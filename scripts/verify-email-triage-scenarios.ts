/**
 * Bulk-test ~20 inbound email scenarios against the keyword rule ladder
 * (same evaluateEmailRules / classifyEmail path production uses).
 * Dry classification only — no inbox writes, push, Resend, or Anthropic.
 *
 * Run: npm run check:email-triage
 *
 * For full pipeline dry-runs (contacts / AI / notify), use Admin → Email Lab
 * or POST /api/email/simulate with skipGates.
 */
import assert from 'node:assert/strict';
import {
  looksLikeFailedOrDuePayment,
  looksLikeShipmentNotice,
  shouldAutoFileAsReceipt,
} from '../src/lib/emailMoney';
import {
  DEFAULT_RULES,
  evaluateEmailRules,
  type EmailRule,
  type InboundEmail,
} from '../src/lib/emailRules';

type Scenario = {
  id: string;
  label: string;
  email: InboundEmail;
  /** Expected keyword-rule status, or UNMATCHED when no rule matches. */
  expectStatus: string;
  /** Extra rules for except / silent-sender cases. */
  extraRules?: EmailRule[];
  /** When set, replace DEFAULT_RULES with pin + extras (except-veto). */
  rulesOnly?: 'pinned-plus-extra';
  expectNotify?: boolean;
  /** Sender is in Contacts — catalog marketing DELETE does not apply. */
  knownContact?: boolean;
};

