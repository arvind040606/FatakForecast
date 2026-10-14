// =========================================================================
// FATAKFORECAST — VERIFICATION SUITE: CROSSING INTELLIGENCE & FALSE-OPEN AUDIT
// Strictly verifies:
// 1. Busy crossings with NO telemetry NEVER return OPEN (must return STATUS UNKNOWN)
// 2. Stale train positions (>15m) return STATUS UNKNOWN / DATA UNAVAILABLE
// 3. Multiple approaching trains calculate merged continuous closure & aggregate count
// 4. Receding trains with live telemetry return PREDICTED OPEN (NO APPROACH DETECTED)
// 5. Cross-corridor train mismatch is rejected (no false association)
// 6. Confirmed gate states (activeDrill, manual report, hardware sensor) return CONFIRMED CLOSED / OPEN
// 7. Backend / feed outage returns STATUS UNKNOWN (never OPEN)
// 8. Historical traffic statistics are strictly separated from live operational conditions
// =========================================================================

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { TrainDetectionEngine, CROSSING_DETECTION_THRESHOLDS } from './trainDetectionEngine.js';
import { geminiIntelligenceService } from './geminiIntelligenceService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load genuine OSM infrastructure datasets
const crossings = JSON.parse(fs.readFileSync(path.join(__dirname, 'amritsar_crossings_osm.json'), 'utf8'));
const corridors = JSON.parse(fs.readFileSync(path.join(__dirname, 'amritsar_corridors_osm.json'), 'utf8'));

const corridorMap = {};
corridors.forEach(c => {
  corridorMap[c.id] = c;
});

const engine = new TrainDetectionEngine('TEST_API_KEY');

console.log('\n=============================================================');
console.log(' FATAKFORECAST ACCURACY & CROSSING-SPECIFIC INTELLIGENCE AUDIT');
console.log('=============================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(testName, testFn) {
  totalTests++;
  try {
    testFn();
    console.log(`  ✓ [PASS] ${testName}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${testName}`);
    console.error(`    Error: ${err.message}`);
    if (err.stack) {
      console.error(err.stack.split('\n').slice(1, 4).join('\n'));
    }
  }
}

// Locate high-traffic Jaura Phatak (LC-26 on ASR-JUC Main Line)
const jauraCrossing = crossings.find(c => c.name.includes('Jaura Phatak') || c.id === 'osm/node/1006212111');
assert(jauraCrossing, 'Jaura Phatak crossing must exist in OSM dataset');
const jucCorridor = corridorMap[jauraCrossing.corridorId];
assert(jucCorridor, 'JUC corridor must exist in OSM dataset');

// Standard healthy feed context
const healthyFeedContext = {
  feedStatus: 'CONNECTED',
  isFeedFresh: true,
  lastSuccessfulSync: new Date().toISOString()
};

// -------------------------------------------------------------------------
// TEST 1: Busy crossing with NO telemetry must NEVER return OPEN
// -------------------------------------------------------------------------
runTest('Busy Crossing with Zero Live Telemetry returns STATUS UNKNOWN (never false OPEN)', () => {
  const result = engine.evaluateCrossingGateState(
    jauraCrossing,
    [], // Zero active trains on corridor
    jucCorridor.coordinates,
    healthyFeedContext
  );

  assert.strictEqual(result.status, 'UNKNOWN', `Expected status UNKNOWN, got ${result.status}`);
  assert.strictEqual(result.gateStatusClassification, 'STATUS UNKNOWN', `Expected classification STATUS UNKNOWN, got ${result.gateStatusClassification}`);
  assert.strictEqual(result.gateStatusLabel, 'STATUS UNKNOWN', `Expected label STATUS UNKNOWN, got ${result.gateStatusLabel}`);
  assert.notStrictEqual(result.status, 'OPEN', 'Must never return false OPEN when telemetry is missing');
  assert.strictEqual(result.countdownAvailable, false, 'Countdown must not be available when data is missing');
  assert.strictEqual(result.timeToNextClosureSec, 0);
  assert.strictEqual(result.estimatedGateClosingTime, null);
  assert.strictEqual(result.expectedTrainArrival, null);
  assert.strictEqual(result.predictedReopenTime, null);
  assert.strictEqual(result.remainingWaitSec, 0);
  assert(result.statusReason.includes('No live train telemetry'), `Reason must mention telemetry: ${result.statusReason}`);
});

