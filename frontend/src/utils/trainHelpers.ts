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
export function findImpactingTrainForCrossing(
  crossing: RailwayCrossing | null | undefined,
  trainList: SectorTrain[]
): SectorTrain | null {
  if (!crossing || !trainList || trainList.length === 0) return null;

  // 1. Authoritative embedded upcomingTrain / primaryTrain payload from backend detection engine
  const embedded = (crossing as any).upcomingTrain || (crossing as any).primaryTrain;
  if (embedded && (embedded.name || embedded.trainName || embedded.number || embedded.trainNumber)) {
    const trainNum = String(embedded.number || embedded.trainNumber || embedded.id || '');
    const matched = trainList && trainList.find(t => String(t.number) === trainNum || t.id === trainNum);
    return (matched || embedded) as SectorTrain;
  }

  // 2. Direct upcomingTrainId match from backend
  if (crossing.upcomingTrainId && trainList && trainList.length > 0) {
    const directMatch = trainList.find(t => 
      (String(t.number) === String(crossing.upcomingTrainId) || t.id === crossing.upcomingTrainId) &&
      t.status !== 'CANCELLED' &&
      t.status !== 'TERMINATED'
    );
    if (directMatch) return directMatch;
  }

  // 3. Train whose declared target crossing matches this crossing (from backend engine)
  const targeted = trainList.find(t => 
    t.targetCrossingId === crossing.id &&
    !t.isStale &&
    t.dataState !== 'STALE' &&
    t.dataState !== 'SIMULATED' &&
    t.positionClassification !== 'SYNTHETIC_DEMO' &&
    t.status !== 'OUT_OF_SECTOR' &&
    t.status !== 'TERMINATED' &&
    t.status !== 'CANCELLED' &&
    t.status !== 'NOT_STARTED' &&
    t.isWithinAmritsarSector !== false &&
    t.corridorId === crossing.corridorId &&
    typeof t.lat === 'number' &&
    typeof t.lng === 'number' &&
    t.lat !== 0 &&
    t.lng !== 0
  );
  if (targeted) return targeted;

  // Strict: If the backend has not supplied a validated association, return null.
  // Never select a substitute train based on proximity or corridor guesswork.
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
  if (train.status === 'NOT_STARTED' || train.status === 'not-started') return '0 km/h (Yet to start)';
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
  trainList: SectorTrain[]
): CrossingTrainDisplayInfo {
  // 1. Direct approaching train validation
  const impactingTrain = findImpactingTrainForCrossing(crossing, trainList);
  if (impactingTrain) {
    const subsequent = crossing.subsequentTrains || crossing.upcomingTrains || [];
    const totalCount = crossing.totalUpcomingTrains || (1 + subsequent.length);
    const isContinuous = Boolean(crossing.combinedClosure?.isContinuous);

    return {
      type: 'APPROACHING',
      label: totalCount > 1 ? `Approaching Train (1 of ${totalCount})` : 'Approaching Train',
      name: impactingTrain.name,
      trainNumber: impactingTrain.number,
      speedText: formatTrainSpeed(impactingTrain),
      isApproaching: true,
      secondaryTrains: subsequent,
      totalApproaching: totalCount,
      isContinuousClosure: isContinuous
    };
  }

  // 2. Verified previous train that passed this crossing
  if (crossing.lastTrainPassed && crossing.lastTrainPassed.trainName) {
    const passed = crossing.lastTrainPassed;
    const distText = passed.distanceKm ? `~${passed.distanceKm.toFixed(1)}km past` : 'Sector cleared';
    return {
      type: 'PREVIOUS',
      label: 'Recent Train Passed',
      name: passed.trainName,
      trainNumber: passed.trainNumber,
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
}

export function getCrossingTimingDetails(
  crossing: RailwayCrossing,
  nowMs: number,
  trainList?: SectorTrain[]
): CrossingTimingDetails {
  // Multi-train detection
  const subsequent = crossing.subsequentTrains || crossing.upcomingTrains?.slice(1) || [];
  const trainCount = (crossing.totalUpcomingTrains && crossing.totalUpcomingTrains > 1) 
    ? crossing.totalUpcomingTrains 
    : (1 + subsequent.length);
  const isMultiTrain = Boolean(crossing.combinedClosure?.isContinuous || trainCount > 1);

  // Parse raw ISO dates
  const closeIso = crossing.estimatedGateClosingTime || crossing.timingMetrics?.likelyClosure || (crossing as any).closure?.likelyClosure;
  const reopenIso = crossing.combinedClosure?.closureEnd || 
    crossing.predictedReopenTime || 
    crossing.estimatedGateReopeningTime || 
    crossing.timingMetrics?.likelyReopen || 
    (crossing as any).reopening?.likelyReopen;

  const rawCloseMs = closeIso ? new Date(closeIso).getTime() : null;
  const rawReopenMs = reopenIso ? new Date(reopenIso).getTime() : null;
  const isCloseValid = rawCloseMs !== null && !isNaN(rawCloseMs);
  const isReopenValid = rawReopenMs !== null && !isNaN(rawReopenMs);

  const isCloseInPast = isCloseValid && rawCloseMs! <= nowMs;
  const isReopenInPast = isReopenValid && rawReopenMs! <= nowMs;
  // If reopening was scheduled in the past by > 90 seconds (grace buffer for gate lifting):
  const isReopenExpired = isReopenValid && (nowMs - rawReopenMs! > 90000);

  // Check timing availability & confidence (OPEN status is never unavailable)
  const isExplicitlyUnavailable = (
    crossing.status === 'UNKNOWN' || 
    crossing.predictionConfidence === 'UNAVAILABLE' || 
    crossing.gateStatusClassification === 'STATUS UNAVAILABLE' || 
    crossing.gateStatusClassification === 'DATA UNAVAILABLE' ||
    crossing.gateStatusClassification === 'STATUS UNKNOWN' ||
    crossing.gateStatusClassification === 'UNAVAILABLE'
  ) && crossing.status !== 'OPEN';

  // If a previously predicted closure has expired and there is no active live approaching train:
  const isPredictionExpired = (crossing.status === 'CLOSED' || crossing.status === 'CLOSURE_EXPECTED') && isReopenExpired;
  const isTimingUnavailable = isExplicitlyUnavailable || isPredictionExpired;

  // 1. Duration of closure (strictly derived from genuine kinematics or labelled as estimate)
  let closureDurationMin = 0;
  let isDurationEstimated = false;

  if (crossing.combinedClosure?.combinedDurationMinutes && crossing.combinedClosure.combinedDurationMinutes > 0) {
    closureDurationMin = Math.round(crossing.combinedClosure.combinedDurationMinutes);
  } else if (crossing.combinedClosure?.durationMinutes && crossing.combinedClosure.durationMinutes > 0) {
    closureDurationMin = Math.round(crossing.combinedClosure.durationMinutes);
  } else if (crossing.closureDurationMin && crossing.closureDurationMin > 0) {
    closureDurationMin = Math.round(crossing.closureDurationMin);
  } else if (isCloseValid && isReopenValid && rawReopenMs! > rawCloseMs!) {
    closureDurationMin = Math.round((rawReopenMs! - rawCloseMs!) / 60000);
  } else if (crossing.avgClosureDurationMin && crossing.avgClosureDurationMin > 0) {
    closureDurationMin = Math.round(crossing.avgClosureDurationMin);
    isDurationEstimated = true;
  }

  // 2. Closure target calculation (strictly future epoch)
  let closeSec = 0;
  const closeTarget = getAuthoritativeTargetEpoch(crossing, 'closure', nowMs);
  if (closeTarget !== null && closeTarget > nowMs) {
    closeSec = calculateRemainingSeconds(closeTarget, nowMs);
  } else if (crossing.countdownAvailable && typeof crossing.timeToNextClosureSec === 'number' && crossing.timeToNextClosureSec > 0) {
    closeSec = crossing.timeToNextClosureSec;
  } else if (isCloseValid && rawCloseMs! > nowMs) {
    closeSec = Math.max(0, Math.floor((rawCloseMs! - nowMs) / 1000));
  }

  // 3. State Determination
  // Train proximity is NOT mechanical barrier confirmation; barrier sensors are uninstrumented.
  const isExplicitlyClosed = crossing.status === 'CLOSED' || crossing.status === 'CLOSURE_REPORTED';
  const isClosureExpected = crossing.status === 'CLOSURE_EXPECTED';
  const isApproachingStatus = crossing.status === 'APPROACHING';

  // Closed only if not unavailable, not expired, and closure epoch is reached
  const isClosedNow = !isTimingUnavailable && (
    (isExplicitlyClosed && (!isReopenValid || !isReopenExpired)) || 
    (isClosureExpected && closeSec <= 0 && (!isReopenValid || !isReopenExpired))
  );

  const isClosingSoon = !isTimingUnavailable && !isClosedNow && (
    isApproachingStatus || 
    (isClosureExpected && closeSec > 0) || 
    (closeSec > 0 && closeSec <= 600)
  );

  const isOpenPassage = !isTimingUnavailable && !isClosedNow && !isClosingSoon;

  // 4. Reopen target calculation (strictly future epoch)
  let reopenSec = 0;
  if (isClosedNow) {
    const reopenTarget = getAuthoritativeTargetEpoch(crossing, 'reopen', nowMs);
    if (reopenTarget !== null && reopenTarget > nowMs) {
      reopenSec = calculateRemainingSeconds(reopenTarget, nowMs);
    } else if (typeof crossing.remainingWaitSec === 'number' && crossing.remainingWaitSec > 0) {
      reopenSec = crossing.remainingWaitSec;
    } else if (isReopenValid && rawReopenMs! > nowMs) {
      reopenSec = Math.max(0, Math.floor((rawReopenMs! - nowMs) / 1000));
    }
  }

  // 5. Clock strings: NEVER format a past timestamp as an expected future time!
  let closingTimeStr: string | null = null;
  if (isClosedNow) {
    closingTimeStr = 'Barriers locked';
  } else if (closeSec > 0) {
    const cEpoch = (closeTarget && closeTarget > nowMs) ? closeTarget : (isCloseValid && rawCloseMs! > nowMs ? rawCloseMs! : nowMs + closeSec * 1000);
    closingTimeStr = format12h(cEpoch);
  }

  let reopeningTimeStr: string | null = null;
  if (isClosedNow) {
    if (reopenSec > 0) {
      const rEpoch = (isReopenValid && rawReopenMs! > nowMs) ? rawReopenMs! : nowMs + reopenSec * 1000;
      reopeningTimeStr = format12h(rEpoch);
    }
  }

  // 6. Train Arrival calculation (strictly future arrival)
  const upcomingTrain = (crossing as any).upcomingTrain || 
                        (crossing as any).primaryTrain || 
                        crossing.upcomingTrains?.[0] || 
                        null;
  const trainArrivalIso = crossing.expectedTrainArrival || 
                          upcomingTrain?.estimatedPassageTime || 
                          crossing.timingMetrics?.passageTime || 
                          null;
  
  let trainArrivalSec = 0;
  let trainArrivalTimeStr: string | null = null;
  if (trainArrivalIso) {
    const arrEpoch = new Date(trainArrivalIso).getTime();
    if (!isNaN(arrEpoch) && arrEpoch > nowMs) {
      trainArrivalSec = Math.max(0, Math.floor((arrEpoch - nowMs) / 1000));
      trainArrivalTimeStr = format12h(arrEpoch);
    }
  } else if (typeof crossing.estimatedTimeToArrivalSec === 'number' && crossing.estimatedTimeToArrivalSec > 0) {
    trainArrivalSec = crossing.estimatedTimeToArrivalSec;
    trainArrivalTimeStr = format12h(nowMs + trainArrivalSec * 1000);
  } else if (upcomingTrain?.etaMinutes && upcomingTrain.etaMinutes > 0) {
    trainArrivalSec = Math.round(upcomingTrain.etaMinutes * 60);
    trainArrivalTimeStr = format12h(nowMs + trainArrivalSec * 1000);
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
    trainArrivalEtaText = isPredictionExpired
      ? 'Waiting for latest train update · Live feed reconnecting'
      : (crossing.statusReason || 'Live train update temporarily unavailable · Please check tracks before crossing');
  } else if (isClosedNow) {
    if (reopeningTimeStr) {
      trainArrivalEtaText = reopenCountdownText 
        ? `Expected to reopen at ${reopeningTimeStr} (${reopenCountdownText})`
        : `Expected to reopen at ${reopeningTimeStr}`;
    } else if (isReopenInPast) {
      trainArrivalEtaText = 'Reopening shortly · Checking tracks';
    } else {
      trainArrivalEtaText = 'Barriers locked · Reopening shortly';
    }
  } else if (upcomingTrain || isClosingSoon) {
    if (trainArrivalSec > 60) {
      const arrMin = Math.round(trainArrivalSec / 60);
      trainArrivalEtaText = trainArrivalTimeStr 
        ? `Train arriving in ${arrMin} min (${trainArrivalTimeStr})`
        : `Train arriving in ${arrMin} min`;
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
  const lastPassedRaw = (crossing as any).lastTrainPassed || null;
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
    activeTrain = {
      trainNumber: String(upcomingTrain.number || upcomingTrain.trainNumber || upcomingTrain.id || ''),
      trainName: String(upcomingTrain.name || upcomingTrain.trainName || 'Express / Passenger'),
      speedText: formatTrainSpeed(upcomingTrain),
      direction: upcomingTrain.direction || crossing.trainDirection || undefined,
      route: (upcomingTrain.origin && upcomingTrain.destination) ? `${upcomingTrain.origin} → ${upcomingTrain.destination}` : (crossing.line || 'Amritsar Corridor'),
      status: isClosedNow ? 'TRAVERSING / TRACK OCCUPIED' : (isClosingSoon ? 'APPROACHING' : 'IN_TRANSIT'),
      dataState: upcomingTrain.dataState,
      distanceKm: typeof crossing.distanceAlongTrackKm === 'number' ? crossing.distanceAlongTrackKm : (upcomingTrain.distanceKm || null),
      timingText: trainArrivalEtaText,
      isApproaching: true,
      locationText: typeof crossing.distanceAlongTrackKm === 'number' ? `~${crossing.distanceAlongTrackKm.toFixed(1)} km away` : 'On Approach Track'
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
    trainDistanceKm: typeof crossing.distanceAlongTrackKm === 'number' ? crossing.distanceAlongTrackKm : (upcomingTrain?.distanceKm || null),
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
    lastTrainPassedText
  };
}


