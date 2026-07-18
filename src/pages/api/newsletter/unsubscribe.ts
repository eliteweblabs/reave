/**
 * Public unsubscribe endpoint (no auth).
 *   GET  ?token=… — records the unsubscribe and shows a confirmation page.
 *   POST ?token=… — RFC 8058 one-click unsubscribe (List-Unsubscribe-Post).
 */
import type { APIRoute } from 'astro';
import { verifyUnsubscribeToken } from '../../../lib/newsletterUnsubscribe';
import { addUnsubscribe } from '../../../lib/newsletterStore';
import { getCompanyConfig } from '../../../lib/companyConfig';

export const prerender = false;

function page(title: string, message: string): Response {
  const html = `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${title}</title>
<style>
  body{margin:0;background:#0a0a0b;color:#e5e5e7;font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px}
  .card{max-width:420px;text-align:center;background:#151517;border:1px solid #2a2a2e;border-radius:16px;padding:40px 32px}
  h1{font-size:20px;margin:0 0 12px}
  p{color:#a1a1aa;font-size:15px;line-height:1.6;margin:0}
</style></head><body>
<div class="card"><h1>${title}</h1><p>${message}</p></div>
</body></html>`;
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

async function unsubscribeFromToken(token: string | null, source: string): Promise<boolean> {
  if (!token) return false;
  const email = verifyUnsubscribeToken(token);
  if (!email) return false;
  return addUnsubscribe(email, source);
}

export const GET: APIRoute = async ({ url }) => {
  const token = url.searchParams.get('token');
  const company = await getCompanyConfig();
  const ok = await unsubscribeFromToken(token, 'link');
  if (!ok) {
    return page(
      'Link expired',
      `We couldn't process that unsubscribe link. Please contact ${company.supportEmail || company.name} if you'd like to opt out.`,
    );
  }
  return page(
    'You\u2019re unsubscribed',
    `You won\u2019t receive any more marketing emails from ${company.name}. You may still get essential messages related to active projects.`,
  );
};

export const POST: APIRoute = async ({ url, request }) => {
  let token = url.searchParams.get('token');
  if (!token) {
    // Some clients POST the token in the body as form data.
    try {
      const form = await request.formData();
      token = (form.get('token') as string) || null;
    } catch {
      /* ignore */
    }
  }
  const ok = await unsubscribeFromToken(token, 'one-click');
  return new Response(JSON.stringify({ ok }), {
    status: ok ? 200 : 400,
    headers: { 'Content-Type': 'application/json' },
  });
};