// -------------------------------------------------------------------------
// TEST 2: Stale train positions (>15m) return STATUS UNKNOWN / DATA UNAVAILABLE
// -------------------------------------------------------------------------
runTest('Stale Train Telemetry (>15m old) returns STATUS UNKNOWN (never false OPEN)', () => {
  const staleTrain = {
    id: 'TR-STALE-12497',
    number: '12497',
    name: 'SHANE PUNJAB',
    type: 'SUPERFAST',
    corridorId: 'CORR_ASR_JUC',
    lat: 31.625,
    lng: 74.910,
    speedKmH: 60,
    hasLiveSpeedMeasurement: true,
    speedSource: 'PROVIDER_LIVE_SPEED',
    direction: 'UP',
    status: 'IN_TRANSIT',
    dataState: 'STALE',
    isStale: true,
    lastPing: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
    providerObservationTimestamp: new Date(Date.now() - 20 * 60 * 1000).toISOString()
  };

  const result = engine.evaluateCrossingGateState(
    jauraCrossing,
    [staleTrain],
    jucCorridor.coordinates,
    healthyFeedContext
  );

  assert.strictEqual(result.status, 'UNKNOWN', `Expected status UNKNOWN for stale data, got ${result.status}`);
  assert.notStrictEqual(result.status, 'OPEN', 'Stale data must not produce OPEN status');
  assert.strictEqual(result.dataFreshness, 'STALE');
});

// -------------------------------------------------------------------------
// TEST 3: Multiple approaching trains calculate merged continuous closure
// -------------------------------------------------------------------------
runTest('Multiple Approaching Trains calculate combined continuous closure & aggregate count', () => {
  // Train 1: at corridor index 65 (track distance ~1.63 km, DOWN towards Amritsar Jn)
  // Train 2: at corridor index 85 (track distance ~4.33 km, DOWN towards Amritsar Jn)
  const train1 = {
    id: 'TR-12497',
    number: '12497',
    name: 'SHANE PUNJAB',
    type: 'SUPERFAST',
    corridorId: 'CORR_ASR_JUC',
    lat: jucCorridor.coordinates[65][0],
    lng: jucCorridor.coordinates[65][1],
    speedKmH: 60,
    hasLiveSpeedMeasurement: true,
    speedSource: 'PROVIDER_LIVE_SPEED',
    direction: 'DOWN',
    status: 'IN_TRANSIT',
    dataState: 'LIVE',
    lastPing: new Date().toISOString()
  };

  const train2 = {
    id: 'TR-12014',
    number: '12014',
    name: 'AMRITSAR SHATABDI',
    type: 'SHATABDI',
    corridorId: 'CORR_ASR_JUC',
    lat: jucCorridor.coordinates[85][0],
    lng: jucCorridor.coordinates[85][1],
    speedKmH: 60,
    hasLiveSpeedMeasurement: true,
    speedSource: 'PROVIDER_LIVE_SPEED',
    direction: 'DOWN',
    status: 'IN_TRANSIT',
    dataState: 'LIVE',
    lastPing: new Date().toISOString()
  };

  const result = engine.evaluateCrossingGateState(
    jauraCrossing,
    [train1, train2],
    jucCorridor.coordinates,
    healthyFeedContext
  );

  assert(result.status === 'APPROACHING' || result.status === 'CLOSURE_EXPECTED' || result.status === 'CLOSED', `Expected alert status, got ${result.status}`);
  assert.strictEqual(result.gateStatusClassification, 'PREDICTED CLOSURE');
  assert.strictEqual(result.gateStatusLabel, 'PREDICTED CLOSURE');
  assert.strictEqual(result.totalUpcomingTrains, 2, `Expected totalUpcomingTrains 2, got ${result.totalUpcomingTrains}`);
  assert(result.combinedClosure, 'combinedClosure must exist');
  assert.strictEqual(result.combinedClosure.trainCount, 2, 'Combined closure must count 2 trains');
  assert.strictEqual(result.combinedClosure.isContinuous, true, 'Closure must be continuous when gap <= 3.5m');
  assert(result.subsequentTrains.length >= 1, 'Subsequent trains array must contain second train');
  assert.strictEqual(result.subsequentTrains[0].trainNumber, '12014');
  assert(new Date(result.predictedReopenTime).getTime() >= new Date(result.expectedTrainArrival).getTime(), 'Reopening must be at or after final train passage');
});

