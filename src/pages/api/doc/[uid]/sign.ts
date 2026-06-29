/**
 * POST /api/doc/:uid/sign
 *
 * Compliance checklist (US ESIGN Act / UETA):
 *  ✓ Intent to sign        — affirmative "Sign & Agree" button click
 *  ✓ Consent to e-records  — consentChecked flag required in body (checkbox on sign page)
 *  ✓ Association           — content hash ties the artifact to the signature event
 *  ✓ Attribution           — signerName + IP + userAgent + timestamp stored
 *  ✓ Retention             — full signed artifact (body + sig block + audit table)
 *                            baked inline into `content` at signing time
 */
import type { APIRoute } from 'astro';
import { createHash } from 'node:crypto';
import {
  getContact,
  extractPortal,
  setContactPortal,
  siteBaseUrl,
  type PortalDocument,
} from '../../../../lib/contactApi';
import { getTemplate, fillTemplate } from '../../../../lib/documentTemplates';
import { getCompanyConfig, poweredByLabel } from '../../../../lib/companyConfig';
import { sendEmail, isEmailSendConfigured } from '../../../../lib/outbound';
import { brandedEmailHtml } from '../../../../lib/emailTemplates';
import { postToSystemAlertsThread } from '../../../../lib/adminAgentAlert';
import { serverEnv } from '../../../../lib/serverEnv';

export const prerender = false;

// ── helpers ────────────────────────────────────────────────────────────────

function getIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip')?.trim() ||
    'unknown'
  );
}

