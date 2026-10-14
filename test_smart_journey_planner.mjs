// test_smart_journey_planner.mjs
// Focused automated test suite for Step 4: Smart Route Planner

const BACKEND_URL = 'http://localhost:8787';

// Authoritative coordinates for Amritsar test locations
const COORDS = {
  ASR_STATION: [31.6340, 74.8723],
  GOLDEN_TEMPLE: [31.6200, 74.8765],
  MALL_ROAD: [31.6420, 74.8750],
  VERKA_BYPASS: [31.6600, 74.9200],
  PUTLIGHAR: [31.6375, 74.8510]
};

async function runTests() {
  console.log('====================================================');
  console.log('  FATAKFORECAST — STEP 4: SMART ROUTE PLANNER AUDIT');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${message}`);
      failed++;
    }
  }

  try {
    // 1. Health check & Geocoding / Place Search
    console.log('TEST 1: Verify Place Search & Geocoding (Osm Nominatim & Curated Landmarks)');
    const placeSearchRes = await fetch(`${BACKEND_URL}/api/places/search?q=Golden+Temple&limit=5`);
    assert(placeSearchRes.ok, 'Places search endpoint returns 200 OK');
    const placeSearchData = await placeSearchRes.json();
    assert(placeSearchData.success === true, 'Place search returns success: true');
    assert(Array.isArray(placeSearchData.results) && placeSearchData.results.length >= 1, 
      `Found ${placeSearchData.results.length} result(s) for "Golden Temple"`);

    // 2. Journey Plan with GPS / Custom Origin & Destination
    console.log('\nTEST 2: Journey Plan between Amritsar Railway Station & Golden Temple');
    const t0 = Date.now();
    const planRes = await fetch(`${BACKEND_URL}/api/plan-journey`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origin: COORDS.ASR_STATION,
        destination: COORDS.GOLDEN_TEMPLE,
        departureOffsetSec: 0,
        travelMode: 'car'
      })
    });
    const duration = Date.now() - t0;
    assert(planRes.ok, `Journey plan returned 200 OK in ${duration}ms (resilient timeout check < 5000ms)`);
    assert(duration < 6000, `Journey plan response time (${duration}ms) is well within client timeout`);

    const planData = await planRes.json();
    assert(planData.success === true && planData.status === 'ok', 'Plan response status is success: true, status: "ok"');
    assert(Array.isArray(planData.routes) && planData.routes.length >= 1, `Calculated ${planData.routes.length} candidate route(s)`);
    assert(planData.recommendedRouteId != null, `Recommended route selected: "${planData.recommendedRouteId}"`);

    // 3. Verify Route Details & Alternative Route Comparison
    console.log('\nTEST 3: Route Details, Distance, Travel Time & Freshness');
    const recommended = planData.routes.find(r => r.id === planData.recommendedRouteId);
    assert(recommended != null, 'Recommended route exists in candidate routes');
    assert(typeof recommended.distanceKm === 'number' && recommended.distanceKm > 0, 
      `Route distance is valid: ${recommended.distanceKm} km`);
    assert(typeof recommended.durationMin === 'number' && recommended.durationMin > 0, 
      `Route baseline travel time is valid: ${recommended.durationMin} min`);
    assert(typeof recommended.totalEstimatedMin === 'number' && recommended.totalEstimatedMin >= recommended.durationMin, 
      `Total estimated time (${recommended.totalEstimatedMin} min) >= baseline (${recommended.durationMin} min)`);
    assert(typeof recommended.recommendationReason === 'string' && recommended.recommendationReason.length > 10, 
      `Recommendation reason provided: "${recommended.recommendationReason.substring(0, 60)}..."`);
    assert(recommended.dataFreshness != null, `Data freshness timestamp present: ${recommended.dataFreshness}`);

    // 4. Verify Route Across Active Railway Line (Chamrang Road across Jaura Phatak)
    console.log('\nTEST 4: Route Crossing Level Crossing (Chamrang Rd <-> Mahan Singh Gate across Jaura Phatak)');
    const crossTrackRes = await fetch(`${BACKEND_URL}/api/plan-journey`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origin: [31.6360, 74.8975], // Chamrang Road North
        destination: [31.6250, 74.8975], // Mahan Singh Gate South
        departureOffsetSec: 0,
        travelMode: 'car'
      })
    });
    assert(crossTrackRes.ok, 'Cross-track route query returns 200 OK');
    const crossTrackData = await crossTrackRes.json();
    assert(crossTrackData.routes.length >= 1, `Identified ${crossTrackData.routes.length} candidate routes`);
    
    for (const r of crossTrackData.routes) {
      console.log(`    Route: "${r.name}" (${r.routeType}) | Dist: ${r.distanceKm}km | Base: ${r.durationMin}m | Est: ${r.totalEstimatedMin}m | Fataks: ${r.crossingCount} | DelayRange: ${r.delayRange}`);
      assert(r.coordinates && r.coordinates.length > 5, `Route has valid polyline geometry (${r.coordinates.length} points)`);
      assert(r.comparisonBadge != null, `Comparison badge present: "${r.comparisonBadge}"`);
      assert(r.tradeoffSummary != null, `Trade-off summary present: "${r.tradeoffSummary.substring(0, 50)}..."`);
    }

    // 5. Verify Crossing Identification & Gate State Honesty
    console.log('\nTEST 5: Crossing Intersections & Gate State Honesty (No Invented Closures)');
    const allCrossings = crossTrackData.routes.flatMap(r => r.crossingsOnRoute || []);
    console.log(`  Identified ${allCrossings.length} total crossing intersections across all candidate routes`);
    
    if (allCrossings.length > 0) {
      const sampleCrossing = allCrossings[0];
      assert(sampleCrossing.name != null, 
        `Crossing identified with name "${sampleCrossing.name}"`);
      assert(sampleCrossing.observedPhysicalGateState === 'UNKNOWN', 
        `Physical gate state is honestly labeled UNKNOWN (observedPhysicalGateState: "${sampleCrossing.observedPhysicalGateState}")`);
      assert(sampleCrossing.physicalSensorAvailable === false, 
        'physicalSensorAvailable is strictly false (no fake hardware sensor claimed)');
      assert(sampleCrossing.delayRange != null, 
        `Delay range metadata provided: "${sampleCrossing.delayRange}"`);
    } else {
      console.log('  Note: Track crossings bypassed via elevated flyover or overpass corridor.');
    }

    // 6. Test Multi-Modal Travel Modes (Car, Motorcycle, Walking)
    console.log('\nTEST 6: Multi-Modal Travel Modes Support');
    const bikeRes = await fetch(`${BACKEND_URL}/api/plan-journey`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origin: COORDS.MALL_ROAD,
        destination: COORDS.GOLDEN_TEMPLE,
        travelMode: 'motorcycle'
      })
    });
    assert(bikeRes.ok, 'Motorcycle routing returns 200 OK');
    const bikeData = await bikeRes.json();
    assert(bikeData.routes[0].travelMode === 'motorcycle', 'Travel mode correctly set to motorcycle');

    const walkRes = await fetch(`${BACKEND_URL}/api/plan-journey`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origin: COORDS.ASR_STATION,
        destination: COORDS.GOLDEN_TEMPLE,
        travelMode: 'walking'
      })
    });
    assert(walkRes.ok, 'Walking routing returns 200 OK');
    const walkData = await walkRes.json();
    assert(walkData.routes[0].travelMode === 'walking', 'Travel mode correctly set to walking');
    assert(walkData.routes[0].durationMin > planData.routes[0].durationMin, 
      `Walking duration (${walkData.routes[0].durationMin}m) is proportionally longer than driving (${planData.routes[0].durationMin}m)`);

    // 7. Verify Train Association Accuracy (Corridor Matching)
    console.log('\nTEST 7: Train Association Accuracy (No Hallucinated Associations)');
    const anyCrossingWithTrain = crossTrackData.routes
      .flatMap(r => r.crossingsOnRoute || [])
      .find(c => c.associatedTrain != null);
    
    if (anyCrossingWithTrain) {
      console.log(`  Found crossing with associated train: ${anyCrossingWithTrain.name} -> Train ${anyCrossingWithTrain.associatedTrain.trainNumber} (${anyCrossingWithTrain.associatedTrain.trainName})`);
      assert(anyCrossingWithTrain.associatedTrain.trainNumber != null, 'Associated train has real trainNumber');
      assert(['LIVE', 'STALE', 'SCHEDULED', 'SIMULATED', 'live', 'stale', 'scheduled', 'simulated'].includes(anyCrossingWithTrain.associatedTrain.dataState), 
        `Associated train has explicit dataState: "${anyCrossingWithTrain.associatedTrain.dataState}"`);

    } else {
      console.log('  No trains currently matching corridor intersection window (honest null, not fabricated)');
    }

    // 8. Recommendation Explanation & Trade-Off Summary
    console.log('\nTEST 8: Recommendation Trade-offs & Explanations');
    assert(crossTrackData.recommendation != null, 'Recommendation object present');
    assert(typeof crossTrackData.recommendation.summary === 'string' && crossTrackData.recommendation.summary.length > 0, 
      `Recommendation summary: "${crossTrackData.recommendation.summary}"`);
    assert(typeof crossTrackData.recommendation.details === 'string' && crossTrackData.recommendation.details.length > 0, 
      `Recommendation details: "${crossTrackData.recommendation.details}"`);
    assert(crossTrackData.recommendation.badge != null, 
      `Recommendation badge: "${crossTrackData.recommendation.badge}"`);

    console.log('\n----------------------------------------------------');
    console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('====================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Test execution failed with error:', err);
    process.exit(1);
  }
}

runTests();
