// =========================================================================
// FATAKFORECAST — MULTI-TRAIN DETECTION & CROSSING-PREDICTION REGRESSION SUITE
// Exhaustive Verification of Multi-Train, Multi-Corridor, Continuous Closures,
// Timetable Separation, and Honest Sensor State Contract
// =========================================================================

import assert from 'assert';
import fs from 'fs';
import { TrainDetectionEngine, CROSSING_DETECTION_THRESHOLDS } from './backend/trainDetectionEngine.js';
import { GeographicValidator } from './backend/geographicValidator.js';
import { railkitService } from './backend/railkitService.js';
import { getCrossingTrainDisplay, findImpactingTrainForCrossing } from './frontend/src/utils/trainHelpers.ts';

const corridorsData = JSON.parse(fs.readFileSync('./backend/amritsar_corridors_osm.json', 'utf8'));
const crossingsData = JSON.parse(fs.readFileSync('./backend/amritsar_crossings_osm.json', 'utf8'));

const corridorsMap = {};
corridorsData.forEach(c => corridorsMap[c.id] = c);

let passed = 0;
let failed = 0;

function it(desc, fn) {
  try {
    fn();
    console.log(`  ✓ PASS: ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${desc}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

async function runSuite() {
  console.log('======================================================================');
  console.log('FATAKFORECAST — MULTI-TRAIN & CROSSING-PREDICTION PIPELINE AUDIT');
  console.log('======================================================================\n');

  const engine = new TrainDetectionEngine('test_api_key');

  // -------------------------------------------------------------------------
  // GROUP 1: MULTI-TRAIN PIPELINE ON SAME CORRIDOR (CORR_ASR_JUC)
  // -------------------------------------------------------------------------
  console.log('GROUP 1: Multi-Train Detection on Same Corridor (CORR_ASR_JUC)');

  const train22487 = {
    id: '22487',
    number: '22487',
    name: 'VANDE BHARAT EXP',
    corridorId: 'CORR_ASR_JUC',
    direction: 'DOWN',
    status: 'IN_TRANSIT',
    dataState: 'LIVE',
    lat: 31.2222,
    lng: 75.7667,
    sectionalSpeedKmH: 85,
    currentStationCode: 'PGW'
  };

  const train12053 = {
    id: '12053',
    number: '12053',
    name: 'ASR JANSHATABDI',
    corridorId: 'CORR_ASR_JUC',
    direction: 'DOWN',
    status: 'IN_TRANSIT',
    dataState: 'LIVE',
    lat: 30.912,
    lng: 75.8538,
    sectionalSpeedKmH: 75,
    currentStationCode: 'LDH'
  };

  const jauraCrossing = crossingsData.find(c => c.id === 'osm/node/1006212111'); // Jaura Phatak
  const jucCorridor = corridorsMap['CORR_ASR_JUC'];

  it('Both train candidates pass validity checks', () => {
    assert(engine.validateTrainCandidate(train22487).isValid === true);
    assert(engine.validateTrainCandidate(train12053).isValid === true);
  });

  it('Both trains are geographically confirmed approaching Jaura Phatak', () => {
    const geo1 = GeographicValidator.validateApproachingCrossing(train22487, jauraCrossing, jucCorridor.coordinates);
    const geo2 = GeographicValidator.validateApproachingCrossing(train12053, jauraCrossing, jucCorridor.coordinates);
    assert(geo1.isValid && geo1.isApproaching, 'Train 22487 is approaching');
    assert(geo2.isValid && geo2.isApproaching, 'Train 12053 is approaching');
    assert(geo1.trackDistanceKm < geo2.trackDistanceKm, 'Train 22487 is closer than 12053');
  });

  const multiEval = engine.evaluateCrossingGateState(
    jauraCrossing,
    [train12053, train22487], // Supplied in reverse order to prove sorting works
    jucCorridor.coordinates,
    { isFeedFresh: true, feedStatus: 'CONNECTED' }
  );

  it('Nearest approaching train (22487) is selected as primary prediction', () => {
    assert(multiEval.upcomingTrainId === '22487', 'upcomingTrainId is 22487');
    assert(multiEval.primaryTrain?.number === '22487', 'primaryTrain number is 22487');
  });

  it('Second approaching train (12053) is preserved in subsequentTrains and upcomingTrains', () => {
    assert(multiEval.totalUpcomingTrains === 2, `totalUpcomingTrains is 2 (got ${multiEval.totalUpcomingTrains})`);
    assert(Array.isArray(multiEval.subsequentTrains), 'subsequentTrains is an array');
    assert(multiEval.subsequentTrains.length === 1, `subsequentTrains has 1 train (got ${multiEval.subsequentTrains.length})`);
    assert(multiEval.subsequentTrains[0].trainNumber === '12053', 'subsequentTrains contains 12053');
    assert(multiEval.upcomingTrains.length === 1, 'upcomingTrains has 1 train');
    assert(multiEval.upcomingTrains[0].trainNumber === '12053', 'upcomingTrains contains 12053');
  });

  it('Neither train is overwritten and subsequent train contains full metrics', () => {
    const sub = multiEval.subsequentTrains[0];
    assert(sub.speedKmph === 75, `Subsequent train speed is 75 (got ${sub.speedKmph})`);
    assert(sub.distanceKm > 100, `Subsequent train distance > 100 km (got ${sub.distanceKm})`);
    assert(sub.etaMinutes > 80 && sub.etaMinutes < 130, `Subsequent train ETA accurate (got ${sub.etaMinutes})`);
    assert(sub.estimatedPassageTime, 'Subsequent train has estimatedPassageTime');
  });

  // -------------------------------------------------------------------------
  // GROUP 2: INDEPENDENT PREDICTIONS ACROSS ALL 4 CORRIDORS
  // -------------------------------------------------------------------------
  console.log('\nGROUP 2: Multi-Corridor Independent Predictions (PTK, TT, ATT, JUC)');

  const train54616_PTK = {
    id: '54616',
    number: '54616',
    name: 'PTK-ASR PASSENGER',
    corridorId: 'CORR_ASR_PTK',
    direction: 'DOWN',
    status: 'IN_TRANSIT',
    dataState: 'LIVE',
    lat: 31.9542,
    lng: 75.3197, // Dhariwal (~55km from ASR)
    sectionalSpeedKmH: 45,
    currentStationCode: 'DHW'
  };

  const train74687_TT = {
    id: '74687',
    number: '74687',
    name: 'KEMK-ASR DMU',
    corridorId: 'CORR_ASR_TT',
    direction: 'DOWN',
    status: 'IN_TRANSIT',
    dataState: 'LIVE',
    lat: 31.15,
    lng: 74.56, // Khemkaran (~61km from ASR)
    sectionalSpeedKmH: 45,
    currentStationCode: 'KEMK'
  };

  const train74664_ATT = {
    id: '74664',
    number: '74664',
    name: 'ATT-ASR DMU',
    corridorId: 'CORR_ASR_ATT',
    direction: 'DOWN',
    status: 'IN_TRANSIT',
    dataState: 'LIVE',
    lat: 31.6033,
    lng: 74.6067, // Attari (~25km from ASR)
    sectionalSpeedKmH: 45,
    currentStationCode: 'ATT'
  };

  const verkaCrossing = crossingsData.find(c => c.corridorId === 'CORR_ASR_PTK');
  const bhagtanwalaCrossing = crossingsData.find(c => c.corridorId === 'CORR_ASR_TT');
  const chhehartaCrossing = crossingsData.find(c => c.corridorId === 'CORR_ASR_ATT');

  it('Train 54616 produces verified prediction on PTK corridor crossing', () => {
    const res = engine.evaluateCrossingGateState(
      verkaCrossing,
      [train54616_PTK],
      corridorsMap['CORR_ASR_PTK'].coordinates,
      { isFeedFresh: true, feedStatus: 'CONNECTED' }
    );
    assert(res.upcomingTrainId === '54616', 'upcomingTrainId is 54616');
    assert(res.primaryTrain?.number === '54616', 'primaryTrain is 54616');
    assert(res.distanceAlongTrackKm > 45 && res.distanceAlongTrackKm < 65, `Track distance is ~54km (got ${res.distanceAlongTrackKm})`);
  });

  it('Train 74687 produces verified prediction on TT corridor crossing', () => {
    const res = engine.evaluateCrossingGateState(
      bhagtanwalaCrossing,
      [train74687_TT],
      corridorsMap['CORR_ASR_TT'].coordinates,
      { isFeedFresh: true, feedStatus: 'CONNECTED' }
    );
    assert(res.upcomingTrainId === '74687', 'upcomingTrainId is 74687');
    assert(res.primaryTrain?.number === '74687', 'primaryTrain is 74687');
    assert(res.distanceAlongTrackKm > 60 && res.distanceAlongTrackKm < 80, `Track distance is ~71km (got ${res.distanceAlongTrackKm})`);
  });

  it('Train 74664 produces verified prediction on ATT corridor crossing', () => {
    const res = engine.evaluateCrossingGateState(
      chhehartaCrossing,
      [train74664_ATT],
      corridorsMap['CORR_ASR_ATT'].coordinates,
      { isFeedFresh: true, feedStatus: 'CONNECTED' }
    );
    assert(res.upcomingTrainId === '74664', 'upcomingTrainId is 74664');
    assert(res.primaryTrain?.number === '74664', 'primaryTrain is 74664');
    assert(res.distanceAlongTrackKm > 10 && res.distanceAlongTrackKm < 30, `Track distance is accurate (got ${res.distanceAlongTrackKm})`);
  });

  it('Strict corridor separation: Train on PTK cannot affect TT or JUC crossings', () => {
    const crossResTT = engine.evaluateCrossingGateState(
      bhagtanwalaCrossing,
      [train54616_PTK], // Wrong corridor
      corridorsMap['CORR_ASR_TT'].coordinates,
      { isFeedFresh: true, feedStatus: 'CONNECTED' }
    );
    assert(crossResTT.upcomingTrainId === null, 'PTK train does NOT attach to TT crossing');

    const crossResJUC = engine.evaluateCrossingGateState(
      jauraCrossing,
      [train54616_PTK], // Wrong corridor
      corridorsMap['CORR_ASR_JUC'].coordinates,
      { isFeedFresh: true, feedStatus: 'CONNECTED' }
    );
    assert(crossResJUC.upcomingTrainId === null, 'PTK train does NOT attach to JUC crossing');
  });

  // -------------------------------------------------------------------------
  // GROUP 3: MULTI-TRAIN CONTINUOUS CLOSURE MERGING
  // -------------------------------------------------------------------------
  console.log('\nGROUP 3: Multi-Train Continuous Closure Merging');

  const coord1 = jucCorridor.coordinates[60];
  const coord2 = jucCorridor.coordinates[70];

  const trainClose1 = {
    id: '22487',
    number: '22487',
    name: 'VANDE BHARAT EXP',
    corridorId: 'CORR_ASR_JUC',
    direction: 'DOWN',
    status: 'IN_TRANSIT',
    dataState: 'LIVE',
    lat: coord1[0],
    lng: coord1[1],
    sectionalSpeedKmH: 60
  };

  const trainClose2 = {
    id: '12053',
    number: '12053',
    name: 'ASR JANSHATABDI',
    corridorId: 'CORR_ASR_JUC',
    direction: 'DOWN',
    status: 'IN_TRANSIT',
    dataState: 'LIVE',
    lat: coord2[0],
    lng: coord2[1],
    sectionalSpeedKmH: 60
  };

  const contEval = engine.evaluateCrossingGateState(
    jauraCrossing,
    [trainClose1, trainClose2],
    jucCorridor.coordinates,
    { isFeedFresh: true, feedStatus: 'CONNECTED' }
  );

  it('Merges close approaching trains into continuous closure', () => {
    assert(contEval.combinedClosure?.isContinuous === true, 'combinedClosure isContinuous is true');
    assert(contEval.combinedClosure?.trainCount === 2, 'combinedClosure trainCount is 2');
    assert(contEval.status === 'CLOSED', `Status is CLOSED (got ${contEval.status})`);
    assert(contEval.statusReason.includes('Continuous closure active for 2 trains'), 'statusReason mentions continuous closure');
  });

  // -------------------------------------------------------------------------
  // GROUP 4: STRICT SEPARATION OF TIMETABLE DATA FROM LIVE TELEMETRY
  // -------------------------------------------------------------------------
  console.log('\nGROUP 4: Strict Separation of Timetable Data from Live Telemetry');

  const timetableOnlyTrain = {
    id: '12411',
    number: '12411',
    name: 'INTERCITY EXP',
    corridorId: 'CORR_ASR_JUC',
    direction: 'DOWN',
    status: 'SCHEDULED',
    dataState: 'SCHEDULED', // NOT LIVE
    lat: 31.3325,
    lng: 75.58
  };

  const staleTrain = {
    id: '12014',
    number: '12014',
    name: 'AMRITSAR SHTABDI',
    corridorId: 'CORR_ASR_JUC',
    direction: 'DOWN',
    status: 'IN_TRANSIT',
    dataState: 'STALE', // >15m old
    lat: 31.3325,
    lng: 75.58,
    lastPing: new Date(Date.now() - 25 * 60 * 1000).toISOString()
  };

  const simulatedTrain = {
    id: 'SIM-001',
    number: 'SIM-001',
    name: 'TEST RAKE',
    corridorId: 'CORR_ASR_JUC',
    direction: 'DOWN',
    status: 'IN_TRANSIT',
    dataState: 'SIMULATED', // Simulated
    lat: 31.62,
    lng: 74.90
  };

  it('Timetable-only train is strictly rejected from crossing predictions', () => {
    const res = engine.evaluateCrossingGateState(
      jauraCrossing,
      [timetableOnlyTrain],
      jucCorridor.coordinates,
      { isFeedFresh: true, feedStatus: 'CONNECTED' }
    );
    assert(res.upcomingTrainId === null, 'Timetable train does not trigger prediction');
  });

  it('Stale telemetry train is strictly rejected from crossing predictions', () => {
    const res = engine.evaluateCrossingGateState(
      jauraCrossing,
      [staleTrain],
      jucCorridor.coordinates,
      { isFeedFresh: true, feedStatus: 'CONNECTED' }
    );
    assert(res.upcomingTrainId === null, 'Stale train does not trigger prediction');
    assert(res.status === 'UNKNOWN', 'Crossing status is UNKNOWN when only stale telemetry exists');
  });

  it('Simulated test train is strictly rejected in LIVE_OPERATIONAL mode', () => {
    const res = engine.evaluateCrossingGateState(
      jauraCrossing,
      [simulatedTrain],
      jucCorridor.coordinates,
      { isFeedFresh: true, feedStatus: 'CONNECTED' }
    );
    assert(res.upcomingTrainId === null, 'Simulated train does not trigger prediction');
  });

  // -------------------------------------------------------------------------
  // GROUP 5: FRONTEND MULTI-TRAIN RENDERING CONTRACT
  // -------------------------------------------------------------------------
  console.log('\nGROUP 5: Frontend Multi-Train Rendering Contract');

  it('getCrossingTrainDisplay attaches secondary trains and total count', () => {
    const crossingWithTwo = {
      ...jauraCrossing,
      primaryTrain: train22487,
      upcomingTrain: train22487,
      subsequentTrains: [
        {
          trainNumber: '12053',
          trainName: 'ASR JANSHATABDI',
          direction: 'DOWN',
          speedKmph: 75,
          distanceKm: 138.29,
          etaMinutes: 110.6,
          estimatedPassageTime: new Date(Date.now() + 110 * 60000).toISOString()
        }
      ],
      totalUpcomingTrains: 2
    };

    const displayInfo = getCrossingTrainDisplay(crossingWithTwo, [train22487, train12053]);
    assert(displayInfo.type === 'APPROACHING', 'type is APPROACHING');
    assert(displayInfo.trainNumber === '22487', 'Primary train number is 22487');
    assert(displayInfo.totalApproaching === 2, 'totalApproaching is 2');
    assert(displayInfo.secondaryTrains?.length === 1, 'secondaryTrains has 1 train');
    assert(displayInfo.secondaryTrains?.[0].trainNumber === '12053', 'secondaryTrains contains 12053');
  });

  // -------------------------------------------------------------------------
  // GROUP 6: RAILKIT LIVE DISCOVERY CAPABILITIES & CREDIT AUDIT
  // -------------------------------------------------------------------------
  console.log('\nGROUP 6: RailKit Live Discovery Capabilities & Credit Audit');

  it('RailKit SDK discovery uses official liveAtStation hub API for ASR and TTO', () => {
    const audit = railkitService.getDiscoveryAudit();
    assert(audit.discoveryMethod.includes('liveAtStation'), 'Discovery method is official liveAtStation');
    assert(audit.discoveryMethod.includes('ASR'), 'Queries ASR hub');
    assert(audit.discoveryMethod.includes('TTO'), 'Queries TTO hub');
  });

  it('Credit conservation caches discovery for 15 minutes and telemetry for 90s', () => {
    assert(railkitService.discoveryCacheTtlMs >= 10 * 60 * 1000, 'Discovery cache TTL >= 10 min');
    assert(railkitService.telemetryCacheTtlMs >= 60 * 1000, 'Telemetry cache TTL >= 60s');
    assert(railkitService.negativeCacheTtlMs >= 10 * 60 * 1000, 'Negative cache TTL >= 10 min');
  });

  it('Observed physical gate state is strictly UNKNOWN (no fabricated hardware sensors)', () => {
    assert(multiEval.observedPhysicalGateState === 'UNKNOWN', 'observedPhysicalGateState is UNKNOWN');
    assert(multiEval.physicalSensorAvailable === false, 'physicalSensorAvailable is false');
  });

  console.log('\n======================================================================');
  console.log(`MULTI-TRAIN REGRESSION SUITE: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runSuite().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
