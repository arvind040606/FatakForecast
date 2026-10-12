import assert from 'assert';
import { trainDetectionEngine } from './backend/trainDetectionEngine.js';
import { railkitService } from './backend/railkitService.js';
import { trainAggregationService } from './backend/trainAggregationService.js';

console.log('================================================================');
console.log('FATAKFORECAST LIVE-ONLY RIGOROUS REGRESSION TEST SUITE');
console.log('================================================================\n');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`[PASS] Test ${totalTests}: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] Test ${totalTests}: ${name}`);
    console.error(`       Error: ${err.message}\n`);
    throw err;
  }
}

// -----------------------------------------------------------------------------
// Test 1: Operating mode defaults to LIVE_OPERATIONAL
// -----------------------------------------------------------------------------
test('Operating mode defaults to LIVE_OPERATIONAL', () => {
  assert.strictEqual(trainDetectionEngine.getOperatingMode(), 'LIVE_OPERATIONAL');
});

// -----------------------------------------------------------------------------
// Test 2: Timetable-only (SCHEDULED) trains are strictly REJECTED from closing crossings
// -----------------------------------------------------------------------------
test('Timetable-only (dataState: SCHEDULED) train is rejected by safety engine', () => {
  const dummyTrain = {
    id: '06935',
    number: '06935',
    name: 'Phantom Timetable Train',
    corridorId: 'CORR_ASR_PTK',
    direction: 'UP',
    speedKmH: 42,
    lat: 31.6500,
    lng: 74.8800,
    status: 'IN_TRANSIT',
    dataState: 'SCHEDULED', // NOT LIVE
    isWithinAmritsarSector: true,
    distanceFromAmritsarKm: 4.5
  };

  const validation = trainDetectionEngine.validateTrainCandidate(dummyTrain);
  assert.strictEqual(validation.isValid, false, 'Scheduled train must not be valid for crossing calculations');
  assert.ok(
    validation.errors.some(e => e.includes('SCHEDULED') || e.includes('LIVE provider telemetry')),
    'Must explain rejection due to non-LIVE dataState'
  );
});

// -----------------------------------------------------------------------------
// Test 3: Synthetic / Simulated demo rakes are strictly REJECTED in LIVE_OPERATIONAL mode
// -----------------------------------------------------------------------------
test('Simulated test rake (SIM-DEMO-01) is rejected in LIVE_OPERATIONAL mode', () => {
  const simTrain = {
    id: 'SIM-DEMO-01',
    number: 'SIM-DEMO-01',
    name: 'Simulated Demo Rake',
    corridorId: 'CORR_ASR_JUC',
    direction: 'UP',
    speedKmH: 45,
    lat: 31.6338,
    lng: 74.8655,
    status: 'IN_TRANSIT',
    dataState: 'SIMULATED',
    positionClassification: 'SYNTHETIC_DEMO'
  };

  const validation = trainDetectionEngine.validateTrainCandidate(simTrain);
  assert.strictEqual(validation.isValid, false);
  assert.ok(validation.errors.some(e => e.includes('Synthetic') || e.includes('Simulated')));
});

// -----------------------------------------------------------------------------
// Test 4: Out-of-sector trains (>85 km) are rejected
// -----------------------------------------------------------------------------
test('Out-of-sector train (e.g. at Ludhiana or New Delhi) cannot close Amritsar crossings', () => {
  const outTrain = {
    id: '12013',
    number: '12013',
    name: 'New Delhi Shatabdi',
    corridorId: 'CORR_ASR_JUC',
    direction: 'DOWN',
    speedKmH: 74,
    lat: 28.64305,
    lng: 77.21938,
    status: 'OUT_OF_SECTOR',
    dataState: 'LIVE',
    distanceFromAmritsarKm: 402.25,
    isWithinAmritsarSector: false
  };

  const validation = trainDetectionEngine.validateTrainCandidate(outTrain);
  assert.strictEqual(validation.isValid, false);
  assert.ok(validation.errors.some(e => e.includes('sector') || e.includes('85km')));
});

// -----------------------------------------------------------------------------
// Test 5: Terminated and Cancelled trains cannot close crossings
// -----------------------------------------------------------------------------
test('Terminated train service is rejected from gate closure evaluation', () => {
  const termTrain = {
    id: '12411',
    number: '12411',
    name: 'Intercity Express',
    corridorId: 'CORR_ASR_JUC',
    direction: 'DOWN',
    speedKmH: null,
    lat: 31.6338,
    lng: 74.8655,
    status: 'TERMINATED',
    dataState: 'LIVE',
    distanceFromAmritsarKm: 0,
    isWithinAmritsarSector: true
  };

  const validation = trainDetectionEngine.validateTrainCandidate(termTrain);
  assert.strictEqual(validation.isValid, false);
  assert.ok(validation.errors.some(e => e.includes('terminated')));
});

