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
export function renderReaveBgPatternSvg(fit: ReaveBgPatternFit = 'contain'): string {
  const preserve = FIT_TO_PAR[fit];

  return patternRaw
    .replace(/<\?xml[^?]*\?>\s*/i, '')
    .replace(/<!--[\s\S]*?-->\s*/g, '')
    .replace(/<svg\b([^>]*)>/i, (_match, attrs: string) => {
      const cleaned = attrs
        .replace(/\s*width="[^"]*"/gi, '')
        .replace(/\s*height="[^"]*"/gi, '')
        .replace(/\s*preserveAspectRatio="[^"]*"/gi, '');

      return `<svg${cleaned} class="reave-bg-pattern__svg" preserveAspectRatio="xMidYMid ${preserve}" aria-hidden="true" focusable="false">`;
    });
}
