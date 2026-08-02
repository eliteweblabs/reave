import { describeViolationServiceArea } from '../dist/lib/violations/index.js';

const summary = describeViolationServiceArea({
  centerLat: 42.5584,
  centerLng: -70.8801,
  radiusMiles: 30,
  topPercent: 0.5,
});

if (summary.municipalityCount < 10) {
  throw new Error(`expected at least 10 municipalities, got ${summary.municipalityCount}`);
}
const feedNames = summary.municipalities.filter((m) => m.hasViolationFeed).map((m) => m.name);
if (!feedNames.includes('Boston') || !feedNames.includes('Cambridge')) {
  throw new Error(`expected Boston and Cambridge feeds in Beverly service area, got: ${feedNames.join(', ')}`);
}

console.log('violations service area test passed');
