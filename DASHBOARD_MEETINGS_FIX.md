# Dashboard Meetings Display Fix

## Problem

The dashboard's "Today" section was only showing 1 meeting when there should be 4. Additionally, when asking the AI assistant about this issue, it would hit the "Stopped after max tool rounds" error and give up.

## Root Causes Identified

1. **Limited Booking Status Filter**: The dashboard was only fetching bookings with `status: 'accepted'`. If any of the 4 meetings had different statuses (e.g., "pending", "confirmed"), they wouldn't show up.

2. **Agent Tool Limits Too Low**: The AI assistant had:
   - `MAX_TOOL_RESULT_CHARS` of only 12,000 chars (files like `admin/index.astro` are 226KB and would get severely truncated)
   - `MAX_AGENT_TOOL_ROUNDS` of only 25 (not enough for complex debugging)

3. **Insufficient Logging**: There was no visibility into:
   - How many bookings were being fetched from the API
   - Which bookings were being filtered out and why
   - What the actual booking statuses were

## Changes Made

### 1. Show All Booking Statuses (`src/lib/bookingClient.ts`)

**Before**: Only showed bookings with `status: 'accepted'`

```typescript
bookingList({ upcoming: true, status: 'accepted', limit }),
bookingList({ upcoming: false, status: 'accepted', limit }),
```

**After**: Shows all bookings regardless of status, with status indicated in the title

```typescript
bookingList({ upcoming: true, limit }),
bookingList({ upcoming: false, limit }),
```

Bookings with non-accepted statuses now show as "Meeting (pending)" or "Meeting (cancelled)" etc.

### 2. Increased Agent Limits (`src/lib/agentRunner.ts`)

- `MAX_TOOL_RESULT_CHARS`: 12,000 → **50,000** (4x increase)
- `MAX_AGENT_TOOL_ROUNDS`: 25 → **40** (60% increase)

This allows the AI assistant to:
- Read larger files without truncation
- Make more tool calls to solve complex problems

### 3. Added Detailed Logging (`src/lib/bookingClient.ts`)

Both `bookingList()` and `bookingsToday()` now log:
- Number of bookings fetched (upcoming + past)
- Current timezone and today's date
- Number of bookings filtered by date
- Number of duplicate UIDs
- Final count of events for today

Example log output:
```
[bookingList] returned 3 bookings (upcoming: true, status: undefined, limit: 50)
[bookingList] returned 2 bookings (upcoming: false, status: undefined, limit: 50)
[bookingsToday] fetched 3 upcoming + 2 past bookings
[bookingsToday] filtering for today: 2026-07-21 (timezone: America/New_York)
[bookingsToday] result: 4 events today (filtered 1 by date, 0 duplicates)
```

### 4. Created Diagnostic Endpoint (`src/pages/api/admin/bookings-debug.ts`)

New endpoint: `GET /api/admin/bookings-debug`

Returns detailed diagnostic info:
- Timezone and today's date
- Count of upcoming/past bookings
- Full list of all bookings with:
  - UID, title, attendee
  - Start time and calculated date
  - Whether it matches "today"
  - Status
- Comparison with the `bookingsToday()` function result
- Any error messages

**Usage**: Visit `https://your-domain.com/api/admin/bookings-debug` (requires login) to see exactly what bookings are being fetched and why they're being included or excluded.

### 5. Improved Error Message (`src/lib/agentRunner.ts`)

**Before**:
```
Stopped after max tool rounds. Try a narrower question.
```

**After**:
```
I ran out of tool calls trying to solve this. This usually means:

1. The question requires reading very large files that get truncated
2. The task is too complex for a single conversation
3. I'm stuck in a loop trying different approaches

Try breaking this down into smaller, more specific questions, or ask me to focus on one aspect at a time.
```

## How to Debug Further

If the issue persists:

1. **Check the logs**: Look for `[bookingList]` and `[bookingsToday]` messages in the Railway logs
2. **Use the diagnostic endpoint**: Visit `/api/admin/bookings-debug` to see:
   - Exact count of bookings being returned from the API
   - Which bookings are today vs other dates
   - Status of each booking
3. **Check the booking service**: The logs will show if the calcom-booking-api is only returning 1 booking (in which case the issue is in that service, not this one)
4. **Verify timezone**: Make sure `BOOKING_TIMEZONE` env var is set correctly (defaults to "America/New_York")

## Expected Behavior Now

- Dashboard shows **all** meetings for today, regardless of status
- Meetings with status other than "accepted" show the status in the title: "Meeting with John (pending)"
- AI assistant can read larger files and make more tool calls before giving up
- Clear logging helps diagnose issues without needing to ask the AI assistant
- Better error messages guide users when the assistant does hit limits

## Testing

After deploying these changes:

1. Visit the dashboard and check the "Today" section
2. Visit `/api/admin/bookings-debug` to see the raw data
3. Check Railway logs for the detailed logging output
4. Try asking the AI assistant about bookings - it should be able to handle the request without hitting limits
