/**
 * Guard: the hero GPS beat's iOS path — a ladder of Mapbox Static Images zoomed
 * through in step — stays geometrically continuous, and its proxy stays a proxy
 * for exactly that ladder and nothing else.
 *
 * This replaces what used to need a device: the failure the ladder exists to fix
 * (iOS showing a dead black letterbox, then a two-image crossfade instead of a
 * zoom) is a geometry failure, and geometry can be swept exhaustively here.
 *
 * Run: npm run check:hero-gps
 */
import assert from 'node:assert/strict';
import {
  HERO_GPS_BEARING,
  HERO_GPS_CENTER,
  HERO_GPS_END_ZOOM,
  HERO_GPS_FADE_SPAN,
  HERO_GPS_FRAME_COUNT,
  HERO_GPS_FRAME_HEIGHT,
  HERO_GPS_FRAME_WIDTH,
  HERO_GPS_MAX_LEG,
  HERO_GPS_MAX_OVERZOOM,
  HERO_GPS_OVERSCAN,
  HERO_GPS_START_ZOOM,
  HERO_GPS_ZOOMS,
  heroGpsFrameRetina,
  heroGpsFrameSrc,
  heroGpsLayerState,
  heroGpsMapboxUrl,
  heroGpsUsableFrames,
  isHeroGpsFrameIndex,
} from '../src/lib/heroGpsMap.ts';

/* ---------------------------------------------------------------- ladder shape */

assert.equal(HERO_GPS_ZOOMS.length, HERO_GPS_FRAME_COUNT);
assert.equal(HERO_GPS_ZOOMS[0], HERO_GPS_START_ZOOM);
assert.equal(HERO_GPS_ZOOMS[HERO_GPS_FRAME_COUNT - 1], HERO_GPS_END_ZOOM);
for (let i = 1; i < HERO_GPS_ZOOMS.length; i++) {
  assert.ok(HERO_GPS_ZOOMS[i]! > HERO_GPS_ZOOMS[i - 1]!, 'ladder zooms must ascend');
}

/*
 * The load-bearing inequality. A frame starts fading in `HERO_GPS_FADE_SPAN`
 * levels early, at which point it is still downscaled to `2^-FADE_SPAN`; it can
 * only cover the letterbox if the frames are drawn at least that much larger.
 * Violate this and the fade exposes the frame's own edge over the map beneath.
 */
assert.ok(
  HERO_GPS_FADE_SPAN < Math.log2(HERO_GPS_OVERSCAN),
  `fade span ${HERO_GPS_FADE_SPAN} must stay under log2(overscan) ${Math.log2(HERO_GPS_OVERSCAN).toFixed(3)}`,
);

/* ------------------------------------------------------------ zoom continuity */

/** A layer scaled below this no longer reaches the letterbox edges. */
const MIN_COVERING_SCALE = 1 / HERO_GPS_OVERSCAN;

type Sweep = {
  /** Ground resolution actually on screen, in Mapbox zoom levels. */
  shown: number;
  /** Layers drawing at all, and how much of the letterbox they own. */
  opaque: number;
  covered: boolean;
};

/** Walk a ladder from its first zoom to its last, reducing each step to what the eye gets. */
function sweep(ladder: readonly number[], steps = 4000): Sweep[] {
  const from = ladder[0]!;
  const to = ladder[ladder.length - 1]!;
  const out: Sweep[] = [];

  for (let s = 0; s <= steps; s++) {
    const zoom = from + ((to - from) * s) / steps;
    const states = ladder.map((_, i) => heroGpsLayerState(ladder, i, zoom));

    let opaque = 0;
    let covered = false;
    let shown = Number.NaN;

    for (let i = 0; i < states.length; i++) {
      const state = states[i]!;
      if (!state.visible || state.opacity <= 0) continue;

      // Every visible layer must be displaying the same ground resolution —
      // that identity is what makes a hand-off invisible.
      const effective = ladder[i]! + Math.log2(state.scale);
      if (Number.isNaN(shown)) shown = effective;
      else assert.ok(Math.abs(effective - shown) < 1e-9, 'visible layers disagree on zoom');

      if (state.opacity >= 1) {
        opaque++;
        if (state.scale >= MIN_COVERING_SCALE) covered = true;
      }
    }

    out.push({ shown, opaque, covered });
  }

  return out;
}

/**
 * The full ladder, plus the degraded ladders a slow network produces: frames
 * arrive independently, so the beat has to stay continuous over any subset that
 * still starts at the world view. Each is trimmed the way the loop trims it.
 */