// -------------------------------------------------------------------------
// TEST 4: Receding train with live telemetry returns PREDICTED OPEN
// -------------------------------------------------------------------------
runTest('Receding Train with Live Telemetry returns PREDICTED OPEN (NO APPROACH DETECTED)', () => {
  // Train that has already passed Jaura Phatak (segIndex 20 < 54) and is moving DOWN towards Amritsar Jn
  const recedingTrain = {
    id: 'TR-12497-REC',
    number: '12497',
    name: 'SHANE PUNJAB',
    type: 'SUPERFAST',
    corridorId: 'CORR_ASR_JUC',
    lat: jucCorridor.coordinates[20][0],
    lng: jucCorridor.coordinates[20][1],
    speedKmH: 50,
    hasLiveSpeedMeasurement: true,
    speedSource: 'PROVIDER_LIVE_SPEED',
    direction: 'DOWN', // Moving towards ASR Jn
    status: 'IN_TRANSIT',
    dataState: 'LIVE',
    lastPing: new Date().toISOString()
  };

  const result = engine.evaluateCrossingGateState(
    jauraCrossing,
    [recedingTrain],
    jucCorridor.coordinates,
    healthyFeedContext
  );

  assert.strictEqual(result.status, 'OPEN', `Expected OPEN for receding train, got ${result.status}`);
  assert.strictEqual(result.gateStatusClassification, 'NO APPROACH DETECTED', `Expected NO APPROACH DETECTED, got ${result.gateStatusClassification}`);
  assert.strictEqual(result.gateStatusLabel, 'PREDICTED OPEN', `Expected PREDICTED OPEN, got ${result.gateStatusLabel}`);
  assert.strictEqual(result.recommendation, 'CLEAR PASSAGE — PREDICTED OPEN');
  assert(result.lastTrainPassed, 'lastTrainPassed must be populated from genuine telemetry');
  assert.strictEqual(result.lastTrainPassed.trainNumber, '12497');
});

// -------------------------------------------------------------------------
// TEST 5: Cross-corridor train mismatch is rejected (no false association)
// -------------------------------------------------------------------------
runTest('Cross-Corridor Train Mismatch is strictly rejected', () => {
  // Train is physically close in 2D Euclidean distance to Jaura Phatak,
  // BUT is on the Attari branch (CORR_ASR_ATT), not the JUC mainline!
  const attariTrain = {
    id: 'TR-ATT-1',
    number: '64552',
    name: 'ATTARI-ASR DMU',
    type: 'LOCAL',
    corridorId: 'CORR_ASR_ATT',
    lat: jauraCrossing.lat + 0.01,
    lng: jauraCrossing.lng + 0.01,
    speedKmH: 45,
    hasLiveSpeedMeasurement: true,
    direction: 'UP',
    status: 'IN_TRANSIT',
    dataState: 'LIVE',
    lastPing: new Date().toISOString()
  };

  const result = engine.evaluateCrossingGateState(
    jauraCrossing,
    [attariTrain],
    jucCorridor.coordinates,
    healthyFeedContext
  );

  // Mismatched corridor train must be rejected and must NOT close Jaura Phatak!
  assert.notStrictEqual(result.status, 'CLOSED');
  assert.notStrictEqual(result.status, 'APPROACHING');
  assert.strictEqual(result.status, 'UNKNOWN', 'Without valid JUC trains, status must be UNKNOWN');
  assert.strictEqual(result.gateStatusClassification, 'STATUS UNKNOWN');
});

