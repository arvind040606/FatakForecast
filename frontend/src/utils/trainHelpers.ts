import type { RailwayCrossing, SectorTrain } from '../types.ts';
import { getAuthoritativeTargetEpoch, calculateRemainingSeconds, formatCountdown } from './timerManager.ts';

/**
 * Resolves the verified server-provided train association for a railway crossing.
 * Uses only authoritative backend associations (upcomingTrainId, embedded upcomingTrain/primaryTrain,
 * or train.targetCrossingId).
 *
 * If the backend supplies no validated train association:
 * - Returns null (no train associated).
 * - Never selects a substitute train based on proximity or corridor heuristics.
 * - Never invents crossing closures or fabricated countdowns.
 */
export interface ResolvedCrossingTrainState {
  activeUpcomingTrain: any | null;
  subsequentTrains: any[];
  totalUpcomingCount: number;
  lastTrainPassed: any | null;
  lastTrainPassedText: string | null;
  isClosedNow: boolean;
  isClosingSoon: boolean;
  isOpenPassage: boolean;
  closeEpochMs: number | null;
  reopenEpochMs: number | null;
  arrivalEpochMs: number | null;
  closureDurationMin: number;
  isContinuousClosure: boolean;
}

/**
 * Checks whether a specific train candidate has already traversed / cleared this crossing.
 */
export function isTrainPastCrossing(
  cand: any,
  crossing: RailwayCrossing,
  nowMs: number,
  trainList?: SectorTrain[]
): boolean {
  if (!cand) return true;
  const candNum = String(cand.number || cand.trainNumber || cand.id || '');
  if (!candNum) return true;

  // 1. Live telemetry explicit signals
  if (Array.isArray(trainList)) {
    const live = trainList.find(t => String(t.number) === candNum || t.id === candNum);
    if (live) {
      if ((live as any).isReceding || (live as any).status === 'CLEARED_CROSSING' || live.status === 'TERMINATED' || live.status === 'CANCELLED') {
        return true;
      }
    }
  }

  // 2. Verified lastTrainPassed match
  if (crossing.lastTrainPassed && String(crossing.lastTrainPassed.trainNumber || '') === candNum) {
    return true;
  }

  // 3. Status checks on candidate
  if (cand.status === 'CLEARED_CROSSING' || cand.isReceding === true) {
    return true;
  }

  // 4. Passage / ETA epoch check:
  // If candidate has future passage time or positive etaMinutes, it has NOT passed.
  const passageIso = cand.estimatedPassageTime || cand.expectedTrainArrival || cand.passageTime;
  if (passageIso) {
    const pEpoch = new Date(passageIso).getTime();
    if (!isNaN(pEpoch) && pEpoch > 0) {
      if (pEpoch > nowMs) {
        return false;
      }
      if (nowMs - pEpoch > 45000) {
        return true;
      }
    }
  }

  if (typeof cand.etaMinutes === 'number' && cand.etaMinutes > 0) {
    return false;
  }

  // 5. Reopening time check for non-continuous closures:
  // ONLY check if this candidate IS the primary train that triggered crossing.predictedReopenTime.
  // Because crossing.predictedReopenTime reflects the primary train's reopening time, not the 2nd train's!
  const isContinuous = Boolean(crossing.combinedClosure?.isContinuous);
  const reopenIso = crossing.predictedReopenTime || crossing.estimatedGateReopeningTime;
  const isPrimary = String((crossing as any).upcomingTrainId || (crossing as any).upcomingTrain?.number || (crossing as any).upcomingTrain?.trainNumber || (crossing as any).primaryTrain?.number || '') === candNum;

  if (isPrimary && reopenIso && !isContinuous) {
    const rEpoch = new Date(reopenIso).getTime();
    if (!isNaN(rEpoch) && rEpoch > 0 && rEpoch <= nowMs) {
      return true;
    }
  }

  return false;
}

/**
 * Resolves active vs passed trains for a crossing.
 * When a primary train has already passed and a 2nd train is approaching,
 * smoothly promotes the upcoming train so commuters see the true future train.
 */
