/** 301 for GET/HEAD; 308 otherwise so POST bodies survive host canonicalization (Siri, webhooks). */
export function permanentRedirectStatus(method: string): 301 | 308 {
  const m = method.toUpperCase();
  return m === 'GET' || m === 'HEAD' ? 301 : 308;
}

export function permanentRedirectResponse(request: Request, location: string): Response {
  return new Response(null, {
    status: permanentRedirectStatus(request.method),
    headers: { Location: location },
  });
}