// -------------------------------------------------------------------------
// TEST 6: Confirmed gate states (drill, report, hardware sensor)
// -------------------------------------------------------------------------
runTest('Confirmed Gate States (activeDrill, manual report, hardware sensor) return CONFIRMED labels', () => {
  // A. Emergency / operational drill
  const drillCrossing = { ...jauraCrossing, activeDrill: true };
  const drillRes = engine.evaluateCrossingGateState(drillCrossing, [], jucCorridor.coordinates, healthyFeedContext);
  assert.strictEqual(drillRes.status, 'CLOSED');
  assert.strictEqual(drillRes.gateStatusClassification, 'CONFIRMED CLOSED');
  assert.strictEqual(drillRes.gateStatusLabel, 'CONFIRMED CLOSED');
  assert.strictEqual(drillRes.statusObservationType, 'OPERATIONAL_DRILL');
  assert.strictEqual(drillRes.recommendation, 'DO NOT CROSS — CONFIRMED CLOSED');

  // B. Verified closure reported
  const reportCrossing = { ...jauraCrossing, activeDrill: false, closureReported: true };
  const reportRes = engine.evaluateCrossingGateState(reportCrossing, [], jucCorridor.coordinates, healthyFeedContext);
  assert.strictEqual(reportRes.status, 'CLOSED');
  assert.strictEqual(reportRes.gateStatusClassification, 'CONFIRMED CLOSED');
  assert.strictEqual(reportRes.gateStatusLabel, 'CONFIRMED CLOSED');

  // C. Physical hardware sensor confirmed CLOSED
  const sensorClosedCrossing = { ...jauraCrossing, activeDrill: false, closureReported: false, observedPhysicalGateState: 'CLOSED' };
  const sensorClosedRes = engine.evaluateCrossingGateState(sensorClosedCrossing, [], jucCorridor.coordinates, healthyFeedContext);
  assert.strictEqual(sensorClosedRes.status, 'CLOSED');
  assert.strictEqual(sensorClosedRes.gateStatusClassification, 'CONFIRMED CLOSED');
  assert.strictEqual(sensorClosedRes.observedPhysicalGateState, 'CLOSED');
  assert.strictEqual(sensorClosedRes.physicalSensorAvailable, true);

  // D. Physical hardware sensor confirmed OPEN
  const sensorOpenCrossing = { ...jauraCrossing, activeDrill: false, closureReported: false, observedPhysicalGateState: 'OPEN' };
  const sensorOpenRes = engine.evaluateCrossingGateState(sensorOpenCrossing, [], jucCorridor.coordinates, healthyFeedContext);
  assert.strictEqual(sensorOpenRes.status, 'OPEN');
  assert.strictEqual(sensorOpenRes.gateStatusClassification, 'CONFIRMED OPEN');
  assert.strictEqual(sensorOpenRes.gateStatusLabel, 'CONFIRMED OPEN');
  assert.strictEqual(sensorOpenRes.observedPhysicalGateState, 'OPEN');
  assert.strictEqual(sensorOpenRes.physicalSensorAvailable, true);
  assert.strictEqual(sensorOpenRes.recommendation, 'SAFE TO CROSS — CONFIRMED OPEN');
});

