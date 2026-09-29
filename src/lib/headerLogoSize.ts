/** Header wordmark width presets — admin Company → Logo & Icon. */

export const HEADER_LOGO_SIZE_IDS = ['xsmall', 'small', 'medium', 'large', 'xlarge'] as const;
export type HeaderLogoSizeId = (typeof HEADER_LOGO_SIZE_IDS)[number];

export const DEFAULT_HEADER_LOGO_SIZE: HeaderLogoSizeId = 'medium';

/** Responsive width per preset (wordmark-driven; height still capped by the header bar). */
export const HEADER_LOGO_SIZE_WIDTH: Record<HeaderLogoSizeId, string> = {
  xsmall: 'clamp(56px, 11vw, 72px)',
  small: 'clamp(72px, 13vw, 88px)',
  medium: 'clamp(100px, 16vw, 125px)',
  large: 'clamp(120px, 20vw, 160px)',
  xlarge: 'clamp(140px, 24vw, 200px)',
};

export const HEADER_LOGO_SIZE_LABELS: Record<HeaderLogoSizeId, string> = {
  xsmall: 'Extra small',
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
  xlarge: 'X-Large',
};

const HEADER_LOGO_SIZE_ALIASES: Record<string, HeaderLogoSizeId> = {
  'x-small': 'xsmall',
  x_small: 'xsmall',
  'extra-small': 'xsmall',
  extra_small: 'xsmall',
  extrasmall: 'xsmall',
  'x-large': 'xlarge',
  x_large: 'xlarge',
};

export function normalizeHeaderLogoSize(raw: string | null | undefined): HeaderLogoSizeId {
  const id = (raw ?? '').trim().toLowerCase();
  const aliased = HEADER_LOGO_SIZE_ALIASES[id];
  if (aliased) return aliased;
  if ((HEADER_LOGO_SIZE_IDS as readonly string[]).includes(id)) return id as HeaderLogoSizeId;
  return DEFAULT_HEADER_LOGO_SIZE;
}

export function isHeaderLogoSizeId(raw: string | null | undefined): boolean {
  const id = (raw ?? '').trim().toLowerCase();
  if (HEADER_LOGO_SIZE_ALIASES[id]) return true;
  return (HEADER_LOGO_SIZE_IDS as readonly string[]).includes(id);
}

export function headerLogoWidthCssValue(sizeId?: string | null): string {
  return HEADER_LOGO_SIZE_WIDTH[normalizeHeaderLogoSize(sizeId)];
}

export function headerLogoSizeCssInline(sizeId?: string | null): string {
  return `--app-header-logo-w: ${headerLogoWidthCssValue(sizeId)}`;
}
