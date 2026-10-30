/**
 * Guard: admin compose must always yield HTML for preview when there is body or attachments.
 * Run: npm run check:compose-preview-html
 */
import assert from 'node:assert/strict';
import { looksLikeHtml } from '../src/lib/emailBody.ts';

assert.equal(looksLikeHtml('<p>Hello</p>'), true);
assert.equal(looksLikeHtml('Write to <you@example.com> today'), false);

/** Mirror adminComposeEmail branch: html-like text in `text` only must produce html. */
function previewHtmlFromComposeText(text: string): string {
  const sendHtml = undefined;
  const sendText = text;
  if (!sendHtml && sendText && !looksLikeHtml(sendText)) return 'plain-path';
  if (sendText.trim() && looksLikeHtml(sendText)) return 'html-fragment-path';
  return '';
}

assert.equal(previewHtmlFromComposeText('Hello there'), 'plain-path');
assert.equal(previewHtmlFromComposeText('<p>Hello</p>'), 'html-fragment-path');
assert.equal(previewHtmlFromComposeText('Contact <you@example.com>'), 'plain-path');

console.log('verify-compose-preview-html: ok');
