// Types for FatakForecast — Amritsar Railway Intelligence Platform
// Rigorous geographic accuracy and evidence-based data integrity

export type CrossingStatus = 'OPEN' | 'APPROACHING' | 'CLOSURE_EXPECTED' | 'CLOSURE_REPORTED' | 'UNKNOWN' | 'CLOSED';
export type TrafficCongestion = 'LOW' | 'MODERATE' | 'HEAVY' | 'CRITICAL';
export type TrainDirection = 'UP' | 'DOWN';
export type VerificationStatus = 'VERIFIED_MAPPED_CROSSING' | 'REQUIRES_FIELD_VERIFICATION';

export interface RailwayCrossing {
  id: string; // Real OpenStreetMap element identifier e.g. 'osm/node/1006212111'
  osmId: string; // e.g. '1006212111'
  osmType: string; // 'node'
  name: string; // Genuine name or street intersection descriptor
  punjabiName: string; // Verified Punjabi (Gurmukhi) label or translation
  locality: string;
  roadClassification: string; // From OSM highway tag
  railClassification: string; // From OSM railway tag
  barrierType?: string; // lifting_gate | full_barrier | unknown
  supervised?: string; // yes | no | unknown
  verificationStatus: VerificationStatus;
  verificationLabel: 'Verified' | 'Verification pending';
  infrastructureVerification?: VerificationStatus;
  dataSource: string; // 'OpenStreetMap (Overpass API)'
  dataSourceAttribution: string;
  lastVerificationDate: string;

  // Operational state disclosure
  statusObservationType: 'SIMULATED_TEST_BENCH' | 'UNOBSERVED' | 'KINEMATIC_DERIVATION' | 'TIMETABLE_PROJECTION';
  statusObservationNote: string;
  status: CrossingStatus;
  gateStatusClassification?: 'VERIFIED_LIVE' | 'ESTIMATED' | 'SCHEDULED' | 'SIMULATED' | 'UNAVAILABLE' | string;
  gateStatusLabel?: string;
  isStatusEstimated?: boolean;

  corridorId: string;
  corridorName?: string;
  lat: number;
  lng: number;

  // Kinematic forecast baseline
  upcomingTrainId: string | null;
  distanceAlongTrackKm?: number | null;
  estimatedTimeToArrivalSec?: number | null;
  timeToNextClosureSec: number;
  forecastStatus?: 'CALCULATED_BASELINE' | 'UNAVAILABLE';
  forecastNote?: string;

  // Additional display fields
  telemetryFreshnessSec?: number;
  officialCode?: string;
  locationDescription?: string;
  line?: string;
  gateType?: string;
  verifiedSource?: string;
  lastStatusChange?: string;
  closureHistoryCountToday?: number;
  avgClosureDurationMin?: number;
  currentClosureStartTime?: string | null;
  predictedReopenTime?: string | null;
  estimatedGateClosingTime?: string | null;
  expectedTrainArrival?: string | null;
  estimatedGateReopeningTime?: string | null;
  remainingWaitSec?: number;
  closureDurationMin?: number | null;
  closureDurationSec?: number | null;
  warningBufferSec?: number;
  traverseDurationSec?: number;
  upcomingTrain?: any;
  primaryTrain?: any;
  upcomingTrains?: Array<{
    trainNumber: string;
    trainName: string;
    direction: string;
    speedKmph: number;
    distanceKm: number;
    etaMinutes: number;
    estimatedPassageTime: string;
  }>;
  subsequentTrains?: Array<{
    trainNumber: string;
    trainName: string;
    direction: string;
    speedKmph: number;
    distanceKm: number;
    etaMinutes: number;
    estimatedPassageTime: string;
  }>;
  totalUpcomingTrains?: number;
  combinedClosure?: {
    isContinuous: boolean;
    isOverlapping: boolean;
    trainCount: number;
    combinedDurationMinutes: number;
    durationMinutes: number;
    closureStart: string;
    closureEnd: string;
    trains: any[];
  } | null;
  timingMetrics?: {
    passageTime?: string | null;
    likelyClosure?: string | null;
    likelyReopen?: string | null;
    leadBuffer?: string | null;
  } | null;
  dataClassification?: string;
  dataClassificationLabel?: string;
  queueEstimateVehicles?: number;
  trafficCongestionLevel?: TrafficCongestion;

  // Physical Gate Telemetry Separation (Honest Gate Status)
  observedPhysicalGateState?: 'OPEN' | 'CLOSED' | 'UNKNOWN';
  physicalSensorAvailable?: boolean;
  physicalSensorNote?: string;
  predictionState?: CrossingPredictionState;
  countdownAvailable?: boolean;

