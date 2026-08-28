/**
 * Geometry for the hero "GPS locate" map beat.
 *
 * Desktop flies a real Mapbox GL camera. iOS Safari can't be trusted with a
 * WebGL canvas inside the demo stack (ancestor transforms mis-size it), so it
 * zooms through a ladder of Mapbox Static Images instead. The ladder is only
 * geometrically exact if the client and the `/api/mapbox/hero-map` proxy agree
 * on the center, bearing, frame size, and zoom of every frame — so all of that
 * lives here and both sides import it.
 */

export const HERO_GPS_STYLE = 'mapbox/dark-v11';

/** Arbitrary coastal job site — not meant to match a real address. */
export const HERO_GPS_CENTER: readonly [number, number] = [-70.255, 43.661];

export const HERO_GPS_START_ZOOM = 2.6;
export const HERO_GPS_END_ZOOM = 13.4;

/**
 * Held constant across every frame. A fixed bearing is a rigid rotation of the
 * whole ladder, so it preserves the scale math; pitch would not, which is why
 * the static path stays flat while the GL path tilts.
 */
export const HERO_GPS_BEARING = -22;

/**
 * Frames are spaced ~1.8 zoom levels apart. Each one is upscaled at most 2^1.8
 * before its successor takes over — blurry only while the world is moving fast.
 */
export const HERO_GPS_FRAME_COUNT = 7;

/**
 * Requested frame size in CSS px. The letterbox is at most 22rem wide at 16/9,
 * and frames are drawn at `HERO_GPS_OVERSCAN` of that, so this is deliberately
 * a little larger than the box it fills.
 */
export const HERO_GPS_FRAME_WIDTH = 416;
export const HERO_GPS_FRAME_HEIGHT = 234;

/**
 * Frames are drawn larger than the letterbox so one can fade in while still
 * slightly downscaled without exposing an edge over the frame beneath it.
 */
export const HERO_GPS_OVERSCAN = 1.34;

/**
 * Cross-fade lead-in, in zoom levels. Must stay under log2(OVERSCAN) (~0.42) or
 * a frame becomes visible before it covers the letterbox.
 */
export const HERO_GPS_FADE_SPAN = 0.38;

/**
 * How far past the highest frame that actually loaded the flight may continue.
 * Keeps a degraded run (slow network, partial ladder) legible instead of mush.
 */
export const HERO_GPS_MAX_OVERZOOM = 1.2;

/**
 * Longest leg the flight will fly on a single frame, in zoom levels. Frames
 * fail independently, so the mounted ladder can have holes; without a cap, a
 * run where only the world view and the job site arrived would upscale the
 * world view ~1800x — mush, and a backing store iOS will not hand out.
 */
export const HERO_GPS_MAX_LEG = 2;

/** Zoom of each ladder frame, world view first. */
export const HERO_GPS_ZOOMS: readonly number[] = Array.from(
  { length: HERO_GPS_FRAME_COUNT },
  (_, i) => {
    const span = HERO_GPS_END_ZOOM - HERO_GPS_START_ZOOM;
    const zoom = HERO_GPS_START_ZOOM + (span * i) / (HERO_GPS_FRAME_COUNT - 1);
    return Math.round(zoom * 100) / 100;
  },
);

/**
 * Retina costs roughly 3x the bytes, so only the two frames the eye rests on
 * get it: the world view before the flight and the job site after it.
 */
export function heroGpsFrameRetina(index: number): boolean {
  return index === 0 || index === HERO_GPS_FRAME_COUNT - 1;
}

/**
 * How many of the frames that loaded the flight can actually use, counted from
 * the world view up. Stops at the first hole wider than `HERO_GPS_MAX_LEG`:
 * a frame beyond it would only be reached after a leg long enough to blur the
 * whole middle of the zoom, so the beat is better off ending early.
 *
 * `zooms` is ascending and starts at the world view.
 */
export function heroGpsUsableFrames(zooms: readonly number[]): number {
  let usable = zooms.length ? 1 : 0;
  for (let i = 1; i < zooms.length; i++) {
    if (zooms[i]! - zooms[i - 1]! > HERO_GPS_MAX_LEG) break;
    usable = i + 1;
  }
  return usable;
}

export type HeroGpsLayerState = {
  /** CSS scale to apply to the frame element. */
  scale: number;
  opacity: number;
  /** False while the layer is pending or once it is retired — it draws nothing. */
  visible: boolean;
};

/**
 * Visual state of one ladder layer at a given zoom.
 *
 * `ladder` is the zoom of every layer actually mounted, world view first — a
 * degraded run mounts a subset, and the hand-off boundaries have to follow the
 * frames that loaded rather than the ones that were meant to.
 *
 * This is the whole zoom: a layer's scale is `2^(zoom - itsZoom)`, so the
 * ground resolution it displays is exactly `zoom` no matter which layer is on
 * top, and hand-offs are invisible. Kept here, out of the DOM loop, so it can
 * be swept and checked without a browser.
 */
export function heroGpsLayerState(
  ladder: readonly number[],
  index: number,
  zoom: number,
): HeroGpsLayerState {
  const layerZoom = ladder[index] ?? HERO_GPS_START_ZOOM;
  const nextZoom = ladder[index + 1];

  /*
   * Hidden until it covers the letterbox, retired the moment its successor is
   * fully opaque. Retiring matters as much as the fade: a layer left scaling
   * past its own leg would blow up iOS's backing store.
   */
  const pending = zoom < layerZoom - HERO_GPS_FADE_SPAN;
  const retired = nextZoom != null && zoom >= nextZoom;
  if (pending || retired) return { scale: 1, opacity: 0, visible: false };

  /*
   * Written to hit exactly 1 at `zoom === layerZoom`, which is the same instant
   * the predecessor retires. The algebraically equal
   * `(zoom - (layerZoom - FADE_SPAN)) / FADE_SPAN` lands an epsilon short there,
   * leaving a one-sample seam where nothing is fully opaque.
   */
  const fadedIn = 1 - (layerZoom - zoom) / HERO_GPS_FADE_SPAN;
  return {
    scale: Math.pow(2, zoom - layerZoom),
    // The world view has nothing beneath it to cross-fade over.
    opacity: index === 0 ? 1 : Math.min(1, Math.max(0, fadedIn)),
    visible: true,
  };
}

export function isHeroGpsFrameIndex(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < HERO_GPS_FRAME_COUNT
  );
}

/** Same-origin frame URL. The proxy holds the token and the response cache. */
export function heroGpsFrameSrc(index: number): string {
  return `/api/mapbox/hero-map?frame=${index}`;
}

/**
 * Upstream Mapbox Static Images URL for one ladder frame. Server-side only —
 * it carries the access token.
 */
export function heroGpsMapboxUrl(index: number, token: string): string {
  const zoom = HERO_GPS_ZOOMS[index];
  if (zoom == null) throw new Error(`hero map frame ${index} is out of range`);

  const retina = heroGpsFrameRetina(index) ? '@2x' : '';
  const [lng, lat] = HERO_GPS_CENTER;
  const position = `${lng},${lat},${zoom},${HERO_GPS_BEARING},0`;
  const size = `${HERO_GPS_FRAME_WIDTH}x${HERO_GPS_FRAME_HEIGHT}${retina}`;

  return (
    `https://api.mapbox.com/styles/v1/${HERO_GPS_STYLE}/static/${position}/${size}` +
    `?access_token=${encodeURIComponent(token)}&attribution=false&logo=false`
  );
}