// -------------------------------------------------------------------------
// TEST 7: Backend / provider outage returns STATUS UNKNOWN (never false OPEN)
// -------------------------------------------------------------------------
runTest('Backend / Provider Outage returns STATUS UNKNOWN (never false OPEN)', () => {
  const disconnectedFeed = {
    feedStatus: 'DISCONNECTED',
    isFeedFresh: false,
    lastSuccessfulSync: null
  };

  const result = engine.evaluateCrossingGateState(
    jauraCrossing,
    [],
    jucCorridor.coordinates,
    disconnectedFeed
  );

  assert.strictEqual(result.status, 'UNKNOWN');
  assert.notStrictEqual(result.status, 'OPEN', 'Outage must NEVER produce false OPEN');
  assert.strictEqual(result.dataClassification, 'DATA_UNAVAILABLE');
  assert(result.statusReason.includes('disconnected') || result.statusReason.includes('unavailable'));
});

// -------------------------------------------------------------------------
// TEST 8: Historical traffic pattern separation (never treat frequency as live closure)
// -------------------------------------------------------------------------
runTest('Historical Traffic Patterns are strictly marked isHistoricalOnly: true and do not alter live state', () => {
  // Crossing with heavy historical pattern (130 daily passages)
  const crossingWithHistory = {
    ...jauraCrossing,
    historicalTrafficPattern: {
      isHistoricalOnly: true,
      corridorType: 'HIGH_FREQUENCY_TRUNK',
      scheduledDailyPassages: 130,
      peakWindowsIST: ['06:00 - 09:30', '16:30 - 20:30'],
      historicalAvgClosureDurationMin: 7.2
    }
  };

  assert.strictEqual(crossingWithHistory.historicalTrafficPattern.isHistoricalOnly, true);

  // In absence of live telemetry, status must still be UNKNOWN, NOT closed based on high frequency!
  const result = engine.evaluateCrossingGateState(
    crossingWithHistory,
    [],
    jucCorridor.coordinates,
    healthyFeedContext
  );

  assert.strictEqual(result.status, 'UNKNOWN');
  assert.notStrictEqual(result.status, 'CLOSED', 'High historical frequency must NEVER be used to mark gate closed without live telemetry');
  assert.notStrictEqual(result.status, 'OPEN', 'Must not be marked OPEN without telemetry');
});

// -------------------------------------------------------------------------
// TEST 9: An OPEN crossing must NEVER display an estimated opening/reopening time
// -------------------------------------------------------------------------
runTest('An OPEN crossing must NEVER have predictedReopenTime or opening estimate', () => {
  // Train is >8km away on corridor (roadway is OPEN with live monitor)
  const distantTrain = {
    id: 'TR-DISTANT-12014',
    number: '12014',
    name: 'SHATABDI EXP',
    corridorId: 'CORR_ASR_JUC',
    direction: 'DOWN',
    speedKmH: 75,
    speedSource: 'CALCULATED_GPS_DELTA',
    hasLiveSpeedMeasurement: true,
    dataState: 'LIVE',
    status: 'IN_TRANSIT',
    lat: jucCorridor.coordinates[150][0],
    lng: jucCorridor.coordinates[150][1],
    currentCoordIndex: 150,
    lastPing: new Date().toISOString()
  };

  const result = engine.evaluateCrossingGateState(
    jauraCrossing,
    [distantTrain],
    jucCorridor.coordinates,
    healthyFeedContext
  );

  assert.strictEqual(result.status, 'OPEN', 'Crossing must be OPEN when train is distant');
  assert.strictEqual(result.predictedReopenTime, null, 'OPEN crossing must NEVER have predictedReopenTime');
  assert.strictEqual(result.estimatedGateReopeningTime, null, 'OPEN crossing must NEVER have estimatedGateReopeningTime');
  assert.strictEqual(result.timingMetrics?.likelyReopen, null, 'OPEN crossing must NEVER have timingMetrics.likelyReopen');
  assert.strictEqual(result.reopening?.likelyReopen, null, 'OPEN crossing must NEVER have reopening.likelyReopen');
  assert.strictEqual(result.combinedClosure?.closureEnd, null, 'OPEN crossing combinedClosure.closureEnd must be null');
});

