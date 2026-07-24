/**
 * Backfill attachments_json (+ fix blank summaries) for inbox rows that have
 * a resend_email_id but no stored attachment metadata.
 *
 * Usage: node scripts/backfill-email-attachments.mjs
 */
import pg from 'pg';
import { Resend } from 'resend';

const databaseUrl = process.env.DATABASE_URL?.trim();
const apiKey = process.env.RESEND_API_KEY?.trim();
if (!databaseUrl) throw new Error('DATABASE_URL required');
if (!apiKey) throw new Error('RESEND_API_KEY required');

function normalizeAttachments(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const id = String(item.id ?? '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      filename: String(item.filename ?? '').trim() || `attachment-${id}`,
      contentType: String(item.content_type ?? item.contentType ?? '').trim(),
      size: Number.isFinite(Number(item.size)) ? Math.floor(Number(item.size)) : 0,
      ...(item.content_id || item.contentId
        ? { contentId: String(item.content_id ?? item.contentId).trim() }
        : {}),
      ...(item.content_disposition || item.contentDisposition
        ? {
            contentDisposition: String(
              item.content_disposition ?? item.contentDisposition,
            ).trim(),
          }
        : {}),
    });
  }
  return out;
}

function attachmentSummary(attachments) {
  const names = attachments.map((a) => a.filename).filter(Boolean);
  if (!names.length) return '';
  if (names.length === 1) return `Attached: ${names[0]}`;
  if (names.length <= 3) return `Attached: ${names.join(', ')}`;
  return `Attached ${names.length} files: ${names.slice(0, 2).join(', ')}, +${names.length - 2} more`;
}

const pool = new pg.Pool({ connectionString: databaseUrl, ssl: /sslmode=require/i.test(databaseUrl) ? { rejectUnauthorized: false } : undefined });
const resend = new Resend(apiKey);

await pool.query(
  `ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS attachments_json JSONB NOT NULL DEFAULT '[]'::jsonb`,
);

const { rows } = await pool.query(`
  SELECT id, resend_email_id, summary, subject, from_address
  FROM email_inbox
  WHERE resend_email_id <> ''
    AND (
      attachments_json IS NULL
      OR attachments_json = '[]'::jsonb
      OR summary ~* '(no body|blank|empty|no content|no message body)'
    )
  ORDER BY received_at DESC
  LIMIT 100
`);

console.log(`Checking ${rows.length} inbox rows…`);
let updated = 0;

for (const row of rows) {
  const { data: email, error } = await resend.emails.receiving.get(row.resend_email_id);
  let attachments = normalizeAttachments(email?.attachments);
  if (!attachments.length) {
    const { data: list, error: listErr } = await resend.emails.receiving.attachments.list({
      emailId: row.resend_email_id,
    });
    if (!listErr) attachments = normalizeAttachments(list?.data ?? list);
  }
  if (error && !attachments.length) {
    console.warn('skip', row.id, error.message || error);
    continue;
  }
  if (!attachments.length) continue;

  let summary = row.summary || '';
  if (
    /\b(no body|blank|empty|no content|no message body)\b/i.test(summary) &&
    !/\battach/i.test(summary)
  ) {
    summary = attachmentSummary(attachments);
  }

  await pool.query(
    `UPDATE email_inbox
     SET attachments_json = $1::jsonb,
         summary = CASE WHEN $2::text <> '' THEN $2 ELSE summary END
     WHERE id = $3`,
    [JSON.stringify(attachments), summary, row.id],
  );
  updated += 1;
  console.log('updated', {
    id: row.id,
    from: row.from_address,
    subject: row.subject,
    files: attachments.map((a) => a.filename),
    summary,
  });
}

await pool.end();
console.log(`Done. Updated ${updated} row(s).`);