  // Real Crossing Detection Metadata Contract
  statusReason?: string;
  message?: string;
  associatedTrainId?: string | null;
  associatedTrainNumber?: string | null;
  trainRoute?: string | null;
  trainDirection?: string | null;
  positionQuality?: string | null;
  hasLiveSpeedMeasurement?: boolean;
  speedSource?: string;
  etaCalculationMethod?: string;
  predictionConfidence?: 'HIGH' | 'MODERATE' | 'LOW' | 'UNAVAILABLE';
  dataFreshness?: string;
  providerObservationTimestamp?: string | null;
  lastProviderSyncTimestamp?: string | null;
  apiRetrievalTimestamp?: string | null;
  calculationTimestamp?: string | null;
  activeDrill?: boolean;
  closureReported?: boolean;
  confirmedOpenReport?: boolean;
  historicalTrafficPattern?: {
    isHistoricalOnly: boolean;
    corridorType: string;
    corridorClassificationLabel: string;
    scheduledDailyPassages: number;
    peakWindowsIST: string[];
    historicalAvgClosureDurationMin: number;
    dataSource: string;
    disclaimer?: string;
  };
  lastTrainPassed?: {
    trainNumber: string;
    trainName: string;
    direction?: string;
    distanceKm?: number;
  } | null;
}

export type CrossingPredictionState =
  | 'NO_RELIABLE_APPROACH'
  | 'APPROACHING'
  | 'CLOSURE_PREDICTED'
  | 'PASSAGE_DETECTED'
  | 'REOPENING_UNCONFIRMED'
  | 'OPEN_CONFIRMED'
  | 'STATUS_UNKNOWN'
  | 'TELEMETRY_STALE';

export type PositionClassification =
  | 'ACTUAL_GPS'
  | 'STATION_PROGRESS'
  | 'TRACK_INTERPOLATION'
  | 'TIMETABLE_ESTIMATE'
  | 'SYNTHETIC_DEMO'
  | 'UNKNOWN'
  | 'ACTUAL_POSITION'
  | 'PROVIDER_REPORTED_POSITION'
  | 'INTERPOLATED_POSITION'
  | 'EXTRAPOLATED_POSITION'
  | 'SCHEDULED_POSITION'
  | 'SIMULATED_POSITION'
  | 'POSITION_UNAVAILABLE';

export type TrainDataState = 'LIVE' | 'STALE' | 'SCHEDULED' | 'SIMULATED' | 'UNAVAILABLE' | 'UNKNOWN' | 'CANCELLED' | 'NOT_STARTED' | 'TERMINATED';

export interface TrainScheduleStop {
  sequence: number;
  stationCode: string;
  stationName: string;
  isHalt: boolean;
  status: 'departed' | 'at-station' | 'upcoming' | string;
  scheduledArrival?: string | null;
  scheduledDeparture?: string | null;
  actualArrival?: string | null;
  actualDeparture?: string | null;
  delayArrival?: number;
  delayDeparture?: number;
  platform?: string | null;
  distance?: number;
  speedToNextStationKmph?: number | null;
  coachPosition?: string | null;
}

export interface SectorTrain {
  id: string;
  number: string;
  name: string;
  type: string;
  rakeType: string;
  origin: string;
  destination: string;
  corridorId: string | null;
  direction: TrainDirection;
  speedKmH: number;
  currentCoordIndex: number;
  lat: number | null;
  lng: number | null;
  bearing: number;
  status: 'IN_TRANSIT' | 'CROSSING_GATE' | 'APPROACHING_STATION' | 'YARD_DEPARTURE' | 'PLATFORM_BOARDING' | 'TERMINATED' | 'OUT_OF_SECTOR' | 'CANCELLED' | 'STATIONARY' | 'NOT_STARTED';
  dataState: TrainDataState;
  positionClassification?: PositionClassification;
  providerObservationTimestamp?: string | null;
  observationAccuracy?: string;
  telemetrySource: string;
  lastPing: string | null;
  isStale: boolean;
  currentStationName?: string;
  lastReportedLocation?: string;
  distanceFromAmritsarKm?: number | null;
  isWithinAmritsarSector?: boolean;
  serviceStatus?: string;
  distanceToNextCrossingKm?: number | null;
  targetCrossingId?: string | null;
  delayMinutes?: number;
  schedule?: TrainScheduleStop[];
  hasLiveSpeedMeasurement?: boolean;
  liveSpeedKmH?: number | null;
  sectionalSpeedKmH?: number | null;
}

