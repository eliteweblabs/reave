/**
 * Guard: /card login texts a Clerk OTP to the number already on the card.
 * Run: npm run check:card-login
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cardPhoneLast4, cardPhoneToE164, cardLoginUsesServerProxy } from '../src/lib/cardPhoneFormat.ts';
import { captchaFieldsForFapi } from '../src/lib/cardLoginCaptcha.ts';

assert.equal(cardPhoneToE164('(617) 706-0805'), '+16177060805');
assert.equal(cardPhoneToE164('16177060805'), '+16177060805');
assert.equal(cardPhoneToE164('+16177060805'), '+16177060805');
assert.equal(cardPhoneToE164(''), '');
assert.equal(cardPhoneLast4('+16177060805'), '0805');

assert.equal(cardLoginUsesServerProxy('life-saving.reave.app'), true);
assert.equal(cardLoginUsesServerProxy('app.levineslaw.com'), false);
assert.equal(cardLoginUsesServerProxy('reave.app'), false);

assert.deepEqual(captchaFieldsForFapi({}), {});
assert.deepEqual(
  captchaFieldsForFapi({ captchaToken: 'tok_abc', captchaWidgetType: 'smart' }),
  { captcha_token: 'tok_abc', captcha_widget_type: 'smart' },
);

const card = readFileSync('src/pages/card.astro', 'utf8');
assert.match(card, /CardPhoneLogin/);
assert.match(card, /cardPhoneToE164/);
assert.match(card, /resolveCardPhoneRaw/);
assert.match(card, /useServerProxy/);

const companyConfig = readFileSync('src/lib/defaultSupportPhone.ts', 'utf8');
assert.match(companyConfig, /DEFAULT_SUPPORT_PHONE = '\+1-617-706-0805'/);

const config = readFileSync('src/lib/companyConfig.ts', 'utf8');
assert.match(config, /DEFAULT_SUPPORT_PHONE,/);
assert.doesNotMatch(card, /name="password"/);

const sendApi = readFileSync('src/pages/api/card/login/send.ts', 'utf8');
assert.match(sendApi, /parseCardLoginCaptchaRequest/);

const login = readFileSync('src/components/CardPhoneLogin.astro', 'utf8');
assert.match(login, /Text a one-time code/);
assert.match(login, /id="nfc-login-err"/);
assert.match(login, /\/api\/card\/login\/send/);
assert.match(login, /\/api\/card\/login\/verify/);
assert.match(login, /clerk\.client\.signIn\.create/);
assert.match(login, /fetchCardLoginCaptchaFields/);
assert.match(login, /turnstile/);
assert.match(login, /captchaToken/);
assert.match(login, /id="clerk-captcha"/);
assert.match(login, /registerCardPasskeyAfterLogin/);
assert.match(login, /initCardPasskeyGate/);
assert.match(login, /autocomplete="username webauthn"/);
assert.doesNotMatch(login, /type="password"/);
assert.doesNotMatch(login, /name="password"/);

console.log('ok — /card login sends Clerk phone OTP for the card number');
