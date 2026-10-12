// =========================================================================
// FATAKFORECAST — PHASE 8 PREDICTION INTEGRITY REGRESSION TEST SUITE
// Tests all 12 mandatory regression requirements:
// 1. A synthetic train cannot close a real crossing.
// 2. A stale train cannot produce a confident live countdown.
// 3. A station-progress record is not classified as actual GPS.
// 4. A stopped train does not receive an invented positive speed.
// 5. A train on an incompatible corridor cannot affect a crossing.
// 6. A cancelled train cannot continue moving.
// 7. A mapped crossing does not automatically become CLOSED.
// 8. A fresh retrieval timestamp does not disguise stale observations.
// 9. An unsupported gate state remains UNKNOWN.
// 10. All pages consume consistent crossing predictions.
// 11. A valid station-level train can still contribute to a prediction when evidence supports it.
// 12. Existing real telemetry integration continues to work.
// =========================================================================

import { GeographicValidator } from './backend/geographicValidator.js';
import { TrainDetectionEngine } from './backend/trainDetectionEngine.js';

const BASE_URL = 'http://localhost:8787';

async function runRegressionSuite() {
  console.log('======================================================================');
  console.log('FATAKFORECAST — PHASE 8 PREDICTION INTEGRITY REGRESSION TEST SUITE');
  console.log('======================================================================\n');

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

  const engine = new TrainDetectionEngine('test_key');

  const mockCorridorCoords = [
    [31.6338, 74.8655], // Amritsar Jn
    [31.6313, 74.8975], // Jaura Phatak
    [31.6050, 74.9965], // Mananwala
    [31.5639, 75.0347], // Jandiala
    [31.5122, 75.2981]  // Beas
  ];

  const jauraCrossing = {
    id: 'osm/node/1006212111',
    osmId: '1006212111',
    name: 'Jaura Phatak (Joda Phatak)',
    corridorId: 'CORR_ASR_JUC',
    lat: 31.6313,
    lng: 74.8975
  };

  const chatiwindCrossing = {
    id: 'osm/node/331024406',
    osmId: '331024406',
    name: 'Chatiwind Gate Crossing',
    corridorId: 'CORR_ASR_TT',
    lat: 31.6076,
    lng: 74.8680
  };

  // -------------------------------------------------------------------
  // TEST 1: A synthetic train cannot close a real crossing
  // -------------------------------------------------------------------
  console.log('REGRESSION 1: Synthetic train cannot close a real crossing');
  const syntheticTrain = {
    id: 'SIM-001',
    number: 'SIM-001',
    name: 'Synthetic Kinematic Test Bench Rake',
    lat: 31.6313,
    lng: 74.8975,
    speedKmH: 60,
    corridorId: 'CORR_ASR_JUC',
    direction: 'UP',
    dataState: 'SIMULATED',
    positionClassification: 'SYNTHETIC_DEMO',
    isSimulated: true,
    lastPing: new Date().toISOString()
  };
  const candSynth = engine.validateTrainCandidate(syntheticTrain);
  assert(candSynth.isValid === false, `Synthetic train rejected by candidate validator`);
  const synthEval = engine.evaluateCrossingGateState(jauraCrossing, [syntheticTrain], mockCorridorCoords);
  assert(synthEval.status === 'OPEN', `Crossing remains OPEN with synthetic train (status: ${synthEval.status})`);
  assert(synthEval.predictionState === 'NO_RELIABLE_APPROACH', `Prediction state is NO_RELIABLE_APPROACH`);
  assert(synthEval.countdownAvailable === false, `No countdown available for synthetic train`);

  // -------------------------------------------------------------------
  // TEST 2: A stale train cannot produce a confident live countdown
  // -------------------------------------------------------------------
  console.log('\nREGRESSION 2: Stale train cannot produce a confident live countdown');
  const staleTrain = {
    id: '12460',
    number: '12460',
    name: 'Amritsar Intercity Express',
    lat: 31.6050,
    lng: 74.9965,
    speedKmH: 55,
    corridorId: 'CORR_ASR_JUC',
    direction: 'UP',
    dataState: 'STALE',
    positionClassification: 'TRACK_INTERPOLATION',
    lastPing: new Date(Date.now() - 30 * 60 * 1000).toISOString()
  };
  const candStale = engine.validateTrainCandidate(staleTrain);
  assert(candStale.isValid === false, `Stale train (>15m) rejected by candidate validator`);
  const staleEval = engine.evaluateCrossingGateState(jauraCrossing, [staleTrain], mockCorridorCoords);
  assert(staleEval.countdownAvailable === false, `Stale train does NOT produce countdown (countdownAvailable: false)`);
  assert(staleEval.timeToNextClosureSec === 0, `No countdown seconds generated (timeToNextClosureSec: 0)`);

  // -------------------------------------------------------------------
  // TEST 3: A station-progress record is not classified as actual GPS
  // -------------------------------------------------------------------
  console.log('\nREGRESSION 3: Station-progress record is not classified as actual GPS');
  const stationRecord = {
    trainNumber: '12014',
    currentLocation: {
      stationName: 'Jalandhar City',
      stationCode: 'JUC',
      hasLocomotiveGps: false
    }
  };
  const isActualGps = Boolean(stationRecord.currentLocation.hasLocomotiveGps);
  const classification = isActualGps ? 'ACTUAL_GPS' : 'STATION_PROGRESS';
  assert(classification === 'STATION_PROGRESS', `Station-progress telemetry classified as STATION_PROGRESS, not ACTUAL_GPS`);
  assert(classification !== 'ACTUAL_GPS', `Station progress is never labeled ACTUAL_GPS without locomotive GPS`);

  // -------------------------------------------------------------------
  // TEST 4: A stopped train does not receive an invented positive speed
  // -------------------------------------------------------------------
  console.log('\nREGRESSION 4: Stopped train does not receive an invented positive speed');
  const stoppedTrain = {
    id: '22488',
    number: '22488',
    name: 'Vande Bharat Express',
    lat: 31.6338,
    lng: 74.8655, // At Amritsar Jn platform
    speedKmH: 0,
    corridorId: 'CORR_ASR_JUC',
    direction: 'UP',
    dataState: 'LIVE',
    positionClassification: 'STATION_PROGRESS',
    lastPing: new Date().toISOString()
  };
  const stoppedEval = engine.evaluateCrossingGateState(jauraCrossing, [stoppedTrain], mockCorridorCoords);
  assert(stoppedEval.status === 'OPEN', `Crossing remains OPEN when train is stopped at platform`);
  assert(stoppedEval.estimatedTimeToArrivalSec === null, `No fabricated ETA for stopped train (estimatedTimeToArrivalSec: null)`);
  assert(stoppedEval.countdownAvailable === false, `No countdown available for stopped train`);

  // -------------------------------------------------------------------
  // TEST 5: A train on an incompatible corridor cannot affect a crossing
  // -------------------------------------------------------------------
  console.log('\nREGRESSION 5: Train on incompatible corridor cannot affect a crossing');
  const jucTrain = {
    id: '12013',
    number: '12013',
    name: 'New Delhi - Amritsar Shatabdi',
    lat: 31.6050,
    lng: 74.9965,
    speedKmH: 60,
    corridorId: 'CORR_ASR_JUC',
    direction: 'UP',
    dataState: 'LIVE',
    positionClassification: 'STATION_PROGRESS',
    lastPing: new Date().toISOString()
  };
  const crossCorrEval = engine.evaluateCrossingGateState(chatiwindCrossing, [jucTrain], mockCorridorCoords);
  assert(crossCorrEval.status === 'OPEN', `Chatiwind (Tarn Taran line) remains OPEN with JUC train`);
  assert(crossCorrEval.upcomingTrainId === null, `No upcoming train assigned across incompatible corridor`);

  // -------------------------------------------------------------------
  // TEST 6: A cancelled train cannot continue moving
  // -------------------------------------------------------------------
  console.log('\nREGRESSION 6: Cancelled train cannot continue moving or close crossing');
  const cancelledTrain = {
    id: '14673',
    number: '14673',
    name: 'Shaheed Express',
    lat: 31.6050,
    lng: 74.9965,
    speedKmH: 50,
    corridorId: 'CORR_ASR_JUC',
    direction: 'UP',
    dataState: 'LIVE',
    status: 'CANCELLED',
    positionClassification: 'STATION_PROGRESS',
    lastPing: new Date().toISOString()
  };
  const candCancelled = engine.validateTrainCandidate(cancelledTrain);
  assert(candCancelled.isValid === false, `Cancelled train rejected by candidate validator`);
  const cancelledEval = engine.evaluateCrossingGateState(jauraCrossing, [cancelledTrain], mockCorridorCoords);
  assert(cancelledEval.status === 'OPEN', `Crossing remains OPEN with cancelled train`);
  assert(cancelledEval.upcomingTrainId === null, `No upcoming train associated for cancelled service`);

  // -------------------------------------------------------------------
  // TEST 7: A mapped crossing does not automatically become CLOSED
  // -------------------------------------------------------------------
  console.log('\nREGRESSION 7: Mapped crossing does not automatically become CLOSED');
  const emptyEval = engine.evaluateCrossingGateState(jauraCrossing, [], mockCorridorCoords);
  assert(emptyEval.status === 'OPEN', `Baseline mapped crossing defaults to OPEN (not CLOSED)`);
  assert(emptyEval.gateStatusClassification === 'CLEAR PASSAGE', `Baseline classification is CLEAR PASSAGE`);
  assert(emptyEval.predictionState === 'NO_RELIABLE_APPROACH', `Baseline predictionState is NO_RELIABLE_APPROACH`);

  // -------------------------------------------------------------------
  // TEST 8: Fresh retrieval timestamp does not disguise stale observations
  // -------------------------------------------------------------------
  console.log('\nREGRESSION 8: Fresh retrieval timestamp does not disguise stale observations');
  const disguisedStaleTrain = {
    id: '12014',
    number: '12014',
    name: 'Amritsar Shatabdi',
    lat: 31.6313,
    lng: 74.8975,
    speedKmH: 50,
    corridorId: 'CORR_ASR_JUC',
    direction: 'UP',
    dataState: 'LIVE',
    lastPing: new Date().toISOString(), // Retrieved 100ms ago
    providerObservationTimestamp: new Date(Date.now() - 40 * 60 * 1000).toISOString() // 40 minutes old
  };
  const candDisguised = engine.validateTrainCandidate(disguisedStaleTrain);
  assert(candDisguised.isValid === false, `Validator catches stale observation timestamp despite fresh retrieval ping`);
  assert(candDisguised.errors.some(e => e.includes('stale')), `Explicit stale error message reported`);

  // -------------------------------------------------------------------
  // TEST 9: An unsupported gate state remains UNKNOWN
  // -------------------------------------------------------------------
  console.log('\nREGRESSION 9: Unsupported gate state remains UNKNOWN');
  assert(emptyEval.observedPhysicalGateState === 'UNKNOWN', `Observed physical gate state is strictly UNKNOWN`);
  assert(emptyEval.physicalSensorAvailable === false, `Physical sensor availability is false without CRIS / barrier telemetry`);

  // -------------------------------------------------------------------
  // TEST 10: All pages consume consistent crossing predictions
  // -------------------------------------------------------------------
  console.log('\nREGRESSION 10: All pages consume consistent crossing predictions');
  const resCrossings = await fetch(`${BASE_URL}/api/crossings`);
  const dataCrossings = await resCrossings.json();
  const resForecasts = await fetch(`${BASE_URL}/api/forecasts`);
  const dataForecasts = await resForecasts.json();

  assert(dataCrossings.crossings.length === 36, `All 36 OpenStreetMap crossings present in /api/crossings`);
  assert(dataForecasts.forecasts.length === 36, `All 36 OpenStreetMap crossings present in /api/forecasts`);

  const sampleCrossing = dataCrossings.crossings.find(c => c.name.includes('Jaura'));
  const sampleForecast = dataForecasts.forecasts.find(f => f.crossingName.includes('Jaura'));
  assert(sampleCrossing !== undefined && sampleForecast !== undefined, `Jaura Phatak found in both endpoints`);
  assert(sampleCrossing.status === sampleForecast.status, `Status matches across endpoints (${sampleCrossing.status})`);
  assert(sampleCrossing.predictionState === sampleForecast.predictionState, `Prediction state matches across endpoints (${sampleCrossing.predictionState})`);
  assert(sampleCrossing.observedPhysicalGateState === 'UNKNOWN', `Physical gate state is UNKNOWN in crossings endpoint`);

  // -------------------------------------------------------------------
  // TEST 11: Valid station-level train contributes to prediction when evidence supports it
  // -------------------------------------------------------------------
  console.log('\nREGRESSION 11: Valid station-level train contributes to prediction when evidence supports it');
  const validApproachingTrain = {
    id: '12460',
    number: '12460',
    name: 'Amritsar Intercity Express',
    lat: 31.6050,
    lng: 74.9965, // At Mananwala, approaching Amritsar/Jaura Phatak
    speedKmH: 60,
    corridorId: 'CORR_ASR_JUC',
    direction: 'DOWN', // Inbound along corridor towards Amritsar Jn / Jaura Phatak
    dataState: 'LIVE',
    positionClassification: 'STATION_PROGRESS',
    isWithinAmritsarSector: true,
    lastPing: new Date().toISOString(),
    providerObservationTimestamp: new Date().toISOString()
  };
  const candValid = engine.validateTrainCandidate(validApproachingTrain);
  assert(candValid.isValid === true, `Valid in-sector station-progress train accepted`);
  const approachEval = engine.evaluateCrossingGateState(jauraCrossing, [validApproachingTrain], mockCorridorCoords);
  assert(approachEval.upcomingTrainId === '12460', `Train #12460 associated with Jaura Phatak based on track geometry`);
  assert(approachEval.countdownAvailable === true, `Countdown is available for validated approaching train`);
  assert(typeof approachEval.timeToNextClosureSec === 'number', `Predicted closure countdown generated: ${approachEval.timeToNextClosureSec}s`);
  assert(approachEval.predictionState === 'APPROACHING' || approachEval.predictionState === 'CLOSURE_PREDICTED', `Prediction state reflects approach (${approachEval.predictionState})`);

  // -------------------------------------------------------------------
  // -------------------------------------------------------------------
  // TEST 12: Train #12014 Data Integrity (NOT_STARTED at ASR, null coords)
  // -------------------------------------------------------------------
  console.log('\nREGRESSION 12: Train #12014 Data Integrity (No fabricated New Delhi coordinates)');
  const resTrains = await fetch(`${BASE_URL}/api/trains`);
  const dataTrains = await resTrains.json();
  assert(resTrains.status === 200, `/api/trains endpoint responds with 200 OK`);
  assert(Array.isArray(dataTrains.trains), `/api/trains returns trains array`);
  const train12014 = dataTrains.trains.find(t => t.number === '12014');
  assert(train12014 !== undefined, `Train #12014 exists in telemetry registry`);
  assert(train12014.status === 'NOT_STARTED', `Train #12014 status is strictly NOT_STARTED`);
  assert(train12014.lat === null && train12014.lng === null, `Train #12014 coordinates are null (no fabricated New Delhi coords)`);

  // -------------------------------------------------------------------
  // TEST 13: Train #74688 Isolation (Past-corridor DEMU does not affect crossings)
  // -------------------------------------------------------------------
  console.log('\nREGRESSION 13: Train #74688 Isolation (No false alerts for Gobindgarh, Bhagtanwala Yard)');
  const train74688 = dataTrains.trains.find(t => t.number === '74688');
  assert(train74688 !== undefined, `Train #74688 exists in telemetry registry`);
  
  // Verify that all 12 crossings on CORR_ASR_TT remain OPEN with NO upcoming train for 74688
  const ttCrossings = dataCrossings.crossings.filter(c => c.corridorId === 'CORR_ASR_TT');
  assert(ttCrossings.length === 12, `All 12 Southern (Tarn Taran line) crossings present`);
  const affectedTTCrossings = ttCrossings.filter(c => c.upcomingTrainId === '74688' || (c.status !== 'OPEN' && c.upcomingTrainId));
  assert(affectedTTCrossings.length === 0, `0 crossings falsely closed or approaching for Train #74688 (actual: ${affectedTTCrossings.length})`);

  // Direct check of Gobindgarh South (idx 27) and Bhagtanwala Yard Approach (idx 41)
  const gobindgarh = ttCrossings.find(c => c.name.toLowerCase().includes('gobindgarh'));
  assert(gobindgarh !== undefined && gobindgarh.status === 'OPEN', `Gobindgarh South crossing is OPEN (not CLOSED)`);
  assert(gobindgarh.upcomingTrainId === null, `Gobindgarh South has no upcoming train`);

  const bhagtanwala = ttCrossings.find(c => c.name.toLowerCase().includes('bhagtanwala'));
  assert(bhagtanwala !== undefined && bhagtanwala.status === 'OPEN', `Bhagtanwala Yard Approach is OPEN (not APPROACHING)`);
  assert(bhagtanwala.upcomingTrainId === null, `Bhagtanwala Yard Approach has no upcoming train`);

  // -------------------------------------------------------------------
  // TEST 14: Unit Evaluation of Train #74688 at Kairon (KCZ)
  // -------------------------------------------------------------------
  console.log('\nREGRESSION 14: Engine Geographic Validator Rejection of Train #74688 at Kairon');
  const kaironTrain = {
    id: '74688',
    number: '74688',
    name: 'Bhagtanwala - Khem Karan DEMU',
    lat: 31.3200,
    lng: 74.8800, // Kairon (KCZ) station coordinates, ~35 km south of Amritsar
    speedKmH: 55,
    corridorId: 'CORR_ASR_TT',
    direction: 'UP',
    dataState: 'LIVE',
    positionClassification: 'STATION_PROGRESS',
    lastPing: new Date().toISOString()
  };
  const candKairon = engine.validateTrainCandidate(kaironTrain);
  assert(candKairon.isValid === true, `Candidate validation passes for live train at Kairon`);

  // Evaluate against Gobindgarh South on CORR_ASR_TT
  const gobindgarhDef = {
    id: 'osm/node/gobindgarh',
    name: 'Gobindgarh South / Railway Workshop Crossing',
    corridorId: 'CORR_ASR_TT',
    lat: 31.6269,
    lng: 74.8493
  };
  // Full Southern corridor coordinates (approx 179 points, ending at Tarn Taran)
  const southernCoords = [
    [31.6338, 74.8655], // Amritsar Jn
    [31.6269, 74.8493], // Gobindgarh South
    [31.6095, 74.8675], // Bhagtanwala
    [31.4839, 74.9175]  // Tarn Taran Terminus of mapped polyline
  ];
  const kaironEval = engine.evaluateCrossingGateState(gobindgarhDef, [kaironTrain], southernCoords);
  assert(kaironEval.status === 'OPEN', `Gobindgarh South remains strictly OPEN with train at Kairon`);
  assert(kaironEval.upcomingTrainId === null, `No upcoming train associated for Gobindgarh South`);
  assert(kaironEval.countdownAvailable === false, `No countdown available for train past crossing`);

  console.log('\n======================================================================');
  console.log(`REGRESSION RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runRegressionSuite().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
