import assert from 'node:assert/strict';
import { buildComplianceTimeline } from '../dist/lib/compliance/index.js';
import { scoreLeadForTrades } from '../dist/lib/leads/score.js';
import { runRadiusScan, runRadiusScanSync } from '../dist/lib/scanner/engine.js';

const timeline = buildComplianceTimeline({ yearBuilt: 1951, state: 'MA' });
assert.ok(timeline.overdue.length > 0 || timeline.dueSoon.length > 0, 'old home should have items');

const score = scoreLeadForTrades(
  { yearBuilt: 1951, state: 'MA', floodZone: 'AE', fullAddress: '1 Test', id: 't', provider: 'mock' },
  ['plumbing', 'restoration'],
);
assert.ok(score.score > 0, 'should score for trades');

const scan = runRadiusScanSync({
  centerLat: 42.36,
  centerLng: -71.06,
  radiusMiles: 20,
  trades: ['roofing', 'plumbing'],
  centerLocation: { city: 'Boston', state: 'MA', zip: '02101' },
});
assert.ok(scan.candidates.length > 0, 'mock scan should return candidates');
assert.ok(
  scan.candidates.every((c) => c.city === 'Boston' && c.state === 'MA'),
  'mock scan addresses should use scan center location',
);

console.log('compliance + scanner tests passed');
