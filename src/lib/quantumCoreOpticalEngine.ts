/**
 * Port of "QUANTUM CORE: OPTICAL ENGINE" (Three.js + postprocessing).
 * Original pen: https://codepen.io/Justin-Ross-Rythorian/pen/MYegaEO (MIT)
 */
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

/** Resolved `mask-size` from computed style (single or two lengths in px). */
function parseMaskImageSize(css: string): { w: number; h: number } | null {
  const parts = css.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  const w = parseCssLengthPx(parts[0]!);
  if (!Number.isFinite(w) || w <= 0) return null;
  if (parts.length === 1) return { w, h: w };
  const h = parseCssLengthPx(parts[1]!);
  if (!Number.isFinite(h) || h <= 0) return { w, h: w };
  return { w, h };
}

function parseCssLengthPx(token: string): number {
  const t = token.trim();
  if (!t || t === "auto") return NaN;
  const m = /^([\d.]+)px$/i.exec(t);
  return m ? parseFloat(m[1]!) : NaN;
}

function splitMaskPositionShorthand(
  merged: string,
  secondDefault: string,
): [string, string] {
  const parts = merged.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return [parts[0]!, parts[1]!];
  if (parts.length === 1) return [parts[0]!, secondDefault];
  return ["50%", "50%"];
}

/** One axis of `mask-position` (keywords, %, or px) → offset of mask image’s top-left in the positioning box. */
function maskOrigin1D(
  axisToken: string,
  extent: number,
  maskExtent: number,
): number {
  const t = axisToken.trim().toLowerCase();
  if (t === "center") return 0.5 * (extent - maskExtent);
  if (t === "left" || t === "top") return 0;
  if (t === "right" || t === "bottom") return extent - maskExtent;
  if (t.endsWith("%")) {
    const p = parseFloat(t) / 100;
    return p * (extent - maskExtent);
  }
  if (t.endsWith("px")) return parseFloat(t);
  return 0.5 * (extent - maskExtent);
}

