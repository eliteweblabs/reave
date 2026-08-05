/**
 * Branded email signature for a client — /c/<uid>/signature.html
 *
 * Renders a self-contained, table-based HTML signature block (Gmail/Outlook
 * compatible — inline styles only, no external CSS) built from the client's
 * own contact + portal branding (name, company, phone, email, website, logo,
 * brand color). A "Copy signature" button copies the *rendered* signature
 * (not raw markup) so pasting into Gmail's signature box keeps formatting.
 *
 * Public, gated the same way as the portal page (unguessable uid is the
 * access token; revoked via `enabled:false`). Never includes the internal
 * private `notes` field. This exists so the assistant never has to fabricate
 * a hosting location (e.g. a GitHub repo or the client's own website) for a
 * one-off asset — the link is always real and stays live on this domain.
 */
import type { APIRoute } from 'astro';
import { getContact, extractPortal, contactStringField, contactTelHref } from '../../../lib/contactApi';
import { resolvePortalBrandColors, DEFAULT_PORTAL_BRAND } from '../../../lib/portalBrandColors';
import { MOBILE_VIEWPORT_CONTENT } from '../../../lib/mobileViewport';

export const prerender = false;

function esc(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export const GET: APIRoute = async ({ params }) => {
  const uid = (params.slug ?? '').trim();
  const notFound = () => new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
  if (!uid) return notFound();

  const res = await getContact(uid);
  if (!res.ok || res.data.archived) return notFound();

  const portal = extractPortal(res.data);
  if (portal && portal.enabled === false) return notFound();

  const c = res.data;
  const name = contactStringField(c.name) || 'Contact';
  const company = contactStringField(c.company);
  const phone = contactStringField(c.phone);
  const phoneHref = contactTelHref(c.phone);
  const email = contactStringField(c.email);
  const website = contactStringField(portal?.website);
  const logoUrl = contactStringField(portal?.logoUrl);
  const websiteDisplay = website.replace(/^https?:\/\//i, '').replace(/\/$/, '');

  const colors = (await resolvePortalBrandColors(uid, portal ?? {})) ?? DEFAULT_PORTAL_BRAND;
  const primary = colors.primary;

  const logoCell = logoUrl
    ? `<td style="padding:0 16px 0 0; vertical-align:top;"><img src="${esc(logoUrl)}" width="64" height="64" alt="${esc(company || name)}" style="display:block; width:64px; height:64px; object-fit:contain; border-radius:8px;" /></td>`
    : '';

  const contactLines: string[] = [];
  if (phone) {
    contactLines.push(
      phoneHref
        ? `<a href="tel:${esc(phoneHref)}" style="color:#444444; text-decoration:none;">${esc(phone)}</a>`
        : esc(phone),
    );
  }
  if (email) {
    contactLines.push(`<a href="mailto:${esc(email)}" style="color:#444444; text-decoration:none;">${esc(email)}</a>`);
  }

  const signatureHtml = `<table cellpadding="0" cellspacing="0" role="presentation" style="font-family: Arial, Helvetica, sans-serif; font-size: 13px; line-height: 1.45; color: #333333; border-collapse: collapse;"><tr>${logoCell}<td style="border-left: 3px solid ${esc(primary)}; padding-left: 16px; vertical-align: top;"><div style="font-size: 15px; font-weight: bold; color: #111111;">${esc(name)}</div>${company ? `<div style="color: ${esc(primary)}; font-weight: 600; margin-top: 2px;">${esc(company)}</div>` : ''}${contactLines.length ? `<div style="margin-top: 6px; color: #444444;">${contactLines.join(' &nbsp;|&nbsp; ')}</div>` : ''}${website ? `<div style="margin-top: 2px;"><a href="${esc(website)}" style="color: ${esc(primary)}; text-decoration: none;">${esc(websiteDisplay)}</a></div>` : ''}</td></tr></table>`;

  const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="${MOBILE_VIEWPORT_CONTENT}" />
<meta name="robots" content="noindex" />
<title>${esc(name)} — Email signature</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; padding: 32px 16px; background: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #18181b; touch-action: manipulation; }
  .wrap { max-width: 560px; margin: 0 auto; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  p.hint { color: #52525b; font-size: 14px; margin: 0 0 20px; }
  .card { background: #ffffff; border: 1px solid #e4e4e7; border-radius: 12px; padding: 24px; margin-bottom: 20px; }
  #sig-copy-source { display: inline-block; }
  button#copy-btn { appearance: none; border: none; border-radius: 8px; background: ${esc(primary)}; color: #ffffff; font-size: 14px; font-weight: 600; padding: 10px 18px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; min-width: 10.5rem; }
  button#copy-btn:active { opacity: 0.85; }
  ol { color: #3f3f46; font-size: 14px; line-height: 1.6; padding-left: 20px; margin: 12px 0 0; }
  #copy-status { margin-top: 10px; font-size: 13px; color: #16a34a; min-height: 16px; }
</style>
</head>
<body>
  <div class="wrap">
    <h1>${esc(name)}'s email signature</h1>
    <p class="hint">Copy this signature and paste it into your email client's signature settings.</p>
    <div class="card">
      <div id="sig-copy-source">${signatureHtml}</div>
    </div>
    <button id="copy-btn" type="button">Copy signature</button>
    <div id="copy-status"></div>
    <ol>
      <li>Tap <strong>Copy signature</strong> above.</li>
      <li>In Gmail: Settings (gear icon) → <strong>See all settings</strong> → General → Signature.</li>
      <li>Click into the signature box, then paste (Cmd/Ctrl+V).</li>
      <li>Save changes at the bottom of the page.</li>
    </ol>
  </div>
  <script>
    (function () {
      var btn = document.getElementById('copy-btn');
      var status = document.getElementById('copy-status');
      var source = document.getElementById('sig-copy-source');
      var iconCheck = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
      btn.addEventListener('click', function () {
        var html = source.innerHTML;
        var text = source.innerText || source.textContent || '';
        function showCopied() {
          var prev = btn.innerHTML;
          btn.innerHTML = iconCheck;
          btn.setAttribute('aria-label', 'Copied');
          setTimeout(function () {
            btn.innerHTML = prev;
            btn.removeAttribute('aria-label');
          }, 1000);
        }
        function done(ok) {
          if (ok) {
            showCopied();
            status.textContent = 'Copied! Paste it into your signature settings.';
          } else {
            status.textContent = 'Could not copy automatically — select the box above and copy manually (Cmd/Ctrl+C).';
          }
        }
        if (navigator.clipboard && window.ClipboardItem) {
          try {
            var item = new ClipboardItem({
              'text/html': new Blob([html], { type: 'text/html' }),
              'text/plain': new Blob([text], { type: 'text/plain' }),
            });
            navigator.clipboard.write([item]).then(function () { done(true); }, function () { legacyCopy(); });
            return;
          } catch (e) {
            legacyCopy();
            return;
          }
        }
        legacyCopy();
        function legacyCopy() {
          try {
            var range = document.createRange();
            range.selectNodeContents(source);
            var sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            var ok = document.execCommand('copy');
            sel.removeAllRanges();
            done(ok);
          } catch (e) {
            done(false);
          }
        }
      });
    })();
  </script>
</body>
</html>`;

  return new Response(page, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
};