// -----------------------------------------------------------------------------
// Test 6: Stale telemetry (>15 min) is rejected
// -----------------------------------------------------------------------------
test('Stale telemetry ping (>15 minutes old) is rejected', () => {
  const staleTime = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  const staleTrain = {
    id: '14673',
    number: '14673',
    name: 'Shaheed Express',
    corridorId: 'CORR_ASR_JUC',
    direction: 'DOWN',
    speedKmH: 52,
    lat: 31.6195,
    lng: 74.9411,
    status: 'IN_TRANSIT',
    dataState: 'LIVE',
    distanceFromAmritsarKm: 14.2,
    isWithinAmritsarSector: true,
    providerObservationTimestamp: staleTime
  };

  const validation = trainDetectionEngine.validateTrainCandidate(staleTrain);
  assert.strictEqual(validation.isValid, false);
  assert.ok(validation.errors.some(e => e.includes('stale') || e.includes('15 minutes')));
});

// -----------------------------------------------------------------------------
// Test 7: Genuine LIVE train inside sector IS valid
// -----------------------------------------------------------------------------
test('Genuine LIVE in-transit train within sector passes validation', () => {
  const liveTrain = {
    id: '12053',
    number: '12053',
    name: 'Jan Shatabdi Express',
    corridorId: 'CORR_ASR_JUC',
    direction: 'DOWN',
    speedKmH: 55,
    lat: 31.5200,
    lng: 75.2500, // Near Beas, within 85km sector
    status: 'IN_TRANSIT',
    dataState: 'LIVE',
    distanceFromAmritsarKm: 42.0,
    isWithinAmritsarSector: true,
    providerObservationTimestamp: new Date().toISOString()
  };

  const validation = trainDetectionEngine.validateTrainCandidate(liveTrain);
  assert.strictEqual(validation.isValid, true, `Expected valid candidate, got errors: ${validation.errors.join(', ')}`);
});

// -----------------------------------------------------------------------------
// Test 8: Crossing evaluation never claims physical barrier is OPEN or CLOSED based on telemetry alone
// -----------------------------------------------------------------------------
test('Crossing evaluation marks physical boom state as UNKNOWN and specifies clear passage prediction', () => {
  const crossing = {
    id: 'osm/node/1006212111',
    name: 'Verka Phatak',
    corridorId: 'CORR_ASR_PTK',
    lat: 31.6668,
    lng: 74.9245
  };

  const corridorCoords = [
    [31.6338, 74.8655],
    [31.6668, 74.9245],
    [31.7000, 74.9600]
  ];

  const evaluation = trainDetectionEngine.evaluateCrossingGateState(
    crossing,
    [], // No approaching trains
    corridorCoords,
    { feedStatus: 'CONNECTED', isFeedFresh: true, lastSuccessfulSync: new Date().toISOString() }
  );

  assert.strictEqual(evaluation.status, 'OPEN');
  assert.strictEqual(evaluation.gateStatusClassification, 'PREDICTED PASSAGE CLEAR');
  assert.strictEqual(evaluation.gateStatusLabel, 'PREDICTED CLEAR');
  assert.strictEqual(evaluation.observedPhysicalGateState, 'UNKNOWN');
  assert.strictEqual(evaluation.physicalSensorAvailable, false);
  assert.ok(evaluation.physicalSensorNote.includes('UNKNOWN'));
});

// -----------------------------------------------------------------------------
// Test 9: RailKit Credit Conservation — App inactive skips polling
// -----------------------------------------------------------------------------
test('App inactivity pause: isAppActive evaluates correctly to conserve API credits', () => {
  // If app is inactive, isAppActive returns false
  railkitService.setAppActiveChecker(() => false);
  assert.strictEqual(railkitService.isAppActive(), false);
  assert.strictEqual(trainAggregationService.isAppActive(), false);

  // When client pings, isAppActive returns true
  railkitService.setAppActiveChecker(() => true);
  assert.strictEqual(railkitService.isAppActive(), true);
  assert.strictEqual(trainAggregationService.isAppActive(), true);

  // Restore null checker
  railkitService.setAppActiveChecker(null);
});

// -----------------------------------------------------------------------------
// Test 10: In-flight request deduplication & Cache TTL
// -----------------------------------------------------------------------------
test('Deduplication & Cache configuration: inFlightRequests map & 90s cache configured', () => {
  assert.ok(railkitService.inFlightRequests instanceof Map);
  assert.strictEqual(railkitService.cacheTtlMs, 90000, 'Cache TTL must be 90s');
  assert.strictEqual(railkitService.errorCacheTtlMs, 900000, 'Negative error cache must be 15 minutes');
});

// -----------------------------------------------------------------------------
// Test 11: Amritsar–Pathankot Corridor Phantom Train (06935) is Purged
// -----------------------------------------------------------------------------
test('Phantom train 06935 is not in monitored trains list', () => {
  assert.strictEqual(railkitService.monitoredTrainNumbers.includes('06935'), false);
  assert.strictEqual(railkitService.monitoredTrainNumbers.includes('06936'), false);
});

console.log(`\n================================================================`);
console.log(`ALL ${passedTests} OF ${totalTests} REGRESSION TESTS PASSED CLEANLY!`);
console.log(`================================================================`);