export interface RailwayCorridor {
  id: string;
  name: string;
  type?: string;
  speedLimitKmH: number;
  coordinates: [number, number][];
  osmDataSource?: string;
  punjabiName?: string;
  description?: string;
  electrified?: boolean;
  tracksCount?: number;
}

export type ConnectionLifecycleState = 'CONNECTING' | 'LIVE' | 'STALE' | 'OFFLINE';

export interface ConnectionStateDetails {
  state: ConnectionLifecycleState;
  backendConnected: boolean;
  railwayFeedStatus: 'LIVE' | 'STALE' | 'OFFLINE';
  latencyMs: number | null;
  lastSyncIso: string | null;
}

export interface OperationalMetrics {
  totalCrossings: number;
  openCount: number;
  closedCount: number;
  approachingCount: number;
  unknownCount?: number;
  closureExpectedCount?: number;
  upcomingPredictedClosures: number;
  activeSectorTrains: number;
  trainsInSector?: number;
  feedLatencyMs: number | null;
  feedStatus: 'CONNECTED' | 'ONLINE_SYNCHRONIZED' | 'DEGRADED' | 'DISCONNECTED';
  railwayFeedFreshness?: 'LIVE' | 'STALE' | 'OFFLINE';
  socketConnected?: boolean;
  feedProvider?: string;
  provider?: string;
  isDualFeedActive?: boolean;
  lastUpdate: string;
  lastSuccessfulSync?: string | null;
}

export interface TelemetryPayload {
  type: 'INITIAL_SNAPSHOT' | 'TELEMETRY_UPDATE';
  timestamp: string;
  metrics: OperationalMetrics;
  crossings: RailwayCrossing[];
  trains: SectorTrain[];
  activeCorridors?: RailwayCorridor[];
}

export interface ClosureForecast {
  crossingId: string;
  crossingName: string;
  currentStatus: CrossingStatus;
  predictedClosureInSec: number;
  predictedDurationSec: number;
  upcomingTrain: SectorTrain | null;
  distanceAlongTrackKm?: number | null;
  forecastStatus: 'CALCULATED_BASELINE' | 'UNAVAILABLE';
  forecastType: string;
  methodologyNote: string;
  reopeningEstimate: string | null;
  predictionState?: CrossingPredictionState;
  countdownAvailable?: boolean;
}

export interface AnalyticsData {
  accuracyMeasurement: {
    status: 'UNMEASURED';
    message: string;
    evaluatedEvents: number;
    evaluationPeriod: string;
    dataClassification: 'CLASS_D_UNAVAILABLE';
    benchmarkProtocol: {
      meanAbsoluteError: string;
      medianAbsoluteError: string;
      pctWithin30Sec: string;
      pctWithin60Sec: string;
      closureTolerance: string;
    };
  };
  dataSourceAudit: {
    category: string;
    classification: 'CLASS_A' | 'CLASS_B' | 'CLASS_C' | 'CLASS_D';
    classificationLabel: string;
    source: string;
    status: string;
    description: string;
  }[];
  discoveredInfrastructure: {
    distinctCrossingsCount: number;
    osmCrossingNodesCount: number;
    osmRailwayWaysCount: number;
    railwayCorridorsCount: number;
    lastOsmSync: string;
  };
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
}

export interface HealthData {
  status: string;
  system: string;
  version: string;
  serverTime: string;
  telemetryStatus: {
    osmInfrastructure: string;
    trainMovementFeed: string;
    apiKeyConfigured?: boolean;
    apiKeyMasked?: string;
    provider?: string;
    providerStatus?: string;
    latencyMs?: number;
    lastSuccessfulSync?: string | null;
    lastError?: string | null;
  };
  metrics: OperationalMetrics;
}

export type TravelMode = 'car' | 'motorcycle' | 'walking';

export type SavedPlaceCategory = 'HOME' | 'COLLEGE' | 'WORK' | 'CUSTOM';

export interface SavedPlace {
  id: string;
  name: string;
  category: SavedPlaceCategory;
  lat: number;
  lng: number;
  address?: string;
  createdAt: string;
}

export interface PlaceSearchResult {
  placeId: string;
  osmId?: number;
  osmType?: string;
  displayName: string;
  name: string;
  locality: string;
  lat: number;
  lng: number;
  type?: string;
  category?: string;
  importance?: number;
  provider: string;
}

export type NotificationCategory = 
  | 'departureReminders' 
  | 'crossingStatusChanges' 
  | 'routeEtaChanges' 
  | 'activeRouteWarnings' 
  | 'providerOutages';

