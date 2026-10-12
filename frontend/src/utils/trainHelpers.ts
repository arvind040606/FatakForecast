import type { RailwayCrossing, SectorTrain } from '../types.ts';

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
  if (train.status === 'CANCELLED') return '0 km/h (Cancelled)';
  if (train.status === 'PLATFORM_BOARDING' || train.status === 'STATIONARY') return '0 km/h (Platform)';
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

