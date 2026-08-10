/**
 * Guard: apex / forwarded inbound mail must not become "Client replied",
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

console.log('email-reply checks passed');
