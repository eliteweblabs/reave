/**
 * Guard: projects created from email must not inherit the subject line.
 * Run: npm run check:email-project-title
 */
import assert from 'node:assert/strict';
import {
  fallbackProjectTitleFromEmail,
  isEmailSubjectTitle,
  normalizeGeneratedProjectTitle,
  resolveNewProjectTitle,
  type EmailMergeSource,
} from '../src/lib/emailProjectMerge.ts';

function email(partial: Partial<EmailMergeSource> & { subject: string }): EmailMergeSource {
  return {
    from: partial.from ?? 'pat@example.com',
    subject: partial.subject,
    summary: partial.summary ?? '',
    bodySnippet: partial.bodySnippet ?? '',
    bodyText: partial.bodyText,
    receivedAt: partial.receivedAt ?? '2026-08-12T12:00:00.000Z',
  };
}

assert.equal(isEmailSubjectTitle('Website quote', 'Website quote'), true);
assert.equal(isEmailSubjectTitle('Website quote', 'Re: Website quote'), true);
assert.equal(isEmailSubjectTitle('Homepage copy refresh', 'Website quote'), false);
assert.equal(isEmailSubjectTitle('', 'Website quote'), false);

const withBody = email({
  subject: 'Hello',
  summary: 'Hi, we need the homepage hero rewritten and a new about page.',
});
assert.equal(
  fallbackProjectTitleFromEmail(withBody),
  'we need the homepage hero rewritten and',
);

const subjectOnly = email({ subject: 'Website quote', summary: 'Website quote' });
assert.equal(fallbackProjectTitleFromEmail(subjectOnly), 'Project inquiry');

assert.equal(
  normalizeGeneratedProjectTitle('Homepage copy refresh', withBody),
  'Homepage copy refresh',
);
assert.equal(
  normalizeGeneratedProjectTitle('Hello', withBody),
  fallbackProjectTitleFromEmail(withBody),
);
assert.equal(
  normalizeGeneratedProjectTitle('Please rewrite the homepage hero and about page copy soon', withBody),
  'Please rewrite the homepage hero and about',
);
assert.equal(
  normalizeGeneratedProjectTitle('"New brochure site."', withBody),
  'New brochure site',
);

assert.equal(
  resolveNewProjectTitle({
    requestedTitle: 'Hello',
    email: withBody,
    generatedTitle: 'Homepage copy refresh',
  }),
  'Homepage copy refresh',
);
assert.equal(
  resolveNewProjectTitle({
    requestedTitle: 'Custom brochure site',
    email: withBody,
    generatedTitle: 'Homepage copy refresh',
  }),
  'Custom brochure site',
);
assert.equal(
  resolveNewProjectTitle({
    email: withBody,
    generatedTitle: 'Homepage copy refresh',
  }),
  'Homepage copy refresh',
);

console.log('email-project-title checks passed');
