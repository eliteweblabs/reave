import assert from 'node:assert/strict';
import { permanentRedirectStatus } from '../src/lib/httpRedirect.ts';

assert.equal(permanentRedirectStatus('GET'), 301);
assert.equal(permanentRedirectStatus('HEAD'), 301);
assert.equal(permanentRedirectStatus('POST'), 308);
assert.equal(permanentRedirectStatus('PUT'), 308);
assert.equal(permanentRedirectStatus('patch'), 308);

console.log('verify-http-redirect: ok');
