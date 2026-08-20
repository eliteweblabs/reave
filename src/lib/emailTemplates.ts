/**
 * Branded HTML email templates for all outbound emails.
 * Uses table-based layout for maximum email-client compatibility
 * (Gmail, Apple Mail, Outlook). Supports prefers-color-scheme so
 * Apple Mail and modern mobile clients render in dark or light mode
 * automatically; inline styles provide the light-mode fallback for
 * clients that strip <style> blocks (Gmail, older Outlook).
 *
 * Visual language mirrors the public site: dark logo header, brand
 * gradient pill CTAs (pink → magenta), and Space Grotesk typography.
 */
import { getCompanyConfig, deckQuantumHeroLogo } from './companyConfig';
import { siteBaseUrl } from './contactApi';
import { qrCodeDataUrl } from './qrCode';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Absolute logo URL for <img> — admin upload, default /reave-logo.png, or empty when hidden. */
function emailLogoAbsoluteUrl(company: Awaited<ReturnType<typeof getCompanyConfig>>, base: string): string {
  const path = deckQuantumHeroLogo(company);
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalized}`;
}

export type EmailCta = { label: string; url: string };
/** Optional QR code linking to the same URL as the CTA (or another share link). */
export type EmailQr = { url: string; label?: string };
/** Label, display value, optional link (e.g. calendar download or maps directions). */
export type EmailMetaRow = [string, string, string?];

/**
 * Wraps email content in the organization branded wrapper.
 *
 * @param firstName  - Recipient's first name for the greeting
 * @param paragraphs - Body paragraphs (plain text, auto-escaped)
 * @param cta        - Optional primary call-to-action button
 * @param metaRows   - Optional metadata table rows (e.g. "Signed by", "Date")
 * @param note       - Optional small gray footnote (plain text, auto-escaped)
 */
export async function brandedEmailHtml(opts: {
  firstName: string;
  paragraphs: string[];
  cta?: EmailCta;
  qr?: EmailQr;
  metaRows?: EmailMetaRow[];
  note?: string;
  /** Optional sender sign-off appended after body paragraphs (Admin → Profile). */
  signature?: string;
  /** Marketing footer: one-click unsubscribe link (adds CAN-SPAM footer row). */
  unsubscribeUrl?: string;
  /** Marketing footer: physical mailing address (CAN-SPAM requirement). */
  footerAddress?: string;
}): Promise<string> {
  const company = await getCompanyConfig();
  const base = siteBaseUrl();
  const brandName = company.name || 'Business OS';
  const brandPrimary = company.brandPrimary || '#f472b6';
  const brandSecondary = company.brandSecondary || '#c026d3';
  const brandGradient = `linear-gradient(135deg, ${brandPrimary}, ${brandSecondary})`;
  const logoUrl = emailLogoAbsoluteUrl(company, base);
  const homeUrl = base;
  const fontStack =
    "Space Grotesk,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

  const logoHeaderHtml = logoUrl
    ? `<img src="${esc(logoUrl)}" alt="${esc(brandName)}" width="140" height="36"
           style="display:block;max-width:220px;width:auto;height:36px;border:0;outline:none;text-decoration:none" />`
    : `<span style="display:inline-block;color:#ffffff;font-family:${fontStack};font-size:18px;font-weight:700;letter-spacing:-0.02em;line-height:1.2">${esc(brandName)}</span>`;

  const bodyRows = opts.paragraphs
    .map(
      (p) =>
        `<tr><td style="padding:0 0 16px"><p class="email-text" style="margin:0;color:#1a1a1a;font-size:15px;line-height:1.65">${esc(p)}</p></td></tr>`,
    )
    .join('\n');

  // Solid secondary = Outlook fallback; gradient for Apple Mail & modern clients.
  // Dark label matches homepage primary CTAs (#0b0512 on brand gradient).
  const ctaHtml = opts.cta
    ? `
      <tr>
        <td style="padding:8px 0 20px" align="center">
          <a href="${esc(opts.cta.url)}" class="email-cta"
             style="display:inline-block;background-color:${esc(brandSecondary)};background-image:${esc(brandGradient)};color:#0b0512;font-family:${fontStack};font-size:15px;font-weight:600;text-decoration:none;padding:13px 30px;border-radius:999px;letter-spacing:0.01em;mso-padding-alt:0;text-align:center">
            ${esc(opts.cta.label)}
          </a>
        </td>
      </tr>`
    : '';
  let qrHtml = '';
  if (opts.qr?.url?.trim()) {
    const qrSrc = await qrCodeDataUrl(opts.qr.url.trim(), 168);
    if (qrSrc) {
      const qrLabel = opts.qr.label?.trim() || 'Or scan to open on your phone';
      qrHtml = `
      <tr>
        <td style="padding:0 0 20px" align="center">
          <p class="email-note" style="margin:0 0 10px;color:#999;font-size:12px;line-height:1.5">${esc(qrLabel)}</p>
          <img src="${qrSrc}" alt="QR code" width="168" height="168"
               style="display:block;width:168px;height:168px;margin:0 auto;border:1px solid #e5e5e5;border-radius:8px" />
        </td>
      </tr>`;
    }
  }

  const metaHtml =
    opts.metaRows && opts.metaRows.length > 0
      ? `<tr><td style="padding:16px 0 0">
          <table cellpadding="0" cellspacing="0" width="100%"
                 class="email-meta-table" style="border-top:1px solid #e5e5e5;border-collapse:collapse">
            ${opts.metaRows
              .map(([label, value, href]) => {
                const valueCell = href
                  ? `<a href="${esc(href)}" class="email-link email-meta-value" style="color:${esc(brandSecondary)};font-size:13px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all;text-decoration:underline">${esc(value)}</a>`
                  : `<span class="email-meta-value" style="color:#1a1a1a;font-size:13px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all">${esc(value)}</span>`;
                return `<tr>
                    <td class="email-meta-label" style="padding:8px 16px 8px 0;font-size:13px;font-weight:600;color:#666;white-space:nowrap;vertical-align:top">${esc(label)}</td>
                    <td style="padding:8px 0">${valueCell}</td>
                  </tr>`;
              })
              .join('\n')}
          </table>
        </td></tr>`
      : '';

  const noteHtml = opts.note
    ? `<tr><td style="padding:20px 0 0"><p class="email-note" style="margin:0;color:#999;font-size:12px;line-height:1.5">${esc(opts.note)}</p></td></tr>`
    : '';

  const signatureHtml = opts.signature?.trim()
    ? `<tr><td style="padding:16px 0 0"><div class="email-signature" style="margin:0;color:#444444;font-size:14px;line-height:1.55">${opts.signature
        .trim()
        .split('\n')
        .map((line) => esc(line.trimEnd()))
        .join('<br />')}</div></td></tr>`
    : '';

  const complianceHtml =
    opts.unsubscribeUrl || opts.footerAddress
      ? `<tr><td style="padding:18px 0 0"><p class="email-note" style="margin:0;color:#999;font-size:12px;line-height:1.6">${
          opts.footerAddress ? `${esc(opts.footerAddress)}<br />` : ''
        }${
          opts.unsubscribeUrl
            ? `You're receiving this because you're a contact of ${esc(brandName)}. <a href="${esc(
                opts.unsubscribeUrl,
              )}" class="email-link" style="color:${esc(brandSecondary)};text-decoration:underline">Unsubscribe</a>.`
            : ''
        }</p></td></tr>`
      : '';

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${esc(brandName)}</title>
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
      /* CTA keeps brand gradient / solid — readable in both modes */
    }
  </style>
</head>
<body class="email-outer" style="margin:0;padding:0;background-color:#f4f4f5;font-family:${fontStack};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="email-outer" style="background-color:#f4f4f5">
    <tr>
      <td align="center" style="padding:40px 16px 48px">

        <!-- Card wrapper -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">

          <!-- ── Logo header (always dark) ──────────────────────────── -->
          <tr>
            <td style="background-color:#09090b;padding:22px 32px;border-radius:12px 12px 0 0" align="center">
              <a href="${esc(homeUrl)}" style="text-decoration:none;display:inline-block">
                ${logoHeaderHtml}
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

                <!-- Sender signature -->
                ${signatureHtml}

                <!-- CTA button -->
                ${ctaHtml}

                <!-- QR code -->
                ${qrHtml}

                <!-- Metadata table -->
                ${metaHtml}

                <!-- Note -->
                ${noteHtml}

                <!-- Marketing compliance footer (unsubscribe + address) -->
                ${complianceHtml}

              </table>
            </td>
          </tr>

          <!-- ── Footer ────────────────────────────────────────────── -->
          <tr>
            <td style="padding:20px 32px;text-align:center">
              <p class="email-footer-text" style="margin:0 0 8px;color:#aaa;font-size:12px;line-height:1.5;letter-spacing:0.02em">
                Baked in Boston
              </p>
              <p class="email-footer-text" style="margin:0;color:#aaa;font-size:12px;line-height:1.5">
                Sent by <a href="${esc(homeUrl)}" class="email-link" style="color:${esc(brandSecondary)};text-decoration:none">${esc(brandName)}</a>
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

/** @deprecated Use brandedEmailHtml */
export const reaveEmailHtml = brandedEmailHtml;
