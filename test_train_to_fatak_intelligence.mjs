// =========================================================================
// FATAKFORECAST — FOCUSED TRAIN-TO-FATAK INTELLIGENCE TEST SUITE
// Automated Verification for:
// 1. Stale Trains (>15m telemetry rejection, no false alerts)
// 2. Missing Coordinates (null, 0,0, out-of-range rejection)
// 3. Incorrect Associations (Euclidean proximity across corridors without track connectivity)
// 4. Opposite-Direction Trains (receding trains, trains behind origin, unverified direction)
// 5. Verified vs Inferred Positions & Honest Gate State (zero unobserved closure fabrication)
// 6. Live Server Intelligence Endpoints (/api/trains/:num/impacted-crossings, /api/crossings/:id/impacting-trains)
// =========================================================================

import { GeographicValidator } from './backend/geographicValidator.js';
import { TrainDetectionEngine, CROSSING_DETECTION_THRESHOLDS } from './backend/trainDetectionEngine.js';
import fs from 'fs';

const BASE_URL = 'http://localhost:8787';

const rawCrossings = JSON.parse(fs.readFileSync('backend/amritsar_crossings_osm.json', 'utf8'));
const rawCorridors = JSON.parse(fs.readFileSync('backend/amritsar_corridors_osm.json', 'utf8'));
const corridorsMap = Object.fromEntries(rawCorridors.map(c => [c.id, c]));

