import patternRaw from '../../public/reave-bg-pattern.svg?raw';

export type ReaveBgPatternFit = 'contain' | 'cover';

const FIT_TO_PAR: Record<ReaveBgPatternFit, 'meet' | 'slice'> = {
  contain: 'meet',
  cover: 'slice',
};

/**
 * One artwork file, one DOM tree — never CSS-tiled.
 * Tiling would slice chevrons at edges and block per-element styling.
 */
const VIGNETTE_DEFS = `
  <defs>
    <linearGradient id="reave-bg-pattern-vignette" gradientUnits="userSpaceOnUse" x1="-194" y1="8" x2="-194" y2="678">
      <stop offset="0%" stop-color="#fff"/>
      <stop offset="62%" stop-color="#fff"/>
      <stop offset="82%" stop-color="#fff" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <mask id="reave-bg-pattern-vignette-mask" maskUnits="userSpaceOnUse" x="-194" y="8" width="835" height="670">
      <rect x="-194" y="8" width="835" height="670" fill="url(#reave-bg-pattern-vignette)"/>
    </mask>
  </defs>
  <g class="reave-bg-pattern__paths" mask="url(#reave-bg-pattern-vignette-mask)">`;

const VIGNETTE_CLOSE = '</g>';

/**
 * Keep the bottom fade inside the SVG — CSS mask-image on an HTML wrapper breaks
 * per-path opacity animation on iOS Safari (WebKit caches the masked layer).
 */
export function renderReaveBgPatternSvg(fit: ReaveBgPatternFit = 'contain'): string {
  const preserve = FIT_TO_PAR[fit];

  const opened = patternRaw
    .replace(/<\?xml[^?]*\?>\s*/i, '')
    .replace(/<!--[\s\S]*?-->\s*/g, '')
    .replace(/<svg\b([^>]*)>/i, (_match, attrs: string) => {
      const cleaned = attrs
        .replace(/\s*width="[^"]*"/gi, '')
        .replace(/\s*height="[^"]*"/gi, '')
        .replace(/\s*preserveAspectRatio="[^"]*"/gi, '');

      return `<svg${cleaned} class="reave-bg-pattern__svg" preserveAspectRatio="xMidYMid ${preserve}" aria-hidden="true" focusable="false">${VIGNETTE_DEFS}`;
    });

  return opened.replace(/<\/svg>\s*$/i, `${VIGNETTE_CLOSE}</svg>`);
}