// -------------------------------------------------------------------------
// TEST 10: Approaching train (CLOSING SOON) must NOT display reopening estimate
// -------------------------------------------------------------------------
runTest('Approaching train (CLOSING SOON) must NOT calculate reopening estimate before gate closes', () => {
  // Train is 5.5 km away (approaching threshold)
  const approachingTrain = {
    id: 'TR-APP-12014',
    number: '12014',
    name: 'AMRITSAR SHATABDI',
    corridorId: 'CORR_ASR_JUC',
    direction: 'DOWN',
    speedKmH: 70,
    speedSource: 'CALCULATED_GPS_DELTA',
    hasLiveSpeedMeasurement: true,
    dataState: 'LIVE',
    status: 'IN_TRANSIT',
    lat: jucCorridor.coordinates[85][0],
    lng: jucCorridor.coordinates[85][1],
    currentCoordIndex: 85,
    lastPing: new Date().toISOString()
  };

  const result = engine.evaluateCrossingGateState(
    jauraCrossing,
    [approachingTrain],
    jucCorridor.coordinates,
    healthyFeedContext
  );

  assert.strictEqual(result.status, 'APPROACHING', 'Status must be APPROACHING');
  assert.strictEqual(result.predictedReopenTime, null, 'APPROACHING crossing must NOT display reopening estimate');
  assert.strictEqual(result.estimatedGateReopeningTime, null, 'APPROACHING crossing must NOT have estimatedGateReopeningTime');
  assert.strictEqual(result.timingMetrics?.likelyReopen, null);
  assert.strictEqual(result.combinedClosure?.closureEnd, null, 'Combined closureEnd must be null before closure');
});

// -------------------------------------------------------------------------
// TEST 11: Stationary platform trains must be EXCLUDED from closing crossings
// -------------------------------------------------------------------------
runTest('Stationary platform trains (dwelling/boarding) are EXCLUDED from triggering gate closures', () => {
  const stationaryPlatformTrain = {
    id: 'TR-STAT-12497',
    number: '12497',
    name: 'SHANE PUNJAB',
    corridorId: 'CORR_ASR_JUC',
    direction: 'UP',
    speedKmH: 0,
    liveSpeedKmH: 0,
    isStationaryAtPlatform: true,
    status: 'PLATFORM_BOARDING',
    dataState: 'SCHEDULED',
    lat: jucCorridor.coordinates[45][0],
    lng: jucCorridor.coordinates[45][1],
    currentCoordIndex: 45,
    lastPing: new Date().toISOString()
  };

  const result = engine.evaluateCrossingGateState(
    jauraCrossing,
    [stationaryPlatformTrain],
    jucCorridor.coordinates,
    healthyFeedContext
  );

  // Must NOT be closed or approaching!
  assert.notStrictEqual(result.status, 'CLOSED', 'Stationary platform train must NOT trigger gate closure');
  assert.notStrictEqual(result.status, 'APPROACHING', 'Stationary platform train must NOT trigger approach warning');
  assert.strictEqual(result.status, 'UNKNOWN', 'With only stationary platform train, crossing remains UNKNOWN (no in-transit movement)');
});

