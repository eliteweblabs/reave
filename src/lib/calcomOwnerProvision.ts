/**
 * Create the Cal.com owner row + default event types when a new install
 * has an empty Cal.com database.
 *
 * The deploy wizard used to set NEXT_PUBLIC_DISABLE_SIGNUP=true and only
 * UPDATE an existing users row. Signup is off, so the owner was never
 * created — booking-api then replies "User not found".
 *
 * Column / table names are discovered at runtime so this survives Cal.com
 * schema drift (users vs "User", avatar vs avatarUrl, …).
 */
import type { InstallIdentity } from './installIdentity';

export const DEFAULT_CALCOM_EVENT_TYPES: ReadonlyArray<{
  slug: string;
  title: string;
  length: number;
}> = [
  { slug: '15min', title: '15 Minute Meeting', length: 15 },
  { slug: '30min', title: '30 Minute Meeting', length: 30 },
  { slug: '60min', title: '60 Minute Meeting', length: 60 },
];

/** Cal.com Availability.days — 0 Sunday … 6 Saturday. Mon–Fri. */
export const CALCOM_WEEKDAY_DAYS = [1, 2, 3, 4, 5] as const;

export const DEFAULT_CALCOM_WORK_START = '09:00:00';
export const DEFAULT_CALCOM_WORK_END = '17:00:00';

export type SqlQuery = <T = Record<string, unknown>>(
  sql: string,
  values?: unknown[],
) => Promise<{ rows: T[]; rowCount?: number | null }>;

export type CalcomOwnerProvisionResult = {
  created: boolean;
  userId?: number;
  eventTypes?: number;
  reason?: string;
};

export function quoteIdent(name: string): string {
  if (/^[a-z_][a-z0-9_]*$/.test(name)) return name;
  return `"${name.replaceAll('"', '""')}"`;
}

export function pickExistingColumns(
  available: Iterable<string>,
  wanted: readonly string[],
): string[] {
  const have = new Set(available);
  return wanted.filter((name) => have.has(name));
}

export function buildParameterizedInsert(
  tableSql: string,
  columns: readonly string[],
  values: readonly unknown[],
): { sql: string; values: unknown[] } {
  if (columns.length !== values.length) {
    throw new Error('insert column/value count mismatch');
  }
  const cols = columns.map(quoteIdent).join(', ');
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
  return {
    sql: `INSERT INTO ${tableSql} (${cols}) VALUES (${placeholders}) RETURNING id`,
    values: [...values],
  };
}

export function ownerUserColumnValues(
  identity: InstallIdentity,
  timezone: string,
): Record<string, unknown> {
  return {
    username: identity.username,
    name: identity.name || identity.username,
    email: identity.email,
    timeZone: timezone,
    weekStart: 'Monday',
    completedOnboarding: true,
    verified: true,
    allowDynamicBooking: true,
    locale: 'en',
    timeFormat: 12,
    hideBranding: true,
    avatarUrl: identity.iconUrl || null,
    avatar: identity.iconUrl || null,
  };
}

async function listColumns(query: SqlQuery, tableName: string): Promise<Set<string>> {
  const rows = await query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    [tableName],
  );
  return new Set(rows.rows.map((r) => r.column_name));
}

async function findPublicTable(query: SqlQuery, candidates: string[]): Promise<string | null> {
  const rows = await query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
    [candidates],
  );
  const have = new Set(rows.rows.map((r) => r.table_name));
  return candidates.find((name) => have.has(name)) ?? null;
}

async function insertRow(
  query: SqlQuery,
  tableSql: string,
  cols: Set<string>,
  wanted: Record<string, unknown>,
): Promise<number | undefined> {
  const columns: string[] = [];
  const values: unknown[] = [];
  for (const [name, value] of Object.entries(wanted)) {
    if (value == null || !cols.has(name)) continue;
    columns.push(name);
    values.push(value);
  }
  if (!columns.length) return undefined;
  const insert = buildParameterizedInsert(tableSql, columns, values);
  const result = await query<{ id: number }>(insert.sql, insert.values);
  return result.rows[0]?.id;
}

async function linkEventTypeToUser(
  query: SqlQuery,
  eventTypeId: number,
  userId: number,
): Promise<void> {
  const join = await findPublicTable(query, [
    '_user_eventtype',
    '_EventTypeToUser',
    '_UserToEventType',
  ]);
  if (!join) return;
  const tableSql = quoteIdent(join);
  await query(
    `INSERT INTO ${tableSql} ("A", "B") VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    join.startsWith('_User') ? [userId, eventTypeId] : [eventTypeId, userId],
  ).catch(async () => {
    await query(`INSERT INTO ${tableSql} ("A", "B") VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
      userId,
      eventTypeId,
    ]).catch(() => undefined);
  });
}

