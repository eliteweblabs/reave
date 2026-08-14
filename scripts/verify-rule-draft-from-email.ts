/**
 * Drafts for "New rule" opened from a dashboard notification must include
 * the sender spelling, subject phrase, and a description the owner can
 * still read after the email is off-screen.
 *
 * Run: node --import ./scripts/ts-extensionless-resolve.mjs --experimental-strip-types scripts/verify-rule-draft-from-email.ts
 */
import assert from 'node:assert/strict';
import { suggestRuleDraftFromEmail } from '../src/lib/emailRuleDraft';

function main() {
  const invoice = suggestRuleDraftFromEmail({
    from: 'Jane Doe <billing@acme-corp.com>',
    subject: 'Q3 invoice overdue — please remit #4412',
    bodyText: 'Invoice 4412 for $1,280 is 14 days past due. Please remit by Friday.',
  });
  assert.ok(invoice, 'invoice draft');
  assert.match(invoice.title, /Q3 invoice overdue/i);
  assert.ok(invoice.phrases.includes('billing@acme-corp.com'), invoice.phrases.join(', '));
  assert.ok(
    invoice.phrases.some((p) => /4412/.test(p)),
    `expected invoice id in ${invoice.phrases.join(', ')}`,
  );
  assert.match(invoice.description, /billing@acme-corp\.com/);
  assert.match(invoice.description, /Q3 invoice overdue/);
  assert.ok(invoice.fields.includes('from'));
  assert.ok(invoice.fields.includes('subject'));

  const generic = suggestRuleDraftFromEmail({
    from: 'Sam <sam@client.example>',
    subject: 'Hi',
    summary: 'Just checking in about the porch railing drawings.',
  });
  assert.ok(generic, 'generic-subject draft');
  assert.equal(generic.title, 'Hi');
  assert.ok(generic.phrases.includes('sam@client.example'));
  assert.ok(
    !generic.phrases.includes('Hi'),
    'generic greeting should not be a match phrase',
  );
  assert.ok(
    generic.phrases.some((p) => /railing|drawings|porch/.test(p)),
    generic.phrases.join(', '),
  );

  const empty = suggestRuleDraftFromEmail({ from: '', subject: '', text: '' });
  assert.equal(empty, null);

  const namedOnly = suggestRuleDraftFromEmail({
    from: 'Acme Alerts <noreply@alerts.acme.io>',
    subject: '',
    text: '',
  });
  assert.ok(namedOnly);
  assert.match(namedOnly.title, /Acme Alerts|noreply@alerts\.acme\.io/);
  assert.deepEqual(namedOnly.phrases, ['noreply@alerts.acme.io']);

  console.log('verify-rule-draft-from-email: ok');
}

main();
