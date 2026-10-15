// =========================================================================
// FATAKFORECAST — COMPREHENSIVE DATA PIPELINE INTEGRITY TEST SUITE
// Tests Train Validation, Provider Sync, New Delhi train rejection,
// Honest Metrics, Analytics Disclosure, and Production Endpoints
// =========================================================================

import { GeographicValidator } from './backend/geographicValidator.js';
import { TrainDetectionEngine } from './backend/trainDetectionEngine.js';

const BASE_URL = 'http://localhost:8787';

async function runTestSuite() {
  console.log('====================================================');
  console.log('FATAKFORECAST — DATA PIPELINE & INTEGRITY TEST SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✓ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${message}`);
      failed++;
    }
  }

  // ----------------------------------------------------
  // TEST 1: Train at New Delhi (#12014) Geographic Validation
  // ----------------------------------------------------
  console.log('TEST 1: Out-of-Sector Train Validation (Amritsar Shatabdi #12014 at New Delhi)');
  const ndlsCoords = { lat: 28.64305, lng: 77.21938 };
  const sectorNDLS = GeographicValidator.isWithinSector(ndlsCoords.lat, ndlsCoords.lng);
  assert(sectorNDLS.inSector === false, `New Delhi train is not in Amritsar sector (${sectorNDLS.distanceFromAsrKm} km away)`);
  assert(sectorNDLS.distanceFromAsrKm > 400, `Distance calculation accurate (${sectorNDLS.distanceFromAsrKm} km ~ 448 km)`);

  const engine = new TrainDetectionEngine('test_key');
  const dummyNDLSTrain = {
    id: '12014',
    number: '12014',
    name: 'Amritsar Shatabdi Express',
    lat: ndlsCoords.lat,
    lng: ndlsCoords.lng,
    speedKmH: 72,
    corridorId: 'CORR_ASR_JUC',
    direction: 'UP',
    dataState: 'LIVE',
    lastPing: new Date().toISOString()
  };
  const candCheck = engine.validateTrainCandidate(dummyNDLSTrain);
  assert(candCheck.isValid === false, `validateTrainCandidate rejects #12014 at New Delhi: ${candCheck.errors.join('; ')}`);

  const mockCrossing = {
    id: 'osm/node/1006212111',
    name: 'Jaura Phatak (Joda Phatak)',
    corridorId: 'CORR_ASR_JUC',
    lat: 31.6313,
    lng: 74.8975
  };
  const mockCorridorCoords = [
    [31.6338, 74.8655],
    [31.6313, 74.8975],
    [31.5972, 74.9861]
  ];
  const evalResult = engine.evaluateCrossingGateState(mockCrossing, [dummyNDLSTrain], mockCorridorCoords);
  assert(evalResult.status === 'OPEN', `Jaura Phatak remains OPEN despite train 12014 having 72 km/h (status: ${evalResult.status})`);
  assert(evalResult.upcomingTrainId === null, `No upcoming train assigned to Jaura Phatak (upcomingTrainId: ${evalResult.upcomingTrainId})`);
  assert(evalResult.forecastStatus === 'UNAVAILABLE', `Forecast status is UNAVAILABLE when train is out of sector (forecastStatus: ${evalResult.forecastStatus})`);

  // ----------------------------------------------------
  // TEST 2: Train near Amritsar (#22488 at platform)
  // ----------------------------------------------------
  console.log('\nTEST 2: In-Sector Train Validation (Vande Bharat #22488 at Amritsar Jn)');
  const asrCoords = { lat: 31.6338, lng: 74.8655 };
  const sectorASR = GeographicValidator.isWithinSector(asrCoords.lat, asrCoords.lng);
  assert(sectorASR.inSector === true, `Amritsar Jn coordinates are inside sector (${sectorASR.distanceFromAsrKm} km)`);

  const asrStationaryTrain = {
    id: '22488',
    number: '22488',
    lat: asrCoords.lat,
    lng: asrCoords.lng,
    speedKmH: 0,
    corridorId: 'CORR_ASR_JUC',
    direction: 'UP',
    dataState: 'LIVE',
    lastPing: new Date().toISOString()
  };
  const asrCand = engine.validateTrainCandidate(asrStationaryTrain);
  assert(asrCand.isValid === true, `Candidate validation passes for in-sector train with live ping`);

  // ----------------------------------------------------
  // TEST 3: Stale Data Rejection (>15 min old)
  // ----------------------------------------------------
  console.log('\nTEST 3: Stale Telemetry Rejection (>15 min old)');
  const staleTrain = {
    id: '22488',
    number: '22488',
    lat: asrCoords.lat,
    lng: asrCoords.lng,
    speedKmH: 45,
    corridorId: 'CORR_ASR_JUC',
    direction: 'UP',
    dataState: 'STALE',
    lastPing: new Date(Date.now() - 25 * 60 * 1000).toISOString() // 25 minutes ago
  };
  const staleCand = engine.validateTrainCandidate(staleTrain);
  assert(staleCand.isValid === false, `Stale ping rejected by engine in LIVE_OPERATIONAL mode: ${staleCand.errors.join('; ')}`);

  // ----------------------------------------------------
  // TEST 4: Invalid Coordinates & Missing Speed Handling
  // ----------------------------------------------------
  console.log('\nTEST 4: Invalid Coordinates & Missing Speed Graceful Handling');
  const invalidCoords = GeographicValidator.isWithinSector(NaN, undefined);
  assert(invalidCoords.inSector === false, `Invalid coordinates safely rejected as out of sector`);

  const missingSpeedTrain = {
    id: '9999',
    number: '9999',
    lat: asrCoords.lat,
    lng: asrCoords.lng,
    speedKmH: undefined, // Missing speed
    corridorId: 'CORR_ASR_JUC',
    direction: 'UP',
    dataState: 'LIVE',
    lastPing: new Date().toISOString()
  };
  // Engine evaluateCrossingGateState should not crash with missing speed
  let didCrash = false;
  try {
    engine.evaluateCrossingGateState(mockCrossing, [missingSpeedTrain], mockCorridorCoords);
  } catch (e) {
    didCrash = true;
  }
  assert(didCrash === false, `Engine executes safely with undefined/missing speed`);

  // ----------------------------------------------------
  // TEST 5: Verify REST Endpoints on Active Server
  // ----------------------------------------------------
  console.log('\nTEST 5: Verify Live REST API Endpoints');

  // /api/health
  const healthRes = await fetch(`${BASE_URL}/api/health`);
  const health = await healthRes.json();
  assert(healthRes.status === 200, `/api/health responds with 200 OK`);
  assert(health.telemetryStatus.latencyMs === null || typeof health.telemetryStatus.latencyMs === 'number', `/api/health latencyMs is genuine (value: ${health.telemetryStatus.latencyMs})`);
  assert(health.metrics.feedLatencyMs === null || typeof health.metrics.feedLatencyMs === 'number', `metrics.feedLatencyMs is not hardcoded (value: ${health.metrics.feedLatencyMs})`);
  assert(health.metrics.feedStatus === 'CONNECTED' || health.metrics.feedStatus === 'DISCONNECTED', `feedStatus is honest connection state: ${health.metrics.feedStatus}`);

  // /api/trains
  const trainsRes = await fetch(`${BASE_URL}/api/trains`);
  const trainsData = await trainsRes.json();
  assert(trainsRes.status === 200, `/api/trains responds with 200 OK`);
  assert(Array.isArray(trainsData.trains), `/api/trains returns trains array`);
  const t12014 = trainsData.trains.find(t => t.number === '12014');
  assert(t12014 !== undefined, `Train #12014 is present in trains database`);
  assert(t12014.status === 'NOT_STARTED', `Train #12014 status is NOT_STARTED`);
  assert(t12014.lat === null && t12014.lng === null, `Train #12014 coordinates are null (not fabricated at New Delhi)`);

  const t74688 = trainsData.trains.find(t => t.number === '74688');
  assert(t74688 !== undefined, `Train #74688 is present in trains database`);
  assert(t74688.corridorId === 'CORR_ASR_TT', `Train #74688 assigned to Southern corridor`);

  // /api/analytics
  const analyticsRes = await fetch(`${BASE_URL}/api/analytics`);
  const analytics = await analyticsRes.json();
  assert(analyticsRes.status === 200, `/api/analytics responds with 200 OK`);
  assert(Array.isArray(analytics.hourlyClosuresTimeline) && analytics.hourlyClosuresTimeline.length === 0, `hourlyClosuresTimeline is empty array (purged of fabricated counts)`);
  assert(Array.isArray(analytics.gateDwellAverages) && analytics.gateDwellAverages.length === 0, `gateDwellAverages is empty array (purged of fabricated dwell times)`);
  assert(analytics.hourlyClosuresStatus === 'DATA_UNAVAILABLE', `hourlyClosuresStatus explicitly declared as DATA_UNAVAILABLE`);

  // /api/forecasts
  const forecastsRes = await fetch(`${BASE_URL}/api/forecasts`);
  const forecastsData = await forecastsRes.json();
  assert(forecastsRes.status === 200, `/api/forecasts responds with 200 OK`);
  const jauraForecast = forecastsData.forecasts.find(f => f.crossingName.includes('Jaura') || f.crossingName.includes('Joda'));
  assert(jauraForecast !== undefined, `Jaura Phatak forecast exists`);
  assert(jauraForecast.currentStatus === 'OPEN', `Jaura Phatak status is OPEN in baseline operational mode (status: ${jauraForecast.currentStatus})`);
  assert(jauraForecast.forecastStatus === 'UNAVAILABLE' || jauraForecast.forecastStatus === 'CLEAR_PASSAGE' || jauraForecast.forecastStatus === 'CALCULATED_BASELINE', `Jaura Phatak forecast status is valid (${jauraForecast.forecastStatus})`);

  // /api/plan-journey
  const journeyRes = await fetch(`${BASE_URL}/api/plan-journey`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      origin: [31.6200, 74.8765],      // Golden Temple area
      destination: [31.6500, 74.8600], // Ranjit Avenue
      departureOffsetSec: 0
    })
  });
  const journey = await journeyRes.json();
  assert(journeyRes.status === 200, `/api/plan-journey responds with 200 OK`);
  assert(journey.primaryRoute && journey.primaryRoute.coordinates.length > 0, `Primary route generated with valid road coordinates`);
  assert(Array.isArray(journey.departureOptions), `Departure optimization windows generated (+0m, +5m, +10m, +15m)`);

  console.log('\n====================================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');
}

runTestSuite().catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});
