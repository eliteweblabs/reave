/**
 * Guard: apex / forwarded inbound mail must not become "Contact replied",
 * and placeholder "New Project — …" titles must not leak into copy.
 * Run: npm run check:email-reply
 */
import assert from 'node:assert/strict';
import {
  displayProjectTitle,
  isForwardSubject,
  isLikelyClientThreadReply,
  isLikelyEmailReply,
  isPlaceholderProjectTitle,
  subjectRelatesToOutbound,
} from '../src/lib/emailProjectReply.ts';
import {
  formatQuotedReplyHtml,
  quotedReplyHtmlFromText,
  splitQuotedReplyBody,
} from '../src/lib/emailReply.ts';

assert.equal(isForwardSubject('Fwd: Are you available?'), true);
assert.equal(isForwardSubject('FW: Hello'), true);
assert.equal(isForwardSubject('Re: Are you available?'), false);
assert.equal(isForwardSubject('Are you available?'), false);

assert.equal(isLikelyEmailReply({ subject: 'Fwd: Meeting' }), true);
assert.equal(isLikelyClientThreadReply({ subject: 'Fwd: Meeting' }), false);
assert.equal(isLikelyClientThreadReply({ subject: 'Re: Meeting' }), true);
assert.equal(
  isLikelyClientThreadReply({
    subject: 'Are you available Wednesday?',
    headers: {},
  }),
  false,
);
assert.equal(
  isLikelyClientThreadReply({
    subject: 'Are you available Wednesday?',
    headers: { 'In-Reply-To': '<abc@mail.example>' },
  }),
  true,
);

assert.equal(isPlaceholderProjectTitle('New Project'), true);
assert.equal(isPlaceholderProjectTitle('New Project — Inner City Fire Protection'), true);
assert.equal(isPlaceholderProjectTitle('Website refresh'), false);
assert.equal(
  displayProjectTitle('New Project — Inner City Fire Protection', 'Tom'),
  'Inner City Fire Protection',
);
assert.equal(displayProjectTitle('New Project', 'Tom'), 'Tom');
assert.equal(displayProjectTitle('Website refresh'), 'Website refresh');

assert.equal(
  subjectRelatesToOutbound(
    'Are you available Wednesday?',
    'New Project — Inner City Fire Protection',
  ),
  false,
);
assert.equal(
  subjectRelatesToOutbound(
    'New Project — Inner City Fire Protection',
    'New Project — Inner City Fire Protection',
  ),
  true,
);

const quotedCompose = [
  'Thanks for the update.',
  '',
  'T',
  '',
  '---',
  'On 8/18/2026, 1:50:03 PM, support@stripe.com wrote:',
  '> Hi T,',
  '> Thanks for reaching out.',
].join('\n');
const split = splitQuotedReplyBody(quotedCompose);
assert.equal(split.draft, 'Thanks for the update.\n\nT');
assert.match(split.quote, /On 8\/18\/2026/);
assert.equal(splitQuotedReplyBody('Just a new email.').quote, '');

const quoteHtml = quotedReplyHtmlFromText(split.quote);
assert.match(quoteHtml, /<blockquote/);
assert.match(quoteHtml, /<br>/);
assert.match(quoteHtml, /Hi T,/);
assert.doesNotMatch(quoteHtml, /&gt; Hi T/);

const originalHtml = formatQuotedReplyHtml({
  from: 'support@stripe.com',
  receivedAt: '2026-08-18T17:50:03.000Z',
  bodyHtml: '<html><body><p><strong>Hi T,</strong></p><p>Thanks for reaching out.</p></body></html>',
});
assert.match(originalHtml, /<strong>Hi T,<\/strong>/);
assert.match(originalHtml, /support@stripe\.com wrote:/);
assert.doesNotMatch(originalHtml, /<html/);

console.log('email-reply checks passed');
