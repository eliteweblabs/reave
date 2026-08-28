/**
 * Guard: compose image refs stay UUID-only and drop unsupported types.
 * Run: npm run check:email-compose-images
 */
import assert from 'node:assert/strict';
import {
  bindAttachmentsToCidHtml,
  composeImageAbsoluteUrl,
  emailHtmlHasCidImages,
  inlineImageSrc,
  listCidImagesInHtml,
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

assert.equal(
  composeImageAbsoluteUrl('https://reave.app', '/api/media/abc'),
  'https://reave.app/api/media/abc',
);
assert.equal(
  composeImageAbsoluteUrl('https://reave.app/', 'https://cdn.example/x.png'),
  'https://cdn.example/x.png',
);
assert.equal(
  inlineImageSrc({ cid: 'compose-img-0', alt: 'image.png', src: 'https://reave.app/api/media/x' }),
  'https://reave.app/api/media/x',
);
assert.equal(inlineImageSrc({ cid: 'compose-img-0', alt: 'image.png' }), 'cid:compose-img-0');

const cidHtml =
  '<img src="cid:compose-img-0" alt="image.png" width="480" style="border:0" />';
assert.equal(emailHtmlHasCidImages(cidHtml), true);
assert.deepEqual(listCidImagesInHtml(cidHtml), [{ cid: 'compose-img-0', alt: 'image.png' }]);

assert.deepEqual(
  bindAttachmentsToCidHtml(cidHtml, [{ filename: 'image.png', contentType: 'image/png' }]),
  [{ filename: 'image.png', contentType: 'image/png', contentId: 'compose-img-0' }],
);

assert.equal(
  rewriteComposeHtmlForPreview(cidHtml, [
    { filename: 'image.png', content: 'abc123', contentType: 'image/png' },
  ]),
  '<img src="data:image/png;base64,abc123" alt="image.png" width="480" style="border:0" />',
);

console.log('verify-email-compose-images: ok');
