/**
 * Port of "QUANTUM CORE: OPTICAL ENGINE" (Three.js + postprocessing).
 * Original pen: https://codepen.io/Justin-Ross-Rythorian/pen/MYegaEO (MIT)
 */
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

/** Soft disc for `PointsMaterial.map` — reads as glow under bloom, not hard squares. */
function createSoftParticleSpriteTexture(): THREE.CanvasTexture {
  const w = 128;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = w;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return new THREE.CanvasTexture(canvas);
  }
  const c = w / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c * 0.98);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.15, "rgba(255,255,255,0.9)");
  g.addColorStop(0.38, "rgba(255,255,255,0.35)");
  g.addColorStop(0.62, "rgba(255,255,255,0.08)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, w);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Even out perceived brightness across the rainbow. At a fixed HSL lightness,
 * purple/blue/red have far lower Rec.709 luminance than cyan/green/yellow, so
 * those frames look dim (worst on mobile). We scale low-luminance hues up toward
 * a target; additive blending + tone mapping absorb the resulting HDR values,
 * and bright hues (gain ≤ 1) are left untouched so they never dim.
 */
function normalizeTintLuminance(
  c: THREE.Color,
  target: number,
  maxGain: number,
): void {
  const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  if (lum <= 1e-4) return;
  const gain = Math.min(target / lum, maxGain);
  if (gain > 1) c.multiplyScalar(gain);
}

/** Options when attaching the optical engine to a host element. */
export interface QuantumEngineOptions {
  /** Particles start outside the ball and rush inward over `durationSec`. */
  introRush?: {
    durationSec: number;
  };
  /** Static logo PNG — colors, resolve plane, and intro sampling target. */
  logoImageUrl?: string;
}

const QUANTUM_PARTICLE_COUNT = 4000;
/**
 * Particle cloud radius in world units. Sized so after PARTICLE_VIS_SCALE the
 * cloud overshoots the viewport (~120%+) and dissolve — not a hard rho cutoff —
 * is what fades particles out at the frame edge.
 */
const QUANTUM_BALL_RADIUS = 32.0;

/** UV band for the A + V characters (3rd & 4th) — light glow trim only (keep brand vibrancy). */
const LOGO_AV_DAMP_U0 = 0.36;
const LOGO_AV_DAMP_U1 = 0.64;
const LOGO_AV_DAMP_EDGE = 0.05;
const LOGO_AV_DAMP_AMOUNT = 0.12;
const LOGO_AV_DAMP_INNER_U0 = 0.43;
const LOGO_AV_DAMP_INNER_U1 = 0.57;
const LOGO_AV_DAMP_INNER_AMOUNT = 0.04;

/** Desktop logo width cap (px). Mobile uses 80% of viewport width. */
const LOGO_MAX_WIDTH_PX = 560;
const LOGO_MAX_VIEWPORT_FRAC = 0.8;

const LogoResolveShader = {
  uniforms: {
    uMap: { value: null as THREE.Texture | null },
    uOpacity: { value: 0 },
    uAvDampU0: { value: LOGO_AV_DAMP_U0 },
    uAvDampU1: { value: LOGO_AV_DAMP_U1 },
    uAvDampEdge: { value: LOGO_AV_DAMP_EDGE },
    uAvDampAmt: { value: LOGO_AV_DAMP_AMOUNT },
    uAvDampInnerU0: { value: LOGO_AV_DAMP_INNER_U0 },
    uAvDampInnerU1: { value: LOGO_AV_DAMP_INNER_U1 },
    uAvDampInnerAmt: { value: LOGO_AV_DAMP_INNER_AMOUNT },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D uMap;
    uniform float uOpacity;
    uniform float uAvDampU0;
    uniform float uAvDampU1;
    uniform float uAvDampEdge;
    uniform float uAvDampAmt;
    uniform float uAvDampInnerU0;
    uniform float uAvDampInnerU1;
    uniform float uAvDampInnerAmt;
    varying vec2 vUv;

    void main() {
      vec4 tex = texture2D(uMap, vUv);
      float outer = smoothstep(uAvDampU0, uAvDampU0 + uAvDampEdge, vUv.x)
        * (1.0 - smoothstep(uAvDampU1 - uAvDampEdge, uAvDampU1, vUv.x));
      float inner = smoothstep(uAvDampInnerU0, uAvDampInnerU0 + 0.03, vUv.x)
        * (1.0 - smoothstep(uAvDampInnerU1 - 0.03, uAvDampInnerU1, vUv.x));
      float damp = 1.0 - outer * uAvDampAmt - inner * uAvDampInnerAmt;
      /* Use the PNG gradient; leave headroom for ACES + bloom (avoids white blow-out). */
      vec3 rgb = tex.rgb * damp;
      float luma = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
      rgb = mix(vec3(luma), rgb, 1.06) * 0.58;
      gl_FragColor = vec4(rgb, tex.a * uOpacity);
    }
  `,
};

async function loadLogoTexture(
  url: string,
): Promise<{ texture: THREE.Texture; aspect: number }> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`Failed to load logo image: ${url}`));
    img.src = url;
  });
  const tex = new THREE.Texture(img);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  const aspect = img.naturalWidth / Math.max(1, img.naturalHeight);
  return { texture: tex, aspect };
}

function particleDissolveStrength(
  hx: number,
  hy: number,
  hz: number,
  ballRadius: number,
): number {
  const r3 =
    Math.sqrt(hx * hx + hy * hy + hz * hz) / Math.max(ballRadius, 0.001);
  const r2 = Math.sqrt(hx * hx + hy * hy) / Math.max(ballRadius, 0.001);
  /*
   * Soft page-edge gradient: bright near the logo, ~0 by ~0.85–1.0 of the cloud
   * radius (past the viewport). Avoids a readable circular rim.
   */
  const dissolve = Math.exp(-Math.pow(Math.max(0, r3) / 0.62, 2.35));
  /* Slightly brighter under the logo without carving a second hard disk. */
  const underLogo = 1 - THREE.MathUtils.smoothstep(0.03, 0.42, r2);
  return dissolve * THREE.MathUtils.lerp(0.06, 1, underLogo);
}

/** Diffuse cloud sampling — center-biased, sparse out past the frame. */
function sampleSphericalHome(ballRadius: number): [number, number, number] {
  const u = Math.random();
  const v = Math.random();
  const theta = u * Math.PI * 2;
  const phi = Math.acos(2 * v - 1);
  /* pow > 1 packs more near center; max rho = full radius (cutoff is dissolve). */
  const rho = ballRadius * Math.pow(Math.random(), 0.48);
  return [
    rho * Math.sin(phi) * Math.cos(theta),
    rho * Math.sin(phi) * Math.sin(theta),
    rho * Math.cos(phi),
  ];
}

const BALL_COLOR_WHITE = new THREE.Color(1, 0.99, 1);
const BALL_COLOR_MAGENTA = new THREE.Color(0.93, 0.24, 0.84);
const BALL_COLOR_MAGENTA_DEEP = new THREE.Color(0.86, 0.06, 0.72);

/** White → magenta (+10% deeper pink at the far end). No rainbow hues. */
function ballParticleColor(i: number): THREE.Color {
  const seed = Math.sin(i * 0.0193 + 1.7) * 0.5 + 0.5;
  const mix = THREE.MathUtils.clamp(seed * 1.1, 0, 1.1);
  const color = BALL_COLOR_WHITE.clone();
  if (mix <= 1) {
    color.lerp(BALL_COLOR_MAGENTA, mix);
  } else {
    color.lerp(BALL_COLOR_MAGENTA, 1);
    color.lerp(BALL_COLOR_MAGENTA_DEEP, mix - 1);
  }
  normalizeTintLuminance(color, 0.36, 1.65);
  return color;
}

/** Per-particle size tier: 70% base, 20% 2×, 10% 3×. */
function particleSizeMultiplier(i: number): number {
  const hash = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  const t = hash - Math.floor(hash);
  if (t < 0.1) return 3;
  if (t < 0.3) return 2;
  return 1;
}

type ParticleDepthLayer = "back" | "front";

/** Size tiers + hemisphere clip so the logo sits inside a rotating particle shell. */
function attachParticleLayerShader(
  material: THREE.PointsMaterial,
  layer: ParticleDepthLayer,
): { setSpinY: (y: number) => void } {
  const uParticleSpinY = { value: 0 };
  material.customProgramCacheKey = () => `quantum-particle-${layer}-shell`;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uParticleSpinY = uParticleSpinY;
    shader.vertexShader = `uniform float uParticleSpinY;\nattribute float aSizeMul;\n${shader.vertexShader}`;
    const layerClip =
      layer === "front"
        ? "\tfloat spinZ = -position.x * sin(uParticleSpinY) + position.z * cos(uParticleSpinY);\n\tif (spinZ <= 0.0) { gl_Position = vec4(2.0, 2.0, 0.0, 1.0); return; }\n"
        : "\tfloat spinZ = -position.x * sin(uParticleSpinY) + position.z * cos(uParticleSpinY);\n\tif (spinZ > 0.0) { gl_Position = vec4(2.0, 2.0, 0.0, 1.0); return; }\n";
    shader.vertexShader = shader.vertexShader.replace(
      /#include <project_vertex>/,
      `${layerClip}\t#include <project_vertex>`,
    );
    shader.vertexShader = shader.vertexShader.replace(
      /#endif\s*\n\s*#include <logdepthbuf_vertex>/,
      "#endif\n\tgl_PointSize *= aSizeMul;\n\n\t#include <logdepthbuf_vertex>",
    );
  };
  return {
    setSpinY(y: number) {
      uParticleSpinY.value = y;
    },
  };
}