const scenarios: Scenario[] = [
  {
    id: 'otp-google',
    label: 'OTP / verification code',
    email: {
      from: 'Google <noreply@google.com>',
      subject: 'Your verification code',
      text: 'G-482901 is your Google verification code. It expires in 10 minutes.',
    },
    expectStatus: 'VERIFICATION_CODE',
    expectNotify: true,
  },
  {
    id: 'otp-phrase',
    label: 'One-time password phrase',
    email: {
      from: 'Auth <noreply@example.com>',
      subject: 'One-time password',
      text: 'Your one-time password is 991122. Do not share it.',
    },
    expectStatus: 'VERIFICATION_CODE',
  },
  {
    id: 'auth-magic',
    label: 'Magic sign-in link',
    email: {
      from: 'Clerk <noreply@clerk.dev>',
      subject: 'Sign in to Reave',
      text: 'Use this magic sign-in link to continue:\nhttps://accounts.example.com/verify?token=abc\n\nIf you did not request this, ignore.',
    },
    expectStatus: 'AUTH_LINK',
    expectNotify: true,
  },
  {
    id: 'auth-activate',
    label: 'Activation link (not junk despite unsubscribe footer)',
    email: {
      from: 'App <hello@app.example>',
      subject: 'Activate your account',
      text:
        'Click to activate your account: https://app.example/activate?t=1\n\n' +
        'To unsubscribe from marketing, visit preferences.',
    },
    expectStatus: 'AUTH_LINK',
  },
  {
    id: 'railway-crash',
    label: 'Railway deployment crashed',
    email: {
      from: 'Railway <noreply@railway.app>',
      subject: 'Deployment crashed',
      text: 'Uh oh. Your deployment crashed within the production environment on railway.app.',
    },
    expectStatus: 'RAILWAY_ALERT',
    expectNotify: true,
  },
  {
    id: 'uptime-down',
    label: 'UptimeRobot DOWN',
    email: {
      from: 'UptimeRobot <alert@uptimerobot.com>',
      subject: 'Monitor is DOWN',
      text: 'UptimeRobot: example.com is DOWN. Check the monitor.',
    },
    expectStatus: 'DOWN',
    expectNotify: true,
  },
  {
    id: 'needs-check-app-password',
    label: 'Security NEEDS_CHECK (app password)',
    email: {
      from: 'Google <no-reply@accounts.google.com>',
      subject: 'Security alert',
      text: 'App password used to sign in to your Google Account.',
    },
    expectStatus: 'NEEDS_CHECK',
    expectNotify: true,
  },
  {
    id: 'google-security-unmatched',
    label: 'Bare Google security alert (no NEEDS_CHECK catch-all)',
    email: {
      from: 'Google <no-reply@accounts.google.com>',
      subject: 'Security alert',
      text: 'A new sign-in on Mac. We noticed a new sign-in to your Google Account.',
    },
    expectStatus: 'UNMATCHED',
  },
  {
    id: 'google-security-silent',
    label: 'Sender-silent DELETE beats NEEDS_CHECK',
    email: {
      from: 'Google <no-reply@accounts.google.com>',
      subject: 'Security alert',
      text: 'App password used to sign in to your Google Account.',
    },
    extraRules: [
      {
        status: 'DELETE',
        phrases: ['no-reply@accounts.google.com', 'Security alert'],
        matchMode: 'all',
        fields: ['from', 'subject', 'body'],
        notify: false,
        enabled: true,
      },
    ],
    expectStatus: 'DELETE',
    expectNotify: false,
  },
  {
    id: 'receipt-you-paid',
    label: 'Expense receipt (You paid)',
    email: {
      from: 'Stripe <receipts@stripe.com>',
      subject: 'Your receipt from Acme',
      text: 'You paid $42.00 to Acme. Amount paid: $42.00. Payment confirmation attached.',
    },
    expectStatus: 'RECEIPT',
    expectNotify: false,
  },
  {
    id: 'shipment-tracked',
    label: 'Shipment tracked phrase → AUTO_ARCHIVED',
    email: {
      from: 'Amazon <auto-confirm@amazon.com>',
      subject: 'Your package update',
      text: 'Shipment tracked. Shipped: 1 Shoes item. Track your package.',
    },
    expectStatus: 'AUTO_ARCHIVED',
    expectNotify: false,
  },
  {
    id: 'shipment-tracking-from',
    label: 'Amazon shipment-tracking@ → AUTO_ARCHIVED',
    email: {
      from: 'Amazon.com <shipment-tracking@amazon.com>',
      subject: 'Your Amazon.com order of "Shoes" has shipped',
      text: 'Your package has shipped. Shipped: 1 Shoes item. Amount: $27.99.',
    },
    expectStatus: 'AUTO_ARCHIVED',
    expectNotify: false,
  },
  {
    id: 'shipment-beats-receipt',
    label: 'Shipping notice with receipt wording still AUTO_ARCHIVED',
    email: {
      from: 'Amazon.com <shipment-tracking@amazon.com>',
      subject: 'Your Amazon.com order has shipped',
      text: 'Your receipt from Amazon. You paid $27.99. Shipment tracking: Shipped: 1 Office item.',
    },
    expectStatus: 'AUTO_ARCHIVED',
    expectNotify: false,
  },
  {
    id: 'amazon-order-confirm',
    label: 'Amazon auto-confirm order (not shipping) still RECEIPT',
    email: {
      from: 'Amazon.com <auto-confirm@amazon.com>',
      subject: 'Your Amazon.com order of Office supplies',
      text: 'Ordered: 1 Office item. You paid $10.55. Amount paid: $10.55. Payment confirmation.',
    },
    expectStatus: 'RECEIPT',
    expectNotify: false,
  },
  {
    id: 'invoice-workspace',
    label: 'Google Workspace invoice → AUTO_ARCHIVED',
    email: {
      from: 'Google Workspace <payments-noreply@google.com>',
      subject: 'Your Google Workspace monthly invoice is available',
      text: 'Your invoice for this month is ready.',
    },
    expectStatus: 'AUTO_ARCHIVED',
    expectNotify: false,
  },
  {
    id: 'junk-unsubscribe',
    label: 'Marketing junk (unsubscribe)',
    email: {
      from: 'Deals <promo@shop.example>',
      subject: 'Weekend flash sale',
      text: 'Big savings inside. To unsubscribe click here. Manage your email preferences anytime.',
    },
    expectStatus: 'DELETE',
    expectNotify: false,
  },
  {
    id: 'junk-opt-out',
    label: 'Marketing opt out',
    email: {
      from: 'News <news@brand.example>',
      subject: 'This week at Brand',
      text: 'You received this because you signed up. Opt out anytime.',
    },
    expectStatus: 'DELETE',
  },
  {
    id: 'anthropic-credits',
    label: 'Anthropic out of credits',
    email: {
      from: 'Anthropic <noreply@anthropic.com>',
      subject: 'Claude API access is turned off',
      text: 'Your organization is out of usage credits. Access to the Claude API has been disabled.',
    },
    expectStatus: 'ANTHROPIC_BILLING',
    expectNotify: true,
  },
  {
    id: 'income-not-receipt',
    label: 'Income notice (Payment of $ from…) — not RECEIPT',
    email: {
      from: 'Stripe <noreply@stripe.com>',
      subject: 'Payment of $250.00 from Client Co',
      text: 'You received a payment of $250.00 from Client Co. Funds will be deposited.',
    },
    expectStatus: 'UNMATCHED',
  },
  {
    id: 'failed-payment-language',
    label: 'Failed payment language — not RECEIPT',
    email: {
      from: 'Stripe Capital <noreply@stripe.com>',
      subject: 'Upcoming minimum payment',
      text: 'Your Stripe Capital loan has an outstanding balance. Payment failed — update your card.',
    },
    expectStatus: 'UNMATCHED',
  },
  {
    id: 'stripe-capital-debit',
    label: 'Stripe Capital debit initiated — not RECEIPT',
    email: {
      from: 'Stripe <noreply@stripe.com>',
      subject: 'Your Stripe Capital debit of $157.00 is initiated',
      text: '$157.00 debit initiated for your Stripe Capital loan payment for Eliteweblabs.',
    },
    expectStatus: 'UNMATCHED',
  },
  {
    id: 'except-veto',
    label: 'Except (NOT) vetoes an otherwise matching rule → inbox',
    email: {
      from: 'News <digest@vendor.example>',
      subject: 'Weekly digest',
      text: 'Here is your weekly digest. To unsubscribe visit preferences.',
    },
    rulesOnly: 'pinned-plus-extra',
    extraRules: [
      {
        status: 'DELETE',
        phrases: ['unsubscribe'],
        exceptPhrases: ['weekly digest'],
        matchMode: 'any',
        fields: ['subject', 'body'],
        notify: false,
        enabled: true,
      },
    ],
    expectStatus: 'UNMATCHED',
  },
  {
    id: 'client-inquiry',
    label: 'Client project inquiry → inbox',
    email: {
      from: 'Jane Client <jane@clientco.com>',
      subject: 'Website redesign quote',
      text: 'Hi — can we talk about rebuilding our marketing site next month? Budget around 8k.',
    },
    expectStatus: 'UNMATCHED',
  },
  {
    id: 'known-contact-skips-catalog-delete',
    label: 'Known contact skips catalog unsubscribe DELETE',
    email: {
      from: 'Cursor <team@mail.cursor.com>',
      subject: 'Cursor code hosting is here',
      text: 'Origin is available. To unsubscribe click here. Manage your email preferences anytime.',
    },
    knownContact: true,
    expectStatus: 'UNMATCHED',
  },
  {
    id: 'known-contact-personal-delete',
    label: 'Known contact still honors personal from-DELETE',
    email: {
      from: 'Cursor <team@mail.cursor.com>',
      subject: 'Cursor code hosting is here',
      text: 'Origin is available. To unsubscribe click here.',
    },
    knownContact: true,
    extraRules: [
      {
        status: 'DELETE',
        phrases: ['team@mail.cursor.com'],
        matchMode: 'any',
        fields: ['from'],
        notify: false,
        enabled: true,
      },
    ],
    expectStatus: 'DELETE',
    expectNotify: false,
  },
  {
    id: 'newsletter-no-junk-phrase',
    label: 'Newsletter without unsubscribe phrase → inbox',
    email: {
      from: 'Substack <hello@substack.com>',
      subject: 'Issue #42: Shipping notes',
      text: 'This week we shipped three features. Read more on the web.',
    },
    expectStatus: 'UNMATCHED',
  },
  {
    id: 'blankish-body',
    label: 'Thin body / scan subject → inbox',
    email: {
      from: 'Scanner <scan@office.example>',
      subject: 'Scan from MF425',
      text: 'Please see the attached PDF.',
    },
    expectStatus: 'UNMATCHED',
  },
];

