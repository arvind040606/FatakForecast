// Types for FatakForecast — Amritsar Railway Intelligence Platform

export type CrossingStatus = 'OPEN' | 'APPROACHING' | 'CLOSED';
export type TrafficCongestion = 'LOW' | 'MODERATE' | 'HEAVY' | 'CRITICAL';
export type TrainDirection = 'UP' | 'DOWN';

export interface RailwayCrossing {
  id: string; // e.g. LC-S25
  name: string; // e.g. Joda Phatak
  punjabiName: string; // e.g. ਜੋੜਾ ਫਾਟਕ
  officialCode: string; // LC-S25 / Spl Class
  division: string; // Firozpur (Northern Railway)
  line: string; // Amritsar - Jalandhar Trunk Double Line
  corridorId: string;
  lat: number;
  lng: number;
  locationDescription: string;
  gateType: string;
  status: CrossingStatus;
  verifiedSource: string;
  lastStatusChange: string;
  closureHistoryCountToday: number;
  avgClosureDurationMin: number;
  currentClosureStartTime: string | null;
  predictedReopenTime: string | null;
  timeToNextClosureSec: number;
  upcomingTrainId: string;
  queueEstimateVehicles: number;
  trafficCongestionLevel: TrafficCongestion;
  telemetryFreshnessSec: number;
}

export interface SectorTrain {
  id: string;
  number: string;
  name: string;
  type: string;
  rakeType: string;
  origin: string;
  destination: string;
  corridorId: string;
  direction: TrainDirection;
  speedKmH: number;
  currentCoordIndex: number;
  lat: number;
  lng: number;
  bearing: number;
  status: 'IN_TRANSIT' | 'CROSSING_GATE' | 'APPROACHING_STATION' | 'YARD_DEPARTURE' | 'PLATFORM_BOARDING';
  telemetrySource: string;
  lastPing: string;
  isStale: boolean;
  distanceToNextCrossingKm: number;
  targetCrossingId: string;
}

export interface RailwayCorridor {
  id: string;
  name: string;
  type: string;
  speedLimitKmH: number;
  coordinates: [number, number][];
}

export interface OperationalMetrics {
  totalCrossings: number;
  openCount: number;
  closedCount: number;
  approachingCount: number;
  upcomingPredictedClosures: number;
  activeSectorTrains: number;
  feedLatencyMs: number;
  feedStatus: 'ONLINE_SYNCHRONIZED' | 'DEGRADED' | 'DISCONNECTED';
  lastUpdate: string;
}

export interface TelemetryPayload {
  type: 'INITIAL_SNAPSHOT' | 'TELEMETRY_UPDATE';
  timestamp: string;
  metrics: OperationalMetrics;
  crossings: RailwayCrossing[];
  trains: SectorTrain[];
  activeCorridors: RailwayCorridor[];
}

export interface ClosureForecast {
  crossingId: string;
  crossingName: string;
  currentStatus: CrossingStatus;
  predictedClosureInSec: number;
  predictedDurationSec: number;
  confidenceScore: number;
  upcomingTrain: SectorTrain | null;
  reliabilityTag: string;
  reopeningEstimate: string | null;
}

export interface AnalyticsData {
  statusDistribution: {
    open: number;
    closed: number;
    approaching: number;
  };
  hourlyClosuresTimeline: {
    hour: string;
    joda: number;
    shivala: number;
    islamabad: number;
    kotKhalsa: number;
  }[];
  gateDwellAverages: {
    name: string;
    avgMinutes: number;
    dailyClosures: number;
    totalDelayHours: number;
  }[];
  predictionAccuracyHistory: {
    measuredDays: number;
    medianErrorSeconds: number;
    accuracyWithin60SecPercent: number;
    totalForecastEvents: number;
  };
}

export interface HealthData {
  status: string;
  system: string;
  version: string;
  division: string;
  serverTime: string;
  telemetryStatus: {
    crisGpsFeed: string;
    ntesRealtimeRelay: string;
    axleCounterBlockInterlocking: string;
    latencyMs: number;
    dataFreshnessSeconds: number;
  };
  metrics: OperationalMetrics;
}

export type ActiveView = 
  | 'overview' 
  | 'map' 
  | 'crossings' 
  | 'upcoming' 
  | 'trains' 
  | 'analytics' 
  | 'health';
