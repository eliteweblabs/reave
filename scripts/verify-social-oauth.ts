/**
 * Guard: Instagram Login uses Instagram App ID + nested token bodies.
 * Run: node --import ./scripts/ts-extensionless-resolve.mjs --experimental-strip-types scripts/verify-social-oauth.ts
 */
import assert from 'node:assert/strict';
import {
  OAUTH_CONFIGS,
  normalizeOAuthCode,
  tokenFieldsFromBody,
} from '../src/lib/social/oauth.ts';

const ig = OAUTH_CONFIGS.instagram;
assert.ok(ig);
assert.equal(ig.clientIdEnv, 'INSTAGRAM_APP_ID');
assert.equal(ig.clientSecretEnv, 'INSTAGRAM_APP_SECRET');
assert.equal(ig.authorizeUrl, 'https://www.instagram.com/oauth/authorize');
assert.equal(ig.tokenUrl, 'https://api.instagram.com/oauth/access_token');
assert.ok(ig.scopes.includes('instagram_business_basic'));
assert.ok(ig.scopes.includes('instagram_business_manage_comments'));

assert.equal(normalizeOAuthCode('abc123#_'), 'abc123');
assert.equal(normalizeOAuthCode('  xyz  '), 'xyz');

const nested = tokenFieldsFromBody({
  data: [{ access_token: 'IGAAA', permissions: 'instagram_business_basic' }],
});
assert.equal(nested.access_token, 'IGAAA');
assert.equal(nested.permissions, 'instagram_business_basic');

const flat = tokenFieldsFromBody({ access_token: 'flat', expires_in: 3600 });
assert.equal(flat.access_token, 'flat');

console.log('verify-social-oauth: ok');
