import assert from 'assert';
import fs from 'fs';

console.log('======================================================================');
console.log('FATAKFORECAST — TIMER REFRESH & PERSISTENCE REGRESSION AUDIT');
console.log('======================================================================\n');

const crossings = JSON.parse(fs.readFileSync('./backend/amritsar_crossings_osm.json', 'utf8'));
const corridors = JSON.parse(fs.readFileSync('./backend/amritsar_corridors_osm.json', 'utf8'));
const { TrainDetectionEngine } = await import('./backend/trainDetectionEngine.js');
const engine = new TrainDetectionEngine('test_key');

const kEast = crossings.find(c => c.name.includes('Kathunangal East'));
const corrPtk = corridors.find(c => c.id === 'CORR_ASR_PTK');

const approachingTrain = {
  id: '54614',
  number: '54614',
  status: 'IN_TRANSIT',
  corridorId: 'CORR_ASR_PTK',
  direction: 'DOWN',
  lat: 32.1469,
  lng: 75.4678,
  speedKmH: 45,
  hasLiveSpeedMeasurement: false,
  isWithinAmritsarSector: true,
  dataState: 'LIVE'
};

const feedContext = { isFeedFresh: true, feedStatus: 'CONNECTED' };

// TEST 1: APPROACHING COUNTDOWN PRESERVED ACROSS PAGE REFRESH
console.log('TEST 1: Approaching Countdown Must Not Reset on Refresh');
{
  const evalInitial = engine.evaluateCrossingGateState(kEast, [approachingTrain], corrPtk.coordinates, feedContext);
  assert(evalInitial.timeToNextClosureSec > 0, 'Initial approach countdown generated');
  assert(evalInitial.estimatedGateClosingTime, 'Estimated gate closing time generated');
  
  const initialCloseIso = evalInitial.estimatedGateClosingTime;
  const initialTimeToClose = evalInitial.timeToNextClosureSec;

  // Simulate storing crossing on server
  Object.assign(kEast, evalInitial);

  // User waits 4 seconds and REFRESHES the page:
  await new Promise(r => setTimeout(r, 4000));

  const evalAfterRefresh = engine.evaluateCrossingGateState(kEast, [approachingTrain], corrPtk.coordinates, feedContext);

  assert.strictEqual(
    evalAfterRefresh.estimatedGateClosingTime,
    initialCloseIso,
    'Closing timestamp must remain 100% identical after refresh'
  );

  const elapsedSec = Math.round((new Date(evalAfterRefresh.calculationTimestamp).getTime() - new Date(evalInitial.calculationTimestamp).getTime()) / 1000);
  assert(
    evalAfterRefresh.timeToNextClosureSec <= initialTimeToClose - elapsedSec + 1 &&
    evalAfterRefresh.timeToNextClosureSec >= initialTimeToClose - elapsedSec - 1,
    `Countdown must decrease by elapsed time (${elapsedSec}s), not reset! Was ${initialTimeToClose}s, now ${evalAfterRefresh.timeToNextClosureSec}s`
  );
  console.log(`  ✓ PASS: Initial: ${initialTimeToClose}s -> Waited ${elapsedSec}s -> Refreshed: ${evalAfterRefresh.timeToNextClosureSec}s (Target: ${initialCloseIso})`);
}

// TEST 2: CLOSED WAIT COUNTDOWN PRESERVED ACROSS PAGE REFRESH
console.log('\nTEST 2: Closed Gate Wait Countdown Must Not Reset on Refresh');
{
  const closedCrossing = {
    ...kEast,
    status: 'CLOSED',
    upcomingTrainId: '12411',
    expectedTrainArrival: new Date(Date.now() + 60000).toISOString(),
    estimatedGateClosingTime: new Date(Date.now() - 60000).toISOString(),
    predictedReopenTime: new Date(Date.now() + 180000).toISOString(),
    remainingWaitSec: 180
  };
  const traversingTrain = {
    id: '12411',
    number: '12411',
    status: 'IN_TRANSIT',
    corridorId: 'CORR_ASR_PTK',
    direction: 'DOWN',
    lat: 31.76, // near Kathunangal
    lng: 75.02,
    speedKmH: 45,
    hasLiveSpeedMeasurement: false,
    isWithinAmritsarSector: true,
    dataState: 'LIVE'
  };

  const evalClosed1 = engine.evaluateCrossingGateState(closedCrossing, [traversingTrain], corrPtk.coordinates, feedContext);
  assert.strictEqual(evalClosed1.status, 'CLOSED', 'Gate must be closed for traversing train');
  assert(evalClosed1.remainingWaitSec > 0, 'Gate must have remainingWaitSec');
  
  const initialReopenIso = evalClosed1.predictedReopenTime;
  const initialWaitSec = evalClosed1.remainingWaitSec;

  Object.assign(closedCrossing, evalClosed1);

  // User waits 3 seconds and REFRESHES the page:
  await new Promise(r => setTimeout(r, 3000));

  const evalClosedAfterRefresh = engine.evaluateCrossingGateState(closedCrossing, [traversingTrain], corrPtk.coordinates, feedContext);

  assert.strictEqual(
    evalClosedAfterRefresh.predictedReopenTime,
    initialReopenIso,
    'Reopen timestamp must remain 100% identical after refresh'
  );

  const elapsedSec = Math.round((new Date(evalClosedAfterRefresh.calculationTimestamp).getTime() - new Date(evalClosed1.calculationTimestamp).getTime()) / 1000);
  assert(
    evalClosedAfterRefresh.remainingWaitSec <= initialWaitSec - elapsedSec + 1 &&
    evalClosedAfterRefresh.remainingWaitSec >= initialWaitSec - elapsedSec - 1,
    `Remaining wait must decrease by elapsed time (${elapsedSec}s), not reset! Was ${initialWaitSec}s, now ${evalClosedAfterRefresh.remainingWaitSec}s`
  );
  console.log(`  ✓ PASS: Initial wait: ${initialWaitSec}s -> Waited ${elapsedSec}s -> Refreshed: ${evalClosedAfterRefresh.remainingWaitSec}s (Reopen: ${initialReopenIso})`);
}

console.log('\n======================================================================');
console.log('ALL REFRESH & PERSISTENCE REGRESSION CHECKS PASSED (2/2)');
console.log('======================================================================');