export function attachQuantumCoreOpticalEngine(host: HTMLElement): () => void {
  const prefersReduced =
    typeof matchMedia !== "undefined" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;

  /**
   * Camera distance: farther = smaller sphere on screen → more rim/fresnel + noise
   * across the mask (too close = front cap fills the letters = one flat color + bloom).
   */
  const VIEW_Z = 20.5;
  const VIEW_FOV = 60;
  const CORE_VIS_SCALE = 0.38;
  const PARTICLE_VIS_SCALE = 0.52;

  /** Stacked canvases / double init = multiple RAF clocks fighting; iOS shows a “~100ms loop”. */
  while (host.firstChild) {
    host.removeChild(host.firstChild);
  }

  const isLikelyIOS =
    typeof navigator !== "undefined" &&
    /iP(ad|hone|od)/.test(navigator.userAgent);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050505);
  scene.fog = new THREE.FogExp2(0x000000, 0.018);

  const camera = new THREE.PerspectiveCamera(
    VIEW_FOV,
    window.innerWidth / Math.max(1, window.innerHeight),
    0.1,
    100,
  );
  camera.position.z = VIEW_Z;

  const stackEl = host.parentElement as HTMLElement | null;

  function resetCameraViewportAspect() {
    const vw = window.innerWidth;
    const vh = Math.max(1, window.innerHeight);
    camera.clearViewOffset();
    camera.aspect = vw / vh;
    camera.updateProjectionMatrix();
  }

  /** Match the perspective frustum to the CSS mask image box so the scene scales with the logo (not the full viewport). */
  function syncCameraToMask() {
    if (!stackEl) {
      resetCameraViewportAspect();
      return;
    }
    const vw = window.innerWidth;
    const vh = Math.max(1, window.innerHeight);
    const cs = getComputedStyle(stackEl);
    const csExt = cs as unknown as {
      webkitMaskSize?: string;
      webkitMaskPositionX?: string;
      webkitMaskPositionY?: string;
    };
    const sizeStr = csExt.webkitMaskSize || cs.maskSize || "";
    const dims = parseMaskImageSize(sizeStr);
    if (!dims) {
      resetCameraViewportAspect();
      return;
    }
    const maskW0 = dims.w;
    const maskH0 = dims.h;
    let posXStr: string;
    let posYStr: string;
    if (csExt.webkitMaskPositionX && csExt.webkitMaskPositionY) {
      posXStr = csExt.webkitMaskPositionX;
      posYStr = csExt.webkitMaskPositionY;
    } else {
      [posXStr, posYStr] = splitMaskPositionShorthand(
        cs.maskPosition || "50% 50%",
        "center",
      );
    }
    let left = maskOrigin1D(posXStr, vw, maskW0);
    let top = maskOrigin1D(posYStr, vh, maskH0);
    const right = Math.min(vw, left + maskW0);
    const bottom = Math.min(vh, top + maskH0);
    left = Math.max(0, left);
    top = Math.max(0, top);
    const clipW = right - left;
    const clipH = bottom - top;
    if (clipW < 2 || clipH < 2) {
      resetCameraViewportAspect();
      return;
    }
    camera.setViewOffset(vw, vh, left, top, clipW, clipH);
    camera.updateProjectionMatrix();
  }

  const renderer = new THREE.WebGLRenderer({
    antialias: false,
    alpha: false,
    powerPreference: isLikelyIOS ? "default" : "high-performance",
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  host.appendChild(renderer.domElement);

  const noiseVertex = `
    varying vec2 vUv; varying vec3 vNormal; varying vec3 vPos;
    uniform float uTime; uniform float uSpike;
    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
    vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
    float snoise(vec3 v) {
      const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
      const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
      vec3 i  = floor(v + dot(v, C.yyy) );
      vec3 x0 = v - i + dot(i, C.xxx) ;
      vec3 g = step(x0.yzx, x0.xyz);
      vec3 l = 1.0 - g;
      vec3 i1 = min( g.xyz, l.zxy );
      vec3 i2 = max( g.xyz, l.zxy );
      vec3 x1 = x0 - i1 + C.xxx;
      vec3 x2 = x0 - i2 + C.yyy;
      vec3 x3 = x0 - D.yyy;
      i = mod289(i);
      vec4 p = permute( permute( permute(
                  i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
              + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
              + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
      float n_ = 0.142857142857;
      vec3  ns = n_ * D.wyz - D.xzx;
      vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
      vec4 x_ = floor(j * ns.z);
      vec4 y_ = floor(j - 7.0 * x_ );
      vec4 x = x_ *ns.x + ns.yyyy;
      vec4 y = y_ *ns.x + ns.yyyy;
      vec4 h = 1.0 - abs(x) - abs(y);
      vec4 b0 = vec4( x.xy, y.xy );
      vec4 b1 = vec4( x.zw, y.zw );
      vec4 s0 = floor(b0)*2.0 + 1.0;
      vec4 s1 = floor(b1)*2.0 + 1.0;
      vec4 sh = -step(h, vec4(0.0));
      vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
      vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
      vec3 p0 = vec3(a0.xy,h.x);
      vec3 p1 = vec3(a0.zw,h.y);
      vec3 p2 = vec3(a1.xy,h.z);
      vec3 p3 = vec3(a1.zw,h.w);
      vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
      p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
      vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
      m = m * m;
      return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
    }
    void main() {
      vUv = uv; vNormal = normalize(normalMatrix * normal);
      float n = snoise(position * 2.5 + uTime * 0.5);
      float pulse = sin(uTime * 4.0) * 0.03;
      vec3 newPos = position + normal * (n * uSpike + pulse);
      vPos = newPos;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(newPos, 1.0);
    }
  `;

  const plasmaFragment = `
    uniform vec3 uColorA; uniform vec3 uColorB; uniform float uTime;
    varying vec3 vNormal; varying vec3 vPos;
    void main() {
      vec3 viewDir = normalize(cameraPosition - vPos);
      float ndv = clamp(dot(viewDir, vNormal), 0.0, 1.0);
      /* Linear limb only — avoids fresnel/additive/center-multiply bands that read as a ring under bloom. */
      float limb = 1.0 - ndv;
      float tw = sin(vPos.y * 28.0 + uTime * 3.4) * 0.028
        + sin(dot(vPos, vec3(1.7, 2.3, 1.1)) * 6.0 + uTime * 1.8) * 0.022;
      float depth = clamp(0.05 + 0.4 * limb + tw, 0.0, 1.0);
      vec3 color = mix(uColorA, uColorB, depth);
      gl_FragColor = vec4(color, 1.0);
    }
  `;

  const sphereGeo = new THREE.IcosahedronGeometry(1.6, 64);
  const sphereMat = new THREE.ShaderMaterial({
    vertexShader: noiseVertex,
    fragmentShader: plasmaFragment,
    uniforms: {
      uTime: { value: 0 },
      uSpike: { value: 0.2 },
      uColorA: { value: new THREE.Color("#03060c") },
      uColorB: { value: new THREE.Color("#00f3ff") },
    },
  });
  const core = new THREE.Mesh(sphereGeo, sphereMat);
  core.scale.setScalar(CORE_VIS_SCALE);
  /* Logo read: particles only — the icosahedron reads as a bright “planet” in the mask. */
  core.visible = false;

  const particleCount = 4000;
  const particlesGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount; i++) {
    const r = 2.5 + Math.random() * 8;
    const theta = Math.random() * Math.PI * 2;
    const phi = (Math.random() - 0.5) * 0.72;
    positions[i * 3] = r * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi);
    positions[i * 3 + 2] = r * Math.sin(theta);
  }
  particlesGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const particlesMat = new THREE.PointsMaterial({
    size: 0.058,
    color: 0x00f3ff,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
  });
  const particles = new THREE.Points(particlesGeo, particlesMat);
  particles.scale.setScalar(PARTICLE_VIS_SCALE);

  /** Scales core + ring from world center in sync with the Focus/Warp cycle. */
  const pulseGroup = new THREE.Group();
  pulseGroup.add(core);
  pulseGroup.add(particles);
  scene.add(pulseGroup);

  const AdvancedLensShader = {
    uniforms: {
      tDiffuse: { value: null },
      uAberration: { value: 0.005 },
      uDistortion: { value: 0.2 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform float uAberration;
      uniform float uDistortion;
      varying vec2 vUv;

      vec2 distort(vec2 uv, float k) {
        vec2 centered = uv - 0.5;
        float r2 = dot(centered, centered);
        float f = 1.0 + r2 * (k + k * sqrt(r2));
        return f * centered + 0.5;
      }

      void main() {
        vec2 uv = vUv;
        vec2 rUv = distort(uv, uDistortion - uAberration);
        vec2 gUv = distort(uv, uDistortion);
        vec2 bUv = distort(uv, uDistortion + uAberration);
        float r = texture2D(tDiffuse, rUv).r;
        float g = texture2D(tDiffuse, gUv).g;
        float b = texture2D(tDiffuse, bUv).b;
        float mask = 1.0;
        if(rUv.x < 0.0 || rUv.x > 1.0 || rUv.y < 0.0 || rUv.y > 1.0) mask = 0.0;
        if(bUv.x < 0.0 || bUv.x > 1.0 || bUv.y < 0.0 || bUv.y > 1.0) mask = 0.0;
        gl_FragColor = vec4(r, g, b, 1.0) * mask;
      }
    `,
  };

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    1.5,
    0.4,
    0.85,
  );
  /* Threshold > 0: full-frame bloom (0) stacks into a bright center ring after blur. */
  bloomPass.threshold = 0.16;
  bloomPass.strength = 0.68;
  bloomPass.radius = 0.36;
  bloomPass.highPassUniforms["smoothWidth"].value = 0.085;
  composer.addPass(bloomPass);

  const lensPass = new ShaderPass(AdvancedLensShader);
  /* Zero = passthrough (no barrel / CA ring). */
  lensPass.uniforms.uAberration.value = 0;
  lensPass.uniforms.uDistortion.value = 0;
  composer.addPass(lensPass);

  let targetSpike = 0.2;
  /** Mirrored from the live rainbow each frame (for any logic that reads the current tint). */
  const targetColor = new THREE.Color(0xff0000);
  const rainbowTint = new THREE.Color(0xff0000);
  let particleSpeedMult = 1.0;
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

  host.addEventListener("touchstart", onHostTouchStart, { passive: true });
  host.addEventListener("touchmove", onHostTouchMove, { passive: false });
  host.addEventListener("touchend", onHostTouchEnd, { passive: true });
  host.addEventListener("touchcancel", onHostTouchEnd, { passive: true });

  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerdown", onPointerDown, { passive: true });
  window.addEventListener("pointerup", onPointerUp, { passive: true });

  function triggerShake(amt: number) {
    shakeIntensity = amt;
  }

  const btnStabilize = document.getElementById("btn-stabilize");
  const btnDestabilize = document.getElementById("btn-destabilize");
  const btnReset = document.getElementById("btn-reset");

  const onStabilize = () => {
    targetSpike = 0.1;
    bloomPass.strength = 0.68;
    particleSpeedMult = 0.5;
    lensPass.uniforms.uAberration.value = 0;
    lensPass.uniforms.uDistortion.value = 0;
    triggerShake(0.1);
  };

  const onDestabilize = () => {
    targetSpike = 1.2;
    bloomPass.strength = 2.8;
    particleSpeedMult = 8.0;
    triggerShake(0.5);
    lensPass.uniforms.uDistortion.value = 0.6;
    lensPass.uniforms.uAberration.value = 0.04;
  };

  const onReset = () => {
    targetSpike = 0.3;
    bloomPass.strength = 0.72;
    particleSpeedMult = 1.0;
    lensPass.uniforms.uAberration.value = 0;
    lensPass.uniforms.uDistortion.value = 0;
    triggerShake(0.2);
  };

  btnStabilize?.addEventListener("click", onStabilize);
  btnDestabilize?.addEventListener("click", onDestabilize);
  btnReset?.addEventListener("click", onReset);

  const clock = new THREE.Clock();
  let raf = 0;
  let alive = true;
  const motionScale = prefersReduced ? 0.2 : 1;

  const onCtxLost = (ev: Event) => {
    ev.preventDefault();
    alive = false;
    cancelAnimationFrame(raf);
  };
  renderer.domElement.addEventListener("webglcontextlost", onCtxLost);

  function animate() {
    if (!alive) return;
    raf = requestAnimationFrame(animate);
    syncCameraToMask();
    const rawT = clock.getElapsedTime();
    /* Plasma / noise: real-time so it doesn’t look “frozen” when Reduce Motion slows other lerps. */
    sphereMat.uniforms.uTime.value = rawT;

    sphereMat.uniforms.uSpike.value +=
      (targetSpike - sphereMat.uniforms.uSpike.value) * 0.05 * motionScale;

    /* Rainbow hue, softened saturation / lightness (less “neon solid” Monday feel). */
    const rainbowCyclesPerSec = prefersReduced ? 0.045 : 0.09;
    const sat = prefersReduced ? 0.68 : 0.74;
    const light = prefersReduced ? 0.51 : 0.53;
    rainbowTint.setHSL((rawT * rainbowCyclesPerSec) % 1, sat, light);
    targetColor.copy(rainbowTint);
    sphereMat.uniforms.uColorB.value.copy(rainbowTint);
    particlesMat.color.copy(rainbowTint);

    particles.rotation.y = -rawT * 0.1 * particleSpeedMult;

    pulseGroup.scale.setScalar(1);

    const tiltLerp = 0.09 * Math.max(motionScale, 0.4);
    pulseGroup.rotation.x +=
      (tiltTargetX - pulseGroup.rotation.x) * tiltLerp;
    pulseGroup.rotation.y +=
      (tiltTargetY - pulseGroup.rotation.y) * tiltLerp;
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
    const parallaxAmp =
      (prefersReduced ? 0.85 : 1.55) * (coarse ? 1.35 : 1);
    const parallaxLerp = 0.038 * Math.max(motionScale, 0.35);
    camera.position.x +=
      (mouseX * parallaxAmp - camera.position.x) * parallaxLerp + shakeX;
    camera.position.y +=
      (-mouseY * parallaxAmp - camera.position.y) * parallaxLerp + shakeY;
    camera.position.x = THREE.MathUtils.clamp(camera.position.x, -0.38, 0.38);
    camera.position.y = THREE.MathUtils.clamp(camera.position.y, -0.38, 0.38);
    camera.position.z = VIEW_Z;
    camera.lookAt(scene.position);

    /* Return lens to passthrough after warp (defaults are 0 / 0). */
    const lensCalmD = 0;
    const lensCalmA = 0;
    if (
      lensPass.uniforms.uDistortion.value > 0.002 &&
      targetSpike < 0.9
    ) {
      lensPass.uniforms.uDistortion.value +=
        (lensCalmD - lensPass.uniforms.uDistortion.value) * 0.08 * motionScale;
      lensPass.uniforms.uAberration.value +=
        (lensCalmA - lensPass.uniforms.uAberration.value) * 0.08 * motionScale;
    }

    composer.render();
  }

  let resizeRaf = 0;
  const applyResize = () => {
    const h = Math.max(1, window.innerHeight);
    const w = window.innerWidth;
    renderer.setSize(w, h);
    composer.setSize(w, h);
    bloomPass.setSize(w, h);
    syncCameraToMask();
  };

  const onResize = () => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = 0;
      applyResize();
    });
  };
  window.addEventListener("resize", onResize);

  applyResize();
  raf = requestAnimationFrame(animate);

  return () => {
    alive = false;
    cancelAnimationFrame(raf);
    cancelAnimationFrame(resizeRaf);
    resetCameraViewportAspect();
    window.removeEventListener("resize", onResize);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointerup", onPointerUp);
    host.removeEventListener("touchstart", onHostTouchStart);
    host.removeEventListener("touchmove", onHostTouchMove);
    host.removeEventListener("touchend", onHostTouchEnd);
    host.removeEventListener("touchcancel", onHostTouchEnd);
    renderer.domElement.removeEventListener("webglcontextlost", onCtxLost);
    btnStabilize?.removeEventListener("click", onStabilize);
    btnDestabilize?.removeEventListener("click", onDestabilize);
    btnReset?.removeEventListener("click", onReset);

    sphereGeo.dispose();
    sphereMat.dispose();
    particlesGeo.dispose();
    particlesMat.dispose();
    composer.dispose();
    renderer.dispose();
    if (renderer.domElement.parentElement === host) {
      host.removeChild(renderer.domElement);
    }
  };
}
