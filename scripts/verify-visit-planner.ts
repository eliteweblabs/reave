/**
 * Verifies business-hours parsing and the inquiry visit planner against a
 * synthetic set of businesses. No network or database access. Run with:
 *   node --import ./scripts/ts-extensionless-resolve.mjs --experimental-strip-types scripts/verify-visit-planner.ts
 */
import assert from 'node:assert/strict';
import {
  formatWeekHours,
  hasAnyHours,
  hoursFromPlacesPeriods,
  intervalsForDay,
  isOpenAt,
  parseHoursText,
  parseStoredBusinessHours,
  type BusinessHours,
} from '../src/lib/businessHours.ts';
import {
  nextMondayIso,
  normalizeTravelMode,
  planVisitsFromCandidates,
  travelLegLabel,
  type VisitCandidate,
} from '../src/lib/visitPlanner.ts';

const results: string[] = [];
let failures = 0;

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    results.push(`  ok   ${name}`);
  } catch (err) {
    failures++;
    results.push(`  FAIL ${name}\n         ${err instanceof Error ? err.message : String(err)}`);
  }
}

const MON = 1;
const SAT = 6;
const SUN = 0;

// ---------------------------------------------------------------------------
// Hours parsing
// ---------------------------------------------------------------------------

await test('Places periods — simple weekday hours', () => {
  const hours = hoursFromPlacesPeriods([
    { open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 17, minute: 30 } },
    { open: { day: 2, hour: 9, minute: 0 }, close: { day: 2, hour: 17, minute: 0 } },
  ]);
  assert.deepEqual(intervalsForDay(hours, MON), [{ start: 540, end: 1050 }]);
  assert.equal(isOpenAt(hours, MON, 600), true);
  assert.equal(isOpenAt(hours, MON, 1080), false);
  assert.equal(intervalsForDay(hours, SUN).length, 0);
});

await test('Places periods — split lunch break merges correctly', () => {
  const hours = hoursFromPlacesPeriods([
    { open: { day: 3, hour: 8, minute: 0 }, close: { day: 3, hour: 12, minute: 0 } },
    { open: { day: 3, hour: 13, minute: 0 }, close: { day: 3, hour: 18, minute: 0 } },
  ]);
  assert.deepEqual(intervalsForDay(hours, 3), [
    { start: 480, end: 720 },
    { start: 780, end: 1080 },
  ]);
  assert.equal(isOpenAt(hours, 3, 750), false, 'closed during the lunch gap');
});

await test('Places periods — overnight span splits at midnight', () => {
  const hours = hoursFromPlacesPeriods([
    { open: { day: 5, hour: 20, minute: 0 }, close: { day: 6, hour: 2, minute: 0 } },
  ]);
  assert.deepEqual(intervalsForDay(hours, 5), [{ start: 1200, end: 1440 }]);
  assert.deepEqual(intervalsForDay(hours, 6), [{ start: 0, end: 120 }]);
});

await test('Places periods — open-ended period means 24 hours', () => {
  const hours = hoursFromPlacesPeriods([{ open: { day: 0, hour: 0, minute: 0 } }]);
  assert.deepEqual(intervalsForDay(hours, SUN), [{ start: 0, end: 1440 }]);
});

await test('Text hours — day range with meridiem', () => {
  const hours = parseHoursText('Mon-Fri 9am-5pm, Sat 10am-2pm');
  assert.ok(hours);
  assert.deepEqual(intervalsForDay(hours, MON), [{ start: 540, end: 1020 }]);
  assert.deepEqual(intervalsForDay(hours, SAT), [{ start: 600, end: 840 }]);
  assert.equal(intervalsForDay(hours, SUN).length, 0);
});

await test('Text hours — bare "9-5" reads as business daytime', () => {
  const hours = parseHoursText('Monday through Thursday 9-5');
  assert.ok(hours);
  assert.deepEqual(intervalsForDay(hours, MON), [{ start: 540, end: 1020 }]);
});

await test('Text hours — 24/7 flagged as always open', () => {
  const hours = parseHoursText('Open 24 hours');
  assert.ok(hours);
  assert.equal(hours.alwaysOpen, true);
  assert.equal(isOpenAt(hours, SUN, 180), true);
});

await test('Text hours — explicit closure overrides a broad range', () => {
  const hours = parseHoursText('Every day 8am-6pm. Closed Sunday');
  assert.ok(hours);
  assert.equal(intervalsForDay(hours, SUN).length, 0);
  assert.equal(isOpenAt(hours, MON, 600), true);
});