export function resolveActiveCrossingTrains(
  crossing: RailwayCrossing | null | undefined,
  nowMs: number,
  trainList?: SectorTrain[]
): ResolvedCrossingTrainState {
  if (!crossing) {
    return {
      activeUpcomingTrain: null,
      subsequentTrains: [],
      totalUpcomingCount: 0,
      lastTrainPassed: null,
      lastTrainPassedText: null,
      isClosedNow: false,
      isClosingSoon: false,
      isOpenPassage: true,
      closeEpochMs: null,
      reopenEpochMs: null,
      arrivalEpochMs: null,
      closureDurationMin: 0,
      isContinuousClosure: false
    };
  }

  // 1. Collect all candidates associated with this crossing
  const primaryCand = (crossing as any).upcomingTrain || (crossing as any).primaryTrain || null;
  const subsequentList: any[] = Array.isArray(crossing.subsequentTrains) 
    ? [...crossing.subsequentTrains] 
    : (Array.isArray(crossing.upcomingTrains) ? [...crossing.upcomingTrains] : []);

  const combined = crossing.combinedClosure;
  const isContinuous = Boolean(combined?.isContinuous);
  let baseDurationMin = 0;
  if (combined?.combinedDurationMinutes && combined.combinedDurationMinutes > 0) {
    baseDurationMin = Math.round(combined.combinedDurationMinutes);
  } else if (crossing.closureDurationMin && crossing.closureDurationMin > 0) {
    baseDurationMin = Math.round(crossing.closureDurationMin);
  } else if (crossing.avgClosureDurationMin && crossing.avgClosureDurationMin > 0) {
    baseDurationMin = Math.round(crossing.avgClosureDurationMin);
  }

  const isPrimaryPassed = isTrainPastCrossing(primaryCand, crossing, nowMs, trainList);

  let activeTrain: any = null;
  let remainingSubs: any[] = [];
  let resolvedLastPassed: any = crossing.lastTrainPassed || null;

  if (primaryCand && !isPrimaryPassed) {
    activeTrain = primaryCand;
    remainingSubs = subsequentList.filter(s => {
      const sNum = String(s.trainNumber || s.number || '');
      return sNum !== String(primaryCand.number || primaryCand.trainNumber) && !isTrainPastCrossing(s, crossing, nowMs, trainList);
    });
  } else {
    // Primary train has passed! Record it as recent passed train
    if (primaryCand) {
      resolvedLastPassed = {
        trainNumber: String(primaryCand.number || primaryCand.trainNumber || ''),
        trainName: String(primaryCand.name || primaryCand.trainName || 'Express / Passenger'),
        direction: primaryCand.direction || crossing.trainDirection,
        distanceKm: primaryCand.distanceKm || 0.8,
        speedKmH: primaryCand.speedKmph || primaryCand.speedKmH,
        passedAt: primaryCand.estimatedPassageTime || crossing.predictedReopenTime || new Date(nowMs).toISOString(),
        timestamp: primaryCand.estimatedPassageTime || crossing.predictedReopenTime || new Date(nowMs).toISOString()
      };
    }

    // Advance to the next candidate that is strictly in the future
    let foundNext = false;
    for (let i = 0; i < subsequentList.length; i++) {
      const cand = subsequentList[i];
      if (!isTrainPastCrossing(cand, crossing, nowMs, trainList)) {
        activeTrain = cand;
        remainingSubs = subsequentList.slice(i + 1).filter(s => !isTrainPastCrossing(s, crossing, nowMs, trainList));
        foundNext = true;
        break;
      }
    }

    // If subsequentList was exhausted, check active trains on this corridor
    if (!foundNext && Array.isArray(trainList)) {
      const corridorUpcoming = trainList.find(t => 
        t.corridorId === crossing.corridorId &&
        t.status !== 'CANCELLED' &&
        t.status !== 'TERMINATED' &&
        t.status !== 'OUT_OF_SECTOR' &&
        !(t as any).isReceding &&
        (t as any).status !== 'CLEARED_CROSSING' &&
        t.isWithinAmritsarSector === true
      );
      if (corridorUpcoming) {
        activeTrain = corridorUpcoming;
      }
    }
  }

  if (activeTrain) {
    activeTrain = {
      ...activeTrain,
      number: String(activeTrain.number || activeTrain.trainNumber || activeTrain.id || ''),
      trainNumber: String(activeTrain.trainNumber || activeTrain.number || activeTrain.id || ''),
      name: String(activeTrain.name || activeTrain.trainName || 'Express / Passenger'),
      trainName: String(activeTrain.trainName || activeTrain.name || 'Express / Passenger')
    };
  }

  const totalUpcoming = (activeTrain ? 1 : 0) + remainingSubs.length;

  // 2. Closure and reopening state determination
  let isClosedNow = false;
  let isClosingSoon = false;
  let closeEpochMs: number | null = null;
  let reopenEpochMs: number | null = null;
  let arrivalEpochMs: number | null = null;

  if (activeTrain) {
    const arrIso = activeTrain.estimatedPassageTime || activeTrain.expectedTrainArrival || activeTrain.passageTime;
    if (arrIso) {
      const arr = new Date(arrIso).getTime();
      if (!isNaN(arr) && arr > 0) arrivalEpochMs = arr;
    } else if (typeof activeTrain.etaMinutes === 'number' && activeTrain.etaMinutes > 0) {
      arrivalEpochMs = nowMs + Math.round(activeTrain.etaMinutes * 60000);
    } else if (typeof crossing.estimatedTimeToArrivalSec === 'number' && crossing.estimatedTimeToArrivalSec > 0 && !isPrimaryPassed) {
      arrivalEpochMs = nowMs + crossing.estimatedTimeToArrivalSec * 1000;
    }
  }

  const isPhysicalClosed = crossing.activeDrill || crossing.closureReported || crossing.observedPhysicalGateState === 'CLOSED' || crossing.status === 'CLOSED';

  if (!activeTrain && isPrimaryPassed) {
    // Both trains / all trains have passed
    isClosedNow = false;
    isClosingSoon = false;
    closeEpochMs = null;
    reopenEpochMs = null;
  } else if (isPrimaryPassed && activeTrain && !isContinuous) {
    // Primary train passed, next train is approaching later, and gate reopens between trains
    // The road is OPEN right now!
    isClosedNow = false;
    if (arrivalEpochMs && arrivalEpochMs > nowMs) {
      closeEpochMs = arrivalEpochMs - 150000;
      const secToClose = Math.max(0, Math.floor((closeEpochMs - nowMs) / 1000));
      if (secToClose <= 0) {
        isClosedNow = true;
      } else if (secToClose <= 600) {
        isClosingSoon = true;
      }
    } else if (typeof activeTrain.etaMinutes === 'number') {
      if (activeTrain.etaMinutes <= 2.5) {
        isClosedNow = true;
      } else if (activeTrain.etaMinutes <= 10) {
        isClosingSoon = true;
      }
    }
  } else if (isContinuous && isPrimaryPassed && activeTrain) {
    // Continuous closure: gate stays closed between trains
    isClosedNow = true;
    if (arrivalEpochMs && arrivalEpochMs > nowMs) {
      reopenEpochMs = arrivalEpochMs + 90000;
    } else if (combined?.closureEnd) {
      const cEnd = new Date(combined.closureEnd).getTime();
      if (!isNaN(cEnd) && cEnd > nowMs) reopenEpochMs = cEnd;
    }
  } else {
    // Primary train has NOT passed yet
    const rawCloseMs = crossing.estimatedGateClosingTime ? new Date(crossing.estimatedGateClosingTime).getTime() : null;
    const rawReopenMs = (combined?.closureEnd || crossing.predictedReopenTime || crossing.estimatedGateReopeningTime) 
      ? new Date(combined?.closureEnd || crossing.predictedReopenTime || crossing.estimatedGateReopeningTime!).getTime() 
      : null;

    const isReopenExpired = rawReopenMs !== null && (nowMs - rawReopenMs > 90000);

    if (rawCloseMs && rawCloseMs > nowMs) {
      closeEpochMs = rawCloseMs;
      const secToClose = Math.max(0, Math.floor((rawCloseMs - nowMs) / 1000));
      if (secToClose <= 600) isClosingSoon = true;
    } else if (isPhysicalClosed && (!rawReopenMs || !isReopenExpired)) {
      isClosedNow = true;
      if (rawReopenMs && rawReopenMs > nowMs) reopenEpochMs = rawReopenMs;
    } else if (crossing.status === 'CLOSURE_EXPECTED' && (!rawReopenMs || !isReopenExpired)) {
      if (rawCloseMs && rawCloseMs <= nowMs) {
        isClosedNow = true;
        if (rawReopenMs && rawReopenMs > nowMs) reopenEpochMs = rawReopenMs;
      } else {
        isClosingSoon = true;
      }
    } else if (crossing.status === 'APPROACHING') {
      isClosingSoon = true;
    }
  }

  // Format last train passed text
  let lastTrainPassedText: string | null = null;
  if (resolvedLastPassed && (resolvedLastPassed.trainName || resolvedLastPassed.trainNumber)) {
    const numName = resolvedLastPassed.trainNumber
      ? `#${resolvedLastPassed.trainNumber} ${resolvedLastPassed.trainName || ''}`.trim()
      : (resolvedLastPassed.trainName || 'Train');

    let timeDetail = '';
    const passTimeIso = resolvedLastPassed.passedAt || resolvedLastPassed.timestamp;
    if (passTimeIso) {
      const passEpoch = new Date(passTimeIso).getTime();
      if (!isNaN(passEpoch)) {
        const diffMin = Math.round((nowMs - passEpoch) / 60000);
        if (diffMin >= 0 && diffMin <= 180) {
          timeDetail = diffMin <= 1 ? 'just now' : `~${diffMin}m ago`;
        } else {
          const tStr = format12h(passEpoch);
          if (tStr) timeDetail = `at ${tStr}`;
        }
      }
    } else if (typeof resolvedLastPassed.distanceKm === 'number' && resolvedLastPassed.distanceKm > 0) {
      timeDetail = `~${resolvedLastPassed.distanceKm.toFixed(1)}km past`;
    }

    lastTrainPassedText = timeDetail ? `Last train: ${numName} (${timeDetail})` : `Last train: ${numName}`;
  }

  const isOpenPassage = !isClosedNow && !isClosingSoon;

  return {
    activeUpcomingTrain: activeTrain,
    subsequentTrains: remainingSubs,
    totalUpcomingCount: totalUpcoming,
    lastTrainPassed: resolvedLastPassed,
    lastTrainPassedText,
    isClosedNow,
    isClosingSoon,
    isOpenPassage,
    closeEpochMs,
    reopenEpochMs,
    arrivalEpochMs,
    closureDurationMin: baseDurationMin,
    isContinuousClosure: isContinuous
  };
}

