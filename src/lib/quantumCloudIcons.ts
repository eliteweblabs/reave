/**
 * App-icon sprites that orbit inside the homepage quantum particle cloud.
 * Icons are loaded from public/logos/replaced-apps/ (same assets as /features).
 */
import * as THREE from "three";

/** Inner / outer shell as fractions of the particle ball — wide band for depth. */
const SHELL_FRAC_MIN = 0.52;
const SHELL_FRAC_MAX = 0.96;
const ICON_RASTER_PX = 128;
const INTRO_OUTWARD_MIN = 2.1;
const INTRO_OUTWARD_MAX = 3.4;
/** Foreground icons scale up to this multiple of the baseline (back) size. */
const DEPTH_SCALE_MIN = 1;
const DEPTH_SCALE_MAX = 2.85;

export interface CloudIconEntry {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  texture: THREE.Texture | null;
  home: THREE.Vector3;
  start: THREE.Vector3;
  stagger: number;
  idlePhase: number;
  edgeFade: number;
}

export interface CloudIconLayer {
  group: THREE.Group;
  entries: CloudIconEntry[];
  /** Drive intro rush, idle drift, depth scale, and visibility each frame. */
  update: (params: {
    rawT: number;
    introDurationSec: number;
    globalIntroT: number;
    inIntro: boolean;
    resolveMix: number;
    sceneT: number;
    idleAmp: number;
    energy: number;
    spinMat3: THREE.Matrix3;
  }) => void;
  dispose: () => void;
}

function fibonacciSphere(i: number, n: number, radius: number): THREE.Vector3 {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const y = 1 - (2 * (i + 0.5)) / Math.max(1, n);
  const ring = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = goldenAngle * i;
  return new THREE.Vector3(
    radius * Math.cos(theta) * ring,
    radius * y,
    radius * Math.sin(theta) * ring,
  );
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
  const dissolve = Math.exp(-Math.pow(Math.max(0, r3) / 0.62, 2.35));
  const underLogo = 1 - THREE.MathUtils.smoothstep(0.03, 0.42, r2);
  return dissolve * THREE.MathUtils.lerp(0.06, 1, underLogo);
}

function idleOffset(
  phase: number,
  t: number,
  amp: number,
  hx: number,
  hy: number,
): THREE.Vector3 {
  const seed = phase + hx * 0.07 + hy * 0.09;
  return new THREE.Vector3(
    Math.sin(t * 0.41 + seed) * amp +
      Math.sin(t * 0.16 + seed * 2.2) * amp * 0.42,
    Math.cos(t * 0.34 + seed * 1.4) * amp * 0.88 +
      Math.sin(t * 0.2 + seed * 0.8) * amp * 0.38,
    Math.sin(t * 0.27 + seed * 1.9) * amp * 0.52,
  );
}

function introTravelT(
  rawT: number,
  duration: number,
  delaySec: number,
): number {
  const span = Math.max(0.001, duration - delaySec);
  const t = THREE.MathUtils.clamp((rawT - delaySec) / span, 0, 1);
  return t * t * t * t * t;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** Per-icon shell radius — spreads icons from mid-inner to far-outer for depth. */
function shellRadiusFrac(i: number): number {
  const hash = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  const t = hash - Math.floor(hash);
  return THREE.MathUtils.lerp(SHELL_FRAC_MIN, SHELL_FRAC_MAX, t);
}

function desaturateImageData(imageData: ImageData): void {
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]!;
    if (a <= 8) continue;
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    data[i] = gray;
    data[i + 1] = gray;
    data[i + 2] = gray;
    data[i + 3] = 255;
  }
}

