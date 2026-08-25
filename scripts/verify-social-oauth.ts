/**
 * Guard: Instagram Login uses Instagram App ID + nested token bodies.
 * Run: node --import ./scripts/ts-extensionless-resolve.mjs --experimental-strip-types scripts/verify-social-oauth.ts
 */
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  OAUTH_CONFIGS,
  normalizeOAuthCode,
  tokenFieldsFromBody,
} from '../src/lib/social/oauth.ts';
import { parseMetaSignedRequest } from '../src/lib/metaSignedRequest.ts';

function base64Url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function makeSignedRequest(payload: Record<string, unknown>, secret: string): string {
  const payloadJson = JSON.stringify({ algorithm: 'HMAC-SHA256', ...payload });
  const encodedPayload = base64Url(Buffer.from(payloadJson));
  const sig = createHmac('sha256', secret).update(encodedPayload).digest();
  return `${base64Url(sig)}.${encodedPayload}`;
}

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

const secret = 'verify-social-oauth-test-secret';
const signed = makeSignedRequest({ user_id: '12345' }, secret);
const parsed = parseMetaSignedRequest(signed, secret);
assert.ok(parsed);
assert.equal(parsed.user_id, '12345');
assert.equal(parseMetaSignedRequest(signed, 'wrong-secret'), null);
assert.equal(parseMetaSignedRequest('not-a-signed-request', secret), null);

console.log('verify-social-oauth: ok');
