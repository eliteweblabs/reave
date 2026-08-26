/**
 * Branded HTML email templates for all outbound emails.
 * Uses table-based layout for maximum email-client compatibility
 * (Gmail, Apple Mail, Outlook). Supports prefers-color-scheme so
 * Apple Mail and modern mobile clients render in dark or light mode
 * automatically; inline styles provide the light-mode fallback for
 * clients that strip <style> blocks (Gmail, older Outlook).
 *
 * Visual language mirrors the public site: white rounded card, wordmark
 * left in the header, square icon in the footer, brand primary→secondary CTA.
 */
import { resolveCompanyBrandColors } from './companyBrandColors';
import {
  brandIconUrl,
  companyBrandingVersion,
  deckQuantumHeroLogo,
  getCompanyConfig,
  type CompanyConfig,
} from './companyConfig';
import { siteBaseUrl } from './contactApi';
import { qrCodeDataUrl } from './qrCode';
import { signatureHtmlForEmail } from './userEmailSignature';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function emailAbsoluteUrl(path: string, base: string): string {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalized}`;
}

/** Absolute wordmark URL for <img> — /branding/logo.png, or empty when hidden. */
function emailLogoAbsoluteUrl(company: Awaited<ReturnType<typeof getCompanyConfig>>, base: string): string {
  return emailAbsoluteUrl(deckQuantumHeroLogo(company) || '', base);
}

/** Absolute square mark for the email footer. */
function emailIconAbsoluteUrl(company: Awaited<ReturnType<typeof getCompanyConfig>>, base: string): string {
  return emailAbsoluteUrl(brandIconUrl(64, companyBrandingVersion(company), { transparent: true }), base);
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
  const cta = emailBrandCta(company);
  const brandLink = cta.primary;
  const logoUrl = emailLogoAbsoluteUrl(company, base);
  const iconUrl = emailIconAbsoluteUrl(company, base);
  const homeUrl = base;
  const fontStack =
    "Space Grotesk,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

  const logoHeaderHtml = logoUrl
    ? `<img src="${esc(logoUrl)}" alt="${esc(brandName)}" width="140" height="36"
           style="display:block;max-width:180px;width:auto;height:32px;border:0;outline:none;text-decoration:none" />`
    : `<span style="display:inline-block;color:#111111;font-family:${fontStack};font-size:18px;font-weight:700;letter-spacing:-0.02em;line-height:1.2">${esc(brandName)}</span>`;

  const footerIconHtml = iconUrl
    ? `<a href="${esc(homeUrl)}" style="text-decoration:none;display:inline-block">
         <img src="${esc(iconUrl)}" alt="" width="28" height="28"
              style="display:block;width:28px;height:28px;border:0;outline:none;margin:0 auto 10px" />
       </a>`
    : '';

  const bodyRows = opts.paragraphs
    .map(
      (p) =>
        `<tr><td style="padding:0 0 16px"><p class="email-text" style="margin:0;color:#1a1a1a;font-size:15px;line-height:1.65">${esc(p)}</p></td></tr>`,
    )
    .join('\n');

  const ctaHtml = opts.cta
    ? `
      <tr>
        <td style="padding:8px 0 20px" align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td class="email-cta" align="center" bgcolor="${esc(cta.primary)}"
                  style="border-radius:999px;background-color:${esc(cta.primary)};background-image:${esc(cta.gradient)};box-shadow:${esc(cta.shadow)}">
                <a href="${esc(opts.cta.url)}"
                   style="display:inline-block;padding:13px 30px;border-radius:999px;color:#ffffff;font-family:${fontStack};font-size:15px;font-weight:600;letter-spacing:0.01em;line-height:1;text-decoration:none;text-align:center">
                  ${esc(opts.cta.label)}
                </a>
              </td>
            </tr>
          </table>
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
                  ? `<a href="${esc(href)}" class="email-link email-meta-value" style="color:${esc(brandLink)};font-size:13px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all;text-decoration:underline">${esc(value)}</a>`
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
    ? `<tr><td style="padding:16px 0 0"><div class="email-signature" style="margin:0;color:#444444;font-size:14px;line-height:1.55">${signatureHtmlForEmail(opts.signature)}</div></td></tr>`
    : '';

  const complianceHtml =
    opts.unsubscribeUrl || opts.footerAddress
      ? `<tr><td style="padding:18px 0 0"><p class="email-note" style="margin:0;color:#999;font-size:12px;line-height:1.6">${
          opts.footerAddress ? `${esc(opts.footerAddress)}<br />` : ''
        }${
          opts.unsubscribeUrl
            ? `You're receiving this because you're a contact of ${esc(brandName)}. <a href="${esc(
                opts.unsubscribeUrl,
              )}" class="email-link" style="color:${esc(brandLink)};text-decoration:underline">Unsubscribe</a>.`
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
      body, .email-outer          { background-color: #111111 !important; }
      /* Card stays white so the dark wordmark / icon stay visible. */
    }
  </style>
</head>
<body class="email-outer" style="margin:0;padding:0;background-color:#f4f4f5;font-family:${fontStack};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="email-outer" style="background-color:#f4f4f5">
    <tr>
      <td align="center" style="padding:40px 16px 48px">

        <!-- White card — wordmark left, icon in the footer -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="email-card" style="max-width:560px;background-color:#ffffff;border:1px solid #e5e5e5;border-radius:12px">

          <tr>
            <td style="padding:22px 28px 8px" align="left">
              <a href="${esc(homeUrl)}" style="text-decoration:none;display:inline-block">
                ${logoHeaderHtml}
              </a>
            </td>
          </tr>

          <tr>
            <td class="email-card-body" style="padding:12px 28px 8px">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">

                <tr>
                  <td style="padding:0 0 20px">
                    <p class="email-greeting" style="margin:0;color:#1a1a1a;font-size:16px;font-weight:600;line-height:1.4">Hi ${esc(opts.firstName)},</p>
                  </td>
                </tr>

                ${bodyRows}
                ${signatureHtml}
                ${ctaHtml}
                ${qrHtml}
                ${metaHtml}
                ${noteHtml}
                ${complianceHtml}

              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:20px 28px 24px;text-align:center;border-top:1px solid #f0f0f0">
              ${footerIconHtml}
              <p class="email-footer-text" style="margin:0 0 6px;color:#999;font-size:12px;line-height:1.5;letter-spacing:0.02em">
                Baked in Boston
              </p>
              <p class="email-footer-text" style="margin:0;color:#999;font-size:12px;line-height:1.5">
                Sent by <a href="${esc(homeUrl)}" class="email-link" style="color:${esc(brandLink)};text-decoration:none">${esc(brandName)}</a>
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

/** CTA fill from admin Company brand_primary / brand_secondary. */
function emailBrandCta(company: Pick<CompanyConfig, 'brandPrimary' | 'brandSecondary'>): {
  primary: string;
  secondary: string;
  gradient: string;
  shadow: string;
} {
  const colors = resolveCompanyBrandColors(company.brandPrimary, company.brandSecondary);
  return {
    primary: colors.primary,
    secondary: colors.secondary,
    gradient: `linear-gradient(145deg, ${colors.primary} 0%, ${colors.secondary} 100%)`,
    shadow: `0 2px 16px rgba(${colors.secondaryRgb}, 0.35)`,
  };
}

/** @deprecated Use brandedEmailHtml */
export const reaveEmailHtml = brandedEmailHtml;
