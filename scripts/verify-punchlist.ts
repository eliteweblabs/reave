/**
 * Guard: install punch-list helpers tag hub items as install:<slug>
 * and keep titles bounded. Shared Punch list is an admin section both sides open.
 * Run: npm run check:punchlist
 */
import assert from 'node:assert/strict';
import {
  installPunchlistUid,
  isInstallPunchlistTodo,
  isSharedPunchlistTodo,
  normalizeInstallSlug,
  normalizeTodoCreatedBy,
  parseInstallPunchlistUid,
  punchlistTitleFromInput,
  toHubPunchlistItem,
} from '../src/lib/punchlist.ts';

assert.equal(normalizeTodoCreatedBy('install'), 'install');
assert.equal(normalizeTodoCreatedBy('STAFF'), 'staff');
assert.equal(normalizeTodoCreatedBy('client'), 'install');
assert.equal(normalizeTodoCreatedBy('nope'), undefined);

assert.equal(normalizeInstallSlug('Tony'), 'tony');
assert.equal(normalizeInstallSlug('Barber\'s Edge'), 'barber-s-edge');
assert.equal(installPunchlistUid('tony'), 'install:tony');
assert.equal(parseInstallPunchlistUid('install:tony'), 'tony');
assert.equal(parseInstallPunchlistUid('abc'), null);

assert.equal(isInstallPunchlistTodo({ contact_uid: 'install:tony' }), true);
assert.equal(isInstallPunchlistTodo({ contact_uid: 'abc' }), false);
assert.equal(isSharedPunchlistTodo({ contact_uid: 'install:tony' }), true);

const hubItem = toHubPunchlistItem({
  id: 9,
  title: 'Need a fleet map on the dashboard',
  status: 'open',
  contact_uid: 'install:tony',
  contact_name: 'Tony',
  created_by: 'install',
  created_at: '2026-08-26T00:00:00.000Z',
  updated_at: '2026-08-26T00:00:00.000Z',
});
assert.deepEqual(hubItem, {
  id: 9,
  title: 'Need a fleet map on the dashboard',
  status: 'open',
  company: 'Tony',
  install_slug: 'tony',
  created_by: 'install',
  created_at: '2026-08-26T00:00:00.000Z',
  updated_at: '2026-08-26T00:00:00.000Z',
});
assert.equal('due_date' in hubItem, false);
assert.equal('assignee' in hubItem, false);

assert.equal(punchlistTitleFromInput('  Touch up paint  '), 'Touch up paint');
assert.equal(punchlistTitleFromInput('').length, 0);
assert.equal(punchlistTitleFromInput('x'.repeat(600)).length, 500);

console.log('verify-punchlist: ok');