function rulesForScenario(s: Scenario): EmailRule[] {
  if (s.rulesOnly === 'pinned-plus-extra') {
    const pinned = DEFAULT_RULES.filter(
      (r) => r.status === 'VERIFICATION_CODE' || r.status === 'AUTH_LINK',
    );
    return [...pinned, ...(s.extraRules || [])];
  }
  if (!s.extraRules?.length) return DEFAULT_RULES;
  const out: EmailRule[] = [];
  let inserted = false;
  for (const rule of DEFAULT_RULES) {
    out.push(rule);
    if (!inserted && rule.status === 'AUTH_LINK') {
      out.push(...s.extraRules);
      inserted = true;
    }
  }
  if (!inserted) out.push(...s.extraRules);
  return out;
}

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length);
}

function main() {
  console.log(`verify-email-triage-scenarios: ${scenarios.length} cases (keyword ladder)`);
  console.log(
    `${pad('ID', 28)} ${pad('EXPECT', 18)} ${pad('GOT', 18)} NOTIFY  RESULT`,
  );
  console.log('-'.repeat(90));

  let failed = 0;
  for (const s of scenarios) {
    const { classification } = evaluateEmailRules(
      s.email,
      rulesForScenario(s),
      true,
      { knownContact: s.knownContact === true },
    );
    const got = String(classification.status || 'UNMATCHED').toUpperCase();
    const expect = s.expectStatus.toUpperCase();
    let ok = got === expect;
    if (s.expectNotify != null) {
      try {
        assert.equal(!!classification.notify, s.expectNotify, `${s.id} notify`);
      } catch (e) {
        ok = false;
        console.error(`  !! ${(e as Error).message}`);
      }
    }
    if (!ok) failed += 1;

    console.log(
      `${pad(s.id, 28)} ${pad(expect, 18)} ${pad(got, 18)} ${
        classification.notify ? 'yes   ' : 'no    '
      } ${ok ? 'ok' : 'FAIL'}  ${s.label}`,
    );
  }

  console.log('-'.repeat(90));

  const amazonShip = {
    from: 'Amazon.com <shipment-tracking@amazon.com>',
    subject: 'Your Amazon.com order of "Shoes" has shipped',
    summary: 'shipment tracking • Shipped: 1 Shoes item',
    bodyText: 'Your package has shipped. Track your shipment.',
  };
  const stripeCapital = {
    from: 'Stripe <noreply@stripe.com>',
    subject: 'Your Stripe Capital debit of $157.00 is initiated',
    summary: 'capital • $157.00 debit initiated for your Stripe Capital loan payment',
    bodyText: '$157.00 debit initiated for your Stripe Capital loan payment for Eliteweblabs.',
  };
  const amazonOrder = {
    from: 'Amazon.com <auto-confirm@amazon.com>',
    subject: 'Your Amazon.com order',
    summary: 'auto confirm • Ordered: 1 Office item',
    bodyText: 'Ordered: 1 Office item. You paid $10.55. Amount paid: $10.55.',
  };
  try {
    assert.equal(looksLikeShipmentNotice(amazonShip), true, 'amazon ship is shipment notice');
    assert.equal(shouldAutoFileAsReceipt(amazonShip), null, 'amazon ship is not a receipt');
    assert.equal(looksLikeFailedOrDuePayment(stripeCapital), true, 'stripe capital is due/debit');
    assert.equal(shouldAutoFileAsReceipt(stripeCapital), null, 'stripe capital is not a receipt');
    assert.ok(shouldAutoFileAsReceipt(amazonOrder), 'amazon order confirm is a receipt');
  } catch (e) {
    failed += 1;
    console.error(`  !! ${(e as Error).message}`);
  }

  if (failed) {
    console.error(`verify-email-triage-scenarios: ${failed} failure(s)`);
    process.exit(1);
  }
  console.log('verify-email-triage-scenarios: ok');
}

main();
