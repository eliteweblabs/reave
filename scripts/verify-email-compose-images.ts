/**
 * Guard: compose image refs stay UUID-only and drop unsupported types.
 * Run: npm run check:email-compose-images
 */
import assert from 'node:assert/strict';
import {
  htmlHasCidImages,
  normalizeEmailComposeImages,
  rewriteComposeHtmlForPreview,
} from '../src/lib/emailComposeImages.ts';

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

assert.equal(htmlHasCidImages('<img src="cid:compose-img-0" alt="image.png">'), true);
assert.equal(htmlHasCidImages('<img src="https://reave.app/logo.png">'), false);
assert.equal(
  rewriteComposeHtmlForPreview('<img src="cid:compose-img-0" alt="image.png">', [
    {
      filename: 'image.png',
      content: 'abc123',
      contentId: 'compose-img-0',
      contentType: 'image/png',
    },
  ]),
  '<img src="data:image/png;base64,abc123" alt="image.png">',
);

console.log('verify-email-compose-images: ok');
