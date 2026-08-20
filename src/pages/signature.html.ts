/**
 * Account-owner email signature — /signature.html
 *
 * Same copy-paste Gmail/Outlook block as Admin → Profile. Public + noindex
 * (company contact details already appear on the site). Built from the
 * signed-in user when present, otherwise the deployment owner.
 */
import type { APIRoute } from 'astro';
import { clerkClient } from '@clerk/astro/server';
import { getCompanyConfig } from '../lib/companyConfig';
import { hasFeature } from '../lib/features';
import { MOBILE_VIEWPORT_CONTENT } from '../lib/mobileViewport';
import {
  parseEmailSignaturePrefs,
  renderEmailSignature,
  resolveEmailSignaturePerson,
  type EmailSignaturePerson,
} from '../lib/emailSignature';

export const prerender = false;

function esc(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function personFromClerkSdk(user: {
  firstName?: string | null;
  lastName?: string | null;
  emailAddresses?: Array<{ emailAddress?: string | null }> | null;
  publicMetadata?: unknown;
}): EmailSignaturePerson {
  const meta = (user.publicMetadata ?? {}) as Record<string, unknown>;
  const prefs = parseEmailSignaturePrefs(meta);
  return {
    name: [user.firstName, user.lastName].map((p) => (p ?? '').trim()).filter(Boolean).join(' '),
    email: user.emailAddresses?.[0]?.emailAddress?.trim() || '',
    phone: typeof meta.phone === 'string' ? meta.phone.trim() : '',
    jobTitle: prefs.jobTitle,
    includeLogo: prefs.includeLogo,
    enabled: prefs.enabled,
  };
}

export const GET: APIRoute = async (context) => {
  if (!hasFeature('email_signature')) {
    return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
  }

  let person: EmailSignaturePerson | null = null;
  try {
    const { userId } = context.locals.auth();
    if (userId) {
      const user = await clerkClient(context).users.getUser(userId);
      person = personFromClerkSdk(user);
    }
  } catch {
    /* fall through */
  }
  if (!person) person = await resolveEmailSignaturePerson();
  if (!person || !person.enabled) {
    return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
  }

  const company = await getCompanyConfig(context.request);
  const rendered = renderEmailSignature({ person, company });
  const name = person.name || company.name || 'Email';
  const primary = company.brandPrimary || '#c026d3';

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
      <div id="sig-copy-source">${rendered.html}</div>
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
