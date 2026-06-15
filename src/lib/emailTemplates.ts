/**
 * Branded HTML email templates for all outbound Reave emails.
 * Uses table-based layout for maximum email-client compatibility
 * (Gmail, Apple Mail, Outlook). Supports prefers-color-scheme so
 * Apple Mail and modern mobile clients render in dark or light mode
 * automatically; inline styles provide the light-mode fallback for
 * clients that strip <style> blocks (Gmail, older Outlook).
 */
import { siteBaseUrl } from './contactApi';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export type EmailCta = { label: string; url: string };
export type EmailMetaRow = [string, string];

/**
 * Wraps email content in the Reave branded wrapper.
 *
 * @param firstName  - Recipient's first name for the greeting
 * @param paragraphs - Body paragraphs (plain text, auto-escaped)
 * @param cta        - Optional primary call-to-action button + link
 * @param metaRows   - Optional metadata table rows (e.g. "Signed by", "Date")
 * @param note       - Optional small gray footnote (plain text, auto-escaped)
 */
export function reaveEmailHtml(opts: {
  firstName: string;
  paragraphs: string[];
  cta?: EmailCta;
  metaRows?: EmailMetaRow[];
  note?: string;
}): string {
  const base = siteBaseUrl();
  const logoUrl = `${base}/reave-logo.png`;
  const homeUrl = base;

  const bodyRows = opts.paragraphs
    .map(
      (p) =>
        `<tr><td style="padding:0 0 16px"><p class="email-text" style="margin:0;color:#1a1a1a;font-size:15px;line-height:1.65">${esc(p)}</p></td></tr>`,
    )
    .join('\n');

  const ctaHtml = opts.cta
    ? `
      <tr>
        <td style="padding:8px 0 4px" align="center">
          <a href="${esc(opts.cta.url)}"
             style="display:inline-block;background:#a855f7;color:#ffffff;font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif;font-size:15px;font-weight:600;text-decoration:none;padding:13px 30px;border-radius:8px;letter-spacing:0.01em;mso-padding-alt:0;text-align:center">
            ${esc(opts.cta.label)}
          </a>
        </td>
      </tr>
      <tr>
        <td style="padding:6px 0 20px" align="center">
          <a href="${esc(opts.cta.url)}" class="email-link" style="color:#a855f7;font-size:12px;word-break:break-all;text-decoration:none">${esc(opts.cta.url)}</a>
        </td>
      </tr>`
    : '';

  const metaHtml =
    opts.metaRows && opts.metaRows.length > 0
      ? `<tr><td style="padding:16px 0 0">
          <table cellpadding="0" cellspacing="0" width="100%"
                 class="email-meta-table" style="border-top:1px solid #e5e5e5;border-collapse:collapse">
            ${opts.metaRows
              .map(
                ([label, value]) =>
                  `<tr>
                    <td class="email-meta-label" style="padding:8px 16px 8px 0;font-size:13px;font-weight:600;color:#666;white-space:nowrap;vertical-align:top">${esc(label)}</td>
                    <td class="email-meta-value" style="padding:8px 0;font-size:13px;color:#1a1a1a;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all">${esc(value)}</td>
                  </tr>`,
              )
              .join('\n')}
          </table>
        </td></tr>`
      : '';

  const noteHtml = opts.note
    ? `<tr><td style="padding:20px 0 0"><p class="email-note" style="margin:0;color:#999;font-size:12px;line-height:1.5">${esc(opts.note)}</p></td></tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>Reave Automatic</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <style>
    /* ── Dark mode overrides (Apple Mail, Samsung Mail, Outlook iOS/Android) ── */
    @media (prefers-color-scheme: dark) {
      body, .email-outer          { background-color: #000000 !important; }
      .email-card-body            { background-color: #1c1c1e !important; }
      .email-greeting,
      .email-text,
      .email-meta-value           { color: #f2f2f7 !important; }
      .email-meta-label           { color: #8e8e93 !important; }
      .email-meta-table           { border-top-color: #38383a !important; }
      .email-note                 { color: #636366 !important; }
      .email-footer-text          { color: #636366 !important; }
      /* CTA button and link keep the purple — stays readable in both modes */
    }
  </style>
</head>
<body class="email-outer" style="margin:0;padding:0;background-color:#f4f4f5;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="email-outer" style="background-color:#f4f4f5">
    <tr>
      <td align="center" style="padding:40px 16px 48px">

        <!-- Card wrapper -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">

          <!-- ── Logo header (always dark) ──────────────────────────── -->
          <tr>
            <td style="background-color:#09090b;padding:22px 32px;border-radius:12px 12px 0 0" align="center">
              <a href="${esc(homeUrl)}" style="text-decoration:none;display:inline-block">
                <img src="${esc(logoUrl)}" alt="Reave" width="88" height="28"
                     style="display:block;width:88px;height:auto;border:0;outline:none;text-decoration:none"
                     onerror="this.style.display='none'" />
              </a>
            </td>
          </tr>

          <!-- ── Body ────────────────────────────────────────────────── -->
          <tr>
            <td class="email-card-body" style="background-color:#ffffff;padding:32px 32px 28px;border-radius:0 0 12px 12px">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">

                <!-- Greeting -->
                <tr>
                  <td style="padding:0 0 20px">
                    <p class="email-greeting" style="margin:0;color:#1a1a1a;font-size:16px;font-weight:600;line-height:1.4">Hi ${esc(opts.firstName)},</p>
                  </td>
                </tr>

                <!-- Body paragraphs -->
                ${bodyRows}

                <!-- CTA button + link -->
                ${ctaHtml}

                <!-- Metadata table -->
                ${metaHtml}

                <!-- Note -->
                ${noteHtml}

              </table>
            </td>
          </tr>

          <!-- ── Footer ────────────────────────────────────────────── -->
          <tr>
            <td style="padding:20px 32px;text-align:center">
              <p class="email-footer-text" style="margin:0;color:#aaa;font-size:12px;line-height:1.5">
                Sent by <a href="${esc(homeUrl)}" style="color:#a855f7;text-decoration:none">Reave Automatic</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