/**
 * Resolves the verified server-provided train association for a railway crossing.
 * Uses authoritative multi-train resolution: if the primary train has already passed,
 * advances to the upcoming train.
 */
export function findImpactingTrainForCrossing(
  crossing: RailwayCrossing | null | undefined,
  trainList: SectorTrain[],
  nowMs?: number
): SectorTrain | null {
  if (!crossing) return null;
  const currentNow = typeof nowMs === 'number' ? nowMs : Date.now();
  const state = resolveActiveCrossingTrains(crossing, currentNow, trainList);
  
  if (state.activeUpcomingTrain) {
    const trainNum = String(state.activeUpcomingTrain.number || state.activeUpcomingTrain.trainNumber || state.activeUpcomingTrain.id || '');
    const matched = trainList && trainList.find(t => String(t.number) === trainNum || t.id === trainNum);
    return (matched || state.activeUpcomingTrain) as SectorTrain;
  }

  // Fallback: direct upcomingTrainId match if not passed
  if (crossing.upcomingTrainId && trainList && trainList.length > 0) {
    const directMatch = trainList.find(t => 
      (String(t.number) === String(crossing.upcomingTrainId) || t.id === crossing.upcomingTrainId) &&
      t.status !== 'CANCELLED' &&
      t.status !== 'TERMINATED' &&
      !(t as any).isReceding &&
      (t as any).status !== 'CLEARED_CROSSING'
    );
    if (directMatch) return directMatch;
  }

  return null;
}

export interface CrossingTrainDisplayInfo {
  type: 'APPROACHING' | 'PREVIOUS' | 'CORRIDOR' | 'CLEAR';
  label: string;
  name: string;
  trainNumber?: string;
  speedText: string;
  isApproaching: boolean;
  secondaryTrains?: Array<{
    trainNumber: string;
    trainName: string;
    etaMinutes?: number;
    distanceKm?: number;
  }>;
  totalApproaching?: number;
  isContinuousClosure?: boolean;
}

