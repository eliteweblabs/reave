/** Max pasted inline SVG size (admin Company branding). */
export const BRAND_SVG_MAX_CHARS = 200_000;

const UNSAFE_SVG_PATTERN =
  /<\s*(script|foreignobject|iframe|object|embed|link|meta|base)\b|<\?|<!\[CDATA[\s\S]*?\]\]>/gi;
const EVENT_HANDLER_ATTR = /\s(on[a-z]+|formaction|xlink:href\s*=\s*["']?\s*javascript:)/gi;
const JS_URL = /javascript:/gi;

/** Illustrator / legacy export filenames → root-relative /public assets. */
const SVG_RASTER_ALIASES: Record<string, string> = {
  'content-1.png': '/reave-icon.png',
  'content-1.jpg': '/reave-icon.png',
  'content-1.jpeg': '/reave-icon.png',
  'reave-icon-1.png': '/reave-icon.png',
  'reave-logo-1.png': '/reave-logo-1.png',
};

function resolveSvgRasterHref(href: string): string {
  if (/^https?:\/\//i.test(href) || href.startsWith('data:') || href.startsWith('#')) {
    return href;
  }
  const file = (href.replace(/^\//, '').split('/').pop() ?? href).toLowerCase();
  if (SVG_RASTER_ALIASES[file]) return SVG_RASTER_ALIASES[file];
  return href.startsWith('/') ? href : `/${file}`;
}

/** Rewrite relative raster refs in pasted SVGs to root-absolute /public paths. */
export function resolveSvgAssetUrls(svg: string): string {
  return svg.replace(
    /(\s(?:xlink:)?href\s*=\s*(["']))([^"']+)\2/gi,
    (_match, prefix: string, quote: string, href: string) => {
      const resolved = resolveSvgRasterHref(href);
      if (resolved === href) return _match;
      return `${prefix}${resolved}${quote}`;
    },
  );
}

/** Strip dangerous markup from owner-pasted SVG before inline render. */
export function sanitizeInlineSvg(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > BRAND_SVG_MAX_CHARS) return null;
  if (!/<svg[\s>]/i.test(trimmed)) return null;

  let svg = trimmed.replace(/<\?xml[^?]*\?>\s*/i, '');
  svg = svg.replace(UNSAFE_SVG_PATTERN, '');
  svg = svg.replace(EVENT_HANDLER_ATTR, ' data-removed=');
  svg = svg.replace(JS_URL, '');

  if (!/<svg[\s>]/i.test(svg)) return null;
  return svg;
}

/** Prefix id/href/url(#…) so multiple inline SVGs do not clash. */
export function prefixSvgIds(svg: string, prefix: string): string {
  const safePrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safePrefix) return svg;

  const idMap = new Map<string, string>();
  svg.replace(/\bid=(["'])([^"']+)\1/g, (_match, quote: string, id: string) => {
    if (!idMap.has(id)) idMap.set(id, `${safePrefix}-${id}`);
    return _match;
  });

  let out = svg;
  for (const [from, to] of idMap) {
    const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`\\bid=(["'])${escaped}\\1`, 'g'), `id=$1${to}$1`);
    out = out.replace(new RegExp(`url\\(#${escaped}\\)`, 'gi'), `url(#${to})`);
    out = out.replace(new RegExp(`href=(["'])#${escaped}\\1`, 'gi'), `href=$1#${to}$1`);
  }
  return out;
}

export type PrepareInlineBrandSvgOptions = {
  className?: string;
  idPrefix?: string;
};

/** Sanitize, prefix ids, and attach presentation classes for inline use. */
export function prepareInlineBrandSvg(
  raw: string,
  { className, idPrefix = 'brand' }: PrepareInlineBrandSvgOptions = {},
): string | null {
  const sanitized = sanitizeInlineSvg(resolveSvgAssetUrls(raw));
  if (!sanitized) return null;

  let svg = prefixSvgIds(sanitized, idPrefix);

  if (className) {
    svg = svg.replace(/<svg\b/i, (tag) => {
      if (/class=/i.test(tag)) {
        return tag.replace(/class=(["'])(.*?)\1/i, (_m, q: string, classes: string) => {
          return `class=${q}${classes} ${className}${q}`;
        });
      }
      return `${tag} class="${className}"`;
    });
  }

  return svg;
}
