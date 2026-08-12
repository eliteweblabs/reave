import type { APIRoute } from 'astro';

/**
 * Legacy Google OAuth callback — disabled. Tokens must not be exchanged or
 * displayed here; use Admin → Analytics → Connect instead.
 */
export const GET: APIRoute = async () => {
  const body = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Google OAuth deprecated</title></head>
<body style="font-family:sans-serif;padding:2rem;max-width:520px;margin:auto">
  <h2>Google OAuth endpoint deprecated</h2>
  <p>This legacy callback is no longer used. Connect Google Search Console from <strong>Admin → Analytics</strong>.</p>
  <p><a href="/admin?map=analytics">Open Analytics in Admin</a></p>
</body>
</html>`;
  return new Response(body, {
    status: 410,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
};
