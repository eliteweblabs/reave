/**
 * Guard: /card login texts a Clerk OTP to the number already on the card.
 * Run: npm run check:card-login
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cardPhoneLast4, cardPhoneToE164 } from '../src/lib/cardPhoneFormat.ts';
import { captchaFieldsForFapi } from '../src/lib/cardLoginCaptcha.ts';

assert.equal(cardPhoneToE164('(617) 706-0805'), '+16177060805');
assert.equal(cardPhoneToE164('16177060805'), '+16177060805');
assert.equal(cardPhoneToE164('+16177060805'), '+16177060805');
assert.equal(cardPhoneToE164(''), '');
assert.equal(cardPhoneLast4('+16177060805'), '0805');

assert.deepEqual(captchaFieldsForFapi({}), {});
assert.deepEqual(
  captchaFieldsForFapi({ captchaToken: 'tok_abc', captchaWidgetType: 'smart' }),
  { captcha_token: 'tok_abc', captcha_widget_type: 'smart' },
);

const card = readFileSync('src/pages/card.astro', 'utf8');
assert.match(card, /CardPhoneLogin/);
assert.match(card, /cardPhoneToE164/);
assert.match(card, /resolveCardPhoneRaw/);

const companyConfig = readFileSync('src/lib/defaultSupportPhone.ts', 'utf8');
assert.match(companyConfig, /DEFAULT_SUPPORT_PHONE = '\+1-617-706-0805'/);

const config = readFileSync('src/lib/companyConfig.ts', 'utf8');
assert.match(config, /DEFAULT_SUPPORT_PHONE,/);
assert.doesNotMatch(card, /name="password"/);

const login = readFileSync('src/components/CardPhoneLogin.astro', 'utf8');
assert.match(login, /Text a one-time code/);
assert.match(login, /id="nfc-login-err"/);
assert.match(login, /clerk\.client\.signIn\.create/);
assert.doesNotMatch(login, /\/api\/card\/login\/send/);
assert.match(login, /id="clerk-captcha"/);
assert.match(login, /registerCardPasskeyAfterLogin/);
assert.match(login, /initCardPasskeyGate/);
assert.match(login, /autocomplete="username webauthn"/);
assert.match(login, /autocomplete="one-time-code"/);
assert.doesNotMatch(login, /type="password"/);
assert.doesNotMatch(login, /name="password"/);

const neverInherit = readFileSync('src/lib/deployWizardCatalog.ts', 'utf8');
assert.match(neverInherit, /PUBLIC_CLERK_PUBLISHABLE_KEY/);
assert.match(neverInherit, /CLERK_SECRET_KEY/);

console.log('ok — /card login sends Clerk phone OTP for the card number');