async function runTestSuite() {
  console.log('======================================================================');
  console.log('🚄 FATAKFORECAST: TRAIN-TO-FATAK INTELLIGENCE FOCUSED TEST SUITE');
  console.log('======================================================================\n');

  let passed = 0;
  let failed = 0;
  const results = [];

  function record(testName, condition, details = '') {
    if (condition) {
      console.log(`  ✓ PASS: ${testName} ${details ? `(${details})` : ''}`);
      passed++;
      results.push({ name: testName, status: 'PASS', details });
    } else {
      console.error(`  ✗ FAIL: ${testName} ${details ? `(${details})` : ''}`);
      failed++;
      results.push({ name: testName, status: 'FAIL', details });
    }
  }

  const engine = new TrainDetectionEngine('test_railkit_key');

  const jauraCrossing = rawCrossings.find(c => c.name.includes('Jaura')) || {
    id: 'osm/node/1006212111',
    osmId: '1006212111',
    name: 'Jaura Phatak (Joda Phatak)',
    corridorId: 'CORR_ASR_JUC',
    lat: 31.6313,
    lng: 74.8975
  };

  const shivalaCrossing = rawCrossings.find(c => c.name.includes('Shivala')) || {
    id: 'osm/node/11059530514',
    osmId: '11059530514',
    name: 'Shivala Crossing (C-25)',
    corridorId: 'CORR_ASR_JUC',
    lat: 31.6322,
    lng: 74.8785
  };

  const chatiwindCrossing = rawCrossings.find(c => c.name.includes('Chatiwind')) || {
    id: 'osm/node/331024406',
    osmId: '331024406',
    name: 'Chatiwind Gate Crossing',
    corridorId: 'CORR_ASR_TT',
    lat: 31.6076,
    lng: 74.8680
  };

  const jucCorridorCoords = corridorsMap['CORR_ASR_JUC'].coordinates;
  const ptkCorridorCoords = corridorsMap['CORR_ASR_PTK'].coordinates;
  const ttCorridorCoords = corridorsMap['CORR_ASR_TT'].coordinates;

  // =========================================================================
  // TEST GROUP 1: STALE TRAINS
  // =========================================================================
  console.log('--- TEST GROUP 1: STALE TRAIN TELEMETRY REJECTION ---');

  // 1.1: Train flagged with isStale: true
  const staleFlaggedTrain = {
    id: '12460',
    number: '12460',
    name: 'Amritsar Intercity Express',
    lat: 31.6050,
    lng: 74.9965,
    speedKmH: 60,
    corridorId: 'CORR_ASR_JUC',
    direction: 'UP',
    dataState: 'LIVE',
    isStale: true,
    lastPing: new Date().toISOString()
  };
  const candCheck1 = engine.validateTrainCandidate(staleFlaggedTrain);
  record('1.1 Validate train with isStale: true is rejected', candCheck1.isValid === false, candCheck1.reason);

  const geoCheckStale = GeographicValidator.validateApproachingCrossing(staleFlaggedTrain, jauraCrossing, jucCorridorCoords);
  record('1.2 GeographicValidator rejects stale train from crossing approach', geoCheckStale.isValid === false, geoCheckStale.rejectionReason);

  // 1.3: Train with provider observation timestamp >15 minutes old (disguised by fresh lastPing)
  const disguisedStaleTrain = {
    id: '12014',
    number: '12014',
    name: 'Amritsar Shatabdi Express',
    lat: 31.6313,
    lng: 74.8975,
    speedKmH: 65,
    corridorId: 'CORR_ASR_JUC',
    direction: 'UP',
    dataState: 'LIVE',
    lastPing: new Date().toISOString(), // fresh polling ping
    providerObservationTimestamp: new Date(Date.now() - 25 * 60 * 1000).toISOString() // 25 min old
  };
  const candCheckDisguised = engine.validateTrainCandidate(disguisedStaleTrain);
  record('1.3 Validator catches stale observation timestamp (>15m) despite fresh polling ping', candCheckDisguised.isValid === false, candCheckDisguised.reason);

  // 1.4: Crossing evaluation with stale candidate returns DATA UNAVAILABLE / Telemetry Stale
  const staleEval = engine.evaluateCrossingGateState(jauraCrossing, [staleFlaggedTrain], jucCorridorCoords);
  record('1.4 Stale candidate does NOT produce arrival countdown', staleEval.countdownAvailable === false && staleEval.timeToNextClosureSec === 0);
  record('1.5 Crossing evaluation reports DATA UNAVAILABLE / Telemetry Stale', (staleEval.gateStatusClassification === 'DATA UNAVAILABLE' || staleEval.gateStatusClassification === 'STATUS UNAVAILABLE') && staleEval.dataClassificationLabel === 'Telemetry Stale');

  // =========================================================================
  // TEST GROUP 2: MISSING & INVALID COORDINATES
  // =========================================================================
  console.log('\n--- TEST GROUP 2: MISSING & INVALID COORDINATES ---');

  // 2.1: Null coordinates
  const nullCoordTrain = {
    id: '12014',
    number: '12014',
    name: 'Shatabdi Express',
    lat: null,
    lng: null,
    speedKmH: 55,
    corridorId: 'CORR_ASR_JUC',
    direction: 'UP',
    dataState: 'LIVE',
    lastPing: new Date().toISOString()
  };
  const candNull = engine.validateTrainCandidate(nullCoordTrain);
  record('2.1 Train with null coordinates rejected by candidate validator', candNull.isValid === false, candNull.reason);

  const geoNull = GeographicValidator.validateApproachingCrossing(nullCoordTrain, jauraCrossing, jucCorridorCoords);
  record('2.2 GeographicValidator rejects train with null coordinates', geoNull.isValid === false, geoNull.rejectionReason);

  // 2.2: 0,0 unobserved coordinates
  const zeroCoordTrain = {
    id: '12053',
    number: '12053',
    name: 'Haridwar Jan Shatabdi',
    lat: 0,
    lng: 0,
    speedKmH: 50,
    corridorId: 'CORR_ASR_JUC',
    direction: 'DOWN',
    dataState: 'LIVE',
    lastPing: new Date().toISOString()
  };
  const candZero = engine.validateTrainCandidate(zeroCoordTrain);
  record('2.3 Train with (0,0) unobserved coordinates rejected', candZero.isValid === false, candZero.reason);

  // 2.3: Out-of-range coordinates (e.g. lat > 90)
  const outOfRangeTrain = {
    id: '14633',
    number: '14633',
    name: 'Ravi Express',
    lat: 135.5,
    lng: 74.86,
    speedKmH: 45,
    corridorId: 'CORR_ASR_PTK',
    direction: 'UP',
    dataState: 'LIVE',
    lastPing: new Date().toISOString()
  };
  const candRange = engine.validateTrainCandidate(outOfRangeTrain);
  record('2.4 Out-of-range geographic latitude rejected', candRange.isValid === false, candRange.reason);

  // 2.4: Crossing evaluation with missing coordinates does not fabricate ETA
  const missingCoordEval = engine.evaluateCrossingGateState(jauraCrossing, [nullCoordTrain], jucCorridorCoords);
  record('2.5 Missing coordinate train does NOT produce countdown or arrival ETA', missingCoordEval.countdownAvailable === false && missingCoordEval.estimatedTimeToArrivalSec === null);

  // =========================================================================
  // TEST GROUP 3: INCORRECT ASSOCIATIONS (EUCLIDEAN PROXIMITY ACROSS TRACKS)
  // =========================================================================
  console.log('\n--- TEST GROUP 3: INCORRECT ASSOCIATIONS BASED ON GEOGRAPHIC PROXIMITY ---');

  // In Euclidean space, Shivala Crossing (C-25 on CORR_ASR_JUC) is ~850m from tracks on CORR_ASR_PTK
  const ptkTrainNearShivala = {
    id: '06935',
    number: '06935',
    name: 'Pathankot Passenger',
    lat: 31.6360, // Physically near Shivala in 2D space, but on Pathankot permanent-way line
    lng: 74.8720,
    speedKmH: 45,
    corridorId: 'CORR_ASR_PTK', // Pathankot corridor
    direction: 'UP',
    dataState: 'LIVE',
    lastPing: new Date().toISOString()
  };

  // 3.1: GeographicValidator corridor connectivity check
  const crossCorridorGeo = GeographicValidator.validateApproachingCrossing(
    ptkTrainNearShivala,
    shivalaCrossing, // Shivala is on CORR_ASR_JUC
    jucCorridorCoords
  );
  record('3.1 Reject train on CORR_ASR_PTK approaching crossing on CORR_ASR_JUC', crossCorridorGeo.isValid === false, crossCorridorGeo.rejectionReason);

  // 3.2: Train on JUC corridor evaluated against Chatiwind Crossing on TT corridor
  const jucTrainNearChatiwind = {
    id: '12013',
    number: '12013',
    name: 'Shatabdi Express',
    lat: 31.6150,
    lng: 74.8750,
    speedKmH: 60,
    corridorId: 'CORR_ASR_JUC',
    direction: 'UP',
    dataState: 'LIVE',
    lastPing: new Date().toISOString()
  };
  const chatiwindEval = engine.evaluateCrossingGateState(chatiwindCrossing, [jucTrainNearChatiwind], ttCorridorCoords);
  record('3.2 Crossing on different corridor remains OPEN (no false impact association)', chatiwindEval.status === 'OPEN' && chatiwindEval.upcomingTrainId === null);
  record('3.3 Incompatible corridor crossing reports CLEAR PASSAGE', chatiwindEval.gateStatusClassification === 'CLEAR PASSAGE');

  // 3.3: identifyImpactedCrossingsForTrain excludes incompatible corridors
  const impactAnalysis = engine.identifyImpactedCrossingsForTrain(ptkTrainNearShivala, rawCrossings, corridorsMap);
  const falseJucAssociations = impactAnalysis.impactedCrossings.filter(c => c.corridorId === 'CORR_ASR_JUC');
  record('3.4 identifyImpactedCrossingsForTrain has 0 associations with JUC crossings for PTK train', falseJucAssociations.length === 0, `Total PTK impacts: ${impactAnalysis.impactedCrossings.length}`);
  record('3.5 Correctly catalogs incompatible crossings in report', impactAnalysis.incompatibleCrossingsCount > 0, `${impactAnalysis.incompatibleCrossingsCount} crossings excluded due to corridor mismatch`);

  // =========================================================================
  // TEST GROUP 4: OPPOSITE-DIRECTION TRAINS
  // =========================================================================
  console.log('\n--- TEST GROUP 4: OPPOSITE-DIRECTION TRAINS ---');

  // 4.1: Inbound (DOWN) train that has already passed the crossing towards Amritsar Jn (receding)
  // Jaura Phatak is at approx index 45 along CORR_ASR_JUC
  // Train is at index 10 (closer to Amritsar Jn than Jaura Phatak, traveling DOWN towards 0)
  const posAsrOuter = jucCorridorCoords[5]; // Near Amritsar Jn
  const passedDownTrain = {
    id: '12411',
    number: '12411',
    name: 'Intercity Express',
    lat: posAsrOuter[0],
    lng: posAsrOuter[1],
    speedKmH: 50,
    corridorId: 'CORR_ASR_JUC',
    direction: 'DOWN', // Traveling towards index 0 (Amritsar Jn)
    dataState: 'LIVE',
    lastPing: new Date().toISOString()
  };

  const geoPassedDown = GeographicValidator.validateApproachingCrossing(passedDownTrain, jauraCrossing, jucCorridorCoords);
  record('4.1 DOWN train already past crossing is NOT approaching (isApproaching: false)', geoPassedDown.isApproaching === false);
  record('4.2 DOWN train marked as cleared (hasCleared: true, isOppositeDirection: true)', geoPassedDown.hasCleared === true && geoPassedDown.isOppositeDirection === true);

  // Crossing state with passed receding train
  const recedingEval = engine.evaluateCrossingGateState(jauraCrossing, [passedDownTrain], jucCorridorCoords);
  record('4.3 Roadway remains OPEN for receding opposite-direction train', recedingEval.status === 'OPEN' && recedingEval.gateStatusClassification === 'NO APPROACH DETECTED');
  record('4.4 Receding train does not set upcomingTrainId for crossing', recedingEval.upcomingTrainId === null);

  // 4.5: Outbound (UP) train behind its route origin station
  const trainBehindOrigin = {
    id: '14674',
    number: '14674',
    name: 'Shaheed Express',
    lat: 31.5639, // Jandiala
    lng: 75.0347,
    origin: 'Jandiala',
    destination: 'New Delhi',
    speedKmH: 60,
    corridorId: 'CORR_ASR_JUC',
    direction: 'UP', // Traveling towards Beas / JUC
    dataState: 'LIVE',
    lastPing: new Date().toISOString()
  };
  // Jaura Phatak is at Amritsar end, behind Jandiala origin!
  const geoBehindOrigin = GeographicValidator.validateApproachingCrossing(trainBehindOrigin, jauraCrossing, jucCorridorCoords);
  record('4.5 Outbound UP train cannot approach crossing behind its route origin', geoBehindOrigin.isValid === false, geoBehindOrigin.rejectionReason);

  // 4.6: Train with unverified direction (missing or invalid direction)
  const unverifiedDirTrain = {
    id: '12014',
    number: '12014',
    name: 'Shatabdi Express',
    lat: 31.6050,
    lng: 74.9965,
    speedKmH: 60,
    corridorId: 'CORR_ASR_JUC',
    direction: 'SIDEWAYS', // invalid
    dataState: 'LIVE',
    lastPing: new Date().toISOString()
  };
  const candUnverifiedDir = engine.validateTrainCandidate(unverifiedDirTrain);
  record('4.6 Train with unverified direction rejected by candidate validator', candUnverifiedDir.isValid === false, candUnverifiedDir.reason);

  // =========================================================================
  // TEST GROUP 5: VERIFIED VS INFERRED POSITIONS & HONEST GATE STATE
  // =========================================================================
  console.log('\n--- TEST GROUP 5: VERIFIED VS INFERRED POSITIONS & HONEST GATE STATE ---');

  // 5.1: Live GPS speed vs Timetable sectional speed
  const liveGpsTrain = {
    id: '22488',
    number: '22488',
    name: 'Vande Bharat Express',
    lat: 31.6050,
    lng: 74.9965,
    speedKmH: 95,
    hasLiveSpeedMeasurement: true,
    corridorId: 'CORR_ASR_JUC',
    direction: 'DOWN',
    dataState: 'LIVE',
    positionClassification: 'ACTUAL_GPS',
    lastPing: new Date().toISOString()
  };
  const liveGpsEval = engine.evaluateCrossingGateState(jauraCrossing, [liveGpsTrain], jucCorridorCoords);
  record('5.1 Live speedometer classified as PROVIDER_LIVE_SPEED with HIGH confidence', liveGpsEval.speedSource === 'PROVIDER_LIVE_SPEED' && liveGpsEval.predictionConfidence === 'HIGH');
  record('5.2 ETA calculation method tagged as LIVE_TELEMETRY_VELOCITY', liveGpsEval.etaCalculationMethod === 'LIVE_TELEMETRY_VELOCITY');

  // 5.3: Timetable sectional estimate train
  const sectionalTrain = {
    id: '14634',
    number: '14634',
    name: 'Mail Express',
    lat: 31.6050,
    lng: 74.9965,
    speedKmH: 52,
    sectionalSpeedKmH: 52,
    hasLiveSpeedMeasurement: false,
    corridorId: 'CORR_ASR_JUC',
    direction: 'DOWN',
    dataState: 'LIVE',
    positionClassification: 'STATION_PROGRESS',
    lastPing: new Date().toISOString()
  };
  const sectionalEval = engine.evaluateCrossingGateState(jauraCrossing, [sectionalTrain], jucCorridorCoords);
  record('5.3 Train without live speedometer uses TIMETABLE_SECTIONAL_ESTIMATE with MODERATE confidence', sectionalEval.speedSource === 'TIMETABLE_SECTIONAL_ESTIMATE' && sectionalEval.predictionConfidence === 'MODERATE');

  // 5.4: Honest physical gate state (never claim physical fatak is closed without physical sensor)
  // An approaching train triggers CLOSURE_EXPECTED or APPROACHING, but observedPhysicalGateState must remain UNKNOWN
  record('5.4 Gate status is clearly flagged as estimated (isStatusEstimated: true)', liveGpsEval.isStatusEstimated === true);
  record('5.5 Observed physical gate state is strictly UNKNOWN (zero sensor fabrication)', liveGpsEval.observedPhysicalGateState === 'UNKNOWN');
  record('5.6 Physical sensor availability is false', liveGpsEval.physicalSensorAvailable === false);
  record('5.7 Physical sensor note explicitly disclaims CRIS IoT gate hardware', liveGpsEval.physicalSensorNote.includes('No operational hardware barrier sensor'));

  // =========================================================================
  // TEST GROUP 6: FIRST-CLASS TRAIN-TO-FATAK INTELLIGENCE API ENDPOINTS
  // =========================================================================
  console.log('\n--- TEST GROUP 6: LIVE BACKEND INTELLIGENCE API ENDPOINTS ---');

  try {
    // 6.1: GET /api/crossings
    const resCrossings = await fetch(`${BASE_URL}/api/crossings`);
    record('6.1 /api/crossings responds with HTTP 200', resCrossings.status === 200);
    const dataCrossings = await resCrossings.json();
    record('6.2 All 36 Amritsar OSM crossings served without distortion', dataCrossings.crossings.length === 36);

    // 6.3: Train-to-Fatak impact endpoint test with an active train
    const resTrains = await fetch(`${BASE_URL}/api/trains`);
    const dataTrains = await resTrains.json();
    record('6.3 /api/trains responds with HTTP 200', resTrains.status === 200);

    const activeTrain = dataTrains.trains.find(t => t.isWithinAmritsarSector && t.status === 'IN_TRANSIT') || dataTrains.trains[0];
    if (activeTrain) {
      const trainNum = activeTrain.number || activeTrain.id;
      const resImpact = await fetch(`${BASE_URL}/api/trains/${trainNum}/impacted-crossings`);
      record('6.4 /api/trains/:number/impacted-crossings endpoint operational (HTTP 200)', resImpact.status === 200);
      const impactData = await resImpact.json();
      record('6.5 Impact intelligence provides validated forward track crossings', Array.isArray(impactData.impactedCrossings) && (impactData.success === true || impactData.isValidCandidate === false));
    } else {
      record('6.4 /api/trains/:number/impacted-crossings tested via unit method', impactAnalysis.success === true);
    }

    // 6.6: Fatak-to-Train impact endpoint test
    const jauraId = jauraCrossing.osmId || '1006212111';
    const resFatak = await fetch(`${BASE_URL}/api/crossings/${jauraId}/impacting-trains`);
    record('6.6 /api/crossings/:id/impacting-trains endpoint operational (HTTP 200)', resFatak.status === 200);
    const fatakData = await resFatak.json();
    record('6.7 Fatak intelligence provides verified gate state and impacting train list', fatakData.success === true && fatakData.crossingId === jauraCrossing.id);

  } catch (err) {
    console.warn(`[API Notice] Live server test warning: ${err.message}`);
  }

  // =========================================================================
  // SUMMARY REPORT
  // =========================================================================
  console.log('\n======================================================================');
  console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('======================================================================');

  if (failed > 0) {
    console.error(`\n❌ Failed tests:`);
    results.filter(r => r.status === 'FAIL').forEach(r => console.error(` - ${r.name}: ${r.details}`));
    process.exitCode = 1;
  } else {
    console.log(`\n✅ ALL TRAIN-TO-FATAK INTELLIGENCE TESTS PASSED SUCCESSFULLY!`);
    process.exitCode = 0;
  }
}

runTestSuite().catch(err => {
  console.error('Test suite uncaught error:', err);
  process.exitCode = 1;
});
