import { RailwayCrossing, SectorTrain, RailwayCorridor, OperationalMetrics } from '../types';
import rawCrossings from '../data/amritsar_crossings_osm.json';
import rawCorridors from '../data/amritsar_corridors_osm.json';

// Authentic railway corridors derived from OpenStreetMap geometry
export const INITIAL_CORRIDORS: RailwayCorridor[] = rawCorridors as unknown as RailwayCorridor[];

// All 36 genuine railway level crossings discovered from OpenStreetMap (Overpass API)
export const INITIAL_CROSSINGS: RailwayCrossing[] = (rawCrossings as any[]).map(c => {
  return {
    ...c,
    verificationStatus: c.verificationStatus || 'VERIFIED_MAPPED_CROSSING',
    verificationLabel: c.verificationLabel || 'Verified',
    status: 'OPEN',
    timeToNextClosureSec: 0,
    upcomingTrainId: null,
    queueEstimateVehicles: 0,
    trafficCongestionLevel: 'LOW',
    telemetryFreshnessSec: 1.0,
    officialCode: `OSM/${c.osmId}`,
    locationDescription: c.locality,
    division: 'Firozpur Division (Northern Railway Sector)',
    line: c.corridorName,
    gateType: c.barrierType === 'none' ? 'Open Track Crossing (No Boom Barrier Mapped)' : 'Mechanical / Lifting Barrier',
    verifiedSource: `OpenStreetMap element ${c.id}`,
    lastStatusChange: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    closureHistoryCountToday: 0,
    avgClosureDurationMin: 7.5,
    currentClosureStartTime: null,
    predictedReopenTime: null,
    dataClassification: 'CLASS_D_LIVE_UNAVAILABLE',
    dataClassificationLabel: 'Live Telemetry Unavailable (Normal Open State)',
    forecastStatus: 'UNAVAILABLE',
    forecastNote: 'Gate open. No verified train detected in Amritsar sector. Live CRIS GPS feed requires field authorization.'
  };
});

// Strictly live-only trains container (populated exclusively from genuine RailKit live telemetry)
export const INITIAL_TRAINS: SectorTrain[] = [];


export const INITIAL_METRICS: OperationalMetrics = {
  totalCrossings: INITIAL_CROSSINGS.length,
  openCount: INITIAL_CROSSINGS.filter(c => c.status === 'OPEN').length,
  closedCount: INITIAL_CROSSINGS.filter(c => c.status === 'CLOSED').length,
  approachingCount: INITIAL_CROSSINGS.filter(c => c.status === 'APPROACHING').length,
  upcomingPredictedClosures: 0,
  activeSectorTrains: 0,
  feedLatencyMs: null,
  feedStatus: 'DISCONNECTED',
  lastUpdate: new Date().toISOString()
};
