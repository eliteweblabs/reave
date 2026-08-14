import { normalizePublicUrl, resolvePublicRedirectUrl } from './publicUrl';

const DEFAULT_MAX_REDIRECTS = 5;

export type SafePublicFetchOptions = {
  signal?: AbortSignal;
  headers?: Record<string, string>;
  method?: RequestInit['method'];
  maxRedirects?: number;
  preferHttps?: boolean;
};

export type SafePublicFetchResult = {
  response: Response;
  finalUrl: string;
};

/** Fetch a public URL with redirect hops validated against private-network SSRF rules. */
export async function fetchPublicWithRedirects(
  urlInput: string,
  opts: SafePublicFetchOptions = {},
): Promise<SafePublicFetchResult | null> {
  const {
    signal,
    headers = {},
    method = 'GET',
    maxRedirects = DEFAULT_MAX_REDIRECTS,
    preferHttps = false,
  } = opts;

  const start = normalizePublicUrl(urlInput, preferHttps);
  if (!start) return null;

  let current = start.toString();
  let res: Response | null = null;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    res = await fetch(current, {
      signal,
      method,
      redirect: 'manual',
      headers,
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location || hop >= maxRedirects) return null;
      const validated = resolvePublicRedirectUrl(location, current, preferHttps);
      if (!validated) return null;
      current = validated.toString();
      continue;
    }
    break;
  }

  if (!res) return null;
  return { response: res, finalUrl: current };
}