const arrivals: Array<{ label: string; zooms: number[] }> = [
  { label: 'full ladder', zooms: [...HERO_GPS_ZOOMS] },
  { label: 'every other frame', zooms: HERO_GPS_ZOOMS.filter((_, i) => i % 2 === 0) },
  { label: 'world view + job site only', zooms: [HERO_GPS_ZOOMS[0]!, HERO_GPS_ZOOMS.at(-1)!] },
  { label: 'first three frames', zooms: HERO_GPS_ZOOMS.slice(0, 3) },
  { label: 'world view alone', zooms: [HERO_GPS_ZOOMS[0]!] },
];

for (const { label, zooms: arrived } of arrivals) {
  const zooms = arrived.slice(0, heroGpsUsableFrames(arrived));

  // Whatever survives the trim must be flyable on its own frames.
  for (let i = 1; i < zooms.length; i++) {
    const leg = zooms[i]! - zooms[i - 1]!;
    assert.ok(leg <= HERO_GPS_MAX_LEG, `${label}: kept a ${leg.toFixed(2)}-level leg`);
  }

  if (zooms.length < 2) {
    // One frame is not a ladder: it can only overzoom, which the loop caps.
    const overzoomed = heroGpsLayerState(zooms, 0, zooms[0]! + HERO_GPS_MAX_OVERZOOM);
    assert.equal(overzoomed.visible, true);
    assert.ok(
      overzoomed.scale <= Math.pow(2, HERO_GPS_MAX_OVERZOOM),
      `${label}: lone frame scaled past the overzoom cap`,
    );
    console.log(`PASS  ${label} — trimmed to overzoom only`);
    continue;
  }

  const samples = sweep(zooms);

  for (const sample of samples) {
    assert.ok(!Number.isNaN(sample.shown), `${label}: letterbox went blank mid-zoom`);
    // Something fully opaque and large enough to reach the edges, always.
    assert.ok(sample.covered, `${label}: nothing covered the letterbox`);
  }

  // Monotonic and gap-free: the whole point is that it reads as one zoom.
  for (let i = 1; i < samples.length; i++) {
    const step = samples[i]!.shown - samples[i - 1]!.shown;
    assert.ok(step >= 0, `${label}: zoom reversed`);
    assert.ok(step < 0.05, `${label}: zoom jumped ${step.toFixed(3)} levels`);
  }

  const span = samples.at(-1)!.shown - samples[0]!.shown;
  assert.ok(
    Math.abs(span - (zooms.at(-1)! - zooms[0]!)) < 1e-9,
    `${label}: covered ${span.toFixed(2)} levels, expected ${(zooms.at(-1)! - zooms[0]!).toFixed(2)}`,
  );

  // No frame may be stretched past the blur/backing-store budget on any subset.
  let worstUpscale = 1;
  for (let i = 0; i < zooms.length; i++) {
    const until = zooms[i + 1] ?? zooms.at(-1)! + HERO_GPS_MAX_OVERZOOM;
    worstUpscale = Math.max(worstUpscale, Math.pow(2, until - zooms[i]!));
  }
  assert.ok(
    worstUpscale <= Math.pow(2, HERO_GPS_MAX_LEG + HERO_GPS_MAX_OVERZOOM),
    `${label}: a frame upscales ${worstUpscale.toFixed(1)}x`,
  );

  console.log(
    `PASS  ${label} — continuous over ${span.toFixed(2)} zoom levels, ` +
      `frames upscale at most ${worstUpscale.toFixed(2)}x`,
  );
}

/*
 * The regression this beat replaced: two static images crossfading, worth a bit
 * over a level of apparent zoom. The desktop GL flight covers >10, so the iOS
 * path has to as well or it still reads as a screenshot.
 */
const fullSpan = HERO_GPS_END_ZOOM - HERO_GPS_START_ZOOM;
assert.ok(fullSpan > 10, `ladder only spans ${fullSpan} zoom levels`);

/* ------------------------------------------------------ hand-off / retirement */

// No layer may outlive its successor's takeover, or its scale runs away and the
// backing store it asks iOS for grows without bound.
for (let i = 0; i < HERO_GPS_ZOOMS.length - 1; i++) {
  const nextZoom = HERO_GPS_ZOOMS[i + 1]!;
  const atHandoff = heroGpsLayerState(HERO_GPS_ZOOMS, i, nextZoom);
  assert.equal(atHandoff.visible, false, `frame ${i} outlived frame ${i + 1}`);

  const successor = heroGpsLayerState(HERO_GPS_ZOOMS, i + 1, nextZoom);
  assert.equal(successor.opacity, 1, `frame ${i + 1} not opaque when frame ${i} retired`);
  assert.ok(successor.scale >= MIN_COVERING_SCALE, `frame ${i + 1} left a gap at hand-off`);
}

