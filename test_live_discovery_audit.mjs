// =========================================================================
// FATAKFORECAST — LIVE TRAIN DISCOVERY & ACCURACY AUDIT REGRESSION SUITE
// Tests for Automatic Discovery, Visibility, Kinematics, 36 Crossings & Credit Safety
// =========================================================================

import fs from 'fs';
import { GeographicValidator, projectPointOnPolyline } from './backend/geographicValidator.js';
import { TrainDetectionEngine } from './backend/trainDetectionEngine.js';
import { railkitService } from './backend/railkitService.js';
import { findImpactingTrainForCrossing, getCrossingTrainDisplay } from './frontend/src/utils/trainHelpers.ts';

const rawCrossings = JSON.parse(fs.readFileSync('./backend/amritsar_crossings_osm.json', 'utf8'));
const rawCorridors = JSON.parse(fs.readFileSync('./backend/amritsar_corridors_osm.json', 'utf8'));
const corridorsMap = {};
rawCorridors.forEach(c => corridorsMap[c.id] = c);

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

async function runTestSuite() {
  console.log('======================================================================');
  console.log('FATAKFORECAST — LIVE DISCOVERY & ACCURACY AUDIT REGRESSION SUITE');
  console.log('======================================================================\n');

  const engine = new TrainDetectionEngine('test_key');

  // -------------------------------------------------------------------------
  // TEST GROUP 1: AUTOMATIC TRAIN DISCOVERY AUDIT
  // -------------------------------------------------------------------------
  console.log('GROUP 1: Automatic Train Discovery Audit (Official RailKit liveAtStation)');
  
  // Test 1.1: Verify discovery uses official Hub APIs without hardcoded rosters
  assert(typeof railkitService.discoverActiveTrains === 'function', 'railkitService implements discoverActiveTrains');
  
  // Test 1.2: Check discovery audit structure
  const audit = railkitService.getDiscoveryAudit();
  assert(audit.discoveryMethod.includes('liveAtStation'), 'Discovery method is officially RailKit liveAtStation Hub API');
  assert(audit.provider.includes('RailKit'), 'Provider is RailKit Indian Railways Gateway');
  assert(Array.isArray(audit.discoveredTrains), 'discoveredTrains is an array');

  // Test 1.3: Credit Conservation TTLs
  assert(railkitService.discoveryCacheTtlMs >= 10 * 60 * 1000, 'Discovery cache TTL is >= 10 minutes (conserves credits)');
  assert(railkitService.cacheTtlMs >= 60 * 1000, 'Train telemetry cache TTL is >= 60s (90s standard)');
  assert(railkitService.errorCacheTtlMs >= 10 * 60 * 1000, 'Negative cache TTL is >= 10 minutes (prevents retrying failed trains)');

  // -------------------------------------------------------------------------
  // TEST GROUP 2: CORRIDOR ASSIGNMENT & MISCLASSIFICATION AUDIT
  // -------------------------------------------------------------------------
  console.log('\nGROUP 2: Corridor Assignment & Misclassification Audit');

  // Test 2.1: Attari Line (CORR_ASR_ATT) route detection
  const attTrainMock = {
    trainInfo: [{ number: '74663', name: 'ASR-ATT DMU' }],
    route: [
      { stnCode: 'ASR', stnName: 'Amritsar Jn', cord: { lat: 31.6338, lon: 74.8655 } },
      { stnCode: 'CIA', stnName: 'Chheharta', cord: { lat: 31.6372, lon: 74.8105 } },
      { stnCode: 'ATT', stnName: 'Atari', cord: { lat: 31.6033, lon: 74.6053 } }
    ],
    currentLocation: { stnCode: 'ASR', status: 'at-station' },
    status: 'running'
  };
  const mappedAtt = railkitService.mapRailkitTrain(attTrainMock);
  assert(mappedAtt.corridorId === 'CORR_ASR_ATT', 'Train with CIA/ATT route correctly assigned to CORR_ASR_ATT');

  // Test 2.2: Tarn Taran Line (CORR_ASR_TT) route detection
  const ttTrainMock = {
    trainInfo: [{ number: '74687', name: 'KEMK-ASR DMU' }],
    route: [
      { stnCode: 'KEMK', stnName: 'Khem Karan', cord: { lat: 31.1550, lon: 74.5650 } },
      { stnCode: 'TTO', stnName: 'Tarn Taran', cord: { lat: 31.4550, lon: 74.9250 } },
      { stnCode: 'BGTN', stnName: 'Bhagtanwala', cord: { lat: 31.6150, lon: 74.8720 } },
      { stnCode: 'ASR', stnName: 'Amritsar Jn', cord: { lat: 31.6338, lon: 74.8655 } }
    ],
    currentLocation: { stnCode: 'TTO', status: 'at-station' },
    status: 'running'
  };
  const mappedTt = railkitService.mapRailkitTrain(ttTrainMock);
  assert(mappedTt.corridorId === 'CORR_ASR_TT', 'Train with TTO/BGTN route correctly assigned to CORR_ASR_TT');

  // Test 2.3: Pathankot Line (CORR_ASR_PTK) route detection
  const ptkTrainMock = {
    trainInfo: [{ number: '54616', name: 'PTK-ASR PASSENGER' }],
    route: [
      { stnCode: 'PTK', stnName: 'Pathankot', cord: { lat: 32.2689, lon: 75.6517 } },
      { stnCode: 'BAT', stnName: 'Batala', cord: { lat: 31.8186, lon: 75.2044 } },
      { stnCode: 'VKA', stnName: 'Verka', cord: { lat: 31.6667, lon: 74.9167 } },
      { stnCode: 'ASR', stnName: 'Amritsar Jn', cord: { lat: 31.6338, lon: 74.8655 } }
    ],
    currentLocation: { stnCode: 'BAT', status: 'at-station' },
    status: 'running'
  };
  const mappedPtk = railkitService.mapRailkitTrain(ptkTrainMock);
  assert(mappedPtk.corridorId === 'CORR_ASR_PTK', 'Train with BAT/VKA route correctly assigned to CORR_ASR_PTK');

  // Test 2.4: Mainline Jalandhar Line (CORR_ASR_JUC) route detection
  const jucTrainMock = {
    trainInfo: [{ number: '22487', name: 'VANDE BHARAT EXP' }],
    route: [
      { stnCode: 'LDH', stnName: 'Ludhiana Jn', distance: 311, cord: { lat: 30.8930, lon: 75.8742 } },
      { stnCode: 'PGW', stnName: 'Phagwara Jn', distance: 347, cord: { lat: 31.2222, lon: 75.7667 } },
      { stnCode: 'JUC', stnName: 'Jalandhar City', distance: 368, cord: { lat: 31.3325, lon: 75.5800 } },
      { stnCode: 'BEAS', stnName: 'Beas Jn', distance: 404, cord: { lat: 31.5122, lon: 75.2981 } },
      { stnCode: 'ASR', stnName: 'Amritsar Jn', distance: 447, cord: { lat: 31.6338, lon: 74.8655 } }
    ],
    currentLocation: { stnCode: 'LDH', status: 'at-station' },
    status: 'running'
  };
  const mappedJuc = railkitService.mapRailkitTrain(jucTrainMock);
  assert(mappedJuc.corridorId === 'CORR_ASR_JUC', 'Train with LDH/JUC route correctly assigned to CORR_ASR_JUC');

  // -------------------------------------------------------------------------
  // TEST GROUP 3: GEOGRAPHIC VALIDATION & MAINLINE EXTENDED KINEMATICS
  // -------------------------------------------------------------------------
  console.log('\nGROUP 3: Geographic Validation & Mainline Extended Kinematics');

  const jucCorridor = corridorsMap['CORR_ASR_JUC'];
  const jauraCrossing = rawCrossings.find(c => c.name.includes('Jaura Phatak'));

  // Test 3.1: Sector boundary expands to 140km (Ludhiana approach)
  assert(GeographicValidator.AMRITSAR_SECTOR_RADIUS_KM === 140.0, 'AMRITSAR_SECTOR_RADIUS_KM is 140 km');
  const ludhianaCheck = GeographicValidator.isWithinSector(30.8930, 75.8742);
  assert(ludhianaCheck.inSector === true, 'Ludhiana Junction (126.4 km away) is within Amritsar operational sector');

  // Test 3.2: New Delhi (400+ km away) is safely rejected
  const delhiCheck = GeographicValidator.isWithinSector(28.6430, 77.2193);
  assert(delhiCheck.inSector === false, 'New Delhi (402 km away) is strictly rejected as out of sector');

  // Test 3.3: Inbound train approaching from Ludhiana along mainline calculates exact track distance
  const vandeBharatAtLdh = {
    id: '22487',
    number: '22487',
    name: 'VANDE BHARAT EXP',
    corridorId: 'CORR_ASR_JUC',
    direction: 'DOWN',
    status: 'IN_TRANSIT',
    dataState: 'LIVE',
    lat: 30.912,
    lng: 75.8538,
    currentStationCode: 'LDH',
    schedule: jucTrainMock.route.map(r => ({ stationCode: r.stnCode, distance: r.distance }))
  };
  const geoCheck = GeographicValidator.validateApproachingCrossing(vandeBharatAtLdh, jauraCrossing, jucCorridor.coordinates);
  assert(geoCheck.isValid === true, 'Inbound train at Ludhiana is geographically valid');
  assert(geoCheck.isApproaching === true, 'Inbound train at Ludhiana is confirmed approaching Jaura Phatak');
  assert(geoCheck.trackDistanceKm > 120 && geoCheck.trackDistanceKm < 145, `Track distance is accurate: ${geoCheck.trackDistanceKm} km`);

  // Test 3.4: Rejection of Outbound train behind origin
  const outboundDepartedBeas = {
    id: '14654',
    number: '14654',
    name: 'ASR HSR EXP',
    corridorId: 'CORR_ASR_JUC',
    direction: 'UP',
    status: 'IN_TRANSIT',
    dataState: 'LIVE',
    origin: 'Amritsar Junction',
    lat: 31.5122,
    lng: 75.2981 // At Beas (passed Jaura Phatak)
  };
  const clearedCheck = GeographicValidator.validateApproachingCrossing(outboundDepartedBeas, jauraCrossing, jucCorridor.coordinates);
  assert(clearedCheck.hasCleared === true, 'Outbound train at Beas has cleared Jaura Phatak');
  assert(clearedCheck.isApproaching === false, 'Cleared outbound train is NOT approaching Jaura Phatak');

  // -------------------------------------------------------------------------
  // TEST GROUP 4: AUDIT ALL 36 LEVEL CROSSINGS
  // -------------------------------------------------------------------------
  console.log('\nGROUP 4: Complete Audit of All 36 Level Crossings');

  assert(rawCrossings.length === 36, 'All 36 OpenStreetMap level crossings are present');
  const byCorridor = {};
  rawCrossings.forEach(c => byCorridor[c.corridorId] = (byCorridor[c.corridorId] || 0) + 1);
  assert(byCorridor['CORR_ASR_TT'] === 12, 'CORR_ASR_TT has 12 crossings');
  assert(byCorridor['CORR_ASR_JUC'] === 8, 'CORR_ASR_JUC has 8 crossings');
  assert(byCorridor['CORR_ASR_ATT'] === 8, 'CORR_ASR_ATT has 8 crossings');
  assert(byCorridor['CORR_ASR_PTK'] === 8, 'CORR_ASR_PTK has 8 crossings');

  // Test 4.1: Verify every crossing evaluation on CORR_ASR_JUC with Vande Bharat
  const jucCrossings = rawCrossings.filter(c => c.corridorId === 'CORR_ASR_JUC');
  let jucWithPrediction = 0;
  for (const crossing of jucCrossings) {
    const res = engine.evaluateCrossingGateState(
      crossing,
      [vandeBharatAtLdh],
      jucCorridor.coordinates,
      { isFeedFresh: true, feedStatus: 'CONNECTED' }
    );
    if (res.upcomingTrainId === '22487' && res.countdownAvailable === true) {
      jucWithPrediction++;
    }
  }
  assert(jucWithPrediction === 8, `All 8 crossings on CORR_ASR_JUC detect approaching Train #22487 (${jucWithPrediction}/8)`);

  // Test 4.2: Verify crossings on other corridors do NOT falsely attach 22487
  const ttCrossings = rawCrossings.filter(c => c.corridorId === 'CORR_ASR_TT');
  let ttFalselyAttached = 0;
  for (const crossing of ttCrossings) {
    const res = engine.evaluateCrossingGateState(
      crossing,
      [vandeBharatAtLdh],
      corridorsMap['CORR_ASR_TT'].coordinates,
      { isFeedFresh: true, feedStatus: 'CONNECTED' }
    );
    if (res.upcomingTrainId === '22487') {
      ttFalselyAttached++;
    }
  }
  assert(ttFalselyAttached === 0, `0 of 12 Tarn Taran crossings falsely attach mainline train (${ttFalselyAttached}/12)`);

  // Test 4.3: Verify UI helper does NOT slap terminated 12411 fallback on empty corridors
  const chatiwind = rawCrossings.find(c => c.name.includes('Chatiwind Gate'));
  const terminatedMorningTrain = {
    id: '12411',
    number: '12411',
    name: 'INTERCITY EXP',
    status: 'TERMINATED',
    dataState: 'TERMINATED',
    corridorId: 'CORR_ASR_JUC',
    lat: 31.6338,
    lng: 74.8655,
    isWithinAmritsarSector: true
  };
  const uiDisplay = getCrossingTrainDisplay(chatiwind, [terminatedMorningTrain]);
  assert(uiDisplay.type === 'CLEAR', 'Chatiwind Gate displays type: CLEAR');
  assert(uiDisplay.name === 'Clear Approach Zone', 'Chatiwind Gate displays Clear Approach Zone');
  assert(uiDisplay.trainNumber === undefined, 'No train number displayed for clear approach zone');

  // Test 4.4: Verify no synthetic lastTrainPassed is fabricated when corridor has no traffic
  const emptyEval = engine.evaluateCrossingGateState(
    chatiwind,
    [],
    corridorsMap['CORR_ASR_TT'].coordinates,
    { isFeedFresh: true, feedStatus: 'CONNECTED' }
  );
  assert(emptyEval.lastTrainPassed === null, 'lastTrainPassed is strictly null when no train has cleared crossing');

  // -------------------------------------------------------------------------
  // TEST GROUP 5: HONEST SAFETY & PHYSICAL SENSOR SEPARATION
  // -------------------------------------------------------------------------
  console.log('\nGROUP 5: Honest Safety & Physical Sensor Separation');

  assert(emptyEval.observedPhysicalGateState === 'UNKNOWN', 'observedPhysicalGateState is strictly UNKNOWN');
  assert(emptyEval.physicalSensorAvailable === false, 'physicalSensorAvailable is strictly false');
  assert(emptyEval.gateStatusClassification !== 'BARRIER LOCKED', 'Does not fabricate physical mechanical barrier lock');
  assert(emptyEval.gateStatusClassification === 'PREDICTED PASSAGE CLEAR', 'Gate state classified as PREDICTED PASSAGE CLEAR');

  console.log('\n======================================================================');
  console.log(`AUDIT SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Test suite uncaught error:', err);
  process.exit(1);
});
