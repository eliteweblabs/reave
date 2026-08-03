import patternRaw from '../../public/reave-bg-pattern.svg?raw';

export type ReaveBgPatternFit = 'contain' | 'cover';

const FIT_TO_PAR: Record<ReaveBgPatternFit, 'meet' | 'slice'> = {
  contain: 'meet',
  cover: 'slice',
};

/** Illustrator exports each chevron as one compound path (two triangles). Split for per-triangle reveal. */
function splitCompoundPathElements(svg: string): string {
  return svg.replace(/<path\b([^>]*)\/>/gi, (match, attrs: string) => {
    const dMatch = attrs.match(/\bd="([^"]+)"/i);
    if (!dMatch) return match;

    const d = dMatch[1];
    const subpaths = d
      .split(/(?<=[Zz])\s*(?=M)/)
      .map((segment) => segment.trim())
      .filter(Boolean);
    if (subpaths.length <= 1) return match;

    const otherAttrs = attrs.replace(/\bd="[^"]*"/i, '').trim();
    const attrPrefix = otherAttrs ? `${otherAttrs} ` : '';
    return subpaths.map((sub) => `<path ${attrPrefix}d="${sub}"/>`).join('\n  ');
  });
}

/**
 * One artwork file, one DOM tree — never CSS-tiled.
 * Tiling would slice chevrons at edges and block per-element styling.
 */
export function renderReaveBgPatternSvg(fit: ReaveBgPatternFit = 'contain'): string {
  const preserve = FIT_TO_PAR[fit];

  return splitCompoundPathElements(
    patternRaw
      .replace(/<\?xml[^?]*\?>\s*/i, '')
      .replace(/<!--[\s\S]*?-->\s*/g, '')
      .replace(/<svg\b([^>]*)>/i, (_match, attrs: string) => {
        const cleaned = attrs
          .replace(/\s*width="[^"]*"/gi, '')
          .replace(/\s*height="[^"]*"/gi, '')
          .replace(/\s*preserveAspectRatio="[^"]*"/gi, '');

        return `<svg${cleaned} class="reave-bg-pattern__svg" preserveAspectRatio="xMidYMid ${preserve}" aria-hidden="true" focusable="false">`;
      }),
  );
}