// -------------------------------------------------------------------------
// TEST 12: Gemini Intelligence Service & Deterministic Railway Fallback
// -------------------------------------------------------------------------
runTest('Gemini Intelligence analyzes crossing risk and detects physical contradictions', async () => {
  // A. Normal evaluation
  const normalAnalysis = geminiIntelligenceService.evaluateDeterministicIntelligence(
    jauraCrossing,
    [],
    jucCorridor
  );
  assert.strictEqual(typeof normalAnalysis.riskLevel, 'string');
  assert.strictEqual(typeof normalAnalysis.recommendedCommuterAction, 'string');
  assert.strictEqual(normalAnalysis.contradictionDetected, false);

  // B. Contradiction evaluation (super-kinematic impossible speed > 130 km/h)
  const anomalyTrain = {
    number: '99999',
    name: 'SUPER SPEED ANOMALY',
    speedKmH: 195,
    distanceKm: 2.0,
    dataState: 'LIVE'
  };
  const anomalyAnalysis = geminiIntelligenceService.evaluateDeterministicIntelligence(
    jauraCrossing,
    [anomalyTrain],
    jucCorridor
  );
  assert.strictEqual(anomalyAnalysis.contradictionDetected, true, 'Must detect speed contradiction exceeding 130 km/h');
  assert.strictEqual(anomalyAnalysis.suspiciousPredictionFlag, true);
  assert(anomalyAnalysis.contradictionDetails.includes('195 km/h'));

  // C. Diagnostics verification
  const diag = geminiIntelligenceService.getDiagnostics();
  assert.strictEqual(typeof diag.isConfigured, 'boolean');
  assert.strictEqual(typeof diag.circuitState, 'string');
});

// -------------------------------------------------------------------------
// TEST 13: API Confirms Corridor Clear returns verified OPEN with NO reopening estimate
// -------------------------------------------------------------------------
runTest('API confirms corridor clear returns verified OPEN with strictly null reopening estimate', () => {
  const verifiedFeedContext = {
    feedStatus: 'CONNECTED',
    isFeedFresh: true,
    lastSuccessfulSync: new Date().toISOString(),
    apiConfirmsCorridorClear: true
  };

  // Case A: Stationary platform train present, API confirms corridor clear
  const statTrain = {
    id: 'TR-STAT-12904',
    number: '12904',
    name: 'GOLDEN TEMPLE ML',
    corridorId: 'CORR_ASR_JUC',
    direction: 'UP',
    speedKmH: 0,
    liveSpeedKmH: 0,
    isStationaryAtPlatform: true,
    status: 'PLATFORM_BOARDING',
    dataState: 'SCHEDULED',
    lat: jucCorridor.coordinates[45][0],
    lng: jucCorridor.coordinates[45][1],
    currentCoordIndex: 45,
    lastPing: new Date().toISOString()
  };

  const resultWithStatTrain = engine.evaluateCrossingGateState(
    jauraCrossing,
    [statTrain],
    jucCorridor.coordinates,
    verifiedFeedContext
  );

  assert.strictEqual(resultWithStatTrain.status, 'OPEN', 'Crossing must be OPEN when platform train is stationary and API confirms clear');
  assert.strictEqual(resultWithStatTrain.gateStatusClassification, 'NO APPROACH DETECTED');
  assert.strictEqual(resultWithStatTrain.predictedReopenTime, null, 'OPEN crossing must NEVER have predictedReopenTime');
  assert.strictEqual(resultWithStatTrain.estimatedGateReopeningTime, null, 'OPEN crossing must NEVER have estimatedGateReopeningTime');
  assert(resultWithStatTrain.statusReason.includes('stationary at station platform'), 'Reason must explain stationary platform train');

  // Case B: Zero trains in corridor, API confirms corridor clear
  const resultEmptyCorridor = engine.evaluateCrossingGateState(
    jauraCrossing,
    [],
    jucCorridor.coordinates,
    verifiedFeedContext
  );

  assert.strictEqual(resultEmptyCorridor.status, 'OPEN', 'Crossing must be OPEN when API confirms corridor clear of moving trains');
  assert.strictEqual(resultEmptyCorridor.predictedReopenTime, null, 'OPEN crossing must NEVER have predictedReopenTime');
  assert.strictEqual(resultEmptyCorridor.estimatedGateReopeningTime, null, 'OPEN crossing must NEVER have estimatedGateReopeningTime');
  assert(resultEmptyCorridor.statusReason.includes('confirms zero moving trains'), 'Reason must cite API confirmation');
});

console.log('\n=============================================================');
console.log(` AUDIT SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED`);
console.log('=============================================================\n');

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
