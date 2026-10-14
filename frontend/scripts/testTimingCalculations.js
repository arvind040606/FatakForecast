// =========================================================================
// FATAKFORECAST — AUTOMATED TIMING CALCULATIONS TEST SUITE
// Tests 9 essential states:
// 1. OPEN (Clear passage, no approaching train)
// 2. APPROACHING (Train approaching outside closure lead buffer)
// 3. CLOSING SOON (Train within imminent closure lead buffer)
// 4. CLOSED (Barriers locked with future reopening time)
// 5. EXPIRED CLOSED (Stale reopen time in the past — MUST NEVER show past time!)
// 6. MULTIPLE TRAINS (Continuous closure across subsequent trains)
// 7. STALE DATA / EXPIRED PREDICTION (Feed offline or prediction expired)
// 8. BACKEND OFFLINE (Feed status DISCONNECTED)
// 9. UNKNOWN POSITION / CORRIDOR MISMATCH (Unverified geometry)
// =========================================================================

import assert from 'assert';
import { getCrossingTimingDetails, format12h } from '../src/utils/trainHelpers.ts';

const NOW = new Date('2026-10-14T07:45:00.000Z').getTime(); // 13:15:00 IST (Asia/Kolkata)

console.log('--- STARTING TIMING LOGIC TESTS ---');
console.log('Base Test Time (IST):', format12h(NOW));

let passed = 0;
let total = 0;

