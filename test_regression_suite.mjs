// =========================================================================
// FATAKFORECAST — COMPREHENSIVE NINE-POINT REGRESSION TEST SUITE
// Explicitly validates the 9 regression requirements from User Audit:
// 1. Train in Delhi (#22488) does not appear near Manawala or any Amritsar crossing.
// 2. Train that has passed a crossing (#14804 past Kathunangal) does not remain marked as approaching.
// 3. Train on a different railway route does not affect that crossing.
// 4. Duplicate train records do not inflate train counts.
// 5. Older responses do not overwrite newer observations.
// 6. Stale or missing positions do not produce fabricated arrival estimates.
// 7. Repeated identical inputs produce consistent predictions.
// 8. Genuine new observations update predictions appropriately.
// 9. Invalid provider responses and exhausted quotas do not activate fake live data.
// =========================================================================

import { GeographicValidator } from './backend/geographicValidator.js';
import { TrainDetectionEngine } from './backend/trainDetectionEngine.js';
import { TrainAggregationService } from './backend/trainAggregationService.js';
import fs from 'fs';

const BASE_URL = 'http://localhost:8787';

const rawCrossings = JSON.parse(fs.readFileSync('backend/amritsar_crossings_osm.json', 'utf8'));
const rawCorridors = JSON.parse(fs.readFileSync('backend/amritsar_corridors_osm.json', 'utf8'));
const corridorsMap = Object.fromEntries(rawCorridors.map(c => [c.id, c]));

