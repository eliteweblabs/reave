/**
 * Smoke tests for Cal.com owner provision helpers (deploy-wizard gap).
 * Run: npx tsx scripts/verify-calcom-identity.ts
 */
import assert from 'node:assert/strict';
import {
  buildParameterizedInsert,
  CALCOM_WEEKDAY_DAYS,
  DEFAULT_CALCOM_EVENT_TYPES,
  ownerUserColumnValues,
  pickExistingColumns,
  provisionCalcomOwner,
  quoteIdent,
  type SqlQuery,
} from '../src/lib/calcomOwnerProvision';

assert.deepEqual(
  DEFAULT_CALCOM_EVENT_TYPES.map((t) => t.slug),
  ['15min', '30min', '60min'],
);
assert.equal(DEFAULT_CALCOM_EVENT_TYPES.find((t) => t.slug === '30min')?.length, 30);
assert.deepEqual([...CALCOM_WEEKDAY_DAYS], [1, 2, 3, 4, 5]);

assert.equal(quoteIdent('users'), 'users');
assert.equal(quoteIdent('EventType'), '"EventType"');
assert.equal(quoteIdent('user_eventtype'), 'user_eventtype');

assert.deepEqual(pickExistingColumns(['id', 'email', 'username', 'bio'], ['email', 'username', 'missing']), [
  'email',
  'username',
]);

const insert = buildParameterizedInsert('users', ['username', 'email'], ['jk', 'jk@jasonkahan.com']);
assert.equal(insert.sql, 'INSERT INTO users (username, email) VALUES ($1, $2) RETURNING id');
assert.deepEqual(insert.values, ['jk', 'jk@jasonkahan.com']);

const quoted = buildParameterizedInsert('"EventType"', ['userId', 'slug'], [1, '30min']);
assert.equal(quoted.sql, 'INSERT INTO "EventType" ("userId", slug) VALUES ($1, $2) RETURNING id');

const cols = ownerUserColumnValues(
  { name: 'CAP Design Group', username: 'jk', email: 'jk@jasonkahan.com', iconUrl: 'https://example.com/icon.png' },
  'America/New_York',
);
assert.equal(cols.username, 'jk');
assert.equal(cols.email, 'jk@jasonkahan.com');
assert.equal(cols.timeZone, 'America/New_York');
assert.equal(cols.completedOnboarding, true);
assert.match(String(cols.uuid), /^[0-9a-f-]{36}$/i);

const skipEmpty = await provisionCalcomOwner((async () => ({ rows: [] })) as SqlQuery, {
  name: 'CAP Design Group',
  username: '',
  email: 'jk@jasonkahan.com',
  iconUrl: '',
}, 'America/New_York');
assert.equal(skipEmpty.created, false);
assert.match(skipEmpty.reason || '', /username/);

const skipNoEmail = await provisionCalcomOwner((async () => ({ rows: [] })) as SqlQuery, {
  name: 'CAP Design Group',
  username: 'jk',
  email: '',
  iconUrl: '',
}, 'America/New_York');
assert.equal(skipNoEmail.created, false);
assert.match(skipNoEmail.reason || '', /email/);

const calls: string[] = [];
const fake = (async (sql: string, values?: unknown[]) => {
  calls.push(sql);
  if (sql.includes('information_schema.tables')) {
    return { rows: [{ table_name: 'users' }, { table_name: 'EventType' }, { table_name: 'Schedule' }, { table_name: 'Availability' }] };
  }
  if (sql.includes('information_schema.columns') && values?.[0] === 'users') {
    return { rows: [{ column_name: 'id' }, { column_name: 'username' }, { column_name: 'email' }, { column_name: 'name' }, { column_name: 'timeZone' }, { column_name: 'completedOnboarding' }, { column_name: 'defaultScheduleId' }] };
  }
  if (sql.includes('information_schema.columns') && values?.[0] === 'EventType') {
    return { rows: [{ column_name: 'id' }, { column_name: 'title' }, { column_name: 'slug' }, { column_name: 'length' }, { column_name: 'userId' }] };
  }
  if (sql.includes('information_schema.columns') && values?.[0] === 'Schedule') {
    return { rows: [{ column_name: 'id' }, { column_name: 'userId' }, { column_name: 'name' }, { column_name: 'timeZone' }] };
  }
  if (sql.includes('information_schema.columns') && values?.[0] === 'Availability') {
    return { rows: [{ column_name: 'id' }, { column_name: 'userId' }, { column_name: 'scheduleId' }, { column_name: 'days' }, { column_name: 'startTime' }, { column_name: 'endTime' }] };
  }
  if (sql.startsWith('INSERT INTO users')) {
    return { rows: [{ id: 7 }] };
  }
  if (sql.startsWith('INSERT INTO "Schedule"') || sql.startsWith('INSERT INTO Schedule')) {
    return { rows: [{ id: 3 }] };
  }
  if (sql.startsWith('INSERT INTO "EventType"') || sql.startsWith('INSERT INTO EventType')) {
    return { rows: [{ id: 11 }] };
  }
  if (sql.startsWith('SELECT id FROM')) {
    return { rows: [] };
  }
  return { rows: [] };
}) as SqlQuery;

const created = await provisionCalcomOwner(
  fake,
  { name: 'CAP Design Group', username: 'jk', email: 'jk@jasonkahan.com', iconUrl: '' },
  'America/New_York',
);
assert.equal(created.created, true);
assert.equal(created.userId, 7);
assert.equal(created.eventTypes, 3);
assert.ok(calls.some((sql) => sql.includes('INSERT INTO users')));
assert.ok(calls.some((sql) => /INSERT INTO "?EventType"?/.test(sql)));

console.log('verify-calcom-identity: ok');
