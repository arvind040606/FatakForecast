// =========================================================================
// FATAKFORECAST — FOCUSED PROVIDER & TELEMETRY INTEGRATION AUDIT TEST SUITE
// Verifies RailKit, RailRadar, Circuit Breakers, Response Integrity, State
// Classification, Timestamp Separation, and Zero Physical State Fabrication
// =========================================================================

import assert from 'assert';
import { TelemetryService } from './backend/telemetryService.js';
import { RailkitService } from './backend/railkitService.js';
import { TrainAggregationService } from './backend/trainAggregationService.js';

console.log('--- STARTING FATAKFORECAST PROVIDER AUDIT TEST SUITE ---');

let passedTests = 0;
let totalTests = 0;

async function runTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`[PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] ${name}:`, err.message);
  }
}

async function runSuite() {
  // ---------------------------------------------------------------------------
  // TEST 1: RailRadar Circuit Breaker Behavior
  // ---------------------------------------------------------------------------
  await runTest('RailRadar Circuit Breaker Trips on Consecutive Failures & Enters Backoff', () => {
    const radar = new TelemetryService();
    assert.strictEqual(radar.circuitBreaker.state, 'CLOSED');
    assert.strictEqual(radar.circuitBreaker.failureCount, 0);

    // Trip circuit breaker
    radar.tripCircuitBreaker('HTTP 429 Quota Exhausted');
    assert.strictEqual(radar.circuitBreaker.state, 'OPEN');
    assert.strictEqual(radar.isQuotaExhausted, true);
    assert.strictEqual(radar.isAvailable(), false);

    const status = radar.getCircuitBreakerStatus();
    assert.strictEqual(status.state, 'OPEN');
    assert.strictEqual(status.quotaExhausted, true);
    assert.ok(status.cooldownRemainingSec > 0);

    // Reset
    radar.resetCircuitBreaker();
    assert.strictEqual(radar.circuitBreaker.state, 'CLOSED');
    assert.strictEqual(radar.isQuotaExhausted, false);
    assert.strictEqual(radar.circuitBreaker.failureCount, 0);
  });

  // ---------------------------------------------------------------------------
  // TEST 2: RailKit Circuit Breaker Behavior
  // ---------------------------------------------------------------------------
  await runTest('RailKit Circuit Breaker Trips and Reports Cooldown Remaining', () => {
    const rk = new RailkitService();
    assert.strictEqual(rk.circuitBreaker.state, 'CLOSED');

    rk.tripCircuitBreaker('RailKit Rate Limit Exceeded');
    assert.strictEqual(rk.circuitBreaker.state, 'OPEN');
    assert.strictEqual(rk.isQuotaExhausted, true);
    assert.strictEqual(rk.isAvailable(), false);

    const cbStatus = rk.getCircuitBreakerStatus();
    assert.strictEqual(cbStatus.state, 'OPEN');
    assert.strictEqual(cbStatus.quotaExhausted, true);
    assert.ok(cbStatus.cooldownRemainingSec > 0);

    rk.resetCircuitBreaker();
    assert.strictEqual(rk.circuitBreaker.state, 'CLOSED');
  });

  // ---------------------------------------------------------------------------
  // TEST 3: Provider Response Verification (Rejects False HTTP 200)
  // ---------------------------------------------------------------------------
  await runTest('RailRadar Response Verifier Rejects Empty and Error Envelopes', () => {
    const radar = new TelemetryService();

    // Empty / null payload
    assert.strictEqual(radar.verifyProviderResponse(null, '12014').isValid, false);
    assert.strictEqual(radar.verifyProviderResponse({}, '12014').isValid, false);

    // Error envelope disguised as HTTP 200
    assert.strictEqual(radar.verifyProviderResponse({ success: false, error: 'Train not tracked' }, '12014').isValid, false);
    assert.strictEqual(radar.verifyProviderResponse({ error: 'Data unavailable' }, '12014').isValid, false);

    // Mismatched train number
    assert.strictEqual(radar.verifyProviderResponse({ train_number: '12460', current_station_code: 'JUC' }, '12014').isValid, false);

    // Valid payload
    const valid = radar.verifyProviderResponse({
      train_number: '12014',
      train_name: 'Amritsar Shatabdi',
      current_station_code: 'JUC',
      current_lat: 31.326,
      current_lng: 75.576,
      status: 'running'
    }, '12014');
    assert.strictEqual(valid.isValid, true);
  });

  // ---------------------------------------------------------------------------
  // TEST 4: RailRadar Data State Classification (Never Labeled LIVE if Scheduled/Stale/Simulated)
  // ---------------------------------------------------------------------------
  await runTest('RailRadar Data State Classification Distinguishes All States Honestly', () => {
    const radar = new TelemetryService();
    const now = new Date();

    // A. Stale observation (> 15 min old)
    const staleTime = new Date(now.getTime() - 20 * 60 * 1000).toISOString();
    const staleTrain = radar.mapRailRadarTrain({
      train_number: '12014',
      status: 'running',
      current_station_code: 'JUC',
      last_updated_at: staleTime
    }, now.toISOString());
    assert.strictEqual(staleTrain.dataState, 'STALE', 'Stale train must be STALE, never LIVE');

    // B. Scheduled / Not Started train
    const scheduledTrain = radar.mapRailRadarTrain({
      train_number: '12014',
      status: 'not-started',
      current_station_code: 'ASR',
      last_updated_at: now.toISOString()
    }, now.toISOString());
    assert.strictEqual(scheduledTrain.dataState, 'SCHEDULED', 'Yet to start train must be SCHEDULED');

    // C. Platform Boarding train
    const boardingTrain = radar.mapRailRadarTrain({
      train_number: '12014',
      source_code: 'ASR',
      current_station_code: 'ASR',
      status: 'platform',
      last_updated_at: now.toISOString()
    }, now.toISOString());
    assert.strictEqual(boardingTrain.dataState, 'SCHEDULED', 'Platform boarding train must be SCHEDULED');

    // D. Simulated record
    const simulatedTrain = radar.mapRailRadarTrain({
      train_number: '12014',
      status: 'running',
      is_simulated: true,
      current_station_code: 'JUC',
      last_updated_at: now.toISOString()
    }, now.toISOString());
    assert.strictEqual(simulatedTrain.dataState, 'SIMULATED', 'Simulated flag must yield SIMULATED state');

    // E. Genuine In-Transit train within 15 minutes
    const freshTime = new Date(now.getTime() - 3 * 60 * 1000).toISOString();
    const liveTrain = radar.mapRailRadarTrain({
      train_number: '12014',
      status: 'running',
      current_station_code: 'JUC',
      current_lat: 31.326,
      current_lng: 75.576,
      last_updated_at: freshTime
    }, now.toISOString());
    assert.strictEqual(liveTrain.dataState, 'LIVE', 'Fresh in-transit train must be LIVE');
    assert.strictEqual(liveTrain.observationAccuracy, 'LOCOMOTIVE_GPS');
  });

  // ---------------------------------------------------------------------------
  // TEST 5: RailKit Data State Classification (Never Labeled LIVE if Scheduled/Stale/Simulated)
  // ---------------------------------------------------------------------------
  await runTest('RailKit Data State Classification Distinguishes All States Honestly', () => {
    const rk = new RailkitService();
    const now = new Date();

    // A. Stale observation (> 15 min old)
    const staleTime = new Date(now.getTime() - 25 * 60 * 1000).toISOString();
    const staleMapped = rk.mapRailkitTrain({
      trainNo: '12460',
      status: 'running',
      currentStationCode: 'BEAS',
      lastUpdatedAt: staleTime
    }, now.toISOString());
    assert.strictEqual(staleMapped.dataState, 'STALE', 'RailKit > 15m train must be STALE');

    // B. Not started
    const notStarted = rk.mapRailkitTrain({
      trainNo: '12460',
      status: 'yet to start',
      currentStationCode: 'ASR',
      lastUpdatedAt: now.toISOString()
    }, now.toISOString());
    assert.strictEqual(notStarted.dataState, 'SCHEDULED', 'Yet to start must be SCHEDULED');

    // C. Fresh live
    const freshTime = new Date(now.getTime() - 2 * 60 * 1000).toISOString();
    const liveMapped = rk.mapRailkitTrain({
      trainNo: '12460',
      status: 'running',
      currentStationCode: 'BEAS',
      lastUpdatedAt: freshTime
    }, now.toISOString());
    assert.strictEqual(liveMapped.dataState, 'LIVE', 'Fresh in-transit train must be LIVE');
  });

  // ---------------------------------------------------------------------------
  // TEST 6: Aggregation Arbitration & Deduplication
  // ---------------------------------------------------------------------------
  await runTest('Aggregation Engine Arbitrates Records Strictly by State Priority and Freshness', () => {
    const agg = new TrainAggregationService();
    const now = new Date();

    // Record A: RailRadar LIVE record from 5 min ago
    const recA = {
      id: '12014',
      number: '12014',
      dataState: 'LIVE',
      providerObservationTimestamp: new Date(now.getTime() - 5 * 60 * 1000).toISOString(),
      observationAccuracy: 'LOCOMOTIVE_GPS',
      lat: 31.326,
      lng: 75.576
    };

    // Record B: RailKit STALE record from 25 min ago
    const recB = {
      id: '12014',
      number: '12014',
      dataState: 'STALE',
      providerObservationTimestamp: new Date(now.getTime() - 25 * 60 * 1000).toISOString(),
      observationAccuracy: 'STATION_NODE_PROJECTION',
      lat: 31.320,
      lng: 75.570
    };

    // Arbitrate: LIVE beats STALE
    const chosen1 = agg.arbitrateRecords(recA, recB);
    assert.strictEqual(chosen1.dataState, 'LIVE');
    assert.strictEqual(chosen1.observationAccuracy, 'LOCOMOTIVE_GPS');

    // Reverse input order: Still LIVE beats STALE
    const chosen2 = agg.arbitrateRecords(recB, recA);
    assert.strictEqual(chosen2.dataState, 'LIVE');

    // Both LIVE: Newer observation wins
    const recC = {
      ...recA,
      providerObservationTimestamp: new Date(now.getTime() - 1 * 60 * 1000).toISOString()
    };
    const chosen3 = agg.arbitrateRecords(recA, recC);
    assert.strictEqual(chosen3.providerObservationTimestamp, recC.providerObservationTimestamp);
  });

  // ---------------------------------------------------------------------------
  // TEST 7: Physical Gate Sensor State Honesty (No Fabrication)
  // ---------------------------------------------------------------------------
  await runTest('Zero Physical Gate State Fabrication across All 36 Crossings', async () => {
    const res = await fetch('http://localhost:8787/api/crossings');
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.crossings));
    assert.strictEqual(data.crossings.length, 36);

    for (const c of data.crossings) {
      assert.strictEqual(
        c.observedPhysicalGateState,
        'UNKNOWN',
        `Crossing ${c.id} must have observedPhysicalGateState: UNKNOWN`
      );
      assert.strictEqual(
        c.physicalSensorAvailable,
        false,
        `Crossing ${c.id} must have physicalSensorAvailable: false`
      );
    }
  });

  // ---------------------------------------------------------------------------
  // TEST 8: /api/telemetry/audit Endpoint Truthfulness
  // ---------------------------------------------------------------------------
  await runTest('/api/telemetry/audit Endpoint Truthfully Reports Telemetry Status', async () => {
    const res = await fetch('http://localhost:8787/api/telemetry/audit');
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.auditSummary);
    assert.strictEqual(data.auditSummary.totalCrossings, 36);
    assert.strictEqual(data.auditSummary.osmCrossingsVerified, true);
    assert.strictEqual(data.auditSummary.physicalGateSensorsInstalled, false);
    assert.ok(data.auditSummary.stateBreakdown);
    assert.strictEqual(typeof data.auditSummary.stateBreakdown.liveCount, 'number');
    assert.strictEqual(typeof data.auditSummary.stateBreakdown.staleCount, 'number');
    assert.strictEqual(typeof data.auditSummary.stateBreakdown.scheduledCount, 'number');
    assert.strictEqual(typeof data.auditSummary.stateBreakdown.simulatedCount, 'number');
    assert.strictEqual(typeof data.auditSummary.stateBreakdown.unavailableCount, 'number');
    assert.ok(data.providers.railkit);
    assert.ok(data.providers.railRadar);
  });

  // ---------------------------------------------------------------------------
  // TEST 9: /api/health Endpoint Reports Dual-Provider Health
  // ---------------------------------------------------------------------------
  await runTest('/api/health Endpoint Returns Valid Health Status & Diagnostics', async () => {
    const res = await fetch('http://localhost:8787/api/health');
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.telemetryStatus);
    assert.ok(Array.isArray(data.telemetryStatus.providers));
    assert.strictEqual(data.telemetryStatus.providers.length, 2);
    assert.strictEqual(data.telemetryStatus.providers[0].name, 'RailKit Indian Railways Gateway');
    assert.strictEqual(data.telemetryStatus.providers[1].name, 'RailRadar Live Tracking Gateway');
    assert.strictEqual(data.telemetryStatus.providers[0].status, 'CONNECTED');
    assert.strictEqual(data.telemetryStatus.providers[1].status, 'NOT_CONFIGURED');
  });

  console.log(`\n========================================`);
  console.log(`AUDIT TEST RESULTS: ${passedTests}/${totalTests} PASSED`);
  console.log(`========================================\n`);

  setTimeout(() => {
    process.exit(passedTests === totalTests ? 0 : 1);
  }, 100);
}

runSuite().catch(e => {
  console.error('Test Suite encountered unexpected error:', e);
  process.exit(1);
});
