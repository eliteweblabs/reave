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
import {
  createMetaSignedRequestForTest,
  verifyMetaSignedRequest,
} from '../src/lib/social/metaSignedRequest.ts';

const ig = OAUTH_CONFIGS.instagram;
assert.ok(ig);
assert.equal(ig.clientIdEnv, 'INSTAGRAM_APP_ID');
assert.equal(ig.clientSecretEnv, 'INSTAGRAM_APP_SECRET');
assert.equal(ig.authorizeUrl, 'https://www.instagram.com/oauth/authorize');
assert.equal(ig.tokenUrl, 'https://api.instagram.com/oauth/access_token');
assert.ok(ig.scopes.includes('instagram_business_basic'));
assert.ok(ig.scopes.includes('instagram_business_manage_comments'));
assert.ok(ig.scopes.includes('instagram_business_manage_messages'));
assert.ok(ig.scopes.includes('instagram_business_content_publish'));
assert.ok(ig.scopes.includes('instagram_business_manage_insights'));

assert.equal(normalizeOAuthCode('abc123#_'), 'abc123');
assert.equal(normalizeOAuthCode('  xyz  '), 'xyz');

const nested = tokenFieldsFromBody({
  data: [{ access_token: 'IGAAA', permissions: 'instagram_business_basic' }],
});
assert.equal(nested.access_token, 'IGAAA');
assert.equal(nested.permissions, 'instagram_business_basic');

const flat = tokenFieldsFromBody({ access_token: 'flat', expires_in: 3600 });
assert.equal(flat.access_token, 'flat');

const secret = 'test-instagram-app-secret';
const signed = createMetaSignedRequestForTest(
  { algorithm: 'HMAC-SHA256', user_id: '12345', issued_at: 1_700_000_000 },
  secret,
);
const verified = verifyMetaSignedRequest(signed, secret);
assert.equal(verified.ok, true);
if (verified.ok) assert.equal(verified.payload.user_id, '12345');

const bad = verifyMetaSignedRequest(signed, 'wrong-secret');
assert.equal(bad.ok, false);

console.log('verify-social-oauth: ok');
