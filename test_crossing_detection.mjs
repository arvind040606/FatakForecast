// test_crossing_detection.mjs
// ============================================================================
// FATAKFORECAST — 16 REALISTIC EDGE CASE VERIFICATION SUITE (A THROUGH P)
// ============================================================================
// Comprehensive test verification covering real crossing status detection,
// candidate validation, speed integrity, route-topology boundary checks,
// multi-train interlocking, feed disconnection safety, and gate state honesty.

import { TrainDetectionEngine, CROSSING_DETECTION_THRESHOLDS } from './backend/trainDetectionEngine.js';
import { GeographicValidator } from './backend/geographicValidator.js';
import { STATION_COORDINATES } from './backend/telemetryService.js';

let passedCount = 0;
let failedCount = 0;

function assert(condition, testId, message) {
  if (condition) {
    console.log(`  ✓ [${testId}] PASS: ${message}`);
    passedCount++;
  } else {
    console.error(`  ✗ [${testId}] FAIL: ${message}`);
    failedCount++;
  }
}

async function runEdgeCasesSuite() {
  console.log('======================================================================');
  console.log('FATAKFORECAST — REALISTIC CROSSING DETECTION EDGE CASES (A THROUGH P)');
  console.log('======================================================================\n');

  const engine = new TrainDetectionEngine('test_key');
  const geoValidator = new GeographicValidator();

  // Reference track polyline for Amritsar - Jalandhar Corridor (CORR_ASR_JUC)
  const asrJucCoords = [
    [31.6338, 74.8655], // Amritsar Jn (index 0)
    [31.6313, 74.8975], // Jaura Phatak (index 1) - ~3.04 km
    [31.6250, 74.9350], // Vallah Crossing (index 2) - ~6.7 km
    [31.6050, 74.9965], // Mananwala (index 3) - ~13.5 km
    [31.5639, 75.0347], // Jandiala (index 4) - ~19.0 km
    [31.5122, 75.2981]  // Beas (index 5) - ~43.0 km
  ];

  // Reference track polyline for Amritsar - Tarn Taran Corridor (CORR_ASR_TARN_TARAN)
  const asrTarnTaranCoords = [
    [31.6210, 74.8760], // BGTN / Bhagtanwala (index 0)
    [31.6150, 74.8850], // Gobindgarh South (index 1) - ~1.1 km
    [31.6020, 74.8980], // Bhagtanwala Yard (index 2) - ~2.8 km
    [31.5850, 74.9150], // Kot Mit Singh (index 3) - ~5.0 km
    [31.5160, 74.9320], // Gohlwar Varpal (index 4) - ~12.5 km
    [31.4520, 74.9270], // Tarn Taran (index 5) - ~20.0 km
    [31.3250, 74.9120], // Patti (index 6) - ~34.0 km
    [31.2500, 74.8850], // Kairon KCZ (index 7) - ~42.0 km
    [31.1710, 74.6050]  // Khem Karan KEMK (index 8) - ~60.0 km
  ];

  const jauraCrossing = {
    id: 'osm/node/1006212111',
    osmId: '1006212111',
    name: 'Jaura Phatak (Joda Phatak)',
    corridorId: 'CORR_ASR_JUC',
    lat: 31.6313,
    lng: 74.8975
  };

  const vallahCrossing = {
    id: 'osm/node/1006212112',
    osmId: '1006212112',
    name: 'Vallah Bypass Crossing',
    corridorId: 'CORR_ASR_JUC',
    lat: 31.6250,
    lng: 74.9350
  };

  const gobindgarhCrossing = {
    id: 'osm/node/3041230001',
    osmId: '3041230001',
    name: 'Gobindgarh South Crossing',
    corridorId: 'CORR_ASR_TARN_TARAN',
    lat: 31.6150,
    lng: 74.8850
  };

  const bhagtanwalaYardCrossing = {
    id: 'osm/node/3041230002',
    osmId: '3041230002',
    name: 'Bhagtanwala Yard Approach',
    corridorId: 'CORR_ASR_TARN_TARAN',
    lat: 31.6020,
    lng: 74.8980
  };

  const kotMitSinghCrossing = {
    id: 'osm/node/3041230003',
    osmId: '3041230003',
    name: 'Kot Mit Singh Crossing',
    corridorId: 'CORR_ASR_TARN_TARAN',
    lat: 31.5850,
    lng: 74.9150
  };

  const healthyFeedContext = {
    isFeedFresh: true,
    feedStatus: 'CONNECTED',
    lastSuccessfulSync: new Date().toISOString()
  };

  // -------------------------------------------------------------------------
  // EDGE CASE A: A verified train approaching a crossing
  // -------------------------------------------------------------------------
  console.log('--- EDGE CASE A: A verified train approaching a crossing ---');
  // Sub-case A1: Train is 1.0 km away (within imminent warning <= 1.8km or <= 150s)
  const imminentTrain = {
    id: '12460_imminent',
    number: '12460',
    name: 'Amritsar Intercity Express',
    lat: 31.6325,
    lng: 74.8850, // ~1.1 km from Jaura Phatak
    speedKmH: 50,
    corridorId: 'CORR_ASR_JUC',
    direction: 'UP',
    dataState: 'LIVE',
    positionClassification: 'STATION_PROGRESS',
    hasLiveSpeedMeasurement: true,
    lastPing: new Date().toISOString()
  };
  const evalA1 = engine.evaluateCrossingGateState(jauraCrossing, [imminentTrain], asrJucCoords, healthyFeedContext);
  assert(evalA1.status === 'CLOSURE_EXPECTED', 'EDGE_A1', 'Train within imminent window produces CLOSURE_EXPECTED');
  assert(evalA1.countdownAvailable === true, 'EDGE_A1', 'Countdown is available for imminent train');
  assert(evalA1.timeToNextClosureSec === 0, 'EDGE_A1', 'Imminent arrival sets timeToNextClosureSec to 0 (closure active)');
  assert(evalA1.associatedTrainNumber === '12460', 'EDGE_A1', 'Associated train matches #12460');

  // Sub-case A2: Train is ~4.0 km away (approaching, > 150s, <= 10 min / 8 km)
  const approachingTrain = {
    id: '12460_approaching',
    number: '12460',
    name: 'Amritsar Intercity Express',
    lat: 31.6338,
    lng: 74.8655, // At ASR Jn, ~3.04 km along track
    speedKmH: 40,
    corridorId: 'CORR_ASR_JUC',
    direction: 'UP',
    dataState: 'LIVE',
    positionClassification: 'STATION_PROGRESS',
    hasLiveSpeedMeasurement: true,
    lastPing: new Date().toISOString()
  };
  const evalA2 = engine.evaluateCrossingGateState(jauraCrossing, [approachingTrain], asrJucCoords, healthyFeedContext);
  assert(evalA2.status === 'APPROACHING', 'EDGE_A2', 'Train in approach horizon produces APPROACHING');
  assert(evalA2.countdownAvailable === true, 'EDGE_A2', 'Countdown available for approaching train');
  assert(evalA2.timeToNextClosureSec > 0, 'EDGE_A2', 'Positive countdown to gate closure generated');
  assert(typeof evalA2.estimatedTimeToArrivalSec === 'number', 'EDGE_A2', 'Valid ETA calculated');

  // -------------------------------------------------------------------------
  // EDGE CASE B: A train moving away from a crossing
  // -------------------------------------------------------------------------
  console.log('\n--- EDGE CASE B: A train moving away from a crossing ---');
  // Train is moving DOWN (towards Amritsar Jn) from Mananwala, but crossing is Jaura Phatak,
  // or train is at Jaura Phatak moving away towards Amritsar.
  // When a DOWN train is at ASR Jn, Jaura Phatak is behind it.
  const recedingTrain = {
    id: '12013_down',
    number: '12013',
    name: 'Shatabdi Express',
    lat: 31.6338,
    lng: 74.8655, // At Amritsar Jn
    speedKmH: 50,
    corridorId: 'CORR_ASR_JUC',
    direction: 'DOWN', // Traveling toward ASR Jn, so Jaura Phatak (segIndex 1) is already passed
    dataState: 'LIVE',
    positionClassification: 'STATION_PROGRESS',
    lastPing: new Date().toISOString()
  };
  const evalB = engine.evaluateCrossingGateState(jauraCrossing, [recedingTrain], asrJucCoords, healthyFeedContext);
  assert(evalB.status === 'OPEN', 'EDGE_B', 'Crossing remains OPEN when train moves away from crossing');
  assert(evalB.upcomingTrainId === null, 'EDGE_B', 'No upcoming train assigned when train is receding');
  assert(evalB.countdownAvailable === false, 'EDGE_B', 'No countdown when train is receding');

  // -------------------------------------------------------------------------
  // EDGE CASE C: A train that has already passed a crossing
  // -------------------------------------------------------------------------
  console.log('\n--- EDGE CASE C: A train that has already passed a crossing ---');
  // UP train is at Mananwala (index 3), so it has already passed Jaura Phatak (index 1)
  const passedTrain = {
    id: '12460_passed',
    number: '12460',
    name: 'Amritsar Intercity Express',
    lat: 31.6050,
    lng: 74.9965, // Mananwala (past Jaura Phatak)
    speedKmH: 60,
    corridorId: 'CORR_ASR_JUC',
    direction: 'UP',
    dataState: 'LIVE',
    positionClassification: 'STATION_PROGRESS',
    lastPing: new Date().toISOString()
  };
  const evalC = engine.evaluateCrossingGateState(jauraCrossing, [passedTrain], asrJucCoords, healthyFeedContext);
  assert(evalC.status === 'OPEN', 'EDGE_C', 'Crossing is OPEN after train has passed');
  assert(evalC.upcomingTrainId === null, 'EDGE_C', 'No upcoming train assigned for passed train');
  assert(evalC.lastTrainPassed !== null, 'EDGE_C', 'lastTrainPassed metadata records the cleared train');
  assert(evalC.lastTrainPassed?.trainNumber === '12460', 'EDGE_C', 'Cleared train number recorded correctly');

  // -------------------------------------------------------------------------
  // EDGE CASE D: A train whose route does not contain the crossing
  // -------------------------------------------------------------------------
  console.log('\n--- EDGE CASE D: A train whose route does not contain the crossing ---');
  // Train #74688 is on the Southern Corridor (CORR_ASR_TARN_TARAN). Jaura Phatak is on CORR_ASR_JUC.
  const demuTrain = {
    id: '74688_demu',
    number: '74688',
    name: 'Bhagtanwala - Khem Karan DEMU',
    lat: 31.6210,
    lng: 74.8760, // BGTN
    speedKmH: 45,
    corridorId: 'CORR_ASR_TARN_TARAN',
    direction: 'UP',
    dataState: 'LIVE',
    positionClassification: 'STATION_PROGRESS',
    lastPing: new Date().toISOString()
  };
  const evalD = engine.evaluateCrossingGateState(jauraCrossing, [demuTrain], asrJucCoords, healthyFeedContext);
  assert(evalD.status === 'OPEN', 'EDGE_D', 'Jaura Phatak remains OPEN when train is on different route (no false closure association)');
  assert(evalD.upcomingTrainId === null, 'EDGE_D', 'No upcoming train association across different route');

  // Also check Check 6: Train originating at BGTN cannot approach crossings behind BGTN
  const behindOriginCheck = GeographicValidator.validateApproachingCrossing(demuTrain, {
    id: 'crossing_behind_bgtn',
    lat: 31.6338,
    lng: 74.8655, // Amritsar Jn
    corridorId: 'CORR_ASR_TARN_TARAN'
  }, asrTarnTaranCoords);
  assert(behindOriginCheck.isValid === false, 'EDGE_D', 'Route origin boundary rejects crossings behind train origin');

  // -------------------------------------------------------------------------
  // EDGE CASE E: A train outside the mapped Amritsar corridor
  // -------------------------------------------------------------------------
  console.log('\n--- EDGE CASE E: A train outside the mapped Amritsar corridor ---');
  const outOfSectorTrain = {
    id: '12014_delhi',
    number: '12014',
    name: 'Amritsar Shatabdi',
    lat: 28.6139,
    lng: 77.2090, // New Delhi (>400 km away)
    speedKmH: 80,
    corridorId: 'CORR_ASR_JUC',
    direction: 'UP',
    dataState: 'LIVE',
    positionClassification: 'STATION_PROGRESS',
    lastPing: new Date().toISOString()
  };
  const candE = engine.validateTrainCandidate(outOfSectorTrain);
  assert(candE.isValid === false, 'EDGE_E', 'Out of sector train rejected by candidate validator');
  const evalE = engine.evaluateCrossingGateState(jauraCrossing, [outOfSectorTrain], asrJucCoords, healthyFeedContext);
  assert(evalE.status === 'UNKNOWN', 'EDGE_E', 'Crossing is UNKNOWN when train is outside sector');
  assert(evalE.upcomingTrainId === null, 'EDGE_E', 'No association for train outside sector');

  // -------------------------------------------------------------------------
  // EDGE CASE F: A train that has not started
  // -------------------------------------------------------------------------
  console.log('\n--- EDGE CASE F: A train that has not started ---');
  const notStartedTrain = {
    id: '12014_not_started',
    number: '12014',
    name: 'Amritsar Shatabdi',
    lat: null,
    lng: null,
    speedKmH: 0,
    corridorId: 'CORR_ASR_JUC',
    direction: 'UP',
    status: 'NOT_STARTED',
    dataState: 'SCHEDULED',
    positionClassification: 'SCHEDULED_POSITION',
    lastPing: new Date().toISOString()
  };
  const candF = engine.validateTrainCandidate(notStartedTrain);
  assert(candF.isValid === false, 'EDGE_F', 'NOT_STARTED train rejected by candidate validator');
  const evalF = engine.evaluateCrossingGateState(jauraCrossing, [notStartedTrain], asrJucCoords, healthyFeedContext);
  assert(evalF.status === 'UNKNOWN', 'EDGE_F', 'Crossing is UNKNOWN for NOT_STARTED train (no live movement)');
  assert(evalF.upcomingTrainId === null, 'EDGE_F', 'No association for unstarted timetable service');

  // -------------------------------------------------------------------------
  // EDGE CASE G: A terminated train
  // -------------------------------------------------------------------------
  console.log('\n--- EDGE CASE G: A terminated train ---');
  const terminatedTrain = {
    id: '12459_term',
    number: '12459',
    name: 'New Delhi - Amritsar InterCity',
    lat: 31.6338,
    lng: 74.8655,
    speedKmH: 0,
    corridorId: 'CORR_ASR_JUC',
    direction: 'DOWN',
    status: 'TERMINATED',
    dataState: 'LIVE',
    positionClassification: 'STATION_PROGRESS',
    lastPing: new Date().toISOString()
  };
  const candG = engine.validateTrainCandidate(terminatedTrain);
  assert(candG.isValid === false, 'EDGE_G', 'TERMINATED train rejected by candidate validator');
  const evalG = engine.evaluateCrossingGateState(jauraCrossing, [terminatedTrain], asrJucCoords, healthyFeedContext);
  assert(evalG.status === 'OPEN', 'EDGE_G', 'Crossing remains OPEN when train is terminated (not in service)');
  assert(evalG.upcomingTrainId === null, 'EDGE_G', 'No upcoming train association for terminated train');

  // -------------------------------------------------------------------------
  // EDGE CASE H: A stale provider observation
  // -------------------------------------------------------------------------
  console.log('\n--- EDGE CASE H: A stale provider observation ---');
  const staleObsTrain = {
    id: '12460_stale',
    number: '12460',
    name: 'Amritsar Intercity Express',
    lat: 31.6338,
    lng: 74.8655,
    speedKmH: 50,
    corridorId: 'CORR_ASR_JUC',
    direction: 'UP',
    dataState: 'STALE',
    positionClassification: 'STATION_PROGRESS',
    providerObservationTimestamp: new Date(Date.now() - 25 * 60 * 1000).toISOString(), // 25 min old
    lastPing: new Date().toISOString() // Fresh API retrieval ping
  };
  const candH = engine.validateTrainCandidate(staleObsTrain);
  assert(candH.isValid === false, 'EDGE_H', 'Stale provider observation (>15m) rejected by candidate validator');
  const evalH = engine.evaluateCrossingGateState(jauraCrossing, [staleObsTrain], asrJucCoords, healthyFeedContext);
  assert(evalH.countdownAvailable === false, 'EDGE_H', 'No countdown available for stale observation');
  assert(evalH.status === 'UNKNOWN' || evalH.status === 'OPEN', 'EDGE_H', 'Does not produce false alert for stale train');

  // -------------------------------------------------------------------------
  // EDGE CASE I: A missing position
  // -------------------------------------------------------------------------
  console.log('\n--- EDGE CASE I: A missing position ---');
  const noPosTrain = {
    id: '12460_nopos',
    number: '12460',
    name: 'Amritsar Intercity Express',
    lat: null,
    lng: null,
    speedKmH: 50,
    corridorId: 'CORR_ASR_JUC',
    direction: 'UP',
    dataState: 'LIVE',
    positionClassification: 'POSITION_UNAVAILABLE',
    lastPing: new Date().toISOString()
  };
  const candI = engine.validateTrainCandidate(noPosTrain);
  assert(candI.isValid === false, 'EDGE_I', 'Train with null coordinates rejected');
  const evalI = engine.evaluateCrossingGateState(jauraCrossing, [noPosTrain], asrJucCoords, healthyFeedContext);
  assert(evalI.status === 'UNKNOWN', 'EDGE_I', 'Crossing is UNKNOWN when train position is missing');
  assert(evalI.upcomingTrainId === null, 'EDGE_I', 'No association for missing position');

  // -------------------------------------------------------------------------
  // EDGE CASE J: Missing live speed
  // -------------------------------------------------------------------------
  console.log('\n--- EDGE CASE J: Missing live speed ---');
  const noLiveSpeedTrain = {
    id: '12460_no_live_speed',
    number: '12460',
    name: 'Amritsar Intercity Express',
    lat: 31.6338,
    lng: 74.8655,
    speedKmH: 50,
    corridorId: 'CORR_ASR_JUC',
    direction: 'UP',
    dataState: 'LIVE',
    positionClassification: 'STATION_PROGRESS',
    hasLiveSpeedMeasurement: false, // Provider does not supply raw GPS speed
    speedSource: 'TIMETABLE_SECTIONAL_ESTIMATE',
    lastPing: new Date().toISOString()
  };
  const evalJ = engine.evaluateCrossingGateState(jauraCrossing, [noLiveSpeedTrain], asrJucCoords, healthyFeedContext);
  assert(evalJ.hasLiveSpeedMeasurement === false, 'EDGE_J', 'Honest reporting: hasLiveSpeedMeasurement is false');
  assert(evalJ.speedSource === 'TIMETABLE_SECTIONAL_ESTIMATE', 'EDGE_J', 'speedSource explicitly identified as TIMETABLE_SECTIONAL_ESTIMATE');
  assert(evalJ.predictionConfidence === 'MODERATE', 'EDGE_J', 'predictionConfidence is MODERATE (not falsely HIGH)');

  // -------------------------------------------------------------------------
  // EDGE CASE K: Contradictory station progress and coordinates
  // -------------------------------------------------------------------------
  console.log('\n--- EDGE CASE K: Contradictory station progress and coordinates ---');
  const contradictoryTrain = {
    id: '12014_contradictory',
    number: '12014',
    name: 'Amritsar Shatabdi',
    lat: 31.5122,
    lng: 75.2981, // Coordinates are at Beas (~43 km away)
    currentStationCode: 'ASR', // Provider claims train is currently at Amritsar Jn!
    speedKmH: 60,
    corridorId: 'CORR_ASR_JUC',
    direction: 'UP',
    dataState: 'LIVE',
    positionClassification: 'STATION_PROGRESS',
    lastPing: new Date().toISOString()
  };
  const candK = engine.validateTrainCandidate(contradictoryTrain);
  assert(candK.isValid === false, 'EDGE_K', 'Contradictory station progress vs coordinates (>25 km) rejected by validator');
  assert(candK.reason.includes('Contradictory'), 'EDGE_K', 'Rejection reason states Contradictory station telemetry');

  // -------------------------------------------------------------------------
  // EDGE CASE L: Multiple trains approaching the same crossing
  // -------------------------------------------------------------------------
  console.log('\n--- EDGE CASE L: Multiple trains approaching the same crossing ---');
  const train1 = {
    id: 'train_1',
    number: '12460',
    name: 'Intercity Express (Leading)',
    lat: 31.6325,
    lng: 74.8850, // ~1.1 km away
    speedKmH: 50,
    corridorId: 'CORR_ASR_JUC',
    direction: 'UP',
    dataState: 'LIVE',
    positionClassification: 'STATION_PROGRESS',
    hasLiveSpeedMeasurement: true,
    lastPing: new Date().toISOString()
  };
  const train2 = {
    id: 'train_2',
    number: '22488',
    name: 'Vande Bharat (Following)',
    lat: 31.6338,
    lng: 74.8655, // ~3.04 km away
    speedKmH: 60,
    corridorId: 'CORR_ASR_JUC',
    direction: 'UP',
    dataState: 'LIVE',
    positionClassification: 'STATION_PROGRESS',
    hasLiveSpeedMeasurement: true,
    lastPing: new Date().toISOString()
  };
  const evalL = engine.evaluateCrossingGateState(jauraCrossing, [train1, train2], asrJucCoords, healthyFeedContext);
  assert(evalL.associatedTrainNumber === '12460', 'EDGE_L', 'Earliest passage train (train 1) selected as primary impacting train');
  assert(evalL.totalUpcomingTrains === 2, 'EDGE_L', 'Both approaching trains detected and counted');
  assert(evalL.combinedClosure.trainCount === 2, 'EDGE_L', 'Multi-train continuous closure window groups both trains');

  // -------------------------------------------------------------------------
  // EDGE CASE M: A train approaching several crossings sequentially
  // -------------------------------------------------------------------------
  console.log('\n--- EDGE CASE M: A train approaching several crossings sequentially ---');
  // Single train starting at BGTN moving UP towards KEMK
  const southernTrain = {
    id: 'demu_seq',
    number: '74688',
    name: 'Khem Karan DEMU',
    lat: 31.6210,
    lng: 74.8760, // BGTN
    speedKmH: 45,
    corridorId: 'CORR_ASR_TARN_TARAN',
    direction: 'UP',
    dataState: 'LIVE',
    positionClassification: 'STATION_PROGRESS',
    hasLiveSpeedMeasurement: true,
    lastPing: new Date().toISOString()
  };
  const evalM1 = engine.evaluateCrossingGateState(gobindgarhCrossing, [southernTrain], asrTarnTaranCoords, healthyFeedContext);
  const evalM2 = engine.evaluateCrossingGateState(bhagtanwalaYardCrossing, [southernTrain], asrTarnTaranCoords, healthyFeedContext);
  const evalM3 = engine.evaluateCrossingGateState(kotMitSinghCrossing, [southernTrain], asrTarnTaranCoords, healthyFeedContext);

  assert(evalM1.distanceAlongTrackKm < evalM2.distanceAlongTrackKm, 'EDGE_M', 'Track distances increase monotonically (M1 < M2)');
  assert(evalM2.distanceAlongTrackKm < evalM3.distanceAlongTrackKm, 'EDGE_M', 'Track distances increase monotonically (M2 < M3)');
  assert(evalM1.estimatedTimeToArrivalSec < evalM2.estimatedTimeToArrivalSec, 'EDGE_M', 'ETAs increase monotonically (M1 < M2)');
  assert(evalM2.estimatedTimeToArrivalSec < evalM3.estimatedTimeToArrivalSec, 'EDGE_M', 'ETAs increase monotonically (M2 < M3)');

  // -------------------------------------------------------------------------
  // EDGE CASE N: A train whose ETA cannot be established
  // -------------------------------------------------------------------------
  console.log('\n--- EDGE CASE N: A train whose ETA cannot be established ---');
  const stoppedTrainAtPlatform = {
    id: 'stopped_at_asr',
    number: '22488',
    name: 'Vande Bharat Express',
    lat: 31.6338,
    lng: 74.8655, // At ASR Jn platform (~3 km away from crossing)
    speedKmH: 0,
    isStationary: true,
    corridorId: 'CORR_ASR_JUC',
    direction: 'UP',
    dataState: 'LIVE',
    positionClassification: 'STATION_PROGRESS',
    lastPing: new Date().toISOString()
  };
  const evalN = engine.evaluateCrossingGateState(jauraCrossing, [stoppedTrainAtPlatform], asrJucCoords, healthyFeedContext);
  assert(evalN.status === 'OPEN', 'EDGE_N', 'Stationary train away from crossing cannot close crossing');
  assert(evalN.estimatedTimeToArrivalSec === null, 'EDGE_N', 'ETA is null when movement cannot be established');
  assert(evalN.countdownAvailable === false, 'EDGE_N', 'No countdown invented for stationary train');

  // -------------------------------------------------------------------------
  // EDGE CASE O: Provider outage or quota exhaustion
  // -------------------------------------------------------------------------
  console.log('\n--- EDGE CASE O: Provider outage or quota exhaustion ---');
  const disconnectedFeedContext = {
    isFeedFresh: false,
    feedStatus: 'DISCONNECTED',
    lastSuccessfulSync: null
  };
  const evalO = engine.evaluateCrossingGateState(jauraCrossing, [], asrJucCoords, disconnectedFeedContext);
  assert(evalO.status === 'UNKNOWN', 'EDGE_O', 'Crossing status is UNKNOWN when provider feed is offline');
  assert(evalO.gateStatusClassification === 'DATA UNAVAILABLE', 'EDGE_O', 'gateStatusClassification is DATA UNAVAILABLE');
  assert(evalO.statusReason.includes('disconnected') || evalO.statusReason.includes('stale'), 'EDGE_O', 'Status reason explains telemetry outage honestly');

  // -------------------------------------------------------------------------
  // EDGE CASE P: Unknown physical gate state
  // -------------------------------------------------------------------------
  console.log('\n--- EDGE CASE P: Unknown physical gate state ---');
  assert(evalA1.observedPhysicalGateState === 'UNKNOWN', 'EDGE_P', 'evalA1 observedPhysicalGateState is strictly UNKNOWN');
  assert(evalA1.physicalSensorAvailable === false, 'EDGE_P', 'evalA1 physicalSensorAvailable is false');
  assert(evalA2.observedPhysicalGateState === 'UNKNOWN', 'EDGE_P', 'evalA2 observedPhysicalGateState is strictly UNKNOWN');
  assert(evalO.observedPhysicalGateState === 'UNKNOWN', 'EDGE_P', 'evalO observedPhysicalGateState is strictly UNKNOWN');
  assert(evalA1.physicalSensorNote.includes('barrier sensor'), 'EDGE_P', 'Honest physical sensor note provided');

  console.log('\n======================================================================');
  console.log(`EDGE CASE SUITE RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('======================================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runEdgeCasesSuite().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
