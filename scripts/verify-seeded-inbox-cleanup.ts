/**
 * Guard: seeded inbox wipes only when the email API goes from blank/null → set.
 * Run: npm run check:seeded-inbox
 */
import assert from 'node:assert/strict';
import {
  isEmailApiConfigured,
  seededInboxCleanupAction,
} from '../src/lib/seededInboxPolicy.ts';
import { isSeededInboxRecord } from '../src/lib/seededInboxMarkers.ts';

assert.equal(isEmailApiConfigured({}), false);
assert.equal(isEmailApiConfigured({ RESEND_API_KEY: undefined }), false);
assert.equal(isEmailApiConfigured({ RESEND_API_KEY: '' }), false);
assert.equal(isEmailApiConfigured({ RESEND_API_KEY: '   ' }), false);
assert.equal(isEmailApiConfigured({ RESEND_API_KEY: 're_123' }), true);

assert.equal(
  seededInboxCleanupAction({ apiConfigured: false, previouslySeen: null }),
  'mark-unset',
);
assert.equal(
  seededInboxCleanupAction({ apiConfigured: false, previouslySeen: false }),
  'noop',
);
assert.equal(
  seededInboxCleanupAction({ apiConfigured: true, previouslySeen: false }),
  'wipe',
);
assert.equal(
  seededInboxCleanupAction({ apiConfigured: true, previouslySeen: null }),
  'mark-set',
  'existing install that already has a key must not wipe on first observation',
);
assert.equal(
  seededInboxCleanupAction({ apiConfigured: true, previouslySeen: true }),
  'noop',
  'rotating an already-set key must not wipe',
);
assert.equal(
  seededInboxCleanupAction({ apiConfigured: false, previouslySeen: true }),
  'noop',
  'removing a key after it was set must not re-arm the wipe',
);
assert.equal(
  seededInboxCleanupAction({
    apiConfigured: true,
    previouslySeen: false,
    demoMode: true,
  }),
  'mark-set',
  'sales DEMO_MODE keeps the sample inbox',
);

assert.equal(
  isSeededInboxRecord({
    id: 'demo-email-sarah-reply',
    resendEmailId: 'demo-demo-email-sarah-reply',
    messageId: 'demo-msg-demo-email-sarah-reply',
  }),
  true,
);
assert.equal(
  isSeededInboxRecord({
    id: '11111111-1111-1111-1111-111111111111',
    resendEmailId: 're_abc',
    messageId: '<real@example.com>',
  }),
  false,
);
assert.equal(
  isSeededInboxRecord({
    id: '11111111-1111-1111-1111-111111111111',
    resendEmailId: 'demo-email-railway',
    messageId: '',
  }),
  true,
);

console.log('verify-seeded-inbox-cleanup: ok');