await test('Text hours — unparseable input yields null, never a guess', () => {
  assert.equal(parseHoursText('call for availability'), null);
  assert.equal(parseHoursText(''), null);
  assert.equal(parseHoursText(null), null);
});

await test('Stored hours round-trip through portal JSON', () => {
  const original = hoursFromPlacesPeriods([
    { open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 17, minute: 0 } },
  ]);
  const revived = parseStoredBusinessHours(JSON.parse(JSON.stringify(original)));
  assert.ok(revived);
  assert.deepEqual(intervalsForDay(revived, MON), intervalsForDay(original, MON));
  assert.equal(parseStoredBusinessHours({ days: [[], [], [], [], [], [], []] }), null);
  assert.equal(parseStoredBusinessHours(null), null);
});

await test('Week summary collapses identical consecutive days', () => {
  const hours = parseHoursText('Mon-Fri 9am-5pm');
  assert.ok(hours);
  const lines = formatWeekHours(hours);
  assert.ok(
    lines.some((line) => line.startsWith('Mon–Fri')),
    `expected a collapsed Mon–Fri line, got ${JSON.stringify(lines)}`,
  );
});

// ---------------------------------------------------------------------------
// Planner
// ---------------------------------------------------------------------------

/** Downtown-ish origin used for all planner cases. */
const ORIGIN = { lat: 42.3601, lng: -71.0589, label: 'Office' };

let candidateSeq = 0;

function candidate(overrides: Partial<VisitCandidate> & { lat: number; lng: number }): VisitCandidate {
  candidateSeq += 1;
  const slug = overrides.slug ?? `inq-${candidateSeq}`;
  return {
    slug,
    uid: overrides.uid ?? `uid-${candidateSeq}`,
    name: overrides.name ?? `Business ${candidateSeq}`,
    title: overrides.title ?? 'Website audit',
    address: overrides.address ?? '1 Main St, Somerville, MA 02143',
    area: overrides.area ?? 'Somerville, MA',
    lat: overrides.lat,
    lng: overrides.lng,
    hours: overrides.hours ?? weekdayHours(9 * 60, 17 * 60),
    hoursAssumed: overrides.hoursAssumed ?? false,
    phone: overrides.phone ?? '',
    website: overrides.website ?? '',
    priorityScore: overrides.priorityScore ?? 20,
    scoreReasons: overrides.scoreReasons ?? [],
    tags: overrides.tags ?? [],
    created: overrides.created ?? new Date().toISOString(),
  };
}

function weekdayHours(start: number, end: number): BusinessHours {
  return hoursFromPlacesPeriods(
    [1, 2, 3, 4, 5].map((day) => ({
      open: { day, hour: Math.floor(start / 60), minute: start % 60 },
      close: { day, hour: Math.floor(end / 60), minute: end % 60 },
    })),
  );
}

/** A dense cluster of businesses around a center point. */
function cluster(
  center: { lat: number; lng: number },
  count: number,
  area: string,
  hours?: BusinessHours,
): VisitCandidate[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2;
    return candidate({
      lat: center.lat + Math.cos(angle) * 0.006,
      lng: center.lng + Math.sin(angle) * 0.006,
      area,
      name: `${area.split(',')[0]} shop ${i + 1}`,
      hours,
    });
  });
}

await test('nextMondayIso lands on a Monday', () => {
  for (const day of ['2026-08-07', '2026-08-08', '2026-08-09', '2026-08-10', '2026-08-11']) {
    const monday = nextMondayIso(new Date(`${day}T12:00:00Z`));
    assert.equal(new Date(`${monday}T00:00:00Z`).getUTCDay(), 1, `${day} → ${monday}`);
  }
  assert.equal(nextMondayIso(new Date('2026-08-10T12:00:00Z')), '2026-08-10', 'Monday maps to itself');
});