function createParticleMaterial(
  isMobileLike: boolean,
  sprite: THREE.CanvasTexture,
): THREE.PointsMaterial {
  return new THREE.PointsMaterial({
    map: sprite,
    size: isMobileLike ? 0.108 : 0.096,
    color: 0xffffff,
    vertexColors: true,
    transparent: true,
    opacity: isMobileLike ? 0.58 : 0.52,
    depthWrite: false,
    fog: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeInQuart(t: number): number {
  return t * t * t * t;
}

function easeInQuint(t: number): number {
  return t * t * t * t * t;
}

/** Slow drift early, dense fill in the last ~25% of the intro. */
function introTravelT(
  rawT: number,
  duration: number,
  delaySec: number,
): number {
  const span = Math.max(0.001, duration - delaySec);
  return easeInQuint(THREE.MathUtils.clamp((rawT - delaySec) / span, 0, 1));
}

/** Particle size: small specks → swell near the end → hold for PNG resolve. */
function introParticleSizeMul(t: number): number {
  if (t < 0.72) return THREE.MathUtils.lerp(0.85, 1.5, t / 0.72);
  if (t < 0.9) return THREE.MathUtils.lerp(1.5, 3.8, (t - 0.72) / 0.18);
  return THREE.MathUtils.lerp(3.8, 2.2, (t - 0.9) / 0.1);
}

/** Cloud scale: spread out early, compress tight before settling to 1. */
function introGatherScale(t: number, galaxy: boolean): number {
  if (galaxy) {
    if (t < 0.55) return THREE.MathUtils.lerp(2.35, 1.65, t / 0.55);
    if (t < 0.9) return THREE.MathUtils.lerp(1.65, 0.82, (t - 0.55) / 0.35);
    return THREE.MathUtils.lerp(0.82, 1, (t - 0.9) / 0.1);
  }
  if (t < 0.68) return THREE.MathUtils.lerp(1.42, 1.12, t / 0.68);
  if (t < 0.92) return THREE.MathUtils.lerp(1.12, 0.76, (t - 0.68) / 0.24);
  return THREE.MathUtils.lerp(0.76, 1, (t - 0.92) / 0.08);
}

/** Full spherical shell — fills portrait and landscape viewports (not a flat XZ disc). */
function randomGalaxyStart(): [number, number, number] {
  const u = Math.random();
  const v = Math.random();
  const theta = u * Math.PI * 2;
  const phi = Math.acos(2 * v - 1);
  const radius = 22 + Math.random() * 30;
  return [
    radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.sin(phi) * Math.sin(theta),
    radius * Math.cos(phi),
  ];
}

/** Stretch the intro field like `background-size: cover` for the current aspect ratio. */
function introCoverScale(
  aspect: number,
  amount: number,
): [number, number] {
  const mix = THREE.MathUtils.clamp(amount, 0, 1);
  if (aspect >= 1) {
    const sy = THREE.MathUtils.lerp(1, aspect * 0.98, mix);
    return [1, sy];
  }
  const sx = THREE.MathUtils.lerp(1, (1 / aspect) * 0.98, mix);
  return [sx, 1];
}

/** Slow post-intro drift — particles orbit their home positions within the ball. */
function idleParticleOffset(
  phase: number,
  t: number,
  amp: number,
  hx: number,
  hy: number,
): [number, number, number] {
  const seed = phase + hx * 0.07 + hy * 0.09;
  const dx =
    Math.sin(t * 0.41 + seed) * amp +
    Math.sin(t * 0.16 + seed * 2.2) * amp * 0.42;
  const dy =
    Math.cos(t * 0.34 + seed * 1.4) * amp * 0.88 +
    Math.sin(t * 0.2 + seed * 0.8) * amp * 0.38;
  const dz = Math.sin(t * 0.27 + seed * 1.9) * amp * 0.52;
  return [dx, dy, dz];
}

export function attachQuantumCoreOpticalEngine(
  host: HTMLElement,
  options?: QuantumEngineOptions,
): () => void {
  const prefersReduced =
    typeof matchMedia !== "undefined" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;

  /**
   * Camera distance: farther = smaller sphere on screen → more rim/fresnel + noise
   * across the mask (too close = front cap fills the letters = one flat color + bloom).
   */
  const VIEW_Z = 20.5;
  const VIEW_FOV = 60;

  /** Stacked canvases / double init = multiple RAF clocks fighting; iOS shows a “~100ms loop”. */
  while (host.firstChild) {
    host.removeChild(host.firstChild);
  }

  const isLikelyIOS =
    typeof navigator !== "undefined" &&
    /iP(ad|hone|od)/.test(navigator.userAgent);

  /**
   * Mobile "gain" profile: coarse pointer or narrow viewport. On phones the mask
   * only reveals the thin letter strokes, the screen is dimmer, and ambient glare
   * is higher — so dim hues (purple/blue/red) wash out. We compensate with more
   * exposure, lower bloom threshold, denser/larger particles, and lighter fog.
   */
  const isMobileLike =
    typeof matchMedia !== "undefined" &&
    (matchMedia("(pointer: coarse)").matches ||
      matchMedia("(max-width: 768px)").matches);

  /**
   * Soft cloud fills the frame on desktop; tighter on mobile so it doesn’t
   * dominate narrow viewports.
   */
  const PARTICLE_VIS_SCALE = isMobileLike ? 0.48 : 0.72;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050505);
  /* Light fog — keep outer particles visible so the edge is dissolve, not fog. */
  scene.fog = new THREE.FogExp2(0x030308, isMobileLike ? 0.0035 : 0.0055);

  const camera = new THREE.PerspectiveCamera(
    VIEW_FOV,
    window.innerWidth / Math.max(1, window.innerHeight),
    0.1,
    100,
  );
  camera.position.z = VIEW_Z;

  const stackEl = host.parentElement as HTMLElement | null;
  const isCompactStack =
    stackEl?.classList.contains("quantum-logo-stack--compact") ?? false;

  function setPresentationMode(galaxy: boolean): void {
    if (!stackEl || isCompactStack) return;
    stackEl.classList.toggle("quantum-logo-stack--galaxy", galaxy);
    stackEl.classList.toggle("quantum-logo-stack--logo", !galaxy);
  }

  function resetCameraViewportAspect() {
    const { w: vw, h: vh } = getViewportSize();
    camera.clearViewOffset();
    camera.aspect = vw / vh;
    camera.updateProjectionMatrix();
  }

  function getViewportSize(): { w: number; h: number } {
    const rect = host.getBoundingClientRect();
    const vv = window.visualViewport;
    const w = Math.max(
      1,
      Math.round(rect.width) || Math.round(vv?.width ?? 0) || window.innerWidth,
    );
    const h = Math.max(
      1,
      Math.round(rect.height) || Math.round(vv?.height ?? 0) || window.innerHeight,
    );
    return { w, h };
  }

  const renderer = new THREE.WebGLRenderer({
    antialias: false,
    alpha: false,
    powerPreference: isLikelyIOS ? "default" : "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = isMobileLike ? 1.42 : 1.12;
  host.appendChild(renderer.domElement);

  const { w: initialW, h: initialH } = getViewportSize();
  renderer.setSize(initialW, initialH);

  const particleCount = QUANTUM_PARTICLE_COUNT;
  const particlesGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const homePositions = new Float32Array(particleCount * 3);
  const startPositions = new Float32Array(particleCount * 3);
  /** Outer particles join the implosion slightly later — reverse-explosion wave. */
  const introStagger = new Float32Array(particleCount);
  /** Per-particle phase for slow idle morph after the intro settles. */
  const particleIdlePhase = new Float32Array(particleCount);
  const introDurationBase = Math.max(0, options?.introRush?.durationSec ?? 0);
  /* Keep the intro on devices that report reduced motion — only shorten it and damp reactive FX. */
  const introDurationSec = introDurationBase * (prefersReduced ? 0.7 : 1);
  const useGalaxyIntro = introDurationSec > 0 && !isCompactStack;
  /** Compact/header: scale outward from home. Hero/preloader: full-screen galaxy field. */
  const introOutwardMin = 2.4;
  const introOutwardMax = 4.2;
  const BALL_RADIUS = isMobileLike ? 22 : QUANTUM_BALL_RADIUS;
  let logoImageAspect = 1014 / 329;
  const homeEdgeFade = new Float32Array(particleCount);

  for (let i = 0; i < particleCount; i++) {
    particleIdlePhase[i] = Math.random() * Math.PI * 2;
    const [hx, hy, hz] = sampleSphericalHome(BALL_RADIUS);
    homeEdgeFade[i] = particleDissolveStrength(hx, hy, hz, BALL_RADIUS);
    homePositions[i * 3] = hx;
    homePositions[i * 3 + 1] = hy;
    homePositions[i * 3 + 2] = hz;

    if (introDurationSec > 0) {
      if (useGalaxyIntro) {
        const [gx, gy, gz] = randomGalaxyStart();
        startPositions[i * 3] = gx;
        startPositions[i * 3 + 1] = gy;
        startPositions[i * 3 + 2] = gz;
      } else {
        const outward =
          introOutwardMin + Math.random() * (introOutwardMax - introOutwardMin);
        startPositions[i * 3] = hx * outward;
        startPositions[i * 3 + 1] = hy * outward;
        startPositions[i * 3 + 2] = hz * outward;
      }
      positions[i * 3] = startPositions[i * 3]!;
      positions[i * 3 + 1] = startPositions[i * 3 + 1]!;
      positions[i * 3 + 2] = startPositions[i * 3 + 2]!;

      const homeDist = Math.sqrt(hx * hx + hy * hy + hz * hz) || 0.001;
      const startDist =
        Math.sqrt(
          startPositions[i * 3]! * startPositions[i * 3]! +
            startPositions[i * 3 + 1]! * startPositions[i * 3 + 1]! +
            startPositions[i * 3 + 2]! * startPositions[i * 3 + 2]!,
        ) || 0.001;
      introStagger[i] = useGalaxyIntro
        ? (startDist / 40) * introDurationSec * 0.38
        : (homeDist / BALL_RADIUS) * introDurationSec * 0.34;
    } else {
      positions[i * 3] = hx;
      positions[i * 3 + 1] = hy;
      positions[i * 3 + 2] = hz;
    }
  }
  particlesGeo.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3),
  );
  const particleColors = new Float32Array(particleCount * 3);
  particlesGeo.setAttribute(
    "color",
    new THREE.BufferAttribute(particleColors, 3),
  );
  const particleSizeMul = new Float32Array(particleCount);
  for (let i = 0; i < particleCount; i++) {
    particleSizeMul[i] = particleSizeMultiplier(i);
  }
  particlesGeo.setAttribute(
    "aSizeMul",
    new THREE.BufferAttribute(particleSizeMul, 1),
  );
  const particleSprite = createSoftParticleSpriteTexture();
  const particlesMatBack = createParticleMaterial(isMobileLike, particleSprite);
  const particlesMatFront = createParticleMaterial(isMobileLike, particleSprite);
  particlesMatFront.opacity *= 1.06;
  const particleLayerBack = attachParticleLayerShader(particlesMatBack, "back");
  const particleLayerFront = attachParticleLayerShader(
    particlesMatFront,
    "front",
  );
  const particleBaseSize = particlesMatBack.size;
  const particleBaseOpacity = particlesMatBack.opacity;
  const particlesBack = new THREE.Points(particlesGeo, particlesMatBack);
  const particlesFront = new THREE.Points(particlesGeo, particlesMatFront);
  particlesBack.renderOrder = 0;
  particlesFront.renderOrder = 3;
  const particleGroup = new THREE.Group();
  particleGroup.scale.setScalar(PARTICLE_VIS_SCALE);
  particleGroup.add(particlesBack);
  particleGroup.add(particlesFront);

  function syncParticleMaterial(size: number, backOpacity: number): void {
    particlesMatBack.size = size;
    particlesMatFront.size = size * 1.04;
    particlesMatBack.opacity = backOpacity;
    particlesMatFront.opacity = THREE.MathUtils.clamp(
      backOpacity * 1.06,
      0.08,
      0.95,
    );
  }

  function syncParticleSpinY(): void {
    const spinY = particleGroup.rotation.y;
    particleLayerBack.setSpinY(spinY);
    particleLayerFront.setSpinY(spinY);
  }

  /* Unit plane — sized in syncLogoDimensions from viewport px caps. */
  const logoResolveGeo = new THREE.PlaneGeometry(1, 1);
  const logoResolveMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.clone(LogoResolveShader.uniforms),
    vertexShader: LogoResolveShader.vertexShader,
    fragmentShader: LogoResolveShader.fragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
  });
  const logoResolve = new THREE.Mesh(logoResolveGeo, logoResolveMat);
  logoResolve.visible = false;
  logoResolve.renderOrder = 2;
  let logoResolveSmoothed = 0;

  /** Rotating shell: back hemisphere → logo → front hemisphere. */
  const pulseGroup = new THREE.Group();
  pulseGroup.add(particleGroup);
  pulseGroup.add(logoResolve);
  scene.add(pulseGroup);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(initialW, initialH),
    1.5,
    0.4,
    0.85,
  );
  /* More generous bloom so points read as luminous haze, not isolated dots.
     Lower threshold on mobile so dim hues (purple/blue) still cross into bloom. */
  const bloomThresholdIdle = isMobileLike ? 0.028 : 0.034;
  const bloomThresholdLogo = isMobileLike ? 0.36 : 0.42;
  bloomPass.threshold = bloomThresholdIdle;
  bloomPass.strength = 0.92;
  bloomPass.radius = 1.18;
  const hpUniforms = bloomPass.highPassUniforms as Record<
    string,
    { value: number }
  >;
  hpUniforms["smoothWidth"].value = 0.11;
  composer.addPass(bloomPass);

  const rushTint = new THREE.Color(1, 0.98, 1);
  const ballHomeColors = new Float32Array(particleCount * 3);

  function computeBallHomeColors(): void {
    for (let i = 0; i < particleCount; i++) {
      const hx = homePositions[i * 3]!;
      const hy = homePositions[i * 3 + 1]!;
      const hz = homePositions[i * 3 + 2]!;
      const fade = homeEdgeFade[i]!;
      const color = ballParticleColor(i);
      ballHomeColors[i * 3] = color.r * fade;
      ballHomeColors[i * 3 + 1] = color.g * fade;
      ballHomeColors[i * 3 + 2] = color.b * fade;
    }
  }
  computeBallHomeColors();

  const logoImageUrl = options?.logoImageUrl?.trim() || "";

  /** World-space size for a target on-screen width/height in CSS pixels. */
  function logoTargetWorldSize(aspect: number): { w: number; h: number } {
    const { w: vw, h: vh } = getViewportSize();
    const visibleH =
      2 * Math.tan(((VIEW_FOV * Math.PI) / 180) * 0.5) * VIEW_Z;
    const visibleW = visibleH * (vw / Math.max(1, vh));
    const maxWidthPx = Math.min(vw * LOGO_MAX_VIEWPORT_FRAC, LOGO_MAX_WIDTH_PX);
    const maxHeightPx = vh * LOGO_MAX_VIEWPORT_FRAC;
    let widthPx = maxWidthPx;
    let heightPx = widthPx / Math.max(aspect, 0.001);
    if (heightPx > maxHeightPx) {
      heightPx = maxHeightPx;
      widthPx = heightPx * aspect;
    }
    return {
      w: (widthPx / Math.max(vw, 1)) * visibleW,
      h: (heightPx / Math.max(vh, 1)) * visibleH,
    };
  }

  function syncLogoDimensions(imageAspect?: number): void {
    if (imageAspect && Number.isFinite(imageAspect) && imageAspect > 0) {
      logoImageAspect = imageAspect;
    }
    const { w, h } = logoTargetWorldSize(logoImageAspect);
    logoResolve.scale.set(w, h, 1);
  }

  syncLogoDimensions(logoImageAspect);

  if (logoImageUrl) {
    void loadLogoTexture(logoImageUrl)
      .then(({ texture, aspect }) => {
        logoResolveMat.uniforms.uMap.value = texture;
        logoResolveMat.needsUpdate = true;
        logoResolve.visible = true;
        syncLogoDimensions(aspect);
      })
      .catch(() => {
        logoResolve.visible = false;
      });
  }

  function applyBallParticleColors(colorMix = 1, energy = 0): void {
    const mix = THREE.MathUtils.clamp(colorMix, 0, 1);
    const boost = 1 + energy * 0.05;
    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      const fade = homeEdgeFade[i]!;
      particleColors[i3] = THREE.MathUtils.lerp(
        rushTint.r * fade,
        ballHomeColors[i3]! * boost,
        mix,
      );
      particleColors[i3 + 1] = THREE.MathUtils.lerp(
        rushTint.g * fade,
        ballHomeColors[i3 + 1]! * boost,
        mix,
      );
      particleColors[i3 + 2] = THREE.MathUtils.lerp(
        rushTint.b * fade,
        ballHomeColors[i3 + 2]! * boost,
        mix,
      );
    }
    particlesGeo.attributes.color!.needsUpdate = true;
  }
  const particleSpeedMult = 1.0;
  /** Smoothed 0–1 from `window` `audioLevel` events (voice reactive). */
  let micLevelTarget = 0;
  let micLevelSmoothed = 0;
  const onAudioLevel: EventListener = (ev: Event) => {
    const e = ev as CustomEvent<{ level?: number }>;
    const v = e.detail?.level;
    micLevelTarget =
      typeof v === "number" && Number.isFinite(v)
        ? THREE.MathUtils.clamp(v, 0, 1)
        : 0;
  };
  window.addEventListener("audioLevel", onAudioLevel);

  /**
   * Conversation reactivity: a smoothed "engaged" baseline while a call is live,
   * plus decaying transient bursts on call start / each transcript chunk, and a
   * color flash that differs by who is speaking. Idle (no call) stays calm.
   */
  let callEnergyTarget = 0;
  let callEnergySmoothed = 0;
  let burst = 0;

  const onCallStart: EventListener = () => {
    callEnergyTarget = 1;
    callEnergySmoothed = Math.max(callEnergySmoothed, 0.28);
    burst = Math.min(burst + 0.38, 1);
    triggerShake(0.12);
  };
  const onCallEnd: EventListener = () => {
    callEnergyTarget = 0;
    burst = Math.min(burst + 0.22, 1.2);
    triggerShake(0.08);
  };
  const onTranscript: EventListener = () => {
    burst = Math.min(burst + 0.32, 1.2);
    triggerShake(0.1);
  };
  window.addEventListener("vapi-call-start", onCallStart);
  window.addEventListener("vapi-call-end", onCallEnd);
  window.addEventListener("vapi-transcript", onTranscript);

  let shakeIntensity = 0;
  let mouseX = 0;
  let mouseY = 0;
  let tiltTargetX = 0;
  let tiltTargetY = 0;

  function isCoarsePointer(): boolean {
    return (
      typeof matchMedia !== "undefined" &&
      matchMedia("(pointer: coarse)").matches
    );
  }

  function setParallaxFromClient(clientX: number, clientY: number) {
    const w = window.innerWidth;
    const h = Math.max(1, window.innerHeight);
    const coarse = isCoarsePointer();
    const px = coarse ? 0.00052 : 0.00022;
    mouseX = (clientX - w / 2) * px;
    mouseY = (clientY - h / 2) * px;
    const nx = (clientX - w / 2) / w;
    const ny = (clientY - h / 2) / h;
    const tiltMul = coarse ? 0.72 : 0.42;
    tiltTargetY = nx * tiltMul;
    tiltTargetX = -ny * tiltMul;
  }

  function clearParallaxTargets() {
    mouseX = 0;
    mouseY = 0;
    tiltTargetX = 0;
    tiltTargetY = 0;
  }

  /** Scrollable homepage hero — parallax from scroll, not pointer drag. */
  const useScrollParallax =
    stackEl?.classList.contains("quantum-logo-stack--in-section") ?? false;

  function setParallaxFromScroll() {
    const heroEl = stackEl?.closest("section") ?? host.closest("section");
    if (!heroEl) {
      clearParallaxTargets();
      return;
    }
    const heroH = Math.max(1, heroEl.clientHeight);
    const progress = THREE.MathUtils.clamp(-heroEl.getBoundingClientRect().top / heroH, 0, 1);
    const coarse = isCoarsePointer();
    const amp = coarse ? 1.35 : 1;
    const t = (progress - 0.5) * 2;
    mouseX = t * 0.08 * amp;
    mouseY = progress * 0.06 * amp;
    tiltTargetY = t * 0.42 * amp;
    tiltTargetX = -progress * 0.25 * amp;
  }

  /** Parallax from pointer position — `window` so it still runs when higher z-index UI is under the cursor. */
  const onPointerMove = (e: PointerEvent) => {
    setParallaxFromClient(e.clientX, e.clientY);
  };
  const onPointerDown = (e: PointerEvent) => {
    if (e.isPrimary) setParallaxFromClient(e.clientX, e.clientY);
  };
  const onPointerUp = (e: PointerEvent) => {
    if (e.pointerType === "touch" && e.isPrimary) clearParallaxTargets();
  };

  const touchClient = (e: TouchEvent) =>
    e.touches[0] ?? e.changedTouches[0] ?? null;

  const onHostTouchStart = (e: TouchEvent) => {
    const t = touchClient(e);
    if (t) setParallaxFromClient(t.clientX, t.clientY);
  };
  const onHostTouchMove = (e: TouchEvent) => {
    if (e.cancelable) e.preventDefault();
    const t = e.touches[0];
    if (t) setParallaxFromClient(t.clientX, t.clientY);
  };
  const onHostTouchEnd = () => {
    clearParallaxTargets();
  };

  let scrollRaf = 0;
  const onScroll = () => {
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = 0;
      setParallaxFromScroll();
    });
  };

  if (useScrollParallax) {
    setParallaxFromScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.visualViewport?.addEventListener("scroll", onScroll, { passive: true });
  } else {
    host.addEventListener("touchstart", onHostTouchStart, { passive: true });
    host.addEventListener("touchmove", onHostTouchMove, { passive: false });
    host.addEventListener("touchend", onHostTouchEnd, { passive: true });
    host.addEventListener("touchcancel", onHostTouchEnd, { passive: true });

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("pointerup", onPointerUp, { passive: true });
  }

  function triggerShake(amt: number) {
    shakeIntensity = amt;
  }

  let introCompleteFired = false;
  let raf = 0;
  let alive = true;
  const clock = new THREE.Clock();
  let introElapsedSec = 0;
  let lastIntroTickMs = 0;
  const motionScale = prefersReduced ? 0.35 : 1;

  const tickIntroElapsed = (): number => {
    const now = performance.now();
    if (lastIntroTickMs === 0) {
      lastIntroTickMs = now;
      return introElapsedSec;
    }
    if (!document.hidden) {
      introElapsedSec += (now - lastIntroTickMs) / 1000;
    }
    lastIntroTickMs = now;
    return introElapsedSec;
  };

  const onVisibilityChange = () => {
    lastIntroTickMs = performance.now();
  };
  document.addEventListener("visibilitychange", onVisibilityChange);

  const onCtxLost = (ev: Event) => {
    ev.preventDefault();
    alive = false;
    cancelAnimationFrame(raf);
  };
  renderer.domElement.addEventListener("webglcontextlost", onCtxLost);

  const onQuantumResume = () => {
    if (!alive || raf) return;
    lastIntroTickMs = performance.now();
    raf = requestAnimationFrame(animate);
  };
  host.addEventListener("quantum-resume", onQuantumResume);

  function animate() {
    if (!alive) return;
    if (host.dataset.quantumPaused === "true") {
      raf = 0;
      return;
    }
    raf = requestAnimationFrame(animate);
    const rawT = tickIntroElapsed();
    const sceneT = clock.getElapsedTime();

    const micLerp = prefersReduced ? 0.04 : 0.08;
    micLevelSmoothed +=
      (micLevelTarget - micLevelSmoothed) *
      micLerp *
      Math.max(motionScale, 0.35);
    const mic = micLevelSmoothed;

    /* Smooth the "in a call" baseline and decay transient bursts / speaker flash. */
    callEnergySmoothed += (callEnergyTarget - callEnergySmoothed) * 0.06;
    burst *= 0.87;
    const wild = callEnergySmoothed;
    const energy = THREE.MathUtils.clamp(
      mic + burst * 0.5 + wild * 0.1,
      0,
      1.0,
    );

    const spinBoost =
      1 +
      energy *
        (prefersReduced ? 0.15 : 0.28 + wild * 0.32) *
        Math.max(motionScale, 0.35);

    /* Voice modulates idle motion — morph + halo pulse, not scatter/warp. */
    const idleVoiceDamp = THREE.MathUtils.lerp(1, 0.42, energy);
    const voiceMorphMul = 1 + mic * 0.95 + burst * 0.18 + wild * 0.1;
    const voiceMorphTime = sceneT * (1 + energy * 0.55);
    const voiceSwell = 1 + mic * 0.032 + burst * 0.02 + wild * 0.015;

    const inIntro = introDurationSec > 0 && rawT < introDurationSec;
    const idleSpinMul = inIntro ? 0.1 : 0.17;
    const rotY = -sceneT * idleSpinMul * particleSpeedMult * spinBoost;
    const idleSizeWobble =
      inIntro || isCompactStack || prefersReduced
        ? 0
        : Math.sin(sceneT * 0.44) * 0.055 * motionScale * idleVoiceDamp;

    const inGalaxyView = inIntro && useGalaxyIntro;
    const globalIntroT = inIntro
      ? THREE.MathUtils.clamp(rawT / introDurationSec, 0, 1)
      : 1;
    const resolveTarget = logoImageUrl
      ? inIntro
        ? THREE.MathUtils.smoothstep(0.78, 0.98, globalIntroT)
        : 1
      : 0;
    const resolveLerp = inIntro ? 0.1 : 0.14;
    logoResolveSmoothed += (resolveTarget - logoResolveSmoothed) * resolveLerp;
    const resolveMix = THREE.MathUtils.clamp(logoResolveSmoothed, 0, 1);
    const reactiveLift = THREE.MathUtils.clamp(
      energy * 0.42 + burst * 0.14,
      0,
      1,
    );
    logoResolveMat.uniforms.uOpacity.value =
      resolveMix * (1 - reactiveLift * 0.08);
    const particleResolveDim = 1 - resolveMix * 0.08;
    bloomPass.threshold = THREE.MathUtils.lerp(
      bloomThresholdIdle,
      bloomThresholdLogo,
      resolveMix,
    );

    if (inGalaxyView) {
      resetCameraViewportAspect();
      (scene.fog as THREE.FogExp2).density = isMobileLike ? 0.0018 : 0.0026;
      setPresentationMode(true);
    } else {
      resetCameraViewportAspect();
      (scene.fog as THREE.FogExp2).density = isMobileLike ? 0.0035 : 0.0055;
      if (useGalaxyIntro) setPresentationMode(false);
    }

    const coverAmount =
      inIntro && useGalaxyIntro
        ? 1 - easeOutCubic(THREE.MathUtils.clamp(globalIntroT * 1.15, 0, 1))
        : 0;
    const [coverSx, coverSy] = introCoverScale(camera.aspect, coverAmount);
    const galaxyFovBoost =
      inIntro && useGalaxyIntro
        ? THREE.MathUtils.lerp(16, 0, easeOutCubic(globalIntroT))
        : 0;
    camera.fov = VIEW_FOV + galaxyFovBoost;
    camera.updateProjectionMatrix();

    if (inIntro) {
      /* Begin tinting as particles swell — not only in the final 10%. */
      const colorizeStart = 0.52;
      const colorizeMix =
        globalIntroT < colorizeStart
          ? 0
          : easeOutCubic(
              THREE.MathUtils.clamp(
                (globalIntroT - colorizeStart) / (1 - colorizeStart),
                0,
                1,
              ),
            );
      const swellColorBoost = THREE.MathUtils.clamp(
        (introParticleSizeMul(globalIntroT) - 1) / 2.8,
        0,
        1,
      );

      for (let i = 0; i < particleCount; i++) {
        const localT = introTravelT(rawT, introDurationSec, introStagger[i]!);
        const inv = 1 - localT;
        const i3 = i * 3;
        positions[i3] =
          homePositions[i3]! + (startPositions[i3]! - homePositions[i3]!) * inv;
        positions[i3 + 1] =
          homePositions[i3 + 1]! +
          (startPositions[i3 + 1]! - homePositions[i3 + 1]!) * inv;
        positions[i3 + 2] =
          homePositions[i3 + 2]! +
          (startPositions[i3 + 2]! - homePositions[i3 + 2]!) * inv;

        const edgeFade = homeEdgeFade[i]!;
        const particleColorMix = THREE.MathUtils.clamp(
          colorizeMix * (0.28 + 0.72 * easeOutCubic(localT)) +
            swellColorBoost * colorizeMix * 0.5,
          0,
          1,
        );
        if (particleColorMix <= 0) {
          particleColors[i3] = rushTint.r * edgeFade;
          particleColors[i3 + 1] = rushTint.g * edgeFade;
          particleColors[i3 + 2] = rushTint.b * edgeFade;
        } else {
          const boost = 1 + energy * 0.06;
          particleColors[i3] = THREE.MathUtils.lerp(
            rushTint.r * edgeFade,
            ballHomeColors[i3]! * boost,
            particleColorMix,
          );
          particleColors[i3 + 1] = THREE.MathUtils.lerp(
            rushTint.g * edgeFade,
            ballHomeColors[i3 + 1]! * boost,
            particleColorMix,
          );
          particleColors[i3 + 2] = THREE.MathUtils.lerp(
            rushTint.b * edgeFade,
            ballHomeColors[i3 + 2]! * boost,
            particleColorMix,
          );
        }
      }
      particlesGeo.attributes.position!.needsUpdate = true;
      particlesGeo.attributes.color!.needsUpdate = true;

      particleGroup.rotation.y = rotY * easeInQuart(globalIntroT) * 0.08;
      syncParticleSpinY();
      pulseGroup.scale.set(coverSx, coverSy, 1);
      particleGroup.scale.setScalar(
        PARTICLE_VIS_SCALE * introGatherScale(globalIntroT, useGalaxyIntro),
      );
      syncParticleMaterial(
        particleBaseSize * introParticleSizeMul(globalIntroT),
        THREE.MathUtils.clamp(
          particleBaseOpacity *
            THREE.MathUtils.lerp(0.88, 1, globalIntroT) *
            particleResolveDim,
          0.08,
          particleBaseOpacity,
        ),
      );
      bloomPass.strength = THREE.MathUtils.lerp(
        0.82,
        1.02 * (1 - resolveMix * 0.35),
        easeInQuart(globalIntroT),
      );
    } else {
      const baseIdleAmp =
        isCompactStack || prefersReduced
          ? 0
          : 0.034 * motionScale * (1 - resolveMix * 0.22);
      const idleAmp = baseIdleAmp * voiceMorphMul;
      for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        const hx = homePositions[i3]!;
        const hy = homePositions[i3 + 1]!;
        const hz = homePositions[i3 + 2]!;
        const [dx, dy, dz] = idleParticleOffset(
          particleIdlePhase[i]!,
          voiceMorphTime,
          idleAmp,
          hx,
          hy,
        );
        positions[i3] = hx + dx;
        positions[i3 + 1] = hy + dy;
        positions[i3 + 2] = hz + dz;
      }
      particlesGeo.attributes.position!.needsUpdate = true;

      particleGroup.rotation.y = rotY;
      syncParticleSpinY();
      applyBallParticleColors(1, energy);

      if (introDurationSec > 0) {
        if (!introCompleteFired) {
          introCompleteFired = true;
          window.dispatchEvent(new CustomEvent("quantum-intro-complete"));
        }
      }
    }

    if (!inIntro) {
      particleGroup.scale.setScalar(PARTICLE_VIS_SCALE);
      const voiceSizeLift = mic * 0.07 + reactiveLift * 0.05;
      syncParticleMaterial(
        particleBaseSize * (1 + voiceSizeLift + idleSizeWobble),
        THREE.MathUtils.clamp(
          particleBaseOpacity *
            particleResolveDim *
            (1 + mic * 0.08 + reactiveLift * 0.1),
          0.08,
          particleBaseOpacity * 0.88,
        ),
      );
      bloomPass.strength = THREE.MathUtils.clamp(
        (0.86 + wild * 0.06 + energy * 0.14) * (1 - resolveMix * 0.35),
        0.62,
        1.12,
      );
    }

    /* Idle breath calms while voice is active; voice adds a subtle swell instead of scatter. */
    const idleBreath =
      inIntro || isCompactStack
        ? 1
        : 1 + Math.sin(sceneT * 0.32) * 0.014 * motionScale * idleVoiceDamp;
    const scaleBreath =
      idleBreath +
      wild * (prefersReduced ? 0.012 : 0.022) * Math.max(motionScale, 0.35);
    if (!inIntro) {
      pulseGroup.scale.setScalar(scaleBreath * voiceSwell);
    }

    const tiltLerp = 0.09 * Math.max(motionScale, 0.4) * (inIntro ? 0.12 : 1);
    const idleTiltX =
      inIntro || prefersReduced || isCompactStack
        ? 0
        : Math.sin(sceneT * 0.21) * 0.032 * motionScale * idleVoiceDamp;
    const idleTiltY =
      inIntro || prefersReduced || isCompactStack
        ? 0
        : Math.cos(sceneT * 0.17) * 0.038 * motionScale * idleVoiceDamp;
    pulseGroup.rotation.x +=
      (tiltTargetX + idleTiltX - pulseGroup.rotation.x) * tiltLerp;
    pulseGroup.rotation.y +=
      (tiltTargetY + idleTiltY - pulseGroup.rotation.y) * tiltLerp;
    pulseGroup.rotation.x = THREE.MathUtils.clamp(
      pulseGroup.rotation.x,
      -0.55,
      0.55,
    );
    pulseGroup.rotation.y = THREE.MathUtils.clamp(
      pulseGroup.rotation.y,
      -0.62,
      0.62,
    );

    shakeIntensity *= 0.9;
    const shakeX = (Math.random() - 0.5) * shakeIntensity;
    const shakeY = (Math.random() - 0.5) * shakeIntensity;

    const coarse = isCoarsePointer();
    const parallaxAmp = (prefersReduced ? 0.85 : 1.55) * (coarse ? 1.35 : 1);
    const parallaxLerp = 0.038 * Math.max(motionScale, 0.35);
    camera.position.x +=
      (mouseX * parallaxAmp - camera.position.x) * parallaxLerp + shakeX;
    camera.position.y +=
      (-mouseY * parallaxAmp - camera.position.y) * parallaxLerp + shakeY;
    camera.position.x = THREE.MathUtils.clamp(camera.position.x, -0.38, 0.38);
    camera.position.y = THREE.MathUtils.clamp(camera.position.y, -0.38, 0.38);
    camera.position.z = VIEW_Z;
    camera.lookAt(scene.position);

    composer.render();
  }

  let resizeRaf = 0;
  const applyResize = () => {
    const { w, h } = getViewportSize();
    renderer.setSize(w, h);
    composer.setSize(w, h);
    bloomPass.setSize(w, h);
    resetCameraViewportAspect();
    syncLogoDimensions();
  };

  const onResize = () => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = 0;
      applyResize();
    });
  };
  window.addEventListener("resize", onResize);
  window.visualViewport?.addEventListener("resize", onResize);

  applyResize();
  raf = requestAnimationFrame(animate);

  return () => {
    alive = false;
    cancelAnimationFrame(raf);
    cancelAnimationFrame(resizeRaf);
    resetCameraViewportAspect();
    host.removeEventListener("quantum-resume", onQuantumResume);
    window.removeEventListener("resize", onResize);
    window.visualViewport?.removeEventListener("resize", onResize);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("audioLevel", onAudioLevel);
    window.removeEventListener("vapi-call-start", onCallStart);
    window.removeEventListener("vapi-call-end", onCallEnd);
    window.removeEventListener("vapi-transcript", onTranscript);
    cancelAnimationFrame(scrollRaf);
    if (useScrollParallax) {
      window.removeEventListener("scroll", onScroll);
      window.visualViewport?.removeEventListener("scroll", onScroll);
    } else {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      host.removeEventListener("touchstart", onHostTouchStart);
      host.removeEventListener("touchmove", onHostTouchMove);
      host.removeEventListener("touchend", onHostTouchEnd);
      host.removeEventListener("touchcancel", onHostTouchEnd);
    }
    renderer.domElement.removeEventListener("webglcontextlost", onCtxLost);

    particlesGeo.dispose();
    particlesMatBack.map = null;
    particlesMatFront.map = null;
    particlesMatBack.dispose();
    particlesMatFront.dispose();
    particleSprite.dispose();
    logoResolveGeo.dispose();
    const logoMap = logoResolveMat.uniforms.uMap.value as THREE.Texture | null;
    logoMap?.dispose();
    logoResolveMat.dispose();
    composer.dispose();
    renderer.dispose();
    if (renderer.domElement.parentElement === host) {
      host.removeChild(renderer.domElement);
    }
  };
}
