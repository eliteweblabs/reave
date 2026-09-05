/**
 * Guard: morning briefing picks the right greeting and highlights.
 */
import assert from 'node:assert/strict';
import {
  buildMorningBriefing,
  countTodosDueTodayAndOverdue,
} from '../src/lib/morningBriefing.ts';

const morning = new Date('2026-09-01T09:30:00');
const afternoon = new Date('2026-09-01T14:00:00');

assert.equal(
  buildMorningBriefing({
    firstName: 'Thomas',
    now: morning,
    stats: {
      reviewsPending: 0,
      projectsActive: 0,
      todosOpen: 0,
    },
    eventsTodayCount: 0,
    upcomingTodos: [],
    schedulingConfigured: true,
  }).greeting,
  'Good morning, Thomas',
);

assert.equal(
  buildMorningBriefing({
    now: afternoon,
    stats: {
      reviewsPending: 0,
      projectsActive: 0,
      todosOpen: 0,
    },
    eventsTodayCount: 0,
    upcomingTodos: [],
    schedulingConfigured: false,
  }).greeting,
  'Good afternoon',
);

// 10:00 AM Eastern is 14:00 UTC — greeting must use the install time zone, not UTC.
const utcTenAmEastern = new Date('2026-09-05T14:00:00.000Z');
assert.equal(
  buildMorningBriefing({
    now: utcTenAmEastern,
    timeZone: 'America/New_York',
    stats: {
      reviewsPending: 0,
      projectsActive: 0,
      todosOpen: 0,
    },
    eventsTodayCount: 0,
    upcomingTodos: [],
    schedulingConfigured: false,
  }).greeting,
  'Good morning',
);

const busy = buildMorningBriefing({
  now: morning,
  stats: {
    reviewsPending: 2,
    emailsUnread: 5,
    projectsActive: 3,
    todosOpen: 4,
    uptimeDown: 1,
    siteHealthCritical: 2,
    billingOverdue: 1,
  },
  eventsTodayCount: 2,
  upcomingTodos: [{ due_date: '2026-08-30' }, { due_date: '2026-09-01' }],
  sleepDeferredCount: 4,
  schedulingConfigured: true,
});

assert.equal(busy.allClear, false);
assert.match(busy.lines.find((line) => line.text.includes('review'))?.text ?? '', /2 items need your review/);
assert.ok(busy.lines.some((line) => line.text.includes('held overnight')));
assert.ok(busy.lines.some((line) => line.text.includes('site') && line.text.includes('down')));
assert.ok(busy.lines.some((line) => line.text.includes('overdue task')));
assert.ok(busy.lines.some((line) => line.text.includes('calendar today')));
assert.ok(busy.lines.some((line) => line.text.includes('due today')));
assert.ok(busy.lines.some((line) => line.text.includes('active project')));
assert.ok(!busy.lines.some((line) => line.text.includes('unread email')));
assert.ok(busy.lines.some((line) => line.text.includes('overdue invoice')));

const clear = buildMorningBriefing({
  now: morning,
  stats: {
    reviewsPending: 0,
    projectsActive: 0,
    todosOpen: 0,
  },
  eventsTodayCount: 0,
  upcomingTodos: [],
  schedulingConfigured: true,
});

assert.equal(clear.allClear, true);
assert.match(clear.lines[0]?.text ?? '', /all caught up/i);

const todoCounts = countTodosDueTodayAndOverdue(
  [{ due_date: '2026-09-01' }, { due_date: '2026-08-30T12:00:00.000Z' }, { due_date: '2026-09-05' }],
  morning,
);
assert.equal(todoCounts.dueToday, 1);
assert.equal(todoCounts.overdue, 1);

console.log('ok: morning briefing');
