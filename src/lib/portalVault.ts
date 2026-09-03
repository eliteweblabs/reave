/**
 * Client vault (portal.data) merge helpers.
 *
 * Portal metadata is stored as one contact-link JSON blob and replaced wholesale
 * on every write. Concurrent submits, a stale admin tab, or brand/address
 * enrich can therefore drop vault rows the caller never loaded. Merge by stable
 * id so unknown rows are preserved and known omissions still delete.
 */
import { createHash } from 'node:crypto';

export type VaultEntry = {
  id?: string;
  label: string;
  value?: string;
  username?: string;
  password?: string;
  url?: string;
};

export type PortalDocumentLike = {
  id: string;
  [key: string]: unknown;
};

function vaultFingerprint(entry: VaultEntry): string {
  return [
    entry.label ?? '',
    entry.username ?? '',
    entry.url ?? '',
    entry.value ?? '',
    entry.password ?? '',
  ].join('\0');
}

/** Stable id for an id-less legacy row (content hash). Existing ids win. */
export function stableVaultEntryId(entry: VaultEntry, used: Set<string>): string {
  const existing = entry.id?.trim();
  if (existing) {
    used.add(existing);
    return existing;
  }
  const digest = createHash('sha256').update(vaultFingerprint(entry)).digest('hex').slice(0, 32);
  let id = `v_${digest}`;
  let n = 0;
  while (used.has(id)) {
    n += 1;
    id = `v_${digest}_${n}`;
  }
  used.add(id);
  return id;
}

export function normalizeVaultEntries(entries: VaultEntry[] | undefined | null): VaultEntry[] {
  if (!Array.isArray(entries)) return [];
  const used = new Set<string>();
  return entries
    .filter((e) => e && typeof e === 'object' && String(e.label ?? '').trim())
    .map((e) => ({
      ...e,
      label: String(e.label).trim(),
      id: stableVaultEntryId(e, used),
    }));
}

function identitySet(entries: VaultEntry[]): Set<string> {
  return new Set(entries.map((e) => e.id).filter((id): id is string => Boolean(id?.trim())));
}

/**
 * Combine the latest stored vault with a writer's incoming list.
 *
 * - Incoming undefined → leave latest unchanged (writer is not touching vault).
 * - Incoming defined → incoming order/content wins for those rows.
 * - Rows only in latest are kept unless their id is in `knownIds` (caller
 *   loaded them and omitted them → delete) or already present in incoming.
 * - When `knownIds` is omitted, treat incoming ids as the only known set so
 *   concurrently added rows (not in incoming) are preserved.
 */
export function mergePortalVaultData(opts: {
  latest: VaultEntry[] | undefined;
  incoming: VaultEntry[] | undefined;
  knownIds?: string[] | null;
}): VaultEntry[] | undefined {
  if (opts.incoming === undefined) {
    const latest = normalizeVaultEntries(opts.latest);
    return latest.length ? latest : opts.latest;
  }

  const incoming = normalizeVaultEntries(opts.incoming);
  const latest = normalizeVaultEntries(opts.latest);
  if (!latest.length) return incoming;

  // Empty password in an update means "unchanged" — do not wipe stored credentials.
  const incomingWithSecrets = incoming.map((entry) => {
    const id = entry.id?.trim();
    if (!id || entry.password?.trim()) return entry;
    const prev = latest.find((row) => row.id?.trim() === id);
    if (prev?.password?.trim()) return { ...entry, password: prev.password };
    return entry;
  });

  const incomingIds = identitySet(incomingWithSecrets);
  const known = opts.knownIds
    ? new Set(opts.knownIds.map((id) => String(id).trim()).filter(Boolean))
    : incomingIds;

  const preserved = latest.filter((entry) => {
    const id = entry.id?.trim();
    if (!id) return false;
    if (incomingIds.has(id)) return false;
    if (known.has(id)) return false;
    return true;
  });

  return [...incomingWithSecrets, ...preserved];
}

/** Strip vault secrets for API responses when the viewer lacks vault access. */
export function maskVaultSecrets(entries: VaultEntry[] | undefined | null): VaultEntry[] {
  if (!Array.isArray(entries)) return [];
  return entries.map((entry) => {
    const masked = { ...entry };
    if (masked.password?.trim()) delete masked.password;
    if (masked.value?.trim()) delete masked.value;
    if (masked.username?.trim()) delete masked.username;
    return masked;
  });
}

/**
 * Agent / "save these items" semantics: update matching ids, otherwise append.
 * Never deletes existing rows.
 */
export function applyIncomingVaultEntries(
  existing: VaultEntry[] | undefined,
  incoming: VaultEntry[],
): VaultEntry[] {
  const result = normalizeVaultEntries(existing);
  const indexById = new Map<string, number>();
  for (let i = 0; i < result.length; i++) {
    const id = result[i]?.id?.trim();
    if (id) indexById.set(id, i);
  }

  const used = new Set(indexById.keys());
  for (const raw of incoming) {
    if (!raw?.label?.trim()) continue;
    const incomingId = raw.id?.trim();
    if (incomingId && indexById.has(incomingId)) {
      const idx = indexById.get(incomingId)!;
      result[idx] = { ...raw, label: raw.label.trim(), id: incomingId };
      continue;
    }
    const stamped = { ...raw, label: raw.label.trim(), id: stableVaultEntryId(raw, used) };
    indexById.set(stamped.id!, result.length);
    result.push(stamped);
  }
  return result;
}

/** Signed documents are append-only — keep latest-only ids the caller omitted. */
export function mergePortalDocuments<T extends PortalDocumentLike>(
  latest: T[] | undefined,
  incoming: T[] | undefined,
): T[] | undefined {
  if (incoming === undefined) return latest;
  if (!latest?.length) return incoming;
  const incomingIds = new Set(incoming.map((d) => d.id).filter(Boolean));
  const preserved = latest.filter((d) => d.id && !incomingIds.has(d.id));
  return [...incoming, ...preserved];
}