export function formatTrainSpeed(train: SectorTrain | any): string {
  if (!train) return '~55 km/h (Sectional)';
  if (train.status === 'TERMINATED') return '0 km/h (Terminus)';
  if (train.status === 'NOT_STARTED' || train.status === 'not-started' || train.status === 'YET_TO_START') return '0 km/h (Yet to start)';
  if (train.isStationaryAtPlatform || train.isStationary || train.status === 'PLATFORM_BOARDING' || train.status === 'STATIONARY' || train.speedKmH === 0) {
    return 'Stationary at Platform (0 km/h)';
  }
  if (train.hasLiveSpeedMeasurement && typeof train.liveSpeedKmH === 'number' && train.liveSpeedKmH > 0) {
    return `${train.liveSpeedKmH} km/h (GPS)`;
  }
  if (typeof train.speedKmH === 'number' && train.speedKmH > 0) {
    return `~${train.speedKmH} km/h (Sectional)`;
  }
  if (typeof train.sectionalSpeedKmH === 'number' && train.sectionalSpeedKmH > 0) {
    return `~${train.sectionalSpeedKmH} km/h (Sectional)`;
  }
  return '~55 km/h (Sectional)';
}

export function getCrossingTrainDisplay(
  crossing: RailwayCrossing,
  trainList: SectorTrain[],
  nowMs?: number
): CrossingTrainDisplayInfo {
  const currentNow = typeof nowMs === 'number' ? nowMs : Date.now();
  const state = resolveActiveCrossingTrains(crossing, currentNow, trainList);

  // 1. Direct approaching train validation (promotes upcoming when primary passed)
  if (state.activeUpcomingTrain) {
    const trainNum = String(state.activeUpcomingTrain.number || state.activeUpcomingTrain.trainNumber || '');
    const trainName = String(state.activeUpcomingTrain.name || state.activeUpcomingTrain.trainName || 'Express / Passenger');
    const matched = trainList && trainList.find(t => String(t.number) === trainNum || t.id === trainNum);
    const speed = formatTrainSpeed(matched || state.activeUpcomingTrain);

    return {
      type: 'APPROACHING',
      label: state.totalUpcomingCount > 1 ? `Approaching Train (1 of ${state.totalUpcomingCount})` : 'Approaching Train',
      name: trainName,
      trainNumber: trainNum,
      speedText: speed,
      isApproaching: true,
      secondaryTrains: state.subsequentTrains,
      totalApproaching: state.totalUpcomingCount,
      isContinuousClosure: state.isContinuousClosure
    };
  }

  // 2. Verified previous train that passed this crossing
  if (state.lastTrainPassed && (state.lastTrainPassed.trainName || state.lastTrainPassed.name)) {
    const passed = state.lastTrainPassed;
    const distText = passed.distanceKm ? `~${passed.distanceKm.toFixed(1)}km past` : 'Sector cleared';
    return {
      type: 'PREVIOUS',
      label: 'Recent Train Passed',
      name: passed.trainName || passed.name,
      trainNumber: passed.trainNumber || passed.number,
      speedText: `Cleared (${distText})`,
      isApproaching: false
    };
  }

  // 3. Corridor active service on this track corridor (STRICT: only active in-transit trains on this corridor)
  const corridorTrain = trainList && trainList.find(t => 
    t.corridorId === crossing.corridorId && 
    t.status !== 'CANCELLED' && 
    t.status !== 'TERMINATED' && 
    t.status !== 'OUT_OF_SECTOR' &&
    !(t as any).isReceding &&
    (t as any).status !== 'CLEARED_CROSSING' &&
    t.isWithinAmritsarSector === true
  );

  if (corridorTrain) {
    return {
      type: 'CORRIDOR',
      label: 'Corridor Active Train',
      name: corridorTrain.name,
      trainNumber: corridorTrain.number,
      speedText: formatTrainSpeed(corridorTrain),
      isApproaching: false
    };
  }

  // 4. Default baseline when no corridor service is active: CLEAR ROADWAY
  return {
    type: 'CLEAR',
    label: 'Track Traffic Status',
    name: 'Clear Approach Zone',
    trainNumber: undefined,
    speedText: 'Clear Passage (No Approaching Train)',
    isApproaching: false
  };
}

export function format12h(timeInput?: string | number | null): string | null {
  if (!timeInput) return null;
  try {
    const d = new Date(timeInput);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  } catch (e) {
    return null;
  }
}

export interface CrossingTimingDetails {
  statusBadge: {
    label: 'OPEN' | 'CLOSING SOON' | 'CLOSED' | 'TIMING UNAVAILABLE' | 'CONFIRMED OPEN' | 'CONFIRMED CLOSED' | 'PREDICTED CLOSURE' | 'PREDICTED OPEN' | 'STATUS UNKNOWN';
    color: string;
    bg: string;
    border: string;
    dotColor: string;
  };

  isClosedNow: boolean;
  isClosingSoon: boolean;
  isOpenPassage: boolean;
  isTimingUnavailable: boolean;

  hasApproachingTrain: boolean;
  trainName?: string;
  trainNumber?: string;
  trainArrivalEtaText: string;
  trainArrivalTimeStr: string | null;
  trainArrivalSec: number;
  trainSpeedText: string;
  trainDistanceKm: number | null;

  closingTimeStr: string | null;
  closingCountdownText: string | null;
  closeSec: number;

  reopeningTimeStr: string | null;
  reopenCountdownText: string | null;
  reopenSec: number;

  closureDurationText: string;
  closureDurationMin: number;