export async function ensureCalcomOwnerEventTypes(
  query: SqlQuery,
  userId: number,
  timezone: string,
  scheduleId?: number,
): Promise<number> {
  const eventTable = await findPublicTable(query, ['EventType', 'eventType', 'event_type']);
  if (!eventTable) return 0;
  const tableSql = quoteIdent(eventTable);
  const cols = await listColumns(query, eventTable);

  const existing = await query<{ id: number }>(
    `SELECT id FROM ${tableSql} WHERE ${quoteIdent(cols.has('userId') ? 'userId' : 'user_id')} = $1 LIMIT 1`,
    [userId],
  ).catch(() => ({ rows: [] as Array<{ id: number }> }));
  if (existing.rows.length) return 0;

  let created = 0;
  for (const type of DEFAULT_CALCOM_EVENT_TYPES) {
    const id = await insertRow(query, tableSql, cols, {
      title: type.title,
      slug: type.slug,
      description: type.title,
      length: type.length,
      userId,
      hidden: false,
      locations: [{ type: 'inPerson' }],
      timeZone: timezone,
      scheduleId,
      minimumBookingNotice: 0,
      periodType: 'UNLIMITED',
    });
    if (id != null) {
      created += 1;
      await linkEventTypeToUser(query, id, userId);
    }
  }
  return created;
}

async function ensureWorkingSchedule(
  query: SqlQuery,
  userId: number,
  timezone: string,
): Promise<number | undefined> {
  const scheduleTable = await findPublicTable(query, ['Schedule', 'schedule']);
  if (!scheduleTable) return undefined;
  const scheduleSql = quoteIdent(scheduleTable);
  const scheduleCols = await listColumns(query, scheduleTable);

  const existing = await query<{ id: number }>(
    `SELECT id FROM ${scheduleSql} WHERE ${quoteIdent(scheduleCols.has('userId') ? 'userId' : 'user_id')} = $1 ORDER BY id ASC LIMIT 1`,
    [userId],
  ).catch(() => ({ rows: [] as Array<{ id: number }> }));
  const scheduleId =
    existing.rows[0]?.id ??
    (await insertRow(query, scheduleSql, scheduleCols, {
      userId,
      name: 'Working Hours',
      timeZone: timezone,
    }));
  if (scheduleId == null) return undefined;

  const availTable = await findPublicTable(query, ['Availability', 'availability']);
  if (availTable) {
    const availSql = quoteIdent(availTable);
    const availCols = await listColumns(query, availTable);
    const hasHours = await query<{ id: number }>(
      `SELECT id FROM ${availSql} WHERE ${quoteIdent(availCols.has('scheduleId') ? 'scheduleId' : 'schedule_id')} = $1 LIMIT 1`,
      [scheduleId],
    ).catch(() => ({ rows: [] as Array<{ id: number }> }));
    if (!hasHours.rows.length) {
      await insertRow(query, availSql, availCols, {
        userId,
        scheduleId,
        days: [...CALCOM_WEEKDAY_DAYS],
        startTime: DEFAULT_CALCOM_WORK_START,
        endTime: DEFAULT_CALCOM_WORK_END,
      });
    }
  }

  return scheduleId;
}

/**
 * Insert the install owner when Cal.com has zero users, then seed 15/30/60
 * event types and weekday working hours so booking-api can list/create.
 */
export async function provisionCalcomOwner(
  query: SqlQuery,
  identity: InstallIdentity,
  timezone: string,
): Promise<CalcomOwnerProvisionResult> {
  if (!identity.username) {
    return { created: false, reason: 'install username is empty' };
  }
  if (!identity.email) {
    return { created: false, reason: 'install email is empty — set EMAIL_FROM before provisioning Cal.com' };
  }

  const userTable = await findPublicTable(query, ['users', 'User']);
  if (!userTable) return { created: false, reason: 'Cal.com users table not found' };
  const tableSql = quoteIdent(userTable);
  const cols = await listColumns(query, userTable);
  if (!cols.has('id') || !cols.has('email')) {
    return { created: false, reason: 'Cal.com users table is missing id/email' };
  }

  const userId = await insertRow(query, tableSql, cols, ownerUserColumnValues(identity, timezone));
  if (userId == null) return { created: false, reason: 'could not insert Cal.com user' };

  const scheduleId = await ensureWorkingSchedule(query, userId, timezone);
  if (scheduleId != null && cols.has('defaultScheduleId')) {
    await query(`UPDATE ${tableSql} SET "defaultScheduleId" = $1 WHERE id = $2`, [scheduleId, userId]).catch(
      () => undefined,
    );
  }

  const eventTypes = await ensureCalcomOwnerEventTypes(query, userId, timezone, scheduleId);
  return { created: true, userId, eventTypes };
}