function runTest(name, fn) {
  total++;
  try {
    fn();
    console.log(`✓ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`✗ FAIL: ${name}`);
    console.error(err);
  }
}

// ---------------------------------------------------------------------------
// TEST 1: OPEN State
// ---------------------------------------------------------------------------
runTest('1. OPEN state has clear passage and no closing/reopening times', () => {
  const crossing = {
    id: 'test-c1',
    name: 'Test Crossing 1',
    status: 'OPEN',
    gateStatusClassification: 'CLEAR PASSAGE',
    predictionConfidence: 'HIGH'
  };

  const timing = getCrossingTimingDetails(crossing, NOW);
  assert.strictEqual(timing.statusBadge.label, 'OPEN');
  assert.strictEqual(timing.isOpenPassage, true);
  assert.strictEqual(timing.isClosedNow, false);
  assert.strictEqual(timing.isClosingSoon, false);
  assert.strictEqual(timing.closingTimeStr, null);
  assert.strictEqual(timing.reopeningTimeStr, null);
  assert.strictEqual(timing.trainArrivalEtaText, 'Clear passage · No approaching trains');
});

// ---------------------------------------------------------------------------
// TEST 2: APPROACHING State (Train 10 min away, closes in 6.5 min)
// ---------------------------------------------------------------------------
runTest('2. APPROACHING state shows future arrival ETA and future closing time', () => {
  const crossing = {
    id: 'test-c2',
    name: 'Test Crossing 2',
    status: 'APPROACHING',
    gateStatusClassification: 'APPROACH ALERT',
    predictionConfidence: 'HIGH',
    estimatedGateClosingTime: new Date(NOW + 390000).toISOString(), // in 6.5 min (13:21:30 IST)
    expectedTrainArrival: new Date(NOW + 600000).toISOString(),      // in 10 min (13:25:00 IST)
    predictedReopenTime: new Date(NOW + 780000).toISOString(),       // in 13 min (13:28:00 IST)
    closureDurationMin: 6.5,
    upcomingTrain: {
      number: '12029',
      name: 'Swarna Shatabdi Express',
      speedKmH: 75
    }
  };

  const timing = getCrossingTimingDetails(crossing, NOW);
  assert.strictEqual(timing.statusBadge.label, 'CLOSING SOON');
  assert.strictEqual(timing.isClosingSoon, true);
  assert.strictEqual(timing.isClosedNow, false);
  assert.strictEqual(timing.closeSec > 0, true);
  assert.strictEqual(timing.closingTimeStr !== null, true);
  assert.strictEqual(timing.closingCountdownText, 'in ~7 min');
  assert(timing.trainArrivalEtaText.includes('Train arriving in 10 min'));
  assert.strictEqual(timing.trainNumber, '12029');
});

// ---------------------------------------------------------------------------
// TEST 3: CLOSING SOON State (Train within 3 minutes of barrier closure)
// ---------------------------------------------------------------------------
runTest('3. CLOSING SOON state within lead buffer displays <1 min countdown correctly', () => {
  const crossing = {
    id: 'test-c3',
    name: 'Test Crossing 3',
    status: 'CLOSURE_EXPECTED',
    gateStatusClassification: 'CLOSURE_EXPECTED',
    predictionConfidence: 'HIGH',
    estimatedGateClosingTime: new Date(NOW + 45000).toISOString(), // closes in 45 sec
    expectedTrainArrival: new Date(NOW + 255000).toISOString(),
    predictedReopenTime: new Date(NOW + 435000).toISOString(),
    closureDurationMin: 6
  };

  const timing = getCrossingTimingDetails(crossing, NOW);
  assert.strictEqual(timing.statusBadge.label, 'CLOSING SOON');
  assert.strictEqual(timing.closeSec, 45);
  assert.strictEqual(timing.closingCountdownText, 'in <1 min');
});

// ---------------------------------------------------------------------------
// TEST 4: CLOSED State with Valid Future Reopening
// ---------------------------------------------------------------------------
runTest('4. CLOSED state shows locked barriers and future reopening time in Kolkata timezone', () => {
  const reopenMs = NOW + 300000; // in 5 minutes (13:20:00 IST)
  const crossing = {
    id: 'test-c4',
    name: 'Test Crossing 4',
    status: 'CLOSED',
    gateStatusClassification: 'CLOSED',
    predictionConfidence: 'HIGH',
    estimatedGateClosingTime: new Date(NOW - 120000).toISOString(), // closed 2m ago
    expectedTrainArrival: new Date(NOW + 90000).toISOString(),
    predictedReopenTime: new Date(reopenMs).toISOString(),
    closureDurationMin: 7
  };

  const timing = getCrossingTimingDetails(crossing, NOW);
  assert.strictEqual(timing.statusBadge.label, 'CLOSED');
  assert.strictEqual(timing.isClosedNow, true);
  assert.strictEqual(timing.closingTimeStr, 'Barriers locked');
  assert.strictEqual(timing.reopenSec, 300);
  assert.strictEqual(timing.reopenCountdownText, 'in ~5 min');
  assert.strictEqual(timing.reopeningTimeStr, format12h(reopenMs));
  assert(timing.trainArrivalEtaText.startsWith('Expected to reopen at'));
  assert(timing.closureDurationText.includes('7 min'));
});

// ---------------------------------------------------------------------------
// TEST 5: EXPIRED Reopening Time (CRITICAL BUG REPRODUCTION & FIX VERIFICATION)
// ---------------------------------------------------------------------------
runTest('5. EXPIRED reopening time (e.g. 11:54 AM at 12:34 PM) NEVER displays a past time string', () => {
  const expiredPastReopenMs = NOW - 40 * 60 * 1000; // 40 minutes in the past!
  const crossing = {
    id: 'test-c5-manawala',
    name: 'Manawala West Crossing',
    status: 'CLOSED',
    gateStatusClassification: 'CLOSED',
    predictionConfidence: 'MODERATE',
    estimatedGateClosingTime: new Date(expiredPastReopenMs - 6 * 60 * 1000).toISOString(),
    predictedReopenTime: new Date(expiredPastReopenMs).toISOString()
  };

  const timing = getCrossingTimingDetails(crossing, NOW);
  // Must NEVER format the past time string as an expected future reopening time!
  assert.strictEqual(timing.reopeningTimeStr, null);
  // Status must recognize that the prediction has expired and is unverified!
  assert.strictEqual(timing.isTimingUnavailable, true);
  assert.strictEqual(timing.statusBadge.label, 'TIMING UNAVAILABLE');
  assert(timing.trainArrivalEtaText.includes('Prediction expired'));
});

// ---------------------------------------------------------------------------
// TEST 6: MULTIPLE TRAINS (Continuous closure)
// ---------------------------------------------------------------------------
runTest('6. MULTIPLE TRAINS continuous closure merges subsequent trains without hardcoded 6m', () => {
  const crossing = {
    id: 'test-c6-multi',
    name: 'Jaura Phatak',
    status: 'CLOSURE_EXPECTED',
    gateStatusClassification: 'CLOSURE_EXPECTED',
    predictionConfidence: 'HIGH',
    combinedClosure: {
      isContinuous: true,
      combinedDurationMinutes: 11.5,
      closureEnd: new Date(NOW + 690000).toISOString()
    },
    totalUpcomingTrains: 2,
    subsequentTrains: [
      { trainNumber: '12029', trainName: 'Swarna Shatabdi' },
      { trainNumber: '12460', trainName: 'Amritsar Intercity' }
    ]
  };

  const timing = getCrossingTimingDetails(crossing, NOW);
  assert.strictEqual(timing.isMultiTrain, true);
  assert.strictEqual(timing.trainCount, 2);
  assert.strictEqual(timing.closureDurationMin, 12);
  assert(timing.closureDurationText.includes('12 min'));
});

// ---------------------------------------------------------------------------
// TEST 7: STALE DATA / PREDICTION EXPIRED
// ---------------------------------------------------------------------------
runTest('7. STALE DATA transitions to TIMING UNAVAILABLE with honest disclosure', () => {
  const crossing = {
    id: 'test-c7-stale',
    name: 'Putlighar Crossing',
    status: 'UNKNOWN',
    predictionConfidence: 'UNAVAILABLE',
    gateStatusClassification: 'UNAVAILABLE',
    statusReason: 'Candidate train telemetry on corridor is stale (>15m).'
  };

  const timing = getCrossingTimingDetails(crossing, NOW);
  assert.strictEqual(timing.statusBadge.label, 'TIMING UNAVAILABLE');
  assert.strictEqual(timing.isTimingUnavailable, true);
  assert.strictEqual(timing.closingTimeStr, null);
  assert.strictEqual(timing.reopeningTimeStr, null);
  assert(timing.trainArrivalEtaText.includes('stale'));
});

// ---------------------------------------------------------------------------
// TEST 8: BACKEND OFFLINE
// ---------------------------------------------------------------------------
runTest('8. BACKEND OFFLINE state does not fabricate closures or fake countdowns', () => {
  const crossing = {
    id: 'test-c8-offline',
    name: 'Vallah Crossing',
    status: 'UNKNOWN',
    gateStatusClassification: 'UNAVAILABLE',
    isStatusEstimated: true,
    predictionConfidence: 'UNAVAILABLE',
    statusReason: 'Telemetry feed offline · Real-time gate state unverified'
  };

  const timing = getCrossingTimingDetails(crossing, NOW);
  assert.strictEqual(timing.statusBadge.label, 'TIMING UNAVAILABLE');
  assert.strictEqual(timing.closeSec, 0);
  assert.strictEqual(timing.reopenSec, 0);
  assert.strictEqual(timing.closingCountdownText, null);
  assert.strictEqual(timing.reopenCountdownText, null);
});

// ---------------------------------------------------------------------------
// TEST 9: UNKNOWN POSITION / CORRIDOR MISMATCH
// ---------------------------------------------------------------------------
runTest('9. UNKNOWN POSITION correctly reports timing unavailable', () => {
  const crossing = {
    id: 'test-c9-missing',
    name: 'Unmapped Crossing',
    status: 'UNKNOWN',
    gateStatusClassification: 'UNAVAILABLE',
    predictionConfidence: 'UNAVAILABLE',
    statusReason: 'Crossing coordinates are missing or unobserved.'
  };

  const timing = getCrossingTimingDetails(crossing, NOW);
  assert.strictEqual(timing.statusBadge.label, 'TIMING UNAVAILABLE');
  assert.strictEqual(timing.isOpenPassage, false);
  assert.strictEqual(timing.isClosedNow, false);
});

// ---------------------------------------------------------------------------
// SUMMARY
// ---------------------------------------------------------------------------
console.log('-----------------------------------');
console.log(`TOTAL TESTS: ${total} | PASSED: ${passed} | FAILED: ${total - passed}`);
if (passed === total) {
  console.log('🎉 ALL TIMING ACCURACY TESTS PASSED!');
  process.exit(0);
} else {
  console.error('❌ SOME TESTS FAILED');
  process.exit(1);
}
