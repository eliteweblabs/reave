/**
 * Guard: one inbound email / OTP code must not produce five phone tray items.
 * Run: npm run check:push-dedupe
 */
import assert from 'node:assert/strict';
import {
  claimPushPresentationIds,
  emailPushCollapseId,
  emailPushStableKey,
  isReusablePushAlertTag,
  pushPresentationIds,
} from '../src/lib/pushNotificationIdentity.ts';
import {
  inboundIdentityLockKey,
  withInboundIdentityLock,
} from '../src/lib/inboundEmailIdentity.ts';
import { messageIdLookupKeys } from '../src/lib/emailMessageId.ts';

const inboxA = '11111111-1111-1111-1111-111111111111';
const inboxB = '22222222-2222-2222-2222-222222222222';
const messageId = '<CA+otp-95014@apple.com>';
const resendId = 're_abc95014';

{
  const a = emailPushCollapseId({
    kind: 'otp',
    inboxId: inboxA,
    messageId,
    resendEmailId: resendId,
    verificationCode: '95014',
  });
  const b = emailPushCollapseId({
    kind: 'otp',
    inboxId: inboxB,
    messageId,
    resendEmailId: 're_other_delivery',
    verificationCode: '95014',
  });
  assert.equal(a, b);
  assert.equal(a, `otp-${messageId}`);
  console.log('ok — OTP collapse id is stable across duplicate inbox rows');
}

{
  const byResend = emailPushCollapseId({
    kind: 'otp',
    inboxId: inboxA,
    resendEmailId: resendId,
    verificationCode: '95014',
  });
  const byCode = emailPushCollapseId({
    kind: 'otp',
    inboxId: inboxA,
    verificationCode: '95014',
  });
  assert.equal(byResend, `otp-${resendId}`);
  assert.equal(byCode, 'otp-code-95014');
  console.log('ok — collapse id falls back to Resend id, then OTP code');
}

{
  const apple = emailPushCollapseId({
    kind: 'email',
    inboxId: inboxA,
    messageId: '<security@email.apple.com>',
  });
  const otp = emailPushCollapseId({
    kind: 'otp',
    inboxId: inboxB,
    messageId,
  });
  assert.notEqual(apple, otp);
  console.log('ok — different emails keep different collapse ids');
}

{
  assert.equal(isReusablePushAlertTag(`otp-${inboxA}`), true);
  assert.equal(isReusablePushAlertTag(inboxA), true);
  assert.equal(isReusablePushAlertTag('inbox'), false);
  assert.equal(isReusablePushAlertTag('reave-badge-sync'), false);
  assert.equal(isReusablePushAlertTag('demo-test'), false);
  console.log('ok — generic tags are not reused as notification ids');
}

{
  const ids = pushPresentationIds({
    tag: `otp-${inboxA}`,
    collapseId: `otp-${messageId}`,
    verificationCode: '95014',
  });
  const claimed = new Set<string>();
  assert.equal(claimPushPresentationIds(claimed, ids), true);
  assert.equal(claimPushPresentationIds(claimed, ids), false);
  assert.equal(
    claimPushPresentationIds(claimed, pushPresentationIds({ tag: `otp-${inboxB}`, verificationCode: '95014' })),
    false,
    'same OTP code must refuse a second tray item even with a new inbox tag',
  );
  assert.equal(
    claimPushPresentationIds(
      claimed,
      pushPresentationIds({ tag: `otp-${inboxB}`, collapseId: 'otp-other', verificationCode: '11111' }),
    ),
    true,
  );
  console.log('ok — presentation claim gates tag, collapse id, and OTP code');
}

{
  assert.equal(
    inboundIdentityLockKey({ resendEmailId: resendId, messageId }),
    `resend:${resendId}`,
  );
  assert.equal(inboundIdentityLockKey({ messageId }), `msgid:${messageId}`);
  assert.equal(inboundIdentityLockKey({}), '');
  const keys = messageIdLookupKeys('CA+otp-95014@apple.com');
  assert.ok(keys.includes(messageId) || keys.includes('<CA+otp-95014@apple.com>'));
  console.log('ok — inbound lock key prefers Resend id, then Message-ID');
}

{
  const order: string[] = [];
  const first = withInboundIdentityLock({ messageId }, async () => {
    order.push('start-a');
    await new Promise((r) => setTimeout(r, 20));
    order.push('end-a');
    return 'a';
  });
  const second = withInboundIdentityLock({ messageId }, async () => {
    order.push('start-b');
    order.push('end-b');
    return 'b';
  });
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a, 'a');
  assert.equal(b, 'b');
  assert.deepEqual(order, ['start-a', 'end-a', 'start-b', 'end-b']);
  console.log('ok — inbound identity lock serializes webhook retries');
}

{
  assert.equal(
    emailPushStableKey({
      messageId,
      resendEmailId: resendId,
      verificationCode: '95014',
      inboxId: inboxA,
    }),
    messageId,
  );
  console.log('ok — stable key prefers Message-ID over inbox UUID');
}

console.log('ok: push notification dedupe');
