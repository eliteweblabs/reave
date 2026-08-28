/**
 * Guard: inbox excerpts skip image/logo chrome and leading tracking URLs.
 * Run: npm run check:email-preview
 */
import assert from 'node:assert/strict';
import {
  htmlToPlainText,
  inboxListExcerpt,
  inboxPreviewSnippet,
} from '../src/lib/emailBody.ts';

const nextdoorPlain = [
  'Nextdoor logo',
  '',
  'Your profile photo (https://nextdoor.com/news_feed/?ct=DjMvaQuznCTAbIQ0xN89WAOXPzFS8e2e6EXGW54VPI-very-long-token)',
  '',
  'Newsletter from Nextdoor',
  '',
  "Here's what's happening in your neighborhood this week.",
].join('\n');

const nextdoorSnippet = inboxPreviewSnippet(nextdoorPlain);
assert.match(nextdoorSnippet, /^Newsletter from Nextdoor/);
assert.doesNotMatch(nextdoorSnippet, /Nextdoor logo/i);
assert.doesNotMatch(nextdoorSnippet, /profile photo/i);
assert.doesNotMatch(nextdoorSnippet, /https?:\/\//i);

const collapsed = inboxPreviewSnippet(
  'Nextdoor logo Your profile photo (https://nextdoor.com/news_feed/?ct=abc123) Newsletter from Nextdoor. More neighborhood news.',
);
assert.match(collapsed, /^Newsletter from Nextdoor/);

const html = htmlToPlainText(
  '<img alt="Nextdoor logo" src="https://cdn.example/logo.png"><a href="https://nextdoor.com/"><img alt="Your profile photo" src="https://cdn.example/me.png"></a><p>Newsletter from Nextdoor</p>',
);
assert.doesNotMatch(html, /Nextdoor logo/i);
assert.doesNotMatch(html, /profile photo/i);
assert.match(html, /Newsletter from Nextdoor/);

const storedChromeOnly = inboxListExcerpt({
  summary: 'Nextdoor logo Your profile photo (https://nextdoor.com/news_feed/?ct=abc)',
  bodySnippet: 'Nextdoor logo Your profile photo (https://nextdoor.com/news_feed/?ct=abc)',
  bodyText: nextdoorPlain,
  subject: 'Your weekly digest',
});
assert.match(storedChromeOnly, /^Newsletter from Nextdoor/);

const subjectFallback = inboxListExcerpt({
  summary: 'Nextdoor logo Your profile photo (https://nextdoor.com/news_feed/?ct=abc)',
  bodySnippet: 'Nextdoor logo Your profile photo (https://nextdoor.com/news_feed/?ct=abc)',
  subject: 'Your weekly digest',
});
assert.equal(subjectFallback, 'Your weekly digest');

const keepsProse = inboxPreviewSnippet('Please send the signed proposal when you can.');
assert.equal(keepsProse, 'Please send the signed proposal when you can.');

console.log('verify-email-preview-snippet: ok');
