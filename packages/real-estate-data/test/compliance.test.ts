import assert from 'node:assert/strict';
import { buildComplianceTimeline } from '../dist/lib/compliance/index.js';
import { scoreLeadForTrades } from '../dist/lib/leads/score.js';
import { runRadiusScan } from '../dist/lib/scanner/engine.js';

const timeline = buildComplianceTimeline({ yearBuilt: 1951, state: 'MA' });
assert.ok(timeline.overdue.length > 0 || timeline.dueSoon.length > 0, 'old home should have items');

const score = scoreLeadForTrades(
  { yearBuilt: 1951, state: 'MA', floodZone: 'AE', fullAddress: '1 Test', id: 't', provider: 'mock' },
  ['plumbing', 'restoration'],
);
assert.ok(score.score > 0, 'should score for trades');

const scan = runRadiusScan({
  centerLat: 42.36,
  centerLng: -71.06,
  radiusMiles: 20,
  trades: ['roofing', 'plumbing'],
});
assert.ok(scan.candidates.length > 0, 'mock scan should return candidates');

console.log('compliance + scanner tests passed');