function fmtDateLong(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC';
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Build the inline-styled signature block + audit table that gets permanently baked
 *  into `content`. Uses only inline styles — self-contained for any renderer. */
function buildSignatureBlock(opts: {
  docId: string;
  signerName: string;
  signedAt: string;
  consentAt: string;
  ip: string;
  userAgent: string;
  contentHash: string;
  companyName: string;
}): string {
  const { docId, signerName, signedAt, consentAt, ip, userAgent, contentHash, companyName } = opts;
  const dateStr = fmtDateLong(signedAt);

  const row = (label: string, value: string) =>
    `<tr>
      <td style="padding:3px 16px 3px 0;font-weight:600;white-space:nowrap;width:1%;vertical-align:top">${escHtml(label)}</td>
      <td style="padding:3px 0;word-break:break-all">${escHtml(value)}</td>
    </tr>`;

  return `
<!-- begin:esignature -->
<div style="margin-top:48px;page-break-inside:avoid;font-family:'Inter',-apple-system,BlinkMacSystemFont,Georgia,serif">
  <div style="height:1px;background:#1a1a1a;margin-bottom:28px"></div>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:20px;flex-wrap:wrap">
    <div style="flex:1;min-width:200px">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.6px;color:#888;margin-bottom:6px">Electronically signed by</div>
      <div style="font-size:21px;font-style:italic;font-weight:600;border-bottom:1px solid #ccc;padding-bottom:6px;margin-bottom:8px;font-family:Georgia,'Times New Roman',serif">${escHtml(signerName)}</div>
      <div style="font-size:13px;color:#555">${escHtml(dateStr)}</div>
    </div>
    <div style="width:100px;height:100px;border:2.5px solid #166534;border-radius:50%;display:flex;align-items:center;justify-content:center;flex:0 0 auto;transform:rotate(-12deg)">
      <div style="text-align:center;line-height:1.4">
        <div style="font-weight:800;font-size:13px;color:#166534;letter-spacing:2px">SIGNED</div>
        <div style="font-size:10px;color:#166534;letter-spacing:1px">via ${escHtml(companyName)}</div>
      </div>
    </div>
  </div>
  <div style="margin-top:32px;padding-top:16px;border-top:1px solid #eee">
    <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.8px;color:#aaa;margin-bottom:10px;font-weight:600">Electronic Signature Audit Record</div>
    <table style="width:100%;border-collapse:collapse;font-size:11px;color:#777;font-family:ui-monospace,'Cascadia Code',monospace">
      ${row('Document ID', docId)}
      ${row('Signed at (UTC)', fmtDateLong(signedAt))}
      ${row('Consent at (UTC)', fmtDateLong(consentAt))}
      ${row('IP address', ip)}
      ${row('User agent', userAgent.slice(0, 200))}
      ${row('Content hash (SHA-256)', contentHash)}
    </table>
  </div>
</div>
<!-- end:esignature -->`.trim();
}

/** Fire-and-forget alert to the admin System alerts thread. */
async function notifyOperator(opts: {
  signerName: string;
  title: string;
  viewUrl: string;
  contactName: string;
}): Promise<void> {
  const msg = [
    'Document signed',
    `Contact: ${opts.contactName}`,
    `Signed by: ${opts.signerName}`,
    `Document: ${opts.title}`,
    opts.viewUrl,
  ].join('\n');
  await postToSystemAlertsThread({
    message: msg,
    autoRun: false,
    push: {
      title: `Signed: ${opts.title}`,
      body: `${opts.contactName} · ${opts.signerName}`,
      tag: 'doc-signed',
      url: '/admin?tab=documents',
    },
  }).catch(() => {});
}

function err(status: number, error: string): Response {
  return new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── route handler ──────────────────────────────────────────────────────────

export const POST: APIRoute = async ({ params, request }) => {
  const uid = (params.uid ?? '').trim();
  if (!uid) return err(400, 'Missing uid');

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return err(400, 'Invalid JSON');
  }

  const raw = body as Record<string, unknown>;
  const templateSlug = typeof raw.template === 'string' ? raw.template.trim() : '';
  const signerName   = typeof raw.signerName === 'string' ? raw.signerName.trim() : '';
  const consentChecked = raw.consentChecked === true;

  if (!templateSlug)        return err(400, 'Missing template');
  if (signerName.length < 2) return err(400, 'signerName must be at least 2 characters');
  if (!consentChecked)       return err(400, 'Electronic-records consent is required');

  const tmpl = getTemplate(templateSlug);
  if (!tmpl) return err(400, `Unknown template "${templateSlug}"`);

  const contactRes = await getContact(uid);
  if (!contactRes.ok || contactRes.data.archived) return err(404, 'Contact not found');

  const portal = extractPortal(contactRes.data) ?? {};
  if (portal.enabled === false) return err(404, 'Contact not found');

  // ── Re-sign guard ──────────────────────────────────────────────────────────
  const existingDoc = (portal.documents ?? []).find((d) => d.template === templateSlug);
  if (existingDoc) {
    const viewUrl = `${siteBaseUrl(request)}/doc/${encodeURIComponent(uid)}/view/${existingDoc.id}`;
    return new Response(
      JSON.stringify({ ok: false, alreadySigned: true, docId: existingDoc.id, viewUrl }),
      { status: 409, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // ── Capture audit metadata ─────────────────────────────────────────────────
  const ip        = getIp(request);
  const userAgent = request.headers.get('user-agent')?.trim() ?? 'unknown';
  const signedAt  = new Date().toISOString();
  const consentAt = signedAt; // consent was recorded in the same request

  const company = await getCompanyConfig(request);

  // ── Fill template + hash ───────────────────────────────────────────────────
  const filledHtml  = fillTemplate(tmpl.html, contactRes.data, company);
  const contentHash = createHash('sha256').update(filledHtml, 'utf8').digest('hex');

  // ── Bake in signature block + audit table ──────────────────────────────────
  const docId = crypto.randomUUID();
  const sigBlock = buildSignatureBlock({
    docId,
    signerName,
    signedAt,
    consentAt,
    ip,
    userAgent,
    contentHash,
    companyName: company.name,
  });
  const fullContent = filledHtml + '\n' + sigBlock;

  const doc: PortalDocument = {
    id:          docId,
    template:    templateSlug,
    title:       tmpl.title,
    signedAt,
    signerName,
    content:     fullContent,
    ip,
    userAgent,
    consentAt,
    contentHash,
  };

  const merged = {
    ...portal,
    documents: [...(portal.documents ?? []), doc],
  };

  const saveRes = await setContactPortal(uid, merged);
  if (!saveRes.ok) return err(502, saveRes.error);

  const viewUrl = `${siteBaseUrl(request)}/doc/${encodeURIComponent(uid)}/view/${docId}`;
  const contact = contactRes.data;

  // ── Post-sign email to signer (fire and forget) ────────────────────────────
  if (contact.email && isEmailSendConfigured()) {
    const signerFirstName = (contact.name || signerName || '').split(/\s+/)[0] || 'there';
    sendEmail({
      to: contact.email,
      subject: `Your signed copy: ${tmpl.title}`,
      text: [
        `Hi ${contact.name},`,
        '',
        `You have electronically signed "${tmpl.title}".`,
        '',
        `View and download your signed copy here:`,
        viewUrl,
        '',
        `Signed by: ${signerName}`,
        `Date: ${fmtDateLong(signedAt)}`,
        `Document ID: ${docId}`,
        '',
        poweredByLabel(company),
      ].join('\n'),
      html: await brandedEmailHtml({
        firstName: signerFirstName,
        paragraphs: [`You have electronically signed "${tmpl.title}".`],
        cta: { label: 'View & download your signed copy', url: viewUrl },
        metaRows: [
          ['Signed by', signerName],
          ['Date', fmtDateLong(signedAt)],
          ['Document ID', docId],
        ],
      }),
    }).catch(() => {});
  }

  // ── Admin alert ───────────────────────────────────────────────────────────
  notifyOperator({
    signerName,
    title: tmpl.title,
    viewUrl,
    contactName: contact.name,
  }).catch(() => {});

  return new Response(
    JSON.stringify({ ok: true, docId, viewUrl }),
    { headers: { 'Content-Type': 'application/json' } }
  );
};
