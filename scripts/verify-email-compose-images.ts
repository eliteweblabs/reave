/**
 * Guard: compose image refs stay UUID-only and drop unsupported types.
 * Run: npm run check:email-compose-images
 */
import assert from 'node:assert/strict';
import { normalizeEmailComposeImages } from '../src/lib/emailComposeImages.ts';

assert.deepEqual(normalizeEmailComposeImages(undefined), []);
assert.deepEqual(normalizeEmailComposeImages('nope'), []);
assert.deepEqual(
  normalizeEmailComposeImages([
    { mediaId: 'not-a-uuid', filename: 'x.png' },
    {
      mediaId: '11111111-1111-4111-8111-111111111111',
      filename: 'shot.png',
      contentType: 'image/png',
    },
    {
      id: '11111111-1111-4111-8111-111111111111',
      filename: 'dup.png',
    },
    {
      mediaId: '22222222-2222-4222-8222-222222222222',
      contentType: 'application/pdf',
    },
    '33333333-3333-4333-8333-333333333333',
  ]),
  [
    {
      mediaId: '11111111-1111-4111-8111-111111111111',
      filename: 'shot.png',
      contentType: 'image/png',
    },
    { mediaId: '33333333-3333-4333-8333-333333333333' },
  ],
);

console.log('verify-email-compose-images: ok');
