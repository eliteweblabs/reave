/**
 * Guard: vault writes must not drop concurrently added items, and known
 * omissions must still delete. Run: npm run check:vault-merge
 */
import assert from 'node:assert/strict';
import {
  applyIncomingVaultEntries,
  maskVaultSecrets,
  mergePortalDocuments,
  mergePortalVaultData,
  normalizeVaultEntries,
} from '../src/lib/portalVault.ts';

const a = { id: 'a', label: 'WordPress', username: 'admin', password: 'one' };
const b = { id: 'b', label: 'cPanel', username: 'root', password: 'two' };
const c = { id: 'c', label: 'DNS', value: 'A 1.2.3.4' };

// Stale admin tab with 1 item must not wipe 2 later submits.
{
  const merged = mergePortalVaultData({
    latest: [a, b, c],
    incoming: [a],
  });
  assert.equal(merged?.length, 3);
  assert.deepEqual(
    merged?.map((e) => e.id).sort(),
    ['a', 'b', 'c'],
  );
}

// Admin loaded all three and deleted b.
{
  const merged = mergePortalVaultData({
    latest: [a, b, c],
    incoming: [a, c],
    knownIds: ['a', 'b', 'c'],
  });
  assert.equal(merged?.length, 2);
  assert.deepEqual(
    merged?.map((e) => e.id),
    ['a', 'c'],
  );
}

// Concurrent submit while admin deletes b: keep the unknown row.
{
  const d = { id: 'd', label: 'Hosting', url: 'https://host.example' };
  const merged = mergePortalVaultData({
    latest: [a, b, c, d],
    incoming: [a, c],
    knownIds: ['a', 'b', 'c'],
  });
  assert.equal(merged?.length, 3);
  assert.ok(merged?.some((e) => e.id === 'd'));
  assert.ok(!merged?.some((e) => e.id === 'b'));
}

// Clear vault: empty incoming + knownIds of everything loaded.
{
  const merged = mergePortalVaultData({
    latest: [a, b],
    incoming: [],
    knownIds: ['a', 'b'],
  });
  assert.equal(merged?.length, 0);
}

// Writer not touching vault leaves latest in place.
{
  const merged = mergePortalVaultData({
    latest: [a, b, c],
    incoming: undefined,
  });
  assert.equal(merged?.length, 3);
}

// Three separate appends (no ids) must not collapse to one.
{
  const first = mergePortalVaultData({
    latest: [],
    incoming: [{ label: 'One', value: '1' }],
  });
  const second = mergePortalVaultData({
    latest: first,
    incoming: [{ label: 'Two', value: '2' }],
  });
  const third = mergePortalVaultData({
    latest: second,
    incoming: [{ label: 'Three', value: '3' }],
  });
  assert.equal(third?.length, 3);
  assert.deepEqual(
    third?.map((e) => e.label).sort(),
    ['One', 'Three', 'Two'],
  );
}

// Agent: three saves without ids append; passing an id updates.
{
  const once = applyIncomingVaultEntries([], [{ label: 'Gmail', username: 'a@x.com' }]);
  const twice = applyIncomingVaultEntries(once, [{ label: 'Hosting', password: 'p' }]);
  const thrice = applyIncomingVaultEntries(twice, [{ label: 'DNS', value: 'ns1' }]);
  assert.equal(thrice.length, 3);
  const updated = applyIncomingVaultEntries(thrice, [
    { id: once[0]!.id, label: 'Gmail', username: 'b@x.com' },
  ]);
  assert.equal(updated.length, 3);
  assert.equal(updated[0]?.username, 'b@x.com');
}

// Legacy id-less rows get stable ids so a later stale write can match them.
{
  const legacy = normalizeVaultEntries([
    { label: 'WordPress', password: 'secret' },
    { label: 'cPanel', password: 'other' },
  ]);
  assert.equal(legacy.length, 2);
  assert.ok(legacy[0]?.id?.startsWith('v_'));
  assert.notEqual(legacy[0]?.id, legacy[1]?.id);
  const stale = mergePortalVaultData({
    latest: legacy,
    incoming: [legacy[0]!],
  });
  assert.equal(stale?.length, 2);
}

// Documents: keep a concurrently added signature.
{
  const docs = mergePortalDocuments(
    [
      { id: 'doc-1', title: 'Contract' },
      { id: 'doc-2', title: 'NDA' },
    ],
    [{ id: 'doc-1', title: 'Contract' }],
  );
  assert.equal(docs?.length, 2);
  assert.ok(docs?.some((d) => d.id === 'doc-2'));
}

// Empty password in an update must not wipe stored credentials.
{
  const merged = mergePortalVaultData({
    latest: [a, b],
    incoming: [{ id: 'a', label: 'WordPress', username: 'admin' }],
    knownIds: ['a', 'b'],
  });
  assert.equal(merged?.length, 1);
  assert.equal(merged?.[0]?.id, 'a');
  assert.equal(merged?.[0]?.password, 'one');
}

{
  const masked = maskVaultSecrets([
    { id: 'x', label: 'Vault', username: 'admin', password: 'pw', value: 'secret', url: 'https://example.com' },
  ]);
  assert.equal(masked.length, 1);
  assert.equal(masked[0].label, 'Vault');
  assert.equal(masked[0].url, 'https://example.com');
  assert.equal(masked[0].password, undefined);
  assert.equal(masked[0].username, undefined);
  assert.equal(masked[0].value, undefined);
}

console.log('ok: vault merge preserves concurrent items and honors known deletes');
