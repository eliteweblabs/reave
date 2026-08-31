/**
 * Guard: /card login texts a Clerk OTP to the number already on the card.
 * Run: npm run check:card-login
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cardPhoneLast4, cardPhoneToE164 } from '../src/lib/cardPhoneFormat.ts';

assert.equal(cardPhoneToE164('(617) 706-0805'), '+16177060805');
assert.equal(cardPhoneToE164('16177060805'), '+16177060805');
assert.equal(cardPhoneToE164('+16177060805'), '+16177060805');
assert.equal(cardPhoneToE164(''), '');
assert.equal(cardPhoneLast4('+16177060805'), '0805');

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
assert.match(login, /\/api\/card\/login\/send/);
assert.match(login, /\/api\/card\/login\/verify/);
assert.doesNotMatch(login, /clerk\.client\.signIn\.create/);
assert.match(login, /autocomplete="one-time-code"/);
assert.match(login, /id="clerk-captcha"/);
assert.doesNotMatch(login, /type="password"/);
assert.doesNotMatch(login, /name="password"/);

console.log('ok — /card login sends Clerk phone OTP for the card number');
