/**
 * Guard: client website editor stays locked to the install’s front-end repo.
 * Run: node --import ./scripts/ts-extensionless-resolve.mjs --experimental-strip-types scripts/verify-website-editor-repo.ts
 */
import assert from 'node:assert/strict';
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

console.log('verify-website-editor-repo: ok');
