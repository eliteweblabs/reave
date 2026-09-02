/**
 * Guard: signature HTML is normalized for email (no figure/br-only gaps).
 * Run: npx tsx scripts/verify-email-signature.ts
 */
import assert from 'node:assert/strict';
import {
  normalizeSignatureHtmlForEmail,
  signatureHtmlForEmail,
  signatureToPlainText,
} from '../src/lib/userEmailSignature.ts';

const editorHtml =
  '<figure class="prof-sig-figure" contenteditable="false">' +
  '<img class="prof-sig-img" src="https://example.com/logo.png" alt="Logo" style="max-width:160px">' +
  '</figure><div><br></div><div><b>Thomas Reave</b></div><div>thomas@reave.app</div>' +
  '<div>+1-617-706-0805</div>';

const normalized = normalizeSignatureHtmlForEmail(editorHtml);
assert.doesNotMatch(normalized, /<figure/i, 'figures are replaced for email');
assert.doesNotMatch(normalized, /prof-sig/i, 'editor classes are stripped');
assert.doesNotMatch(normalized, /<div><br\s*\/?><\/div>/i, 'empty br-only rows are removed');
assert.match(normalized, /margin:0 0 6px 0/, 'logo gets tight bottom margin');
assert.match(normalized, /Thomas Reave/, 'name is preserved');

const viaPublic = signatureHtmlForEmail(editorHtml);
assert.equal(viaPublic, normalized, 'signatureHtmlForEmail uses normalization');

const plain = signatureToPlainText(editorHtml);
assert.match(plain, /Thomas Reave/);
assert.match(plain, /thomas@reave\.app/);

console.log('verify-email-signature: ok');
