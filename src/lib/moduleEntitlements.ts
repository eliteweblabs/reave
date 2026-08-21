/**
 * Purchase / request records for paid modules.
 * Activation is still an owner action (features[] + deploy). This table is
 * the sales ledger so a client cannot flip a module on from the UI.
 */
import { getPgPool } from './pgPool';
import type { FeatureId } from './featureCatalog.ts';
import { FEATURE_ID_SET } from './featureCatalog.ts';

export const MODULE_PURCHASE_STATUSES = ['requested', 'invoiced', 'paid'] as const;
export type ModulePurchaseStatus = (typeof MODULE_PURCHASE_STATUSES)[number];

export type ModuleEntitlement = {
  feature: FeatureId;
  status: ModulePurchaseStatus;
  amount: number | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  invoiceUrl: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS module_entitlements (
  feature         TEXT PRIMARY KEY,
  status          TEXT NOT NULL
    CHECK (status IN ('requested', 'invoiced', 'paid')),
  amount          NUMERIC(10, 2),
  invoice_id      TEXT,
  invoice_number  TEXT,
  invoice_url     TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
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

function rowToEntitlement(row: {
  feature: string;
  status: string;
  amount: string | number | null;
  invoice_id: string | null;
  invoice_number: string | null;
  invoice_url: string | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}): ModuleEntitlement {
  return {
    feature: row.feature as FeatureId,
    status: row.status as ModulePurchaseStatus,
    amount: row.amount != null ? Number(row.amount) : null,
    invoiceId: row.invoice_id,
    invoiceNumber: row.invoice_number,
    invoiceUrl: row.invoice_url,
    notes: row.notes,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export function isFeatureId(value: string): value is FeatureId {
  return FEATURE_ID_SET.has(value);
}

export async function listModuleEntitlements(): Promise<ModuleEntitlement[]> {
  const pool = await ensureSchema().catch(() => null);
  if (!pool) return [];
  const { rows } = await pool.query(`SELECT * FROM module_entitlements ORDER BY updated_at DESC`);
  return rows.map(rowToEntitlement);
}

export async function getModuleEntitlement(feature: FeatureId): Promise<ModuleEntitlement | null> {
  const pool = await ensureSchema().catch(() => null);
  if (!pool) return null;
  const { rows } = await pool.query(`SELECT * FROM module_entitlements WHERE feature = $1`, [feature]);
  return rows[0] ? rowToEntitlement(rows[0]) : null;
}

export async function upsertModuleEntitlement(input: {
  feature: FeatureId;
  status: ModulePurchaseStatus;
  amount?: number | null;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  invoiceUrl?: string | null;
  notes?: string | null;
}): Promise<ModuleEntitlement | null> {
  const pool = await ensureSchema().catch(() => null);
  if (!pool) return null;
  const { rows } = await pool.query(
    `INSERT INTO module_entitlements (
       feature, status, amount, invoice_id, invoice_number, invoice_url, notes, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, now())
     ON CONFLICT (feature) DO UPDATE SET
       status = EXCLUDED.status,
       amount = COALESCE(EXCLUDED.amount, module_entitlements.amount),
       invoice_id = COALESCE(EXCLUDED.invoice_id, module_entitlements.invoice_id),
       invoice_number = COALESCE(EXCLUDED.invoice_number, module_entitlements.invoice_number),
       invoice_url = COALESCE(EXCLUDED.invoice_url, module_entitlements.invoice_url),
       notes = COALESCE(EXCLUDED.notes, module_entitlements.notes),
       updated_at = now()
     RETURNING *`,
    [
      input.feature,
      input.status,
      input.amount ?? null,
      input.invoiceId ?? null,
      input.invoiceNumber ?? null,
      input.invoiceUrl ?? null,
      input.notes ?? null,
    ],
  );
  return rows[0] ? rowToEntitlement(rows[0]) : null;
}
