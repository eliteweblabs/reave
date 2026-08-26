/**
 * Guard: shared punch-list helpers keep client-facing payloads lean and
 * only let clients edit items they added.
 * Run: npm run check:punchlist
 */
import assert from 'node:assert/strict';
import {
  canClientEditPunchlistItem,
  isSharedPunchlistTodo,
  normalizeTodoCreatedBy,
  punchlistTitleFromInput,
  toPublicPunchlistItem,
} from '../src/lib/punchlist.ts';

assert.equal(normalizeTodoCreatedBy('client'), 'client');
assert.equal(normalizeTodoCreatedBy('STAFF'), 'staff');
assert.equal(normalizeTodoCreatedBy('nope'), undefined);

assert.equal(isSharedPunchlistTodo({ contact_uid: 'abc' }), true);
assert.equal(isSharedPunchlistTodo({ contact_uid: '  ' }), false);
assert.equal(isSharedPunchlistTodo({}), false);

assert.equal(canClientEditPunchlistItem({ created_by: 'client' }), true);
assert.equal(canClientEditPunchlistItem({ created_by: 'staff' }), false);

const publicItem = toPublicPunchlistItem({
  id: 9,
  title: 'Fix the leak under the sink',
  status: 'open',
  created_by: 'client',
  created_at: '2026-08-26T00:00:00.000Z',
  updated_at: '2026-08-26T00:00:00.000Z',
});
assert.deepEqual(publicItem, {
  id: 9,
  title: 'Fix the leak under the sink',
  status: 'open',
  created_by: 'client',
  created_at: '2026-08-26T00:00:00.000Z',
  updated_at: '2026-08-26T00:00:00.000Z',
});
assert.equal('due_date' in publicItem, false);
assert.equal('contact_uid' in publicItem, false);
assert.equal('assignee' in publicItem, false);

assert.equal(punchlistTitleFromInput('  Touch up paint  '), 'Touch up paint');
assert.equal(punchlistTitleFromInput('').length, 0);
assert.equal(punchlistTitleFromInput('x'.repeat(600)).length, 500);

console.log('verify-punchlist: ok');
