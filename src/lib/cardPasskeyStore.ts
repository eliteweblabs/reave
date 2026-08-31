/**
 * WebAuthn passkeys registered from /card — ties a discoverable credential to a Clerk user.
 */
import type { AuthenticatorTransportFuture, WebAuthnCredential } from '@simplewebauthn/server';
import { getPgPool } from './pgPool';

export type StoredCardPasskey = {
  credentialId: string;
  userId: string;
  publicKey: Uint8Array;
  counter: number;
  transports: AuthenticatorTransportFuture[];
  deviceType: string | null;
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
};

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS card_passkeys (
  credential_id  TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL,
  public_key     BYTEA NOT NULL,
  counter        BIGINT NOT NULL DEFAULT 0,
  transports     TEXT[] NOT NULL DEFAULT '{}',
  device_type    TEXT,
  backed_up      BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS card_passkeys_user_id_idx ON card_passkeys (user_id);
`;

let _schemaReady: Promise<void> | null = null;

async function ensureSchema(): Promise<ReturnType<typeof getPgPool>> {
  const pool = getPgPool();
  if (!pool) return null;
  if (!_schemaReady) {
    _schemaReady = pool
      .query(SCHEMA_SQL)
      .then(() => undefined)
      .catch((err) => {
        _schemaReady = null;
        throw err;
      });
  }
  await _schemaReady;
  return pool;
}

function rowToPasskey(row: {
  credential_id: string;
  user_id: string;
  public_key: Buffer;
  counter: string | number;
  transports: string[] | null;
  device_type: string | null;
  backed_up: boolean;
  created_at: Date | string;
  last_used_at: Date | string | null;
}): StoredCardPasskey {
  return {
    credentialId: row.credential_id,
    userId: row.user_id,
    publicKey: new Uint8Array(row.public_key),
    counter: Number(row.counter) || 0,
    transports: (row.transports ?? []).filter(Boolean) as AuthenticatorTransportFuture[],
    deviceType: row.device_type,
    backedUp: Boolean(row.backed_up),
    createdAt: new Date(row.created_at).toISOString(),
    lastUsedAt: row.last_used_at ? new Date(row.last_used_at).toISOString() : null,
  };
}

export async function storeHasCardPasskeys(): Promise<boolean> {
  const pool = await ensureSchema();
  if (!pool) return false;
  const { rows } = await pool.query(`SELECT 1 FROM card_passkeys LIMIT 1`);
  return rows.length > 0;
}

export async function storeListCardPasskeysForUser(userId: string): Promise<StoredCardPasskey[]> {
  const pool = await ensureSchema();
  if (!pool) return [];
  const { rows } = await pool.query(
    `SELECT credential_id, user_id, public_key, counter, transports, device_type, backed_up, created_at, last_used_at
     FROM card_passkeys WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId],
  );
  return rows.map(rowToPasskey);
}

export async function storeFindCardPasskey(credentialId: string): Promise<StoredCardPasskey | null> {
  const pool = await ensureSchema();
  if (!pool) return null;
  const { rows } = await pool.query(
    `SELECT credential_id, user_id, public_key, counter, transports, device_type, backed_up, created_at, last_used_at
     FROM card_passkeys WHERE credential_id = $1 LIMIT 1`,
    [credentialId],
  );
  return rows[0] ? rowToPasskey(rows[0]) : null;
}

export async function storeSaveCardPasskey(input: {
  credentialId: string;
  userId: string;
  publicKey: Uint8Array;
  counter: number;
  transports?: AuthenticatorTransportFuture[];
  deviceType?: string | null;
  backedUp?: boolean;
}): Promise<StoredCardPasskey | null> {
  const pool = await ensureSchema();
  if (!pool) return null;
  const { rows } = await pool.query(
    `INSERT INTO card_passkeys
       (credential_id, user_id, public_key, counter, transports, device_type, backed_up)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (credential_id) DO UPDATE SET
       public_key = EXCLUDED.public_key,
       counter = EXCLUDED.counter,
       transports = EXCLUDED.transports,
       device_type = EXCLUDED.device_type,
       backed_up = EXCLUDED.backed_up
     RETURNING credential_id, user_id, public_key, counter, transports, device_type, backed_up, created_at, last_used_at`,
    [
      input.credentialId,
      input.userId,
      Buffer.from(input.publicKey),
      input.counter,
      input.transports ?? [],
      input.deviceType ?? null,
      input.backedUp ?? false,
    ],
  );
  return rows[0] ? rowToPasskey(rows[0]) : null;
}

export async function storeUpdateCardPasskeyCounter(
  credentialId: string,
  counter: number,
): Promise<void> {
  const pool = await ensureSchema();
  if (!pool) return;
  await pool.query(
    `UPDATE card_passkeys SET counter = $2, last_used_at = now() WHERE credential_id = $1`,
    [credentialId, counter],
  );
}

export function toWebAuthnCredential(row: StoredCardPasskey): WebAuthnCredential {
  return {
    id: row.credentialId,
    publicKey: row.publicKey,
    counter: row.counter,
    transports: row.transports,
  };
}