export interface NotificationPreferences {
  departureReminders: boolean; // Upcoming recommended departure
  crossingStatusChanges: boolean; // Meaningful shifts in predicted crossing closure
  routeEtaChanges: boolean; // Significant changes to route or ETA
  activeRouteWarnings: boolean; // Crossing warning during active journey
  providerOutages: boolean; // Provider outage invalidating recommendation
  // Configurable thresholds & cooldowns
  alertRadiusMeters: number; // Vicinity radius for approaching crossing alerts (e.g. 2500m)
  routeDelayThresholdMin: number; // Delay difference to trigger route change alert (e.g. 3 min)
  closureAdvanceNoticeMin: number; // Advance notice for predicted closure window (e.g. 5 min)
  cooldownMinutes: number; // Cooldown between repeat alerts for same event (e.g. 10 min)
}

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  category: NotificationCategory;
  timestamp: string;
  crossingId?: string;
  crossingName?: string;
  isRead: boolean;
  scheduledFor?: string;
  eventSignature?: string;
  actionUrl?: string;
}

export interface RouteCrossingHit {
  id: string;
  name: string;
  punjabiName?: string;
  locality?: string;
  coordinates: [number, number];
  lat: number;
  lng: number;
  distanceAlongRouteMeters: number;
  distanceAlongRouteKm: number;
  travelTimeToCrossingSec: number;
  userArrivalTimestamp: string;
  currentStatus: CrossingStatus;
  gateStatusLabel: string;
  isStatusEstimated: boolean;
  predictedStatusAtArrival: CrossingStatus;
  delaySec: number | null;
  isDelayUnknown?: boolean;
  delayStatus?: 'UNKNOWN' | 'ESTIMATED' | 'CONFIRMED';
  uncertaintyReason?: string;
  conflictSeverity: 'NONE' | 'LOW' | 'HIGH' | 'UNKNOWN';
  message: string;
  forecastNote?: string;
  dataSource: string;
  verificationStatus: string;
  corridorId?: string | null;
  corridorName?: string | null;
  confirmedPhysicalGateState?: 'UNKNOWN' | 'OPEN' | 'CLOSED';
  observedRailwayStationEvents?: string;
  estimatedTrainArrival?: string | null;
  predictedGateClosure?: string | null;
  predictedGateReopening?: string | null;
  predictionConfidence?: 'HIGH' | 'MODERATE' | 'LOW' | 'UNKNOWN';
  telemetryFreshnessSec?: number | null;
  estimatedGateClosingTime?: string | null;
  estimatedGateReopeningTime?: string | null;
  dataClassification?: string;
}

export interface RouteTurnStep {
  instruction: string;
  modifier?: string;
  type?: string;
  distanceMeters: number;
  durationSeconds: number;
  location?: [number, number] | null;
  streetName?: string;
}

export interface CandidateJourneyRoute {
  id: string;
  name?: string;
  type: 'FASTEST_ROAD' | 'FATAK_AWARE' | 'AVOID_FATAKS';
  label: string;
  description: string;
  source: string;
  travelMode: TravelMode;
  distanceMeters: number;
  distanceKm: number;
  roadDurationSec: number;
  roadDurationMin: number;
  durationMin?: number;
  crossingDelaySec: number | null;
  delayRange?: string;
  dataFreshness?: string;
  isDelayUnknown: boolean;
  unknownCrossingsCount: number;
  totalDurationSec: number;
  totalDurationMin: number;
  totalEstimatedMin?: number;
  estimatedArrivalTime: string;
  crossingsCount: number;
  crossingCount?: number;
  crossings: RouteCrossingHit[];
  crossingsOnRoute?: any[];
  coordinates: [number, number][];
  steps?: RouteTurnStep[];
  isGradeSeparatedFlyover?: boolean;
  bypassName?: string | null;
  comparisonBadge?: string;
  tradeoffSummary?: string;
  recommendationReason?: string;
  dataConfidence: {
    level: string;
    label: string;
    uncertaintyNote: string;
  };
}

export interface DepartureOption {
  offsetSec: number;
  offsetMin: number;
  label: string;
  departureTimestamp: string;
  travelDurationSec: number;
  delayAtCrossingsSec: number;
  totalTimeFromNowSec: number;
  expectedArrivalTime: string;
  hasConflict: boolean;
  conflictCrossings?: string[];
}