await test('plan schedules stops inside opening hours and inside the daily budget', () => {
  const candidates = [
    ...cluster({ lat: 42.3876, lng: -71.0995 }, 8, 'Somerville, MA'),
    ...cluster({ lat: 42.3736, lng: -71.1097 }, 8, 'Cambridge, MA'),
    ...cluster({ lat: 42.4184, lng: -71.1062 }, 8, 'Medford, MA'),
  ];

  const plan = planVisitsFromCandidates(candidates, {
    startDate: '2026-08-10',
    dayCount: 3,
    minutesPerDay: 120,
    origin: ORIGIN,
  });

  assert.equal(plan.days.length, 3);
  assert.ok(plan.stats.scheduled > 0, 'scheduled at least one stop');

  for (const day of plan.days) {
    const spent = day.stops.reduce(
      (sum, s) => sum + s.travelMinutesFromPrev + s.waitMinutes + (s.departMinutes - s.arriveMinutes),
      0,
    );
    assert.ok(spent <= 120, `${day.date} used ${spent} of 120 budgeted minutes`);

    for (const stop of day.stops) {
      const source = candidates.find((c) => c.slug === stop.slug)!;
      assert.equal(
        isOpenAt(source.hours, day.weekday, stop.arriveMinutes),
        true,
        `${stop.name} arrival ${stop.arriveLabel} falls outside its hours`,
      );
      assert.ok(
        stop.departMinutes <= 17 * 60,
        `${stop.name} departs after the 5pm cutoff`,
      );
    }

    // Stops must be chronological within a day.
    for (let i = 1; i < day.stops.length; i += 1) {
      assert.ok(
        day.stops[i]!.arriveMinutes >= day.stops[i - 1]!.departMinutes,
        `${day.date} stop ${i} starts before the previous one ends`,
      );
    }
  }
});

await test('no inquiry is scheduled twice across the week', () => {
  const plan = planVisitsFromCandidates(
    [
      ...cluster({ lat: 42.3876, lng: -71.0995 }, 10, 'Somerville, MA'),
      ...cluster({ lat: 42.4184, lng: -71.1062 }, 10, 'Medford, MA'),
    ],
    { startDate: '2026-08-10', dayCount: 5, origin: ORIGIN },
  );

  const seen = new Set<string>();
  for (const day of plan.days) {
    for (const stop of day.stops) {
      assert.equal(seen.has(stop.slug), false, `${stop.slug} scheduled more than once`);
      seen.add(stop.slug);
    }
  }
  assert.equal(seen.size, plan.stats.scheduled);
});

await test('each day stays geographically tight', () => {
  const plan = planVisitsFromCandidates(
    [
      ...cluster({ lat: 42.3876, lng: -71.0995 }, 6, 'Somerville, MA'),
      ...cluster({ lat: 42.5195, lng: -70.8967 }, 6, 'Lynn, MA'),
      ...cluster({ lat: 42.2529, lng: -71.0023 }, 6, 'Quincy, MA'),
    ],
    { startDate: '2026-08-10', dayCount: 3, origin: ORIGIN },
  );

  for (const day of plan.days) {
    if (day.stops.length < 2) continue;
    const areas = new Set(day.stops.map((s) => s.area));
    assert.equal(
      areas.size,
      1,
      `${day.date} mixes distant areas: ${[...areas].join(' + ')}`,
    );
  }
});

await test('businesses closed on a day are not scheduled that day', () => {
  // Open Wednesday only — must land on Wed 2026-08-12 or not at all.
  const wednesdayOnly = hoursFromPlacesPeriods([
    { open: { day: 3, hour: 10, minute: 0 }, close: { day: 3, hour: 15, minute: 0 } },
  ]);

  const plan = planVisitsFromCandidates(
    [
      ...cluster({ lat: 42.3876, lng: -71.0995 }, 4, 'Somerville, MA', wednesdayOnly),
      ...cluster({ lat: 42.3876, lng: -71.0995 }, 4, 'Somerville, MA'),
    ],
    { startDate: '2026-08-10', dayCount: 5, origin: ORIGIN, assumeHoursWhenUnknown: false },
  );

  for (const day of plan.days) {
    for (const stop of day.stops) {
      const source = [...plan.days.flatMap((d) => d.stops)].find((s) => s.slug === stop.slug);
      assert.ok(source);
      if (stop.hoursLabel === 'Closed') {
        throw new Error(`${stop.name} scheduled on ${day.weekdayLabel} while closed`);
      }
    }
  }

  const wednesday = plan.days.find((d) => d.date === '2026-08-12');
  assert.ok(wednesday, 'Wednesday is in the plan');
});

await test('inquiries missing coordinates are reported, not silently dropped', () => {
  const plan = planVisitsFromCandidates(
    [
      candidate({ lat: 42.3876, lng: -71.0995 }),
      { ...candidate({ lat: 0, lng: 0 }), lat: null, lng: null, address: '' },
      {
        ...candidate({ lat: 0, lng: 0 }),
        lat: null,
        lng: null,
        address: '9 Elm St, Malden, MA',
      },
    ],
    { startDate: '2026-08-10', dayCount: 2, origin: ORIGIN },
  );

  assert.equal(plan.missingLocation.length, 2);
  assert.equal(plan.stats.routable, 1);
  assert.ok(plan.missingLocation.some((m) => m.reason.includes('no address')));
  assert.ok(plan.missingLocation.some((m) => m.reason.includes('never geocoded')));
});

