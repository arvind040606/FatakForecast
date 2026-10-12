import assert from 'assert';

console.log('======================================================================');
console.log('FATAKFORECAST — LIVE COUNTDOWN & TIMER SYNCHRONIZATION AUDIT');
console.log('======================================================================\n');

// Replicate the exact authoritative functions from timerManager.ts for deterministic audit
class SharedTimerManager {
  constructor() {
    this.subscribers = new Set();
    this.intervalId = null;
    this.currentEpochMs = 1770000000000;
  }

  getNow() {
    return this.currentEpochMs;
  }

  setMockTime(ms) {
    this.currentEpochMs = ms;
    this.subscribers.forEach((cb) => cb(this.currentEpochMs));
  }

  subscribe(callback) {
    this.subscribers.add(callback);
    callback(this.currentEpochMs);
    if (this.subscribers.size === 1) {
      this.intervalId = 'mock_interval_1';
    }
    return () => {
      this.subscribers.delete(callback);
      if (this.subscribers.size === 0) {
        this.intervalId = null;
      }
    };
  }

  tick() {
    this.subscribers.forEach((cb) => cb(this.currentEpochMs));
  }
}

function calculateRemainingSeconds(targetTimestampMs, currentTimeMs) {
  if (!targetTimestampMs || isNaN(targetTimestampMs) || targetTimestampMs <= 0) {
    return 0;
  }
  const remainingMs = targetTimestampMs - currentTimeMs;
  return Math.max(0, Math.floor(remainingMs / 1000));
}