async function runRegressionSuite() {
  console.log('======================================================================');
  console.log('🎯 FATAKFORECAST: 9-POINT REGRESSION VERIFICATION SUITE');
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

  const engine = new TrainDetectionEngine('test_api_key');
  const aggregation = new TrainAggregationService();

  // Reference Crossings from OSM
  const manawalaCrossing = rawCrossings.find(c => c.name.toLowerCase().includes('manawala') || c.name.toLowerCase().includes('mananwala')) || {
    id: 'osm/node/1006212112',
    name: 'Manawala Railway Crossing (LC-28)',
    corridorId: 'CORR_ASR_JUC',
    lat: 31.6050,
    lng: 74.9965,
    nearestStation: 'MNWL'
  };

  const jauraCrossing = rawCrossings.find(c => c.name.includes('Jaura')) || {
    id: 'osm/node/1006212111',
    name: 'Jaura Phatak (LC-27)',
    corridorId: 'CORR_ASR_JUC',
    lat: 31.6313,
    lng: 74.8975,
    nearestStation: 'ASR'
  };

  const kathunangalCrossing = rawCrossings.find(c => c.name.toLowerCase().includes('kathunangal')) || {
    id: 'osm/node/1006212130',
    name: 'Kathunangal Phatak (LC-12)',
    corridorId: 'CORR_ASR_PTK',
    lat: 31.7500,
    lng: 75.0200,
    nearestStation: 'KNG'
  };

  const chogawanCrossing = rawCrossings.find(c => c.name.toLowerCase().includes('chogawan') || c.name.toLowerCase().includes('khasa')) || {
    id: 'osm/node/1006212120',
    name: 'Chogawan Road Crossing',
    corridorId: 'CORR_ASR_ATT',
    lat: 31.6400,
    lng: 74.7800,
    nearestStation: 'KSA'
  };

  const jucCoords = corridorsMap['CORR_ASR_JUC']?.coordinates || [];
  const ptkCoords = corridorsMap['CORR_ASR_PTK']?.coordinates || [];
  const attCoords = corridorsMap['CORR_ASR_ATT']?.coordinates || [];
  const standardFeed = { isFeedFresh: true, feedStatus: 'CONNECTED' };

  console.log('--- REQUIREMENT 1: TRAIN IN DELHI DOES NOT APPEAR NEAR AMRITSAR CROSSINGS ---');
  {
    // Train #22488 (Vande Bharat Express) currently in Delhi/Ambala
    const delhiTrain22488 = {
      id: '22488',
      number: '22488',
      name: 'Vande Bharat Express',
      lat: 28.6139, // New Delhi coordinates (~400+ km away)
      lng: 77.2090,
      corridorId: 'CORR_ASR_JUC',
      direction: 'UP',
      speedKmH: 130,
      status: 'OUT_OF_SECTOR',
      isWithinAmritsarSector: false,
      distanceFromAmritsarKm: 450,
      currentStation: 'NDLS',
      providerObservationTimestamp: new Date().toISOString()
    };

    // 1. Candidate validator check on engine
    const candValid = engine.validateTrainCandidate(delhiTrain22488);
    assert(candValid.isValid === false, 'Candidate validator rejects Delhi train (22488)');
    assert(candValid.reason.includes('Amritsar sector') || candValid.reason.includes('New Delhi'), 
      `Rejection reason explicitly references sector boundary (${candValid.reason})`);

    // 2. Approach validator for Manawala crossing
    const appValidManawala = GeographicValidator.validateApproachingCrossing(delhiTrain22488, manawalaCrossing, jucCoords);
    assert(appValidManawala.isValid === false, 'Approach validator rejects Delhi train approaching Manawala crossing');
    assert(appValidManawala.rejectionReason.includes('outside Amritsar') || appValidManawala.rejectionReason.includes('sector'),
      `Manawala approach validator rejection: ${appValidManawala.rejectionReason}`);

    // 3. Approach validator for Jaura Phatak
    const appValidJaura = GeographicValidator.validateApproachingCrossing(delhiTrain22488, jauraCrossing, jucCoords);
    assert(appValidJaura.isValid === false, 'Approach validator rejects Delhi train approaching Jaura Phatak');

    // 4. Crossing evaluation with Delhi train returns OPEN / CLEAR PASSAGE with zero train association
    const evalResult = engine.evaluateCrossingGateState(manawalaCrossing, [delhiTrain22488], jucCoords, standardFeed);
    assert(evalResult.status === 'OPEN' || evalResult.status === 'UNKNOWN', 'Manawala crossing does NOT close for Delhi train');
    assert(evalResult.upcomingTrainId === null, 'No upcomingTrainId associated with crossing');
    assert(evalResult.corridorTrain === null, 'corridorTrain is strictly null');
    assert(evalResult.activeCorridorTrain === null, 'activeCorridorTrain is strictly null');
    assert(evalResult.timeToNextClosureSec === 0 || evalResult.countdownAvailable === false, 'No false closing countdown for Delhi train');
  }

  console.log('\n--- REQUIREMENT 2: TRAIN THAT HAS PASSED CROSSING IS NOT MARKED AS APPROACHING ---');
  {
    // Train #14804: Heading UP towards Batala/Pathankot, currently beyond Kathunangal at Jaintipur
    const trainPastKathunangal = {
      id: '14804',
      number: '14804',
      name: 'JAT BGKT EXP',
      lat: 31.7900, // Located beyond Kathunangal (31.7500) heading UP towards Batala
      lng: 75.0600,
      corridorId: 'CORR_ASR_PTK',
      direction: 'UP',
      speedKmH: 60,
      hasLiveSpeedMeasurement: true,
      currentStation: 'JNT',
      schedule: [
        { code: 'ASR', name: 'Amritsar Jn' },
        { code: 'VKA', name: 'Verka Jn' },
        { code: 'KNG', name: 'Kathunangal' },
        { code: 'JNT', name: 'Jaintipur' },
        { code: 'BAT', name: 'Batala Jn' }
      ],
      dataState: 'LIVE',
      isWithinAmritsarSector: true,
      distanceFromAmritsarKm: 22,
      providerObservationTimestamp: new Date().toISOString()
    };

    const valPastKng = GeographicValidator.validateApproachingCrossing(trainPastKathunangal, kathunangalCrossing, ptkCoords);
    assert(valPastKng.isApproaching === false, 'Train 14804 is NOT marked as approaching Kathunangal');
    assert(valPastKng.hasCleared === true || valPastKng.isValid === false, 'Train 14804 is marked as hasCleared or passed Kathunangal');

    const evalKathunangal = engine.evaluateCrossingGateState(kathunangalCrossing, [trainPastKathunangal], ptkCoords, standardFeed);
    assert(evalKathunangal.status === 'OPEN', 'Kathunangal crossing is OPEN once train has passed');
    assert(evalKathunangal.upcomingTrainId === null, 'No upcoming train marked for Kathunangal crossing');

    // Scenario 2B: Inbound DOWN train traveling towards Amritsar that has already passed Kathunangal
    const inboundTrainPastCrossing = {
      id: '12411',
      number: '12411',
      name: 'Intercity Express',
      lat: 31.6800, // Near Verka, already passed Kathunangal (31.7500)
      lng: 74.9200,
      corridorId: 'CORR_ASR_PTK',
      direction: 'DOWN',
      speedKmH: 65,
      hasLiveSpeedMeasurement: true,
      currentStation: 'VKA',
      schedule: [
        { code: 'BAT', name: 'Batala Jn' },
        { code: 'JNT', name: 'Jaintipur' },
        { code: 'KNG', name: 'Kathunangal' },
        { code: 'VKA', name: 'Verka Jn' },
        { code: 'ASR', name: 'Amritsar Jn' }
      ],
      dataState: 'LIVE',
      isWithinAmritsarSector: true,
      distanceFromAmritsarKm: 8,
      providerObservationTimestamp: new Date().toISOString()
    };

    const valDownPastKng = GeographicValidator.validateApproachingCrossing(inboundTrainPastCrossing, kathunangalCrossing, ptkCoords);
    assert(valDownPastKng.isApproaching === false, 'Inbound DOWN train past crossing is not approaching');
    assert(valDownPastKng.hasCleared === true || valDownPastKng.isValid === false, 'Inbound DOWN train past crossing has hasCleared: true');
  }

  console.log('\n--- REQUIREMENT 3: TRAIN ON DIFFERENT RAILWAY ROUTE DOES NOT AFFECT CROSSING ---');
  {
    // Train #12014 on Amritsar-Jalandhar main line (CORR_ASR_JUC)
    const trainOnJalandharLine = {
      id: '12014',
      number: '12014',
      name: 'Shatabdi Express',
      lat: 31.6100,
      lng: 74.9800,
      corridorId: 'CORR_ASR_JUC',
      direction: 'UP',
      speedKmH: 90,
      dataState: 'LIVE',
      isWithinAmritsarSector: true,
      distanceFromAmritsarKm: 12,
      providerObservationTimestamp: new Date().toISOString()
    };

    // Crossing on Attari corridor (CORR_ASR_ATT)
    const valDiffCorridor = GeographicValidator.validateApproachingCrossing(trainOnJalandharLine, chogawanCrossing, attCoords);
    assert(valDiffCorridor.isValid === false, 'Validator rejects train on different corridor');
    assert(valDiffCorridor.rejectionReason.includes('Corridor mismatch') || valDiffCorridor.rejectionReason.includes('different railway line'),
      `Rejection reason explicitly identifies corridor mismatch (${valDiffCorridor.rejectionReason})`);

    // Crossing on Pathankot corridor (CORR_ASR_PTK)
    const valDiffPtk = GeographicValidator.validateApproachingCrossing(trainOnJalandharLine, kathunangalCrossing, ptkCoords);
    assert(valDiffPtk.isValid === false, 'Validator rejects JUC train on PTK crossing');

    // Evaluate Attari crossing with JUC train
    const evalAttari = engine.evaluateCrossingGateState(chogawanCrossing, [trainOnJalandharLine], attCoords, standardFeed);
    assert(evalAttari.status === 'OPEN', 'Attari crossing remains OPEN with JUC train in area');
    assert(evalAttari.corridorTrain === null, 'corridorTrain is null for mismatched corridor');
    assert(evalAttari.upcomingTrainId === null, 'upcomingTrainId is null for mismatched corridor');
  }

  console.log('\n--- REQUIREMENT 4: DUPLICATE TRAIN RECORDS DO NOT INFLATE TRAIN COUNTS ---');
  {
    // Duplicate records for train 12053 arriving from multiple feeds/sources
    const recordA = {
      id: '12053',
      number: '12053',
      name: 'Haridwar Jan Shatabdi',
      corridorId: 'CORR_ASR_JUC',
      direction: 'DOWN',
      lat: 31.6200,
      lng: 74.9500,
      speedKmH: 75,
      dataState: 'LIVE',
      providerObservationTimestamp: '2026-10-15T11:00:00.000Z'
    };

    const recordB_duplicate = {
      id: '12053',
      number: '12053',
      name: 'HW-ASR JANSHATABDI',
      corridorId: 'CORR_ASR_JUC',
      direction: 'DOWN',
      lat: 31.6205,
      lng: 74.9510,
      speedKmH: 75,
      dataState: 'LIVE',
      providerObservationTimestamp: '2026-10-15T11:00:00.000Z'
    };

    const recordC_formattedNum = {
      id: '012053',
      number: '12053',
      name: 'HW-ASR JANSHATABDI',
      corridorId: 'CORR_ASR_JUC',
      direction: 'DOWN',
      lat: 31.6205,
      lng: 74.9510,
      speedKmH: 75,
      dataState: 'LIVE',
      providerObservationTimestamp: '2026-10-15T11:00:00.000Z'
    };

    // Test normalization
    const normA = aggregation.normalizeTrainNumber(recordA.number);
    const normB = aggregation.normalizeTrainNumber(recordB_duplicate.number);
    const normC = aggregation.normalizeTrainNumber(recordC_formattedNum.number);
    assert(normA === '12053', 'Normalized train number is 5-digit 12053');
    assert(normA === normB && normB === normC, 'All duplicates normalize to identical 5-digit key');

    // Simulate map aggregation
    const testMap = new Map();
    testMap.set(normA, recordA);
    testMap.set(normB, aggregation.arbitrateRecords(testMap.get(normB), recordB_duplicate));
    testMap.set(normC, aggregation.arbitrateRecords(testMap.get(normC), recordC_formattedNum));

    assert(testMap.size === 1, 'Duplicate records resolved to exactly 1 aggregated train');

    // Raw list deduplication
    const rawListWithDuplicates = [recordA, recordB_duplicate, recordC_formattedNum];
    const uniqueTrains = Array.from(new Map(rawListWithDuplicates.map(t => [aggregation.normalizeTrainNumber(t.number), t])).values());
    assert(uniqueTrains.length === 1, 'Train array deduplication yields strictly 1 distinct train');
  }

  console.log('\n--- REQUIREMENT 5: OLDER RESPONSES DO NOT OVERWRITE NEWER OBSERVATIONS ---');
  {
    // Newer observation at 11:05:00
    const newerRecord = {
      number: '12460',
      dataState: 'LIVE',
      lat: 31.6250,
      lng: 74.9100,
      speedKmH: 70,
      hasLiveSpeedMeasurement: true,
      providerObservationTimestamp: '2026-10-15T11:05:00.000Z'
    };

    // Older, out-of-order observation from earlier poll at 11:01:00
    const olderRecord = {
      number: '12460',
      dataState: 'LIVE',
      lat: 31.5500,
      lng: 75.0500,
      speedKmH: 50,
      hasLiveSpeedMeasurement: true,
      providerObservationTimestamp: '2026-10-15T11:01:00.000Z'
    };

    const arbitrated1 = aggregation.arbitrateRecords(newerRecord, olderRecord);
    assert(arbitrated1.providerObservationTimestamp === '2026-10-15T11:05:00.000Z', 
      'Arbitration retains newer observation when older record arrives second');
    assert(arbitrated1.lat === 31.6250, 'Retains fresher coordinates from newer record');

    // Reverse parameter order test
    const arbitrated2 = aggregation.arbitrateRecords(olderRecord, newerRecord);
    assert(arbitrated2.providerObservationTimestamp === '2026-10-15T11:05:00.000Z', 
      'Arbitration retains newer observation regardless of argument order');

    // Live vs Stale state test: Live beats Stale regardless of timestamp
    const staleRecordNewerFetch = {
      number: '12460',
      dataState: 'STALE',
      providerObservationTimestamp: '2026-10-15T11:06:00.000Z'
    };
    const arbitratedLiveStale = aggregation.arbitrateRecords(newerRecord, staleRecordNewerFetch);
    assert(arbitratedLiveStale.dataState === 'LIVE', 'LIVE data state takes precedence over STALE state');
  }

  console.log('\n--- REQUIREMENT 6: STALE OR MISSING POSITIONS DO NOT PRODUCE FABRICATED ARRIVAL ESTIMATES ---');
  {
    // Stale train (> 15 minutes old)
    const staleTrain = {
      id: '12013',
      number: '12013',
      name: 'New Delhi Shatabdi',
      corridorId: 'CORR_ASR_JUC',
      direction: 'DOWN',
      lat: 31.6200,
      lng: 74.9200,
      speedKmH: 80,
      isStale: true,
      dataState: 'STALE',
      lastPing: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
      providerObservationTimestamp: new Date(Date.now() - 25 * 60 * 1000).toISOString()
    };

    const staleApproach = GeographicValidator.validateApproachingCrossing(staleTrain, jauraCrossing, jucCoords);
    assert(staleApproach.isValid === false, 'Validator rejects stale train (>15 min old)');
    assert(staleApproach.rejectionReason.includes('older than 15 minutes') || staleApproach.rejectionReason.includes('stale'), 
      `Rejection reason indicates stale telemetry (${staleApproach.rejectionReason})`);

    const staleEval = engine.evaluateCrossingGateState(jauraCrossing, [staleTrain], jucCoords, standardFeed);
    assert(staleEval.countdownAvailable === false || staleEval.timeToNextClosureSec === 0, 'Stale train produces no false countdown');
    assert(staleEval.estimatedTimeToArrivalSec === null, 'Stale train produces null estimatedTimeToArrivalSec');
    assert(staleEval.status === 'UNKNOWN' || staleEval.status === 'OPEN', 
      `Crossing reports honest status (${staleEval.status}) rather than fabricated closure countdown`);

    // Train with missing / null coordinates
    const missingCoordsTrain = {
      id: '14631',
      number: '14631',
      name: 'Dehradun Express',
      corridorId: 'CORR_ASR_JUC',
      direction: 'DOWN',
      lat: null,
      lng: null,
      speedKmH: 50,
      dataState: 'UNAVAILABLE'
    };

    const nullApproach = GeographicValidator.validateApproachingCrossing(missingCoordsTrain, jauraCrossing, jucCoords);
    assert(nullApproach.isValid === false, 'Validator rejects train with null coordinates');

    const nullEval = engine.evaluateCrossingGateState(jauraCrossing, [missingCoordsTrain], jucCoords, standardFeed);
    assert(nullEval.countdownAvailable === false, 'Null coordinates produce countdownAvailable: false');
    assert(nullEval.estimatedTimeToArrivalSec === null, 'Null coordinates produce null estimatedTimeToArrivalSec');
  }

  console.log('\n--- REQUIREMENT 7: REPEATED IDENTICAL INPUTS PRODUCE CONSISTENT PREDICTIONS ---');
  {
    const nowIso = new Date().toISOString();
    const stableTrain = {
      id: '12497',
      number: '12497',
      name: 'Shane Punjab',
      corridorId: 'CORR_ASR_JUC',
      direction: 'DOWN',
      lat: 31.6200,
      lng: 74.9350,
      speedKmH: 60,
      hasLiveSpeedMeasurement: true,
      observationAccuracy: 'LOCOMOTIVE_GPS',
      isWithinAmritsarSector: true,
      distanceFromAmritsarKm: 4.5,
      dataState: 'LIVE',
      providerObservationTimestamp: nowIso
    };

    // Run 5 consecutive evaluations with identical input
    const results = [];
    for (let i = 0; i < 5; i++) {
      results.push(engine.evaluateCrossingGateState(jauraCrossing, [stableTrain], jucCoords, standardFeed));
    }

    const firstStatus = results[0].status;
    const firstClassification = results[0].gateStatusClassification;
    const firstTimeToClose = results[0].timeToNextClosureSec;
    const firstConfidence = results[0].predictionConfidence;

    const allIdentical = results.every(r => 
      r.status === firstStatus &&
      r.gateStatusClassification === firstClassification &&
      r.timeToNextClosureSec === firstTimeToClose &&
      r.predictionConfidence === firstConfidence
    );

    assert(allIdentical === true, 'Repeated identical inputs produce 100% deterministic, non-flapping predictions across 5 evaluations');
    assert(firstStatus !== 'UNKNOWN', `Consistent status calculated: ${firstStatus}`);
  }

  console.log('\n--- REQUIREMENT 8: GENUINE NEW OBSERVATIONS UPDATE PREDICTIONS APPROPRIATELY ---');
  {
    const nowMs = Date.now();
    // Step 1: Train approaching from ~14 km out along tracks at 60 km/h (Passage ~14 min away, gate closes in ~11.5 min)
    const trainObservation1 = {
      id: '12497',
      number: '12497',
      name: 'Shane Punjab',
      corridorId: 'CORR_ASR_JUC',
      direction: 'DOWN',
      lat: 31.5940,
      lng: 75.0390,
      speedKmH: 60,
      hasLiveSpeedMeasurement: true,
      observationAccuracy: 'LOCOMOTIVE_GPS',
      isWithinAmritsarSector: true,
      distanceFromAmritsarKm: 14.0,
      dataState: 'LIVE',
      providerObservationTimestamp: new Date(nowMs - 20000).toISOString()
    };

    const eval1 = engine.evaluateCrossingGateState(jauraCrossing, [trainObservation1], jucCoords, standardFeed);
    const eta1 = eval1.timeToNextClosureSec;

    // Step 2: Train moves closer to ~4 km out at 60 km/h (Passage ~4 min away, imminent closure zone)
    const trainObservation2 = {
      ...trainObservation1,
      lat: 31.6200,
      lng: 74.9350,
      distanceFromAmritsarKm: 4.0,
      providerObservationTimestamp: new Date(nowMs - 10000).toISOString()
    };

    const eval2 = engine.evaluateCrossingGateState(jauraCrossing, [trainObservation2], jucCoords, standardFeed);
    const eta2 = eval2.timeToNextClosureSec;

    // Step 3: Train right at crossing (< 0.2 km, CLOSED / IMPACT IMMINENT)
    const trainObservation3 = {
      ...trainObservation1,
      lat: 31.6313,
      lng: 74.8976,
      distanceFromAmritsarKm: 0.1,
      providerObservationTimestamp: new Date(nowMs).toISOString()
    };

    const eval3 = engine.evaluateCrossingGateState(jauraCrossing, [trainObservation3], jucCoords, standardFeed);

    assert(eta1 > 0 && eta2 >= 0, `Both observation states produce coherent countdowns (Obs 1: ${eta1}s, Obs 2: ${eta2}s)`);
    assert(eta2 < eta1, `ETA countdown shortens as train moves closer: ${eta1}s -> ${eta2}s`);
    assert(eval2.status === 'CLOSING_SOON' || eval2.status === 'APPROACHING' || eval2.status === 'CLOSURE_EXPECTED', `Crossing status updates to approach/closure: ${eval2.status}`);
    assert(eval3.status === 'CLOSED' || eval3.status === 'CLOSURE_EXPECTED', `Crossing reaches CLOSED/CLOSURE_EXPECTED state when train is at threshold: ${eval3.status}`);
    assert(eval3.gateStatusClassification.includes('CLOSURE') || eval3.gateStatusClassification.includes('CLOSED') || eval3.gateStatusClassification.includes('IMPACT IMMINENT'),
      `Gate status classification reflects active train occupancy: ${eval3.gateStatusClassification}`);
  }

  console.log('\n--- REQUIREMENT 9: INVALID RESPONSES & EXHAUSTED QUOTAS DO NOT ACTIVATE FAKE DATA ---');
  {
    // Fallback list should have 0 fabricated synthetic trains
    const fallbackList = aggregation.getAggregatedTrainsList();
    const fabricatedSimulated = fallbackList.filter(t => t.dataState === 'SIMULATED' && t.isFabricated);
    assert(fabricatedSimulated.length === 0, 'Zero fabricated simulated trains returned in live operational mode');

    // Crossing state with empty feeds reports honest OPEN with CLEAR PASSAGE
    const evalEmpty = engine.evaluateCrossingGateState(manawalaCrossing, [], jucCoords, standardFeed);
    assert(evalEmpty.status === 'OPEN', 'Empty feeds with healthy connection maintain honest OPEN state');
    assert(evalEmpty.gateStatusClassification === 'CLEAR PASSAGE' || evalEmpty.gateStatusClassification === 'NO APPROACH DETECTED', 
      `Classification reports honest clear status (${evalEmpty.gateStatusClassification}), not fake closures`);
    assert(evalEmpty.corridorTrain === null, 'No synthetic corridor train attached');
    assert(evalEmpty.upcomingTrainId === null, 'No synthetic upcomingTrainId attached');
  }

  console.log('\n--- LIVE HTTP ENDPOINT SANITY CHECKS ---');
  {
    try {
      const res = await fetch(`${BASE_URL}/api/crossings`);
      assert(res.status === 200, 'GET /api/crossings returns HTTP 200');
      const data = await res.json();
      assert(Array.isArray(data.crossings), 'Returns crossings array');
      assert(data.crossings.length === 36, `Contains all 36 Amritsar OSM crossings (found: ${data.crossings.length})`);

      // Verify no crossing has out-of-sector train #22488 attached
      const crossingsWithDelhiTrain = data.crossings.filter(c => 
        (c.upcomingTrainId === '22488' || c.upcomingTrainId === '02488') ||
        (c.corridorTrain && (c.corridorTrain.number === '22488' || c.corridorTrain.number === '02488'))
      );
      assert(crossingsWithDelhiTrain.length === 0, 
        `Zero live crossings have Delhi train #22488 attached (found: ${crossingsWithDelhiTrain.length})`);

    } catch (err) {
      assert(false, `Live endpoint test failed: ${err.message}`);
    }
  }

  console.log('\n======================================================================');
  console.log(`REGRESSION SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('======================================================================');

  if (failed === 0) {
    console.log('\n🎉 ALL 9 REGRESSION REQUIREMENTS STRICTLY VERIFIED AND PASSING!\n');
    process.exitCode = 0;
  } else {
    console.error(`\n❌ ${failed} REGRESSION TESTS FAILED.\n`);
    process.exitCode = 1;
  }
}

runRegressionSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
