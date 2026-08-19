/**
 * Guard: client website editor stays locked to the install’s front-end repo.
 * Run: node --import ./scripts/ts-extensionless-resolve.mjs --experimental-strip-types scripts/verify-website-editor-repo.ts
 */
import assert from 'node:assert/strict';
import { createVerify, generateKeyPairSync } from 'node:crypto';
import { githubAppJwt, normalizeGithubAppPrivateKey } from '../src/lib/githubApp.ts';
import {
  defaultWebsiteRepoSlug,
  isProtectedAppRepo,
  lockedWebsiteEditorRepo,
} from '../src/lib/websiteEditorRepo.ts';

assert.equal(defaultWebsiteRepoSlug('Tony Barletta Jr.'), 'eliteweblabs/tonybarlettajr-site');
assert.equal(defaultWebsiteRepoSlug('barbersedge'), 'eliteweblabs/barbersedge-site');
assert.equal(isProtectedAppRepo('eliteweblabs/reave'), true);
assert.equal(isProtectedAppRepo('https://github.com/eliteweblabs/reave.git'), true);
assert.equal(isProtectedAppRepo('eliteweblabs/barbersedge-site'), false);

const clientOk = lockedWebsiteEditorRepo({
  opsInstall: false,
  websiteRepo: 'eliteweblabs/tonybarlettajr-site',
});
assert.equal(clientOk.ok, true);
if (clientOk.ok) assert.equal(clientOk.data, 'eliteweblabs/tonybarlettajr-site');

const clientRejectReave = lockedWebsiteEditorRepo({
  opsInstall: false,
  websiteRepo: 'eliteweblabs/tonybarlettajr-site',
  requested: 'eliteweblabs/reave',
});
assert.equal(clientRejectReave.ok, false);

const clientMisconfigured = lockedWebsiteEditorRepo({
  opsInstall: false,
  websiteRepo: 'eliteweblabs/reave',
});
assert.equal(clientMisconfigured.ok, false);

const clientUnset = lockedWebsiteEditorRepo({
  opsInstall: false,
  websiteRepo: '',
});
assert.equal(clientUnset.ok, false);

const opsSibling = lockedWebsiteEditorRepo({
  opsInstall: true,
  websiteRepo: 'eliteweblabs/reave',
  requested: 'eliteweblabs/paulino-wizard',
});
assert.equal(opsSibling.ok, true);
if (opsSibling.ok) assert.equal(opsSibling.data, 'eliteweblabs/paulino-wizard');

assert.equal(
  normalizeGithubAppPrivateKey('"-----BEGIN KEY-----\\nABC\\n-----END KEY-----"'),
  '-----BEGIN KEY-----\nABC\n-----END KEY-----',
);

const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const jwt = githubAppJwt('4242', pem);
const [headerB64, payloadB64, sig] = jwt.split('.');
assert.ok(headerB64 && payloadB64 && sig);
const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as { iss?: string };
assert.equal(payload.iss, '4242');
const verify = createVerify('RSA-SHA256');
verify.update(`${headerB64}.${payloadB64}`);
assert.equal(verify.verify(pair.publicKey, sig, 'base64url'), true);

console.log('verify-website-editor-repo: ok');