async function loadRasterIconTexture(url: string): Promise<THREE.Texture> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`Failed to load cloud icon: ${url}`));
    img.src = url;
  });
  const size = ICON_RASTER_PX;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d unavailable");
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(img, 0, 0, size, size);
  const imageData = ctx.getImageData(0, 0, size, size);
  desaturateImageData(imageData);
  ctx.putImageData(imageData, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Build orbiting icon sprites for the particle shell. Returns null when `urls`
 * is empty; otherwise loads textures asynchronously and adds sprites to `group`.
 */
export function createCloudIconLayer(
  urls: string[],
  ballRadius: number,
  isMobileLike: boolean,
  introDurationSec: number,
): CloudIconLayer | null {
  const unique = [...new Set(urls.map((u) => u.trim()).filter(Boolean))];
  if (unique.length === 0) return null;

  const maxShellRadius = ballRadius * SHELL_FRAC_MAX;
  const iconBaseSize = isMobileLike ? 1.35 : 1.85;
  const group = new THREE.Group();
  group.renderOrder = 1;

  const entries: CloudIconEntry[] = [];

  for (let i = 0; i < unique.length; i++) {
    const shellRadius = ballRadius * shellRadiusFrac(i);
    const home = fibonacciSphere(i, unique.length, shellRadius);
    const edgeFade = particleDissolveStrength(home.x, home.y, home.z, ballRadius);
    const outward =
      INTRO_OUTWARD_MIN + (i / Math.max(1, unique.length)) * (INTRO_OUTWARD_MAX - INTRO_OUTWARD_MIN);
    const start = home.clone().multiplyScalar(outward);
    const stagger =
      introDurationSec > 0
        ? (home.length() / ballRadius) * introDurationSec * 0.28 + i * 0.018
        : 0;

    const material = new THREE.SpriteMaterial({
      transparent: true,
      opacity: 1,
      alphaTest: 0.35,
      depthWrite: true,
      depthTest: true,
      fog: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(iconBaseSize, iconBaseSize, 1);
    sprite.visible = false;
    sprite.position.copy(introDurationSec > 0 ? start : home);
    sprite.renderOrder = 1;
    group.add(sprite);

    const entry: CloudIconEntry = {
      sprite,
      material,
      texture: null,
      home,
      start,
      stagger,
      idlePhase: Math.random() * Math.PI * 2,
      edgeFade,
    };
    entries.push(entry);
  }

  void Promise.all(
    unique.map(async (url, i) => {
      try {
        const texture = await loadRasterIconTexture(url);
        const entry = entries[i];
        if (!entry) return;
        entry.texture = texture;
        entry.material.map = texture;
        entry.material.needsUpdate = true;
      } catch {
        /* Skip broken icons — cloud still runs without them. */
      }
    }),
  );

  const tmpOffset = new THREE.Vector3();
  const tmpView = new THREE.Vector3();

  function update(params: {
    rawT: number;
    introDurationSec: number;
    globalIntroT: number;
    inIntro: boolean;
    resolveMix: number;
    sceneT: number;
    idleAmp: number;
    energy: number;
    spinMat3: THREE.Matrix3;
  }): void {
    const {
      rawT,
      introDurationSec,
      globalIntroT,
      inIntro,
      sceneT,
      idleAmp,
      spinMat3,
    } = params;

    const revealStart = 0.48;
    const revealMix =
      introDurationSec <= 0
        ? 1
        : globalIntroT < revealStart
          ? 0
          : easeOutCubic(
              THREE.MathUtils.clamp(
                (globalIntroT - revealStart) / (1 - revealStart),
                0,
                1,
              ),
            );

    for (const entry of entries) {
      if (!entry.material.map) continue;

      let px = entry.home.x;
      let py = entry.home.y;
      let pz = entry.home.z;

      if (inIntro && introDurationSec > 0) {
        const localT = introTravelT(rawT, introDurationSec, entry.stagger);
        const inv = 1 - localT;
        px = entry.home.x + (entry.start.x - entry.home.x) * inv;
        py = entry.home.y + (entry.start.y - entry.home.y) * inv;
        pz = entry.home.z + (entry.start.z - entry.home.z) * inv;
      } else if (idleAmp > 0) {
        tmpOffset.copy(
          idleOffset(entry.idlePhase, sceneT, idleAmp * 1.15, entry.home.x, entry.home.y),
        );
        px += tmpOffset.x;
        py += tmpOffset.y;
        pz += tmpOffset.z;
      }

      entry.sprite.position.set(px, py, pz);

      tmpView.set(px, py, pz).applyMatrix3(spinMat3);
      const depthT = THREE.MathUtils.clamp(
        (tmpView.z / maxShellRadius + 1) * 0.5,
        0,
        1,
      );
      const depthScale = THREE.MathUtils.lerp(
        DEPTH_SCALE_MIN,
        DEPTH_SCALE_MAX,
        Math.pow(depthT, 0.68),
      );
      const size = iconBaseSize * depthScale;
      entry.sprite.scale.set(size, size, 1);

      entry.sprite.visible =
        revealMix > 0.02 && entry.edgeFade > 0.05;
      entry.material.opacity = 1;
    }
  }

  function dispose(): void {
    for (const entry of entries) {
      group.remove(entry.sprite);
      entry.material.map = null;
      entry.material.dispose();
      entry.texture?.dispose();
    }
    entries.length = 0;
  }

  return { group, entries, update, dispose };
}