await test('unknown hours are reported and can be excluded entirely', () => {
  const unknown = { ...candidate({ lat: 42.3876, lng: -71.0995 }), hours: null, hoursAssumed: true };

  const assumed = planVisitsFromCandidates([unknown], {
    startDate: '2026-08-10',
    dayCount: 1,
    origin: ORIGIN,
    assumeHoursWhenUnknown: true,
  });
  assert.equal(assumed.stats.missingHours, 1);
  assert.equal(assumed.stats.scheduled, 1, 'assumed window lets it be planned');
  assert.equal(assumed.days[0]!.stops[0]!.hoursAssumed, true);

  const strict = planVisitsFromCandidates([unknown], {
    startDate: '2026-08-10',
    dayCount: 1,
    origin: ORIGIN,
    assumeHoursWhenUnknown: false,
  });
  assert.equal(strict.stats.scheduled, 0, 'strict mode skips unknown hours');
  assert.equal(strict.stats.unscheduled, 1);
});

await test('overflow beyond the week is ranked best-first, not dropped', () => {
  const many = [
    ...cluster({ lat: 42.3876, lng: -71.0995 }, 30, 'Somerville, MA'),
    ...cluster({ lat: 42.4184, lng: -71.1062 }, 30, 'Medford, MA'),
  ];
  many[0]!.priorityScore = 99;
  many[0]!.name = 'Top lead';

  const plan = planVisitsFromCandidates(many, {
    startDate: '2026-08-10',
    dayCount: 5,
    minutesPerDay: 120,
    origin: ORIGIN,
  });

  assert.equal(
    plan.stats.scheduled + plan.stats.unscheduled,
    plan.stats.routable,
    'every routable inquiry is either scheduled or listed as unscheduled',
  );
  assert.ok(plan.stats.unscheduled > 0, '60 inquiries cannot fit in 5 × 2h');

  for (let i = 1; i < plan.unscheduled.length; i += 1) {
    assert.ok(
      plan.unscheduled[i - 1]!.priorityScore >= plan.unscheduled[i]!.priorityScore,
      'unscheduled list is sorted best-first',
    );
  }
});

await test('weekends are skipped when stepping through dates', () => {
  const plan = planVisitsFromCandidates(cluster({ lat: 42.3876, lng: -71.0995 }, 4, 'Somerville, MA'), {
    startDate: '2026-08-14', // a Friday
    dayCount: 3,
    origin: ORIGIN,
  });
  assert.deepEqual(
    plan.days.map((d) => d.date),
    ['2026-08-14', '2026-08-17', '2026-08-18'],
  );
});

await test('plan is deterministic for the same inputs', () => {
  const candidates = [
    ...cluster({ lat: 42.3876, lng: -71.0995 }, 12, 'Somerville, MA'),
    ...cluster({ lat: 42.4184, lng: -71.1062 }, 12, 'Medford, MA'),
  ];
  const a = planVisitsFromCandidates(candidates, { startDate: '2026-08-10', origin: ORIGIN });
  const b = planVisitsFromCandidates(candidates, { startDate: '2026-08-10', origin: ORIGIN });
  assert.deepEqual(
    a.days.map((d) => d.stops.map((s) => s.slug)),
    b.days.map((d) => d.stops.map((s) => s.slug)),
  );
});

await test('planner tolerates an empty inquiry list', () => {
  const plan = planVisitsFromCandidates([], { startDate: '2026-08-10', origin: ORIGIN });
  assert.equal(plan.stats.scheduled, 0);
  assert.equal(plan.days.length, 5);
  assert.ok(plan.warnings.some((w) => w.includes('No open inquiries')));
});

await test('missing origin is a warning, not a failure', () => {
  const plan = planVisitsFromCandidates(cluster({ lat: 42.3876, lng: -71.0995 }, 4, 'Somerville, MA'), {
    startDate: '2026-08-10',
    dayCount: 1,
    origin: null,
  });
  assert.ok(plan.stats.scheduled > 0);
  assert.ok(plan.warnings.some((w) => w.includes('origin')));
  assert.equal(plan.days[0]!.stops[0]!.travelMinutesFromPrev, 0, 'first stop has no inbound drive');
});

