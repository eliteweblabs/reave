/**
 * Persist reply drafts for sample / future live social items.
 * Reviews keep using online_reviews; this table is for soc:* ids only.
 */
import { getPgPool } from '../pgPool';

export type SocialActivityStatus = 'new' | 'todo' | 'responded' | 'dismissed';

export type SocialActivityReply = {
  itemId: string;
  replyDraft: string;
  replyText: string;
  status: SocialActivityStatus;
  updatedAt: string;
};

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS social_feed_replies (
  item_id      TEXT PRIMARY KEY,
  reply_draft  TEXT,
  reply_text   TEXT,
  status       TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'todo', 'responded', 'dismissed')),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

let _schemaReady: Promise<void> | null = null;

async function ensureSchema() {
  const pool = getPgPool();
  if (!pool) return null;
  if (!_schemaReady) {
    _schemaReady = pool
      .query(SCHEMA_SQL)
      .then(() => undefined)
      .catch((e) => {
        _schemaReady = null;
        throw e;
      });
  }
  await _schemaReady;
  return pool;
}

function rowToReply(row: { item_id: string; reply_draft: string | null; reply_text: string | null; status: string; updated_at: Date }): SocialActivityReply {
  return {
    itemId: row.item_id,
    replyDraft: row.reply_draft ?? '',
    replyText: row.reply_text ?? '',
    status: (row.status as SocialActivityStatus) || 'new',
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function getActivityReplies(): Promise<Map<string, SocialActivityReply>> {
  const pool = await ensureSchema().catch(() => null);
  if (!pool) return new Map();
  const { rows } = await pool.query(`SELECT * FROM social_feed_replies`);
  return new Map(rows.map((row) => [row.item_id as string, rowToReply(row)]));
}

export async function upsertActivityReply(input: {
  itemId: string;
  replyDraft?: string;
  replyText?: string;
  status?: SocialActivityStatus;
}): Promise<SocialActivityReply | null> {
  const pool = await ensureSchema().catch(() => null);
  if (!pool) return null;

  const { rows } = await pool.query(
    `INSERT INTO social_feed_replies (item_id, reply_draft, reply_text, status, updated_at)
     VALUES ($1, $2, $3, COALESCE($4, 'new'), now())
     ON CONFLICT (item_id) DO UPDATE SET
       reply_draft = COALESCE($2, social_feed_replies.reply_draft),
       reply_text  = COALESCE($3, social_feed_replies.reply_text),
       status      = COALESCE($4, social_feed_replies.status),
       updated_at  = now()
     RETURNING *`,
    [
      input.itemId,
      input.replyDraft ?? null,
      input.replyText ?? null,
      input.status ?? null,
    ],
  );
  return rows[0] ? rowToReply(rows[0]) : null;
}
