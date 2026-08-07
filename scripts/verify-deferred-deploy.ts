/**
 * Verifies deferred deploy helpers. Run with:
 *   node --experimental-strip-types scripts/verify-deferred-deploy.ts
 */
import assert from 'node:assert/strict';
import { splitGitPushCommand } from '../src/lib/deferredDeploySplit.ts';

const results: string[] = [];
let failures = 0;

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    results.push(`  ok   ${name}`);
  } catch (err) {
    failures++;
    results.push(`  FAIL ${name}\n         ${err instanceof Error ? err.message : String(err)}`);
  }
}

await test('splitGitPushCommand — push only', () => {
  const split = splitGitPushCommand('git push origin main');
  assert.ok(split);
  assert.equal(split.runNow, '');
  assert.deepEqual(split.pushCommands, ['git push origin main']);
});

await test('splitGitPushCommand — commit then push', () => {
  const split = splitGitPushCommand('git add . && git commit -m "x" && git push origin main');
  assert.ok(split);
  assert.equal(split.runNow, 'git add . && git commit -m "x"');
  assert.deepEqual(split.pushCommands, ['git push origin main']);
});

await test('splitGitPushCommand — no push', () => {
  assert.equal(splitGitPushCommand('git status'), null);
});

console.log('\nverify-deferred-deploy\n');
for (const line of results) console.log(line);
console.log(failures ? `\n${failures} failed\n` : '\nall passed\n');
process.exit(failures ? 1 : 0);
