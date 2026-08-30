/**
 * Share-card titles must be ASCII. Legacy stylized brand (Λ) still folds so
 * old cached titles / configs do not break iMessage previews.
 * Browser <title> keeps the branded display name.
 * Run: npm run check:share-safe-text
 */
import assert from 'node:assert/strict';
import { shareSafeText } from '../src/lib/shareSafeText.ts';

assert.equal(shareSafeText('reave.app'), 'reave.app');
assert.equal(shareSafeText('reave'), 'reave.app');
// Legacy stylized spellings (logo era) → canonical ASCII
assert.equal(shareSafeText('reΛVe.app'), 'reave.app');
assert.equal(shareSafeText('REΛVE'), 'reave.app');
assert.equal(shareSafeText('REΛVE.app'), 'reave.app');
assert.equal(shareSafeText('Features | reΛVe.app'), 'Features | reave.app');
assert.equal(shareSafeText('Acme Corp'), 'Acme Corp');
assert.equal(shareSafeText('Café'), 'Cafe');
assert.equal(shareSafeText('Features | reave.app'), 'Features | reave.app');
assert.equal(shareSafeText('reaves'), 'reaves');
assert.equal(shareSafeText(''), '');

console.log('verify-share-safe-text: ok');