await test('hasAnyHours distinguishes real hours from empty', () => {
  assert.equal(hasAnyHours(null), false);
  assert.equal(hasAnyHours(weekdayHours(9 * 60, 17 * 60)), true);
});

await test('normalizeTravelMode accepts common aliases', () => {
  assert.equal(normalizeTravelMode('driving'), 'driving');
  assert.equal(normalizeTravelMode('bike'), 'bicycling');
  assert.equal(normalizeTravelMode('WALK'), 'walking');
  assert.equal(normalizeTravelMode('hoverboard'), null);
  assert.equal(travelLegLabel(0, 'driving'), 'start');
  assert.equal(travelLegLabel(8, 'walking'), '8m walk');
  assert.equal(travelLegLabel(5, 'bicycling'), '5m ride');
});

await test('walking between the same stops takes longer than driving', () => {
  const candidates = cluster({ lat: 42.3876, lng: -71.0995 }, 6, 'Somerville, MA');
  const driving = planVisitsFromCandidates(candidates, {
    startDate: '2026-08-10',
    dayCount: 1,
    origin: ORIGIN,
    travelMode: 'driving',
  });
  const walking = planVisitsFromCandidates(candidates, {
    startDate: '2026-08-10',
    dayCount: 1,
    origin: ORIGIN,
    travelMode: 'walking',
    approachMode: 'walking',
  });

  assert.equal(driving.options.travelMode, 'driving');
  assert.equal(walking.options.travelMode, 'walking');

  const driveHops = driving.days[0]!.stops.slice(1);
  const walkHops = walking.days[0]!.stops.slice(1);
  assert.ok(driveHops.length && walkHops.length, 'both modes scheduled multi-stop days');
  assert.ok(
    walkHops[0]!.travelMinutesFromPrev > driveHops[0]!.travelMinutesFromPrev,
    `walk hop ${walkHops[0]!.travelMinutesFromPrev}m should beat drive hop ${driveHops[0]!.travelMinutesFromPrev}m`,
  );
});

await test('walking schedules fewer stops than driving when distance matters', () => {
  // Spread businesses far enough that a walking day cannot cover as many.
  const spread = [
    candidate({ lat: 42.3876, lng: -71.0995, area: 'Somerville, MA' }),
    candidate({ lat: 42.395, lng: -71.12, area: 'Somerville, MA' }),
    candidate({ lat: 42.38, lng: -71.08, area: 'Somerville, MA' }),
    candidate({ lat: 42.405, lng: -71.09, area: 'Somerville, MA' }),
    candidate({ lat: 42.37, lng: -71.11, area: 'Somerville, MA' }),
    candidate({ lat: 42.41, lng: -71.105, area: 'Somerville, MA' }),
  ];

  const driving = planVisitsFromCandidates(spread, {
    startDate: '2026-08-10',
    dayCount: 1,
    minutesPerDay: 90,
    origin: ORIGIN,
    travelMode: 'driving',
  });
  const walking = planVisitsFromCandidates(spread, {
    startDate: '2026-08-10',
    dayCount: 1,
    minutesPerDay: 90,
    origin: ORIGIN,
    travelMode: 'walking',
    approachMode: 'driving',
  });

  assert.ok(
    walking.stats.scheduled < driving.stats.scheduled,
    `walking scheduled ${walking.stats.scheduled}, driving ${driving.stats.scheduled}`,
  );
});

await test('approach mode labels the first leg separately from later hops', () => {
  const plan = planVisitsFromCandidates(
    cluster({ lat: 42.3876, lng: -71.0995 }, 4, 'Somerville, MA'),
    {
      startDate: '2026-08-10',
      dayCount: 1,
      origin: ORIGIN,
      travelMode: 'walking',
      approachMode: 'driving',
    },
  );

  const stops = plan.days[0]!.stops;
  assert.ok(stops.length >= 2);
  assert.equal(stops[0]!.travelModeFromPrev, 'driving');
  assert.match(stops[0]!.travelLabel, /drive$/);
  assert.equal(stops[1]!.travelModeFromPrev, 'walking');
  assert.match(stops[1]!.travelLabel, /walk$/);
  assert.equal(plan.options.travelMode, 'walking');
  assert.equal(plan.options.approachMode, 'driving');
});

console.log('\nverify-visit-planner\n');
for (const line of results) console.log(line);
console.log(failures ? `\n${failures} failed\n` : `\n${results.length} passed\n`);
process.exit(failures ? 1 : 0);
