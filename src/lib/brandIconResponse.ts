import { brandingEtag, renderCompanyBrandIconPng } from './brandImageRender';
import { brandingPngHttpResponse, resolveCachedBrandingPng } from './brandingPngResponse';
import { getStoredCompanyConfig } from './companyConfigStore';

/** Rasterize the admin mark (or letter fallback) as a PNG response. */
export async function brandIconPngResponse(
  request: Request,
  size: number,
  opts?: { transparent?: boolean; requestUrl?: URL },
): Promise<Response> {
  const stored = await getStoredCompanyConfig();
  const etagInner = brandingEtag(stored, size, 'icon', opts);
  const body = await resolveCachedBrandingPng(etagInner, () =>
    renderCompanyBrandIconPng(stored, size, opts),
  );
  const requestUrl = opts?.requestUrl ?? new URL(request.url);
  return brandingPngHttpResponse(request, requestUrl, etagInner, body!);
}
