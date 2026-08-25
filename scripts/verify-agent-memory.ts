/**
 * Smoke tests for durable-recall helpers (no database).
 * Run: npm run check:agent-memory
 */
import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  formatMemoriesForPrompt,
  formatMemoryUpdateNotification,
  inferMemoryScope,
  looksLikeSecret,
  memoriesAreSimilar,
  normalizeMemoryKey,
  parseExtractedMemories,
  shouldSkipMemoryExtract,
  type AgentMemory,
} from '../src/lib/agentMemory.ts';

assert.equal(normalizeMemoryKey('Owner Kids'), 'owner.kids');
assert.equal(normalizeMemoryKey('  pref.Invoice-Terms!! '), 'pref.invoice.terms');
assert.equal(normalizeMemoryKey('', 'Owner is 25 years old'), 'owner.is.25.years.old');

assert.equal(looksLikeSecret('Owner is 25'), false);
assert.equal(looksLikeSecret('The API key is sk-ant-123'), true);
assert.equal(looksLikeSecret('password: hunter2'), true);

assert.equal(inferMemoryScope('fact', 'I have two kids'), 'user');
assert.equal(inferMemoryScope('preference', 'Invoice terms are net-30'), 'install');
assert.equal(inferMemoryScope('procedure', 'Reggie invoices go to his bookkeeper'), 'install');

assert.equal(memoriesAreSimilar('Owner is 25 years old.', 'owner is 25 years old'), true);
assert.equal(memoriesAreSimilar('Owner has two kids', 'Send the Acme invoice'), false);

const parsed = parseExtractedMemories(`
\`\`\`json
{"memories":[
  {"kind":"fact","key":"owner.age","content":"Owner is 25 years old.","scope":"user"},
  {"kind":"fact","key":"secret","content":"The password is hunter2"},
  {"kind":"preference","key":"pref.invoice-terms","content":"Invoice terms are net-30."}
]}
\`\`\`
`);
assert.equal(parsed.length, 2);
assert.equal(parsed[0].key, 'owner.age');
assert.equal(parsed[0].scope, 'user');
assert.equal(parsed[1].kind, 'preference');

assert.deepEqual(
  parseExtractedMemories('{"memories":[]}'),
  [],
);

assert.equal(
  shouldSkipMemoryExtract({
    userText: 'Please wait for instructions…',
    assistantText: 'Ready — what should I do with this project?',
  }),
  true,
);
assert.equal(
  shouldSkipMemoryExtract({
    userText: 'ok',
    assistantText: 'Done.',
  }),
  true,
);
assert.equal(
  shouldSkipMemoryExtract({
    userText: 'I have two kids and I am 25.',
    assistantText: 'Got it — I will keep that in mind for later chats.',
  }),
  false,
);
assert.equal(
  shouldSkipMemoryExtract({
    userText: 'I have two kids',
    assistantText: 'Noted.',
    systemAlert: true,
  }),
  true,
);

const sample: AgentMemory = {
  id: 1,
  user_id: 'user_1',
  scope: 'user',
  kind: 'fact',
  key: 'owner.kids',
  content: 'Owner has two kids.',
  source: 'extract',
  source_thread_id: null,
  hit_count: 1,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  last_used_at: null,
};
const block = formatMemoriesForPrompt([sample], 3);
assert.match(block ?? '', /Durable recall/);
assert.match(block ?? '', /Owner has two kids/);
assert.match(block ?? '', /2 more on file/);

{
  const created = formatMemoryUpdateNotification({
    memories: [{ id: 7, content: 'Owner has two kids.' }],
    created: true,
  });
  assert.equal(created.title, '🧠 Memory saved');
  assert.equal(created.body, 'Owner has two kids.');
  assert.equal(created.tag, 'memory-7');
  assert.equal(created.url, '/admin?tab=dashboard');

  const updated = formatMemoryUpdateNotification({
    memories: [{ id: 7, content: 'Owner has two kids and a dog.' }],
    created: false,
  });
  assert.equal(updated.title, '🧠 Memory updated');
  assert.match(updated.body, /dog/);

  const batch = formatMemoryUpdateNotification({
    memories: [
      { id: 1, content: 'Owner is 25 years old.' },
      { id: 2, content: 'Invoice terms are net-30.' },
    ],
    created: true,
  });
  assert.equal(batch.title, '🧠 2 memories saved');
  assert.match(batch.body, /25 years old/);
  assert.match(batch.body, /net-30/);
  assert.equal(batch.tag, 'memory-batch-1-2');

  const batchUpdate = formatMemoryUpdateNotification({
    memories: [
      { id: 1, content: 'Owner is 25 years old.' },
      { id: 2, content: 'Invoice terms are net-30.' },
    ],
    created: false,
  });
  assert.equal(batchUpdate.title, '🧠 2 memories updated');
}

{
  const dir = join(tmpdir(), `reave-agent-memories-${process.pid}`);
  mkdirSync(dir, { recursive: true });
  process.env.AGENT_MEMORIES_DIR = dir;
  const { fileUpsertMemory } = await import('../src/lib/fileAgentMemories.ts');
  const first = fileUpsertMemory({
    userId: 'user_1',
    scope: 'user',
    kind: 'fact',
    key: 'owner.kids',
    content: 'Owner has two kids.',
    source: 'agent',
  });
  assert.equal(first.created, true);
  assert.equal(first.changed, true);
  const same = fileUpsertMemory({
    userId: 'user_1',
    scope: 'user',
    kind: 'fact',
    key: 'owner.kids',
    content: 'Owner has two kids.',
    source: 'agent',
  });
  assert.equal(same.created, false);
  assert.equal(same.changed, false);
  const rewrite = fileUpsertMemory({
    userId: 'user_1',
    scope: 'user',
    kind: 'fact',
    key: 'owner.kids',
    content: 'Owner has two kids and a dog.',
    source: 'agent',
  });
  assert.equal(rewrite.created, false);
  assert.equal(rewrite.changed, true);
  rmSync(dir, { recursive: true, force: true });
}

console.log('ok: agent durable recall helpers');