export interface DepartureRecommendation {
  action: 'LEAVE_NOW' | 'WAIT' | 'CONSIDER_ALTERNATIVE';
  badge: string;
  recommendedDepartureOffsetSec: number;
  recommendedRoute?: 'PRIMARY' | 'ALTERNATIVE';
  summary: string;
  details: string;
  confidence: 'HIGH' | 'MODERATE' | 'CALCULATED_BASELINE';
  uncertaintyNote?: string;
}

export interface PlannedJourney {
  success: boolean;
  origin: [number, number];
  destination: [number, number];
  travelMode: TravelMode;
  departureOffsetSec: number;
  plannedAt: string;
  routes?: CandidateJourneyRoute[];
  fastestRoadRoute?: CandidateJourneyRoute;
  fatakAwareRoute?: CandidateJourneyRoute;
  avoidFataksRoute?: CandidateJourneyRoute | null;
  selectedRouteType?: 'FASTEST_ROAD' | 'FATAK_AWARE' | 'AVOID_FATAKS';
  primaryRoute: {
    source: string;
    travelMode: TravelMode;
    distanceMeters: number;
    durationSeconds: number;
    normalDurationSec: number;
    additionalDelaySec: number;
    totalDurationSec: number;
    estimatedArrivalTime: string;
    coordinates: [number, number][];
    crossings: RouteCrossingHit[];
  };
  alternativeRoute: {
    source: string;
    bypassName: string;
    travelMode: TravelMode;
    distanceMeters: number;
    durationSeconds: number;
    normalDurationSec: number;
    additionalDelaySec: number;
    totalDurationSec: number;
    estimatedArrivalTime: string;
    savingsSec: number;
    coordinates: [number, number][];
    crossings: RouteCrossingHit[];
  } | null;
  departureOptions: DepartureOption[];
  recommendation: DepartureRecommendation;
  dataConfidence?: {
    level: string;
    label: string;
    reason?: string;
    uncertaintyNote?: string;
  };
}

export type ActiveRoute = 
  | '/' 
  | '/crossings' 
  | '/forecasts' 
  | '/trains' 
  | '/planner'
  | '/saved-places'
  | '/notifications'
  | '/data-health'
  | '/settings'
  | '/analytics';


export interface ProviderTelemetry {
  timestamp: string;
  overallStatus: string;
  providers: {
    railkit: {
      name: string;
      configured: boolean;
      status: string;
      latencyMs: number | null;
      lastSync: string | null;
      error: string | null;
    };
    ipstack: {
      name: string;
      configured: boolean;
      status: string;
      cachedEntries: number;
    };
    osm: {
      name: string;
      status: string;
      crossings: number;
      ways: number;
    };
    osrm: {
      name: string;
      status: string;
      endpoint: string;
    };
  };
  aggregation: {
    totalTrainRecords: number;
    activeTrains: number;
    lastAggregationTime: string | null;
    activeProviders: string[];
    deduplicationStrategy: string;
  };
}

export type AlarmRecurrence = 'WEEKDAYS' | 'WEEKENDS' | 'DAILY' | 'ONCE';

export interface SmartCommuteAlarm {
  id: string;
  name: string;
  enabled: boolean;
  targetTime: string; // e.g. "08:30" (24h format HH:mm)
  recurrence: AlarmRecurrence;
  originId: string;
  originName: string;
  destinationId: string;
  destinationName: string;
  destinationCoords: [number, number];
  travelMode: TravelMode;
  autoDetectLocation: boolean;
  soundAlarm: boolean;
  advanceNoticeMin: number;
  lastTriggeredDate?: string;
  createdAt: string;
}

export interface CommuteAlarmDepartureEstimate {
  alarmId: string;
  destinationName: string;
  targetArrivalTime: string;
  prepTimeMin: number;
  travelDurationMin: number;
  distanceKm: number;
  potentialCrossingDelayMin: number;
  recommendedDepartureTime: string;
  prepStartTime: string;
  urgency: 'LEAVE_IMMEDIATELY' | 'LEAVE_SOON' | 'ON_TRACK' | 'PASSED';
  reason: string;
}

export type LocationSource = 'GPS_HARDWARE' | 'MANUAL_ENTRY' | 'APPROXIMATE_IP';

export interface UserLocationProfile {
  userName?: string;
  lat: number;
  lng: number;
  locationName: string;
  source: LocationSource;
  isApproximate: boolean;
  accuracyMeters?: number;
  updatedAt: string;
}

export interface NearbyCrossingItem {
  crossing: RailwayCrossing;
  distanceMeters: number;
  distanceKm: number;
  distanceLabel: string;
  dataFreshness: 'LIVE' | 'SCHEDULED' | 'CALCULATED_BASELINE';
}

export type ThemeMode = 'dark' | 'light' | 'system';
