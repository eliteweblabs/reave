/**
 * App-icon sprites that orbit inside the homepage quantum particle cloud.
 * Icons are loaded from public/logos/replaced-apps/ (same assets as /features).
 */
import * as THREE from "three";

/** Shell radius as a fraction of the particle ball — mid-outer band around the logo. */
const SHELL_FRAC = 0.74;
const ICON_RASTER_PX = 128;
const INTRO_OUTWARD_MIN = 2.1;
const INTRO_OUTWARD_MAX = 3.4;

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
  /** Drive intro rush, idle drift, and opacity each frame. */
  update: (params: {
    rawT: number;
    introDurationSec: number;
    globalIntroT: number;
    inIntro: boolean;
    resolveMix: number;
    sceneT: number;
    idleAmp: number;
    energy: number;
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

  const shellRadius = ballRadius * SHELL_FRAC;
  const iconWorldSize = isMobileLike ? 1.35 : 1.85;
  const group = new THREE.Group();
  group.renderOrder = 1;

  const entries: CloudIconEntry[] = [];

  for (let i = 0; i < unique.length; i++) {
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
      opacity: 0,
      depthWrite: false,
      depthTest: true,
      fog: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(iconWorldSize, iconWorldSize, 1);
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

  function update(params: {
    rawT: number;
    introDurationSec: number;
    globalIntroT: number;
    inIntro: boolean;
    resolveMix: number;
    sceneT: number;
    idleAmp: number;
    energy: number;
  }): void {
    const {
      rawT,
      introDurationSec,
      globalIntroT,
      inIntro,
      resolveMix,
      sceneT,
      idleAmp,
      energy,
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

    const baseOpacity = isMobileLike ? 0.62 : 0.72;
    const resolveDim = 1 - resolveMix * 0.22;
    const energyLift = 1 + energy * 0.08;

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

      const fade = entry.edgeFade * revealMix * resolveDim * energyLift;
      entry.material.opacity = THREE.MathUtils.clamp(
        baseOpacity * fade,
        0,
        0.88,
      );
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