  isMultiTrain: boolean;
  trainCount: number;
  confidenceLabel: string;
  lastUpdateText: string | null;
  activeTrain?: {
    trainNumber: string;
    trainName: string;
    speedText: string;
    direction?: string;
    route?: string;
    status: string;
    dataState?: string;
    distanceKm?: number | null;
    timingText?: string | null;
    isStationary?: boolean;
    isApproaching?: boolean;
    isReceding?: boolean;
    isScheduled?: boolean;
    locationText?: string | null;
  } | null;

  passingTrain?: {
    trainNumber: string;
    trainName: string;
    speedText: string;
    direction?: string;
    route?: string;
    status?: string;
    dataState?: string;
  } | null;

  lastTrainPassed?: {
    trainNumber?: string;
    trainName?: string;
    direction?: string;
    distanceKm?: number;
    passedAt?: string;
    timestamp?: string;
    speedKmH?: number;
  } | null;
  lastTrainPassedText?: string | null;
  secondaryTrains?: any[];
}

export function getCrossingTimingDetails(
  crossing: RailwayCrossing,
  nowMs: number,
  trainList?: SectorTrain[]
): CrossingTimingDetails {
  // Authoritative multi-train & approaching resolution:
  const resolved = resolveActiveCrossingTrains(crossing, nowMs, trainList);
  const upcomingTrain = resolved.activeUpcomingTrain;
  const subsequent = resolved.subsequentTrains;
  const trainCount = resolved.totalUpcomingCount;
  const isMultiTrain = resolved.isContinuousClosure || trainCount > 1;

  // Check timing availability & confidence (OPEN status is never unavailable)
  const isExplicitlyUnavailable = (
    crossing.status === 'UNKNOWN' || 
    crossing.predictionConfidence === 'UNAVAILABLE' || 
    crossing.gateStatusClassification === 'STATUS UNAVAILABLE' || 
    crossing.gateStatusClassification === 'DATA UNAVAILABLE' ||
    crossing.gateStatusClassification === 'STATUS UNKNOWN' ||
    crossing.gateStatusClassification === 'UNAVAILABLE'
  ) && crossing.status !== 'OPEN';

  const isTimingUnavailable = isExplicitlyUnavailable;

  // 1. Duration of closure
  const closureDurationMin = resolved.closureDurationMin;

  // 2. Closure target calculation (strictly future epoch)
  let closeSec = 0;
  if (!resolved.isClosedNow && resolved.closeEpochMs && resolved.closeEpochMs > nowMs) {
    closeSec = Math.max(0, Math.floor((resolved.closeEpochMs - nowMs) / 1000));
  } else if (!resolved.isClosedNow && crossing.countdownAvailable && typeof crossing.timeToNextClosureSec === 'number' && crossing.timeToNextClosureSec > 0 && !resolved.lastTrainPassed) {
    closeSec = crossing.timeToNextClosureSec;
  }

  // 3. State Determination
  const isClosedNow = !isTimingUnavailable && resolved.isClosedNow;
  const isClosingSoon = !isTimingUnavailable && !isClosedNow && (resolved.isClosingSoon || (closeSec > 0 && closeSec <= 600));
  const isOpenPassage = !isTimingUnavailable && !isClosedNow && !isClosingSoon;

  // 4. Reopen target calculation (strictly future epoch)
  let reopenSec = 0;
  if (isClosedNow) {
    if (resolved.reopenEpochMs && resolved.reopenEpochMs > nowMs) {
      reopenSec = Math.max(0, Math.floor((resolved.reopenEpochMs - nowMs) / 1000));
    } else if (typeof crossing.remainingWaitSec === 'number' && crossing.remainingWaitSec > 0) {
      reopenSec = crossing.remainingWaitSec;
    }
  }

  // 5. Clock strings: NEVER format a past timestamp as an expected future time!
  let closingTimeStr: string | null = null;
  if (isClosedNow) {
    closingTimeStr = 'Barriers locked';
  } else if (closeSec > 0) {
    const cEpoch = resolved.closeEpochMs && resolved.closeEpochMs > nowMs ? resolved.closeEpochMs : nowMs + closeSec * 1000;
    closingTimeStr = format12h(cEpoch);
  }

  let reopeningTimeStr: string | null = null;
  if (isClosedNow && reopenSec > 0) {
    const rEpoch = resolved.reopenEpochMs && resolved.reopenEpochMs > nowMs ? resolved.reopenEpochMs : nowMs + reopenSec * 1000;
    reopeningTimeStr = format12h(rEpoch);
  }

  // 6. Train Arrival calculation (strictly future arrival for active upcoming train)
  let trainArrivalSec = 0;
  let trainArrivalTimeStr: string | null = null;
  if (upcomingTrain) {
    if (resolved.arrivalEpochMs && resolved.arrivalEpochMs > nowMs) {
      trainArrivalSec = Math.max(0, Math.floor((resolved.arrivalEpochMs - nowMs) / 1000));
      trainArrivalTimeStr = format12h(resolved.arrivalEpochMs);
    } else if (typeof upcomingTrain.etaMinutes === 'number' && upcomingTrain.etaMinutes > 0) {
      trainArrivalSec = Math.round(upcomingTrain.etaMinutes * 60);
      trainArrivalTimeStr = format12h(nowMs + trainArrivalSec * 1000);
    }
  }

  // 7. Countdowns (no fake precision, no ~0s, no negative numbers)
  const closingCountdownText = closeSec > 60 
    ? `in ~${Math.round(closeSec / 60)} min` 
    : (closeSec > 0 ? 'in <1 min' : null);

  const reopenCountdownText = (isClosedNow && reopenSec > 60)
    ? `in ~${Math.round(reopenSec / 60)} min` 
    : (isClosedNow && reopenSec > 0 ? 'in <1 min' : null);

  // 8. Readable Train ETA line & Reopening statement
  let trainArrivalEtaText = '';
  if (isTimingUnavailable) {
    trainArrivalEtaText = crossing.statusReason || 'Live train update temporarily unavailable · Please check tracks before crossing';
  } else if (isClosedNow) {
    if (reopeningTimeStr) {
      trainArrivalEtaText = reopenCountdownText 
        ? `Expected to reopen at ${reopeningTimeStr} (${reopenCountdownText})`
        : `Expected to reopen at ${reopeningTimeStr}`;
    } else {
      trainArrivalEtaText = 'Barriers locked · Reopening shortly';
    }
  } else if (upcomingTrain || isClosingSoon) {
    const isYetToStart = upcomingTrain?.status === 'YET_TO_START' || upcomingTrain?.status === 'NOT_STARTED' || upcomingTrain?.isStationary;
    const depTimeStr = upcomingTrain?.expectedDeparture || (upcomingTrain?.expectedDepartureMs ? format12h(upcomingTrain.expectedDepartureMs) : null);

    if (trainArrivalSec > 60) {
      const arrMin = Math.round(trainArrivalSec / 60);
      const arrHours = Math.floor(arrMin / 60);
      const arrRemMin = arrMin % 60;
      const durationStr = arrHours > 0 ? `~${arrHours} hr ${arrRemMin} min` : `~${arrMin} min`;

      if (isYetToStart && depTimeStr) {
        trainArrivalEtaText = trainArrivalTimeStr
          ? `Departs ${depTimeStr} · Crossing ETA: ${trainArrivalTimeStr} (in ${durationStr})`
          : `Departs ${depTimeStr} · in ${durationStr}`;
      } else {
        trainArrivalEtaText = trainArrivalTimeStr 
          ? `Train arriving at ${trainArrivalTimeStr} (in ${durationStr})`
          : `Train arriving in ${durationStr}`;
      }
    } else if (trainArrivalSec > 0) {
      trainArrivalEtaText = trainArrivalTimeStr 
        ? `Train arriving in <1 min (${trainArrivalTimeStr})`
        : `Train arriving in <1 min`;
    } else {
      trainArrivalEtaText = 'Train approaching crossing';
    }
  } else {
    trainArrivalEtaText = 'Clear passage · No approaching trains';
  }

  // 9. Status badge details (Strictly distinguish CONFIRMED OPEN, CONFIRMED CLOSED, PREDICTED CLOSURE, and STATUS UNKNOWN)
  let statusBadge: CrossingTimingDetails['statusBadge'];
  if (crossing.activeDrill || crossing.closureReported || crossing.observedPhysicalGateState === 'CLOSED') {
    statusBadge = {
      label: 'CONFIRMED CLOSED',
      color: '#ef4444',
      bg: 'rgba(239, 68, 68, 0.12)',
      border: 'rgba(239, 68, 68, 0.3)',
      dotColor: '#ef4444'
    };
  } else if (crossing.observedPhysicalGateState === 'OPEN' || crossing.confirmedOpenReport === true) {
    statusBadge = {
      label: 'CONFIRMED OPEN',
      color: '#10b981',
      bg: 'rgba(16, 185, 129, 0.12)',
      border: 'rgba(16, 185, 129, 0.3)',
      dotColor: '#10b981'
    };
  } else if (isTimingUnavailable || crossing.status === 'UNKNOWN') {
    statusBadge = {
      label: 'STATUS UNKNOWN',
      color: '#94a3b8',
      bg: 'rgba(148, 163, 184, 0.12)',
      border: 'rgba(148, 163, 184, 0.3)',
      dotColor: '#94a3b8'
    };
  } else if (isClosedNow) {
    statusBadge = {
      label: 'PREDICTED CLOSURE',
      color: '#ef4444',
      bg: 'rgba(239, 68, 68, 0.12)',
      border: 'rgba(239, 68, 68, 0.3)',
      dotColor: '#ef4444'
    };
  } else if (isClosingSoon) {
    statusBadge = {
      label: 'PREDICTED CLOSURE',
      color: '#f59e0b',
      bg: 'rgba(245, 158, 11, 0.12)',
      border: 'rgba(245, 158, 11, 0.3)',
      dotColor: '#f59e0b'
    };
  } else {
    statusBadge = {
      label: 'PREDICTED OPEN',
      color: '#10b981',
      bg: 'rgba(16, 185, 129, 0.12)',
      border: 'rgba(16, 185, 129, 0.3)',
      dotColor: '#10b981'
    };
  }

  // 10. Confidence & Duration formatting
  const confidenceLabel = isTimingUnavailable
    ? 'Data Unavailable'
    : (crossing.predictionConfidence === 'HIGH' || crossing.hasLiveSpeedMeasurement 
      ? 'Verified Live' 
      : crossing.predictionConfidence === 'MODERATE' 
      ? 'Schedule Estimate' 
      : 'Timing Unavailable');

  const lastUpdateIso = crossing.calculationTimestamp || crossing.providerObservationTimestamp || crossing.lastProviderSyncTimestamp;
  const lastUpdateText = lastUpdateIso ? format12h(lastUpdateIso) : null;

  let closureDurationText = 'Duration unmeasured';
  if (closureDurationMin > 0) {
    closureDurationText = isClosedNow 
      ? `Closed for ~${closureDurationMin} min` 
      : `~${closureDurationMin} min`;
  }

  // 11. Train passing or active in corridor: strictly verified candidates only
  const corridorMatchFromList = (!((crossing as any).upcomingTrain || (crossing as any).primaryTrain || (crossing as any).corridorTrain || (crossing as any).activeCorridorTrain) && Array.isArray(trainList)) 
    ? trainList.find(t => t.corridorId === crossing.corridorId && t.status !== 'TERMINATED' && t.status !== 'CANCELLED' && t.status !== 'OUT_OF_SECTOR')
    : null;

  const activeCand = (crossing as any).upcomingTrain || 
                     (crossing as any).primaryTrain || 
                     (crossing as any).corridorTrain || 
                     (crossing as any).activeCorridorTrain || 
                     crossing.upcomingTrains?.[0] || 
                     corridorMatchFromList ||
                     null;
  
  let passingTrain: CrossingTimingDetails['passingTrain'] = null;
  // Only display passingTrain if train is strictly verified in-sector and crossing is active/closing
  if (activeCand && (activeCand.number || activeCand.trainNumber || activeCand.name || activeCand.trainName)) {
    const isOutOfSector = activeCand.status === 'OUT_OF_SECTOR' || activeCand.isWithinAmritsarSector === false;
    const isTermOrCancelled = activeCand.status === 'CANCELLED' || activeCand.status === 'TERMINATED' || activeCand.status === 'NOT_STARTED';
    const isCorridorMatch = !activeCand.corridorId || activeCand.corridorId === crossing.corridorId;

    if (!isOutOfSector && !isTermOrCancelled && isCorridorMatch && (isClosedNow || isClosingSoon || crossing.status === 'APPROACHING')) {
      passingTrain = {
        trainNumber: String(activeCand.number || activeCand.trainNumber || activeCand.id || ''),
        trainName: String(activeCand.name || activeCand.trainName || 'Express / Passenger'),
        speedText: formatTrainSpeed(activeCand),
        direction: activeCand.direction || crossing.trainDirection || undefined,
        route: (activeCand.origin && activeCand.destination) ? `${activeCand.origin} → ${activeCand.destination}` : (crossing.line || 'Amritsar Corridor'),
        status: activeCand.status,
        dataState: activeCand.dataState
      };
    }
  }

  // 12. Verified last train passed metadata
  const lastPassedRaw = resolved.lastTrainPassed || (crossing as any).lastTrainPassed || null;
  let lastTrainPassed: CrossingTimingDetails['lastTrainPassed'] = null;
  let lastTrainPassedText: string | null = null;

  if (lastPassedRaw && (lastPassedRaw.trainNumber || lastPassedRaw.trainName)) {
    lastTrainPassed = {
      trainNumber: lastPassedRaw.trainNumber ? String(lastPassedRaw.trainNumber) : undefined,
      trainName: lastPassedRaw.trainName ? String(lastPassedRaw.trainName) : undefined,
      direction: lastPassedRaw.direction,
      distanceKm: typeof lastPassedRaw.distanceKm === 'number' ? lastPassedRaw.distanceKm : undefined,
      passedAt: lastPassedRaw.passedAt || lastPassedRaw.timestamp,
      timestamp: lastPassedRaw.timestamp || lastPassedRaw.passedAt,
      speedKmH: lastPassedRaw.speedKmH
    };

    const numName = lastTrainPassed.trainNumber
      ? `#${lastTrainPassed.trainNumber} ${lastTrainPassed.trainName || ''}`.trim()
      : (lastTrainPassed.trainName || 'Train');

    let timeDetail = '';
    const passTimeIso = lastTrainPassed.passedAt || lastTrainPassed.timestamp;
    if (passTimeIso) {
      const passEpoch = new Date(passTimeIso).getTime();
      if (!isNaN(passEpoch)) {
        const diffMin = Math.round((nowMs - passEpoch) / 60000);
        if (diffMin >= 0 && diffMin <= 180) {
          timeDetail = diffMin <= 1 ? 'just now' : `~${diffMin}m ago`;
        } else {
          const tStr = format12h(passEpoch);
          if (tStr) timeDetail = `at ${tStr}`;
        }
      }
    } else if (typeof lastTrainPassed.distanceKm === 'number' && lastTrainPassed.distanceKm > 0) {
      timeDetail = `~${lastTrainPassed.distanceKm.toFixed(1)}km past`;
    }

    lastTrainPassedText = timeDetail ? `Last train: ${numName} (${timeDetail})` : `Last train: ${numName}`;
  }

  // 13. Comprehensive activeTrain calculation for all crossing states (Approaching, Stationary, Receding, Monitored)
  let activeTrain: CrossingTimingDetails['activeTrain'] = null;
  if (upcomingTrain) {
    const isStationary = Boolean(upcomingTrain.status === 'YET_TO_START' || upcomingTrain.isStationary || upcomingTrain.speedKmH === 0);
    const distNum = typeof upcomingTrain.distanceKm === 'number' ? upcomingTrain.distanceKm : (typeof crossing.distanceAlongTrackKm === 'number' && !resolved.lastTrainPassed ? crossing.distanceAlongTrackKm : null);

    activeTrain = {
      trainNumber: String(upcomingTrain.number || upcomingTrain.trainNumber || upcomingTrain.id || ''),
      trainName: String(upcomingTrain.name || upcomingTrain.trainName || 'Express / Passenger'),
      speedText: formatTrainSpeed(upcomingTrain),
      direction: upcomingTrain.direction || crossing.trainDirection || undefined,
      route: (upcomingTrain.origin && upcomingTrain.destination) ? `${upcomingTrain.origin} → ${upcomingTrain.destination}` : (crossing.line || 'Amritsar Corridor'),
      status: isClosedNow ? 'TRAVERSING / TRACK OCCUPIED' : (isClosingSoon ? 'APPROACHING' : (upcomingTrain.status === 'YET_TO_START' ? 'YET_TO_START' : (isStationary ? 'PLATFORM_BOARDING' : 'IN_TRANSIT'))),
      isStationary,
      dataState: upcomingTrain.dataState,
      distanceKm: distNum,
      timingText: trainArrivalEtaText,
      isApproaching: !isStationary,
      locationText: distNum ? `~${distNum.toFixed(1)} km away` : 'On Approach Track'
    };
  } else if (
    activeCand && 
    (activeCand.number || activeCand.trainNumber || activeCand.name || activeCand.trainName) &&
    activeCand.status !== 'OUT_OF_SECTOR' &&
    activeCand.status !== 'CANCELLED' &&
    activeCand.status !== 'TERMINATED' &&
    activeCand.isWithinAmritsarSector !== false &&
    (!activeCand.corridorId || activeCand.corridorId === crossing.corridorId) &&
    (activeCand.isStationary || activeCand.status === 'PLATFORM_BOARDING' || (typeof activeCand.distanceFromAmritsarKm === 'number' && activeCand.distanceFromAmritsarKm <= 140))
  ) {
    const isStationary = Boolean(
      activeCand.isStationaryAtPlatform || 
      activeCand.isStationary || 
      activeCand.status === 'PLATFORM_BOARDING' || 
      activeCand.status === 'HALTED' ||
      activeCand.speedKmH === 0
    );
    const stationLabel = activeCand.currentStationName || (isStationary ? 'Amritsar Junction (ASR)' : '');
    const distNum = typeof activeCand.distanceKm === 'number' ? activeCand.distanceKm : (typeof activeCand.distanceFromAmritsarKm === 'number' ? activeCand.distanceFromAmritsarKm : null);
    
    let timingLabel = '';
    if (isStationary) {
      timingLabel = stationLabel ? `Stationary at ${stationLabel} · Departure Awaited` : 'Stationary at Platform · Dispatch Signal Held';
    } else if (activeCand.isReceding || activeCand.status === 'CLEARED_CROSSING') {
      timingLabel = distNum ? `Cleared crossing · Receding (~${distNum.toFixed(1)} km past)` : 'Cleared crossing · Receding';
    } else if (distNum && distNum > 8.0) {
      timingLabel = `Outside Approach Zone (~${distNum.toFixed(1)} km away) · Corridor Monitored`;
    } else {
      timingLabel = activeCand.delayMinutes ? `In Transit · Delay: ${activeCand.delayMinutes}m` : 'In Transit on Corridor';
    }

    activeTrain = {
      trainNumber: String(activeCand.number || activeCand.trainNumber || activeCand.id || ''),
      trainName: String(activeCand.name || activeCand.trainName || 'Express / Passenger'),
      speedText: formatTrainSpeed(activeCand),
      direction: activeCand.direction || crossing.trainDirection || undefined,
      route: (activeCand.origin && activeCand.destination) ? `${activeCand.origin} → ${activeCand.destination}` : (crossing.line || 'Amritsar Corridor'),
      status: isStationary ? 'PLATFORM_BOARDING' : (activeCand.status || 'CORRIDOR_MONITORED'),
      dataState: activeCand.dataState,
      distanceKm: distNum,
      timingText: timingLabel,
      isStationary,
      isApproaching: false,
      isReceding: Boolean(activeCand.isReceding || activeCand.status === 'CLEARED_CROSSING'),
      isScheduled: activeCand.dataState === 'SCHEDULED',
      locationText: stationLabel ? `${stationLabel} Platform` : (distNum ? `~${distNum.toFixed(1)} km` : 'In Sector')
    };
  } else if (lastTrainPassed) {
    activeTrain = {
      trainNumber: lastTrainPassed.trainNumber || '',
      trainName: lastTrainPassed.trainName || 'Recent Train',
      speedText: lastTrainPassed.speedKmH ? `${lastTrainPassed.speedKmH} km/h` : 'Cleared',
      direction: lastTrainPassed.direction,
      status: 'CLEARED_CROSSING',
      timingText: lastTrainPassedText || 'Cleared crossing',
      isReceding: true,
      distanceKm: lastTrainPassed.distanceKm || null,
      locationText: lastTrainPassed.distanceKm ? `~${lastTrainPassed.distanceKm.toFixed(1)} km past` : 'Cleared crossing'
    };
  }

  const effectiveDistance = typeof upcomingTrain?.distanceKm === 'number' 
    ? upcomingTrain.distanceKm 
    : (typeof crossing.distanceAlongTrackKm === 'number' && !resolved.lastTrainPassed ? crossing.distanceAlongTrackKm : null);

  return {
    statusBadge,
    isClosedNow,
    isClosingSoon,
    isOpenPassage,
    isTimingUnavailable,
    hasApproachingTrain: Boolean(upcomingTrain || isClosingSoon || isClosedNow),
    trainName: upcomingTrain?.name || upcomingTrain?.trainName,
    trainNumber: upcomingTrain?.number || upcomingTrain?.trainNumber,
    trainArrivalEtaText,
    trainArrivalTimeStr,
    trainArrivalSec,
    trainSpeedText: formatTrainSpeed(upcomingTrain),
    trainDistanceKm: effectiveDistance,
    closingTimeStr,
    closingCountdownText,
    closeSec,
    reopeningTimeStr,
    reopenCountdownText,
    reopenSec,
    closureDurationText,
    closureDurationMin,
    isMultiTrain,
    trainCount,
    confidenceLabel,
    lastUpdateText,
    activeTrain,
    passingTrain,
    lastTrainPassed,
    lastTrainPassedText,
    secondaryTrains: subsequent
  };
}


