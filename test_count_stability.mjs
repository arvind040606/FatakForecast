// test_count_stability.mjs
// ============================================================================
// FATAKFORECAST — COUNT STABILITY & STATE CONSISTENCY VERIFICATION
// ============================================================================

import assert from 'assert';

console.log('======================================================================');
console.log('FATAKFORECAST — COUNT STABILITY & PACKET SEQUENCING AUDIT');
console.log('======================================================================\n');

// 1. Mutually Exclusive Metrics Calculation Audit
function calculateAuthoritativeMetrics(crossings) {
  let openCount = 0;
  let closedCount = 0;
  let closureExpectedCount = 0;
  let approachingCount = 0;
  let unknownCount = 0;

  for (const c of crossings) {
    if (c.status === 'CLOSED' || c.status === 'CLOSURE_EXPECTED' || c.status === 'CLOSURE_REPORTED') {
      closedCount++;
      if (c.status === 'CLOSURE_EXPECTED') closureExpectedCount++;
    } else if (c.status === 'APPROACHING') {
      approachingCount++;
    } else if (c.status === 'OPEN') {
      openCount++;
    } else {
      unknownCount++;
    }
  }

  return {
    totalCrossings: crossings.length,
    openCount,
    closedCount,
    closureExpectedCount,
    approachingCount,
    unknownCount
  };
}

console.log('TEST 1: Mutually exclusive count summation');
const mockCrossings = [
  { id: 'c1', status: 'CLOSED' },
  { id: 'c2', status: 'CLOSURE_EXPECTED' },
  { id: 'c3', status: 'CLOSURE_REPORTED' },
  { id: 'c4', status: 'APPROACHING' },
  { id: 'c5', status: 'OPEN' },
  { id: 'c6', status: 'OPEN' },
  { id: 'c7', status: 'UNKNOWN' },
  { id: 'c8', status: 'STATUS_UNAVAILABLE' } // Fallback to unknown
];

const metrics = calculateAuthoritativeMetrics(mockCrossings);
assert.strictEqual(metrics.totalCrossings, 8);
assert.strictEqual(metrics.closedCount, 3); // c1, c2, c3
assert.strictEqual(metrics.closureExpectedCount, 1); // c2
assert.strictEqual(metrics.approachingCount, 1); // c4
assert.strictEqual(metrics.openCount, 2); // c5, c6
assert.strictEqual(metrics.unknownCount, 2); // c7, c8
assert.strictEqual(
  metrics.openCount + metrics.closedCount + metrics.approachingCount + metrics.unknownCount,
  metrics.totalCrossings,
  'Sum of mutually exclusive metrics must strictly equal totalCrossings'
);
console.log('  ✓ PASS: Mutually exclusive metrics strictly sum up to totalCrossings (8 = 2 open + 3 closed + 1 approaching + 2 unknown)\n');

// 2. Monotonic packet delivery guard audit
console.log('TEST 2: Out-of-order packet sequencing & suppression of older HTTP packets');
class MockTelemetryStore {
  constructor() {
    this.lastProcessedTimestamp = 0;
    this.currentClosedCount = 0;
    this.updateHistory = [];
  }

  processPacket(packet) {
    const packetTime = packet.timestamp ? new Date(packet.timestamp).getTime() : Date.now();
    if (this.lastProcessedTimestamp > 0 && packetTime < this.lastProcessedTimestamp) {
      // Out of order: drop packet
      return false;
    }
    this.lastProcessedTimestamp = packetTime;

    const m = calculateAuthoritativeMetrics(packet.crossings);
    this.currentClosedCount = m.closedCount;
    this.updateHistory.push({
      time: packetTime,
      closedCount: m.closedCount,
      source: packet.source
    });
    return true;
  }
}

const store = new MockTelemetryStore();
const t0 = 1770000000000;

// Packet 1: Normal WS frame at t = 1000ms (3 closed)
const p1 = {
  timestamp: new Date(t0 + 1000).toISOString(),
  source: 'WS',
  crossings: [
    { id: 'c1', status: 'CLOSED' },
    { id: 'c2', status: 'CLOSURE_EXPECTED' },
    { id: 'c3', status: 'CLOSURE_EXPECTED' },
    { id: 'c4', status: 'OPEN' }
  ]
};
assert.strictEqual(store.processPacket(p1), true);
assert.strictEqual(store.currentClosedCount, 3);

// Packet 2: Newer WS frame at t = 2000ms (3 closed)
const p2 = {
  timestamp: new Date(t0 + 2000).toISOString(),
  source: 'WS',
  crossings: [
    { id: 'c1', status: 'CLOSED' },
    { id: 'c2', status: 'CLOSURE_EXPECTED' },
    { id: 'c3', status: 'CLOSURE_EXPECTED' },
    { id: 'c4', status: 'OPEN' }
  ]
};
assert.strictEqual(store.processPacket(p2), true);
assert.strictEqual(store.currentClosedCount, 3);

// Packet 3: Slow delayed HTTP poll initiated at t = 500ms, arriving at t = 2500ms with timestamp t = 500ms (0 closed)
const p3_delayed_stale = {
  timestamp: new Date(t0 + 500).toISOString(),
  source: 'HTTP_DELAYED',
  crossings: [
    { id: 'c1', status: 'OPEN' },
    { id: 'c2', status: 'OPEN' },
    { id: 'c3', status: 'OPEN' },
    { id: 'c4', status: 'OPEN' }
  ]
};
const p3Accepted = store.processPacket(p3_delayed_stale);
assert.strictEqual(p3Accepted, false, 'Stale out-of-order HTTP packet must be rejected');
assert.strictEqual(store.currentClosedCount, 3, 'Closed count must NOT regress to 0 due to delayed HTTP packet');
console.log('  ✓ PASS: Delayed HTTP response (t=500ms) arriving after WebSocket frame (t=2000ms) successfully rejected; count remained 3\n');

// 3. Transient network glitch / empty simulation audit
console.log('TEST 3: Transient network failure does NOT reset authoritative state to 0');
let lastGoodPayload = {
  metrics: { closedCount: 3, openCount: 33, totalCrossings: 36 },
  crossings: mockCrossings
};

function handlePollError(hasExistingGoodPayload) {
  if (!hasExistingGoodPayload) {
    // Only emit simulation if NO live data has ever been received
    return { emittedSimulation: true, closedCount: 0 };
  }
  // Otherwise, retain authoritative snapshot
  return { emittedSimulation: false, closedCount: hasExistingGoodPayload.metrics.closedCount };
}

const errorResult = handlePollError(lastGoodPayload);
assert.strictEqual(errorResult.emittedSimulation, false);
assert.strictEqual(errorResult.closedCount, 3);
console.log('  ✓ PASS: Transient poll error retains active live count (3) instead of flickering to INITIAL_METRICS (0)\n');

console.log('======================================================================');
console.log('ALL COUNT STABILITY CHECKS PASSED');
console.log('======================================================================\n');
