/**
 * Guard: account email signature HTML/text + append helpers.
 * Run: npm run check:email-signature
 */
import assert from 'node:assert/strict';
import { demoModuleIdForFeature, DEMO_BASELINE_MODULE_IDS } from '../src/lib/demoModuleCatalog.ts';
import { FEATURE_IDS } from '../src/lib/featureCatalog.ts';
import {
  EMAIL_SIGNATURE_MARK,
  appendSignatureHtml,
  appendSignatureText,
  buildEmailSignatureHtml,
  buildEmailSignatureText,
  emailAlreadyHasSignature,
  emailSignaturePrefsToMetadata,
  parseEmailSignaturePrefs,
} from '../src/lib/emailSignatureFormat.ts';
import { MARKETING_FEATURES } from '../src/lib/marketingFeatures.ts';

const person = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  phone: '+1 (555) 010-2030',
  jobTitle: 'Analyst',
  includeLogo: true,
  enabled: true,
};

const html = buildEmailSignatureHtml({
  person,
  companyName: 'Analytical Engines',
  website: 'https://analytical.example',
  logoUrl: 'https://analytical.example/logo.png',
  brandPrimary: '#c026d3',
});

assert.equal(emailAlreadyHasSignature(html), true);
assert.match(html, /Ada Lovelace/);
assert.match(html, /Analyst/);
assert.match(html, /Analytical Engines/);
assert.match(html, /ada@example.com/);
assert.match(html, /analytical.example/);
assert.match(html, /logo.png/);
assert.match(html, new RegExp(EMAIL_SIGNATURE_MARK));

const noLogo = buildEmailSignatureHtml({
  person: { ...person, includeLogo: false },
  companyName: 'Analytical Engines',
  website: 'https://analytical.example',
  logoUrl: 'https://analytical.example/logo.png',
  brandPrimary: '#111111',
});
assert.doesNotMatch(noLogo, /logo.png/);

const text = buildEmailSignatureText({
  person,
  companyName: 'Analytical Engines',
  website: 'https://analytical.example',
});
assert.match(text, /Ada Lovelace/);
assert.match(text, /Analyst/);
assert.match(text, /ada@example.com/);

const once = appendSignatureHtml('<p>Hi</p>', html);
assert.equal(appendSignatureHtml(once, html), once);
assert.match(appendSignatureText('Hello', text), /--/);

const prefs = parseEmailSignaturePrefs({
  jobTitle: 'Founder',
  signatureEnabled: '0',
  signatureIncludeLogo: 'false',
});
assert.deepEqual(prefs, { jobTitle: 'Founder', enabled: false, includeLogo: false });
assert.deepEqual(emailSignaturePrefsToMetadata({ jobTitle: 'Founder', enabled: true, includeLogo: false }), {
  jobTitle: 'Founder',
  signatureEnabled: '1',
  signatureIncludeLogo: '0',
});

const defaults = parseEmailSignaturePrefs({});
assert.equal(defaults.enabled, true);
assert.equal(defaults.includeLogo, true);

assert.equal(FEATURE_IDS.includes('email_signature'), true);
assert.equal(demoModuleIdForFeature('email_signature'), '035');
assert.equal(DEMO_BASELINE_MODULE_IDS.includes('035'), true);
assert.equal(
  MARKETING_FEATURES.some((f) => f.id === 'email-signature' && f.modules.includes('email_signature')),
  true,
);

console.log('ok — email signature helpers');