// Peak upscale per frame — how blurry the ladder ever gets. Frames are spaced
// ~1.8 levels apart, so ~3.5x, and only while the world is moving fast.
let peakUpscale = 1;
for (let i = 0; i < HERO_GPS_ZOOMS.length; i++) {
  const until = HERO_GPS_ZOOMS[i + 1] ?? HERO_GPS_END_ZOOM;
  peakUpscale = Math.max(peakUpscale, Math.pow(2, until - HERO_GPS_ZOOMS[i]!));
}
assert.ok(peakUpscale < 4, `frames upscale up to ${peakUpscale.toFixed(2)}x — ladder too sparse`);
console.log(`PASS  hand-offs clean, frames upscale at most ${peakUpscale.toFixed(2)}x`);

/* --------------------------------------------------------------- frame sources */

// Frames come from our own origin, so the client needs no Mapbox token — which
// is also why this path is right when the public token is simply absent.
for (let i = 0; i < HERO_GPS_FRAME_COUNT; i++) {
  const src = heroGpsFrameSrc(i);
  assert.equal(src, `/api/mapbox/hero-map?frame=${i}`);
  assert.ok(!src.includes('api.mapbox.com'), 'frames must not hotlink Mapbox');
  assert.ok(!/access_token/i.test(src), 'frame URLs must not carry a token');
}

// Retina only where the eye rests: the world view and the job site.
const retina = HERO_GPS_ZOOMS.map((_, i) => heroGpsFrameRetina(i));
assert.deepEqual(retina, [true, false, false, false, false, false, true]);

for (let i = 0; i < HERO_GPS_FRAME_COUNT; i++) {
  const url = heroGpsMapboxUrl(i, 'pk.test-token');
  const [lng, lat] = HERO_GPS_CENTER;

  // Client and proxy have to agree on all of this or the ladder is not a ladder.
  assert.ok(
    url.includes(`/${lng},${lat},${HERO_GPS_ZOOMS[i]},${HERO_GPS_BEARING},0/`),
    `frame ${i} url lost its position`,
  );
  assert.ok(
    url.includes(`/${HERO_GPS_FRAME_WIDTH}x${HERO_GPS_FRAME_HEIGHT}${retina[i] ? '@2x' : ''}?`),
    `frame ${i} url lost its size`,
  );
  // Pitch would not be a rigid transform, so the ladder's scale math needs it flat.
  assert.ok(url.endsWith('&attribution=false&logo=false'), `frame ${i} url lost its flags`);
  assert.ok(url.includes('access_token=pk.test-token'));
}

assert.throws(() => heroGpsMapboxUrl(HERO_GPS_FRAME_COUNT, 'pk.test-token'));
console.log(`PASS  ${HERO_GPS_FRAME_COUNT} frames proxied same-origin, geometry pinned`);

/* ------------------------------------------------------------ proxy input guard */

// The route is public, so the frame index is the only thing a caller may steer.
for (const bad of [-1, 0.5, HERO_GPS_FRAME_COUNT, Number.NaN, Infinity, '0', null, undefined]) {
  assert.equal(isHeroGpsFrameIndex(bad), false, `accepted ${String(bad)} as a frame index`);
}
for (let i = 0; i < HERO_GPS_FRAME_COUNT; i++) {
  assert.equal(isHeroGpsFrameIndex(i), true);
}

/*
 * A missing `frame` used to coerce to 0 and silently serve the world view, so
 * the parse is checked the way the route does it, not just the predicate.
 */
const parseFrame = (raw: string | null): number =>
  raw != null && /^\d+$/.test(raw.trim()) ? Number(raw) : Number.NaN;

for (const raw of [null, '', ' ', 'abc', '1.5', '-1', '0x2', '١']) {
  assert.equal(isHeroGpsFrameIndex(parseFrame(raw)), false, `accepted frame=${String(raw)}`);
}
assert.equal(parseFrame('3'), 3);
assert.equal(parseFrame(' 3 '), 3);
console.log('PASS  proxy rejects every frame index outside the ladder');

console.log('\nhero GPS ladder OK');