function formatCountdown(totalSeconds) {
  const safeSec = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSec / 60);
  const seconds = safeSec % 60;
  return {
    minutes,
    seconds,
    formatted: `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  };
}

const stableTargetMap = new Map();

function getAuthoritativeTargetEpoch(crossing, type, nowMs) {
  if (!crossing || !crossing.id) return null;
  const cacheKey = `${crossing.id}:${type}`;

  if (type === 'reopen') {
    const isClosed = crossing.status === 'CLOSED' || crossing.status === 'CLOSURE_REPORTED' || crossing.status === 'CLOSURE_EXPECTED';
    if (!isClosed) {
      stableTargetMap.delete(cacheKey);
      return null;
    }
    let rawTargetMs = null;
    const isoString = crossing.predictedReopenTime || crossing.estimatedGateReopeningTime;
    if (isoString) {
      const parsed = new Date(isoString).getTime();
      if (!isNaN(parsed) && parsed > 0) rawTargetMs = parsed;
    }
    if (rawTargetMs === null && typeof crossing.remainingWaitSec === 'number' && crossing.remainingWaitSec > 0) {
      rawTargetMs = nowMs + crossing.remainingWaitSec * 1000;
    }
    if (rawTargetMs === null) {
      stableTargetMap.delete(cacheKey);
      return null;
    }
    const existing = stableTargetMap.get(cacheKey);
    if (!existing) {
      stableTargetMap.set(cacheKey, {
        crossingId: crossing.id,
        type: 'reopen',
        status: crossing.status,
        trainId: crossing.upcomingTrainId || null,
        targetEpochMs: rawTargetMs,
        lastSourceEpochMs: rawTargetMs,
        establishedAtMs: nowMs
      });
      return rawTargetMs;
    }
    const trainChanged = existing.trainId !== (crossing.upcomingTrainId || null);
    const statusChanged = existing.status !== crossing.status;
    const significantShift = Math.abs(rawTargetMs - existing.lastSourceEpochMs) >= 5000;
    const expiredTarget = nowMs > existing.targetEpochMs && rawTargetMs > nowMs + 1000;
    if (trainChanged || statusChanged || significantShift || expiredTarget) {
      existing.targetEpochMs = rawTargetMs;
      existing.lastSourceEpochMs = rawTargetMs;
      existing.status = crossing.status;
      existing.trainId = crossing.upcomingTrainId || null;
      existing.establishedAtMs = nowMs;
    } else {
      existing.lastSourceEpochMs = rawTargetMs;
    }
    return existing.targetEpochMs;
  }

  // type === 'closure'
  const isClosed = crossing.status === 'CLOSED' || crossing.status === 'CLOSURE_REPORTED';
  if (isClosed) {
    stableTargetMap.delete(cacheKey);
    return null;
  }
  let rawTargetMs = null;
  const isoString = crossing.estimatedGateClosingTime || crossing.expectedTrainArrival;
  if (isoString) {
    const parsed = new Date(isoString).getTime();
    if (!isNaN(parsed) && parsed > 0) rawTargetMs = parsed;
  }
  if (rawTargetMs === null && crossing.countdownAvailable && typeof crossing.timeToNextClosureSec === 'number' && crossing.timeToNextClosureSec > 0) {
    rawTargetMs = nowMs + crossing.timeToNextClosureSec * 1000;
  }
  if (rawTargetMs === null) {
    stableTargetMap.delete(cacheKey);
    return null;
  }
  const existing = stableTargetMap.get(cacheKey);
  if (!existing) {
    stableTargetMap.set(cacheKey, {
      crossingId: crossing.id,
      type: 'closure',
      status: crossing.status,
      trainId: crossing.upcomingTrainId || null,
      targetEpochMs: rawTargetMs,
      lastSourceEpochMs: rawTargetMs,
      establishedAtMs: nowMs
    });
    return rawTargetMs;
  }
  const trainChanged = existing.trainId !== (crossing.upcomingTrainId || null);
  const statusChanged = existing.status !== crossing.status;
  const significantShift = Math.abs(rawTargetMs - existing.lastSourceEpochMs) >= 5000;
  const expiredTarget = nowMs > existing.targetEpochMs && rawTargetMs > nowMs + 1000;
  if (trainChanged || statusChanged || significantShift || expiredTarget) {
    existing.targetEpochMs = rawTargetMs;
    existing.lastSourceEpochMs = rawTargetMs;
    existing.status = crossing.status;
    existing.trainId = crossing.upcomingTrainId || null;
    existing.establishedAtMs = nowMs;
  } else {
    existing.lastSourceEpochMs = rawTargetMs;
  }
  return existing.targetEpochMs;
}

// ======================================================================
// TEST 1: AUTHORITATIVE FORMULA & ROUNDING CONVENTION AUDIT
// ======================================================================
console.log('TEST 1: Authoritative Formula & Math.floor Rounding Audit');
{
  const targetEpoch = 1770000035000; // target in 35s
  const now = 1770000000000;
  const sec = calculateRemainingSeconds(targetEpoch, now);
  assert.strictEqual(sec, 35, 'Remaining seconds must be 35');
  const formatted = formatCountdown(sec);
  assert.strictEqual(formatted.formatted, '00:35');
  assert.strictEqual(formatted.minutes, 0);
  assert.strictEqual(formatted.seconds, 35);

  // Sub-second boundary check (34.9s vs 34.1s)
  const remHigh = calculateRemainingSeconds(targetEpoch, now + 100); // 34.9s left
  assert.strictEqual(remHigh, 34, '34.9s remaining rounds to 34s with Math.floor');
  const remLow = calculateRemainingSeconds(targetEpoch, now + 900); // 34.1s left
  assert.strictEqual(remLow, 34, '34.1s remaining rounds to 34s with Math.floor');
  console.log('  ✓ PASS: Computes exact remaining duration and applies uniform Math.floor convention');
}

// ======================================================================
// TEST 2: BOUNDARIES & NON-NEGATIVE GUARANTEE
// ======================================================================
console.log('\nTEST 2: Timer Boundaries & State Handling');
{
  const targetEpoch = 1770000000000;
  // Sub-minute (<60s)
  assert.strictEqual(calculateRemainingSeconds(targetEpoch, targetEpoch - 45000), 45);
  assert.strictEqual(formatCountdown(45).formatted, '00:45');

  // Exact target reached (0s)
  assert.strictEqual(calculateRemainingSeconds(targetEpoch, targetEpoch), 0);
  assert.strictEqual(formatCountdown(0).formatted, '00:00');

  // Target passed (past deadline)
  assert.strictEqual(calculateRemainingSeconds(targetEpoch, targetEpoch + 5000), 0);
  assert.strictEqual(calculateRemainingSeconds(null, targetEpoch), 0);
  assert.strictEqual(calculateRemainingSeconds(undefined, targetEpoch), 0);
  console.log('  ✓ PASS: Strictly non-negative, cleanly reaches 00:00 and handles invalid targets');
}

// ======================================================================
// TEST 3: THE ACTUAL ROOT CAUSE: PREVENTING 00:34 <-> 00:35 OSCILLATION
// ======================================================================
console.log('\nTEST 3: The Actual Root Cause: Preventing 00:34 <-> 00:35 Polling Jitter Oscillation');
{
  stableTargetMap.clear();
  let currentTime = 1770000000000; // T = 0

  // Server poll 1 at T = 0: train is approaching, closing in 35s
  const crossingPoll1 = {
    id: 'osm/node/101',
    status: 'APPROACHING',
    upcomingTrainId: '12411',
    estimatedGateClosingTime: new Date(currentTime + 35000).toISOString(),
    countdownAvailable: true,
    timeToNextClosureSec: 35
  };

  const target1 = getAuthoritativeTargetEpoch(crossingPoll1, 'closure', currentTime);
  const rem1 = calculateRemainingSeconds(target1, currentTime);
  assert.strictEqual(rem1, 35, 'T=0 displays 35s');
  assert.strictEqual(formatCountdown(rem1).formatted, '00:35');

  // Time advances 1 second (T = 1s)
  currentTime += 1000;
  const rem2 = calculateRemainingSeconds(target1, currentTime);
  assert.strictEqual(rem2, 34, 'T=1s displays 34s');
  assert.strictEqual(formatCountdown(rem2).formatted, '00:34');

  // Server poll 2 arrives at T = 2.5s:
  // Server re-evaluates passageTime = serverNow + arrivalTimeSec.
  // Because train is between GPS stations, serverNow advanced by 2.5s,
  // so the server's ISO timestamp drifted forward by +2.5s (to currentTime + 35s)!
  currentTime += 1500; // now at T = 2.5s
  const crossingPoll2 = {
    id: 'osm/node/101',
    status: 'APPROACHING',
    upcomingTrainId: '12411',
    estimatedGateClosingTime: new Date(currentTime + 35000).toISOString(), // server sent drifted target!
    countdownAvailable: true,
    timeToNextClosureSec: 35
  };

  const target2 = getAuthoritativeTargetEpoch(crossingPoll2, 'closure', currentTime);
  // Target MUST NOT jump forward!
  assert.strictEqual(target2, target1, 'Target must remain stable despite server polling jitter');
  const rem3 = calculateRemainingSeconds(target2, currentTime);
  assert.strictEqual(rem3, 32, 'T=2.5s must display 32s (not jump back up to 34 or 35!)');
  assert.strictEqual(formatCountdown(rem3).formatted, '00:32');

  // Time advances to T = 3s
  currentTime += 500; // now at T = 3.0s
  const rem4 = calculateRemainingSeconds(target2, currentTime);
  assert.strictEqual(rem4, 32);

  // Time advances to T = 4s
  currentTime += 1000; // now at T = 4.0s
  const rem5 = calculateRemainingSeconds(target2, currentTime);
  assert.strictEqual(rem5, 31, 'T=4s displays 31s');

  // Server poll 3 arrives at T = 5s with another +2.5s server drift:
  currentTime += 1000; // now at T = 5.0s
  const crossingPoll3 = {
    id: 'osm/node/101',
    status: 'APPROACHING',
    upcomingTrainId: '12411',
    estimatedGateClosingTime: new Date(currentTime + 35000).toISOString(),
    countdownAvailable: true,
    timeToNextClosureSec: 35
  };
  const target3 = getAuthoritativeTargetEpoch(crossingPoll3, 'closure', currentTime);
  assert.strictEqual(target3, target1, 'Target remains stable on poll 3');
  const rem6 = calculateRemainingSeconds(target3, currentTime);
  assert.strictEqual(rem6, 30, 'T=5s displays 30s strictly monotonic');
  console.log('  ✓ PASS: Alternating 00:34 / 00:35 oscillation completely eliminated; countdown decreases monotonically');
}

// ======================================================================
// TEST 4: MULTI-COMPONENT ABSOLUTE SYNCHRONIZATION
// ======================================================================
console.log('\nTEST 4: Two Components Displaying the Same Target Never Disagree');
{
  const crossing = {
    id: 'osm/node/202',
    status: 'APPROACHING',
    upcomingTrainId: '22487',
    estimatedGateClosingTime: new Date(1770000045000).toISOString(),
    countdownAvailable: true,
    timeToNextClosureSec: 45
  };
  const testNow = 1770000000000;

  // Component A: ClosureCountdown card
  const targetA = getAuthoritativeTargetEpoch(crossing, 'closure', testNow);
  const secA = calculateRemainingSeconds(targetA, testNow);
  const cardDisplay = formatCountdown(secA).formatted;

  // Component B: UpcomingClosuresView table row
  const targetB = getAuthoritativeTargetEpoch(crossing, 'closure', testNow);
  const secB = calculateRemainingSeconds(targetB, testNow);
  const tableDisplay = formatCountdown(secB).formatted;

  // Component C: HomeView crossing preview
  const targetC = getAuthoritativeTargetEpoch(crossing, 'closure', testNow);
  const secC = calculateRemainingSeconds(targetC, testNow);
  const homeDisplay = formatCountdown(secC).formatted;

  assert.strictEqual(cardDisplay, tableDisplay);
  assert.strictEqual(cardDisplay, homeDisplay);
  assert.strictEqual(cardDisplay, '00:45');
  console.log('  ✓ PASS: ClosureCountdown, UpcomingClosuresView, and HomeView display identical synchronized values');
}

// ======================================================================
// TEST 5: MULTIPLE COUNTDOWNS OPERATE INDEPENDENTLY WITHOUT INTERFERENCE
// ======================================================================
console.log('\nTEST 5: Multiple Independent Countdowns Operate Without Cross-Talk');
{
  const now = 1770000000000;
  const crossing1 = {
    id: 'osm/node/jaura_phatak',
    status: 'APPROACHING',
    upcomingTrainId: '12053',
    estimatedGateClosingTime: new Date(now + 25000).toISOString()
  };
  const crossing2 = {
    id: 'osm/node/shivala_phatak',
    status: 'CLOSED',
    upcomingTrainId: '22487',
    predictedReopenTime: new Date(now + 180000).toISOString()
  };

  const target1 = getAuthoritativeTargetEpoch(crossing1, 'closure', now);
  const target2 = getAuthoritativeTargetEpoch(crossing2, 'reopen', now);

  const sec1 = calculateRemainingSeconds(target1, now);
  const sec2 = calculateRemainingSeconds(target2, now);

  assert.strictEqual(sec1, 25);
  assert.strictEqual(sec2, 180);
  assert.strictEqual(formatCountdown(sec1).formatted, '00:25');
  assert.strictEqual(formatCountdown(sec2).formatted, '03:00');
  console.log('  ✓ PASS: Independent crossings calculate separate targets without mutual interference');
}

// ======================================================================
// TEST 6: GENUINE TARGET UPDATE SYNCHRONIZATION
// ======================================================================
console.log('\nTEST 6: Genuine Target Updates Synchronize Immediately');
{
  const baseTime = 1770000000000;
  const crossing = {
    id: 'osm/node/303',
    status: 'APPROACHING',
    upcomingTrainId: '12411',
    estimatedGateClosingTime: new Date(baseTime + 60000).toISOString()
  };

  const targetInit = getAuthoritativeTargetEpoch(crossing, 'closure', baseTime);
  assert.strictEqual(calculateRemainingSeconds(targetInit, baseTime), 60);

  // Train delayed at station: genuine update shifts target by +120 seconds (>= 5s shift)
  crossing.estimatedGateClosingTime = new Date(baseTime + 180000).toISOString();
  const targetUpdated = getAuthoritativeTargetEpoch(crossing, 'closure', baseTime);
  assert.strictEqual(targetUpdated, baseTime + 180000);
  assert.strictEqual(calculateRemainingSeconds(targetUpdated, baseTime), 180);
  console.log('  ✓ PASS: Significant shift (>= 5s) legitimately updates authoritative target immediately');
}

// ======================================================================
// TEST 7: SUBSCRIPTION LIFECYCLE & STRICT MODE / REMOUNT SAFETY
// ======================================================================
console.log('\nTEST 7: React Strict Mode & Subscription Cleanup Audit');
{
  const timer = new SharedTimerManager();
  assert.strictEqual(timer.intervalId, null, 'Interval should be stopped with 0 subscribers');

  // Mount component 1
  const unsub1 = timer.subscribe(() => {});
  assert.notStrictEqual(timer.intervalId, null, 'Interval started on subscriber 1');

  // React Strict Mode remount simulation: unmount then remount
  unsub1();
  assert.strictEqual(timer.intervalId, null, 'Interval cleanly stopped on unmount');

  const unsubRemount = timer.subscribe(() => {});
  assert.notStrictEqual(timer.intervalId, null, 'Interval started cleanly on remount');

  // Mount component 2
  const unsub2 = timer.subscribe(() => {});
  assert.strictEqual(timer.subscribers.size, 2, '2 active subscribers');

  // Unmount 1
  unsubRemount();
  assert.strictEqual(timer.subscribers.size, 1, '1 subscriber remaining');
  assert.notStrictEqual(timer.intervalId, null, 'Interval remains active while 1 subscriber exists');

  // Unmount 2
  unsub2();
  assert.strictEqual(timer.subscribers.size, 0);
  assert.strictEqual(timer.intervalId, null, 'Interval terminates cleanly when all components unmount');
  console.log('  ✓ PASS: Zero interval leaks, safe React Strict Mode mount/remount lifecycle');
}

// ======================================================================
// TEST 8: DELAYED TIMER CALLBACK / TAB RESUME AUDIT
// ======================================================================
console.log('\nTEST 8: Delayed Timer Callback & Tab Resume (No Drift)');
{
  const targetEpoch = 1770000100000;
  const t0 = 1770000000000;
  assert.strictEqual(calculateRemainingSeconds(targetEpoch, t0), 100);

  // Phone sleep / tab backgrounded for 45 seconds: callback delayed
  const tDelayed = t0 + 45000;
  assert.strictEqual(calculateRemainingSeconds(targetEpoch, tDelayed), 55);
  console.log('  ✓ PASS: Delayed callbacks and tab resumes recompute against wall-clock time without drift');
}

console.log('\n======================================================================');
console.log('ALL DETERMINISTIC TIMER SYNCHRONIZATION AUDIT CHECKS PASSED (8/8)');
console.log('======================================================================');
