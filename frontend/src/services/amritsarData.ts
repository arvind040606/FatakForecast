import { RailwayCrossing, SectorTrain, RailwayCorridor, OperationalMetrics } from '../types';

export const INITIAL_CORRIDORS: RailwayCorridor[] = [
  {
    id: 'CORR_ASR_JUC',
    name: 'Northern Railway Main Line (Amritsar - Jalandhar Section)',
    type: 'Double Broad Gauge Electrified (25kV AC)',
    speedLimitKmH: 110,
    coordinates: [
      [31.6337, 74.8655], // Amritsar Jn
      [31.6300, 74.8800],
      [31.6248, 74.8992], // Joda Phatak
      [31.6150, 74.9200],
      [31.5950, 74.9500],
      [31.5760, 74.9780]  // Manawala
    ]
  },
  {
    id: 'CORR_ASR_PTK',
    name: 'Amritsar - Verka - Pathankot Line',
    type: 'Single Broad Gauge Electrified',
    speedLimitKmH: 90,
    coordinates: [
      [31.6337, 74.8655], // Amritsar Jn
      [31.6360, 74.8770],
      [31.6385, 74.8878], // Shivala Phatak
      [31.6490, 74.9010],
      [31.6650, 74.9120],
      [31.6811, 74.9224]  // Verka Jn
    ]
  },
  {
    id: 'CORR_ASR_ATT',
    name: 'Amritsar - Chheharta - Attari Line',
    type: 'Single Broad Gauge Electrified',
    speedLimitKmH: 80,
    coordinates: [
      [31.6337, 74.8655], // Amritsar Jn
      [31.6310, 74.8580],
      [31.6285, 74.8512], // Islamabad Phatak
      [31.6320, 74.8250],
      [31.6385, 74.7892]  // Chheharta
    ]
  },
  {
    id: 'CORR_ASR_TT',
    name: 'Amritsar - Bhagtanwala - Khemkaran Line',
    type: 'Single Broad Gauge Diesel/Electrified',
    speedLimitKmH: 70,
    coordinates: [
      [31.6337, 74.8655], // Amritsar Jn
      [31.6250, 74.8550],
      [31.6160, 74.8428], // Kot Khalsa Phatak
      [31.6090, 74.8550],
      [31.6055, 74.8680]  // Bhagtanwala
    ]
  }
];

export const INITIAL_CROSSINGS: RailwayCrossing[] = [
  {
    id: 'LC-S25',
    name: 'Joda Phatak',
    punjabiName: 'ਜੋੜਾ ਫਾਟਕ',
    officialCode: 'LC-S25 / Spl Class',
    division: 'Firozpur (Northern Railway)',
    line: 'Amritsar - Jalandhar Trunk Double Line',
    corridorId: 'CORR_ASR_JUC',
    lat: 31.6248,
    lng: 74.8992,
    locationDescription: 'Chamrang Road / Dhobi Ghat / Near Golden Temple bypass',
    gateType: 'Electrically Coupled Lifting Barrier with Audio-Visual Warble',
    status: 'APPROACHING',
    verifiedSource: 'Northern Railway Interlocking Relay & Axle Counter',
    lastStatusChange: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
    closureHistoryCountToday: 32,
    avgClosureDurationMin: 9.4,
    currentClosureStartTime: null,
    predictedReopenTime: null,
    timeToNextClosureSec: 180,
    upcomingTrainId: '12014',
    queueEstimateVehicles: 24,
    trafficCongestionLevel: 'MODERATE',
    telemetryFreshnessSec: 1.2
  },
  {
    id: 'LC-S27',
    name: 'Shivala Phatak',
    punjabiName: 'ਸ਼ਿਵਾਲਾ ਫਾਟਕ',
    officialCode: 'LC-S27 / Class-A',
    division: 'Firozpur (Northern Railway)',
    line: 'Amritsar - Verka Jn Branch',
    corridorId: 'CORR_ASR_PTK',
    lat: 31.6385,
    lng: 74.8878,
    locationDescription: 'Shivala Bagh Bhaiyan / Circular Road intersection',
    gateType: 'Interlocked Lifting Barrier with Motor Drive',
    status: 'OPEN',
    verifiedSource: 'CRIS Axle Counter Block Telemetry',
    lastStatusChange: new Date(Date.now() - 38 * 60 * 1000).toISOString(),
    closureHistoryCountToday: 21,
    avgClosureDurationMin: 7.8,
    currentClosureStartTime: null,
    predictedReopenTime: null,
    timeToNextClosureSec: 960,
    upcomingTrainId: '14632',
    queueEstimateVehicles: 8,
    trafficCongestionLevel: 'LOW',
    telemetryFreshnessSec: 1.8
  },
  {
    id: 'LC-C22',
    name: 'Islamabad Phatak',
    punjabiName: 'ਇਸਲਾਮਾਬਾਦ ਫਾਟਕ',
    officialCode: 'LC-C22 / Class-B',
    division: 'Firozpur (Northern Railway)',
    line: 'Amritsar - Chheharta - Attari Border Spur',
    corridorId: 'CORR_ASR_ATT',
    lat: 31.6285,
    lng: 74.8512,
    locationDescription: 'Islamabad / Putligarh Commercial Gateway',
    gateType: 'Manned Interlocked Winch Barrier with Approach Annunciator',
    status: 'CLOSED',
    verifiedSource: 'Gatekeeper Station Phone & Home Signal Interlock',
    lastStatusChange: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
    closureHistoryCountToday: 18,
    avgClosureDurationMin: 8.5,
    currentClosureStartTime: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
    predictedReopenTime: new Date(Date.now() + 4 * 60 * 1000).toISOString(),
    timeToNextClosureSec: 0,
    upcomingTrainId: '04694',
    queueEstimateVehicles: 48,
    trafficCongestionLevel: 'HEAVY',
    telemetryFreshnessSec: 0.9
  },
  {
    id: 'LC-C18',
    name: 'Kot Khalsa Phatak',
    punjabiName: 'ਕੋਟ ਖਾਲਸਾ ਫਾਟਕ',
    officialCode: 'LC-C18 / Class-B',
    division: 'Firozpur (Northern Railway)',
    line: 'Amritsar - Bhagtanwala / Khemkaran Line',
    corridorId: 'CORR_ASR_TT',
    lat: 31.6160,
    lng: 74.8428,
    locationDescription: 'Kot Khalsa Main Road / Guru Ki Wadali Link',
    gateType: 'Manual Mechanical Barrier with Key Transmitter Interlock',
    status: 'OPEN',
    verifiedSource: 'Track Circuit Occupancy Relay',
    lastStatusChange: new Date(Date.now() - 52 * 60 * 1000).toISOString(),
    closureHistoryCountToday: 14,
    avgClosureDurationMin: 6.9,
    currentClosureStartTime: null,
    predictedReopenTime: null,
    timeToNextClosureSec: 1840,
    upcomingTrainId: 'BTPN-882',
    queueEstimateVehicles: 5,
    trafficCongestionLevel: 'LOW',
    telemetryFreshnessSec: 2.1
  }
];

export const INITIAL_TRAINS: SectorTrain[] = [
  {
    id: '12014',
    number: '12014',
    name: 'Amritsar Shatabdi Express',
    type: 'Superfast / Shatabdi',
    rakeType: 'LHB 16 Coaches',
    origin: 'Amritsar Jn (ASR)',
    destination: 'New Delhi (NDLS)',
    corridorId: 'CORR_ASR_JUC',
    direction: 'UP',
    speedKmH: 78,
    currentCoordIndex: 1.4,
    lat: 31.6280,
    lng: 74.8880,
    bearing: 115,
    status: 'IN_TRANSIT',
    telemetrySource: 'CRIS GPS Real-time Telemetry',
    lastPing: new Date().toISOString(),
    isStale: false,
    distanceToNextCrossingKm: 1.35,
    targetCrossingId: 'LC-S25'
  },
  {
    id: '04694',
    number: '04694',
    name: 'Firozpur - Amritsar DMU Passenger',
    type: 'Suburban Diesel Multiple Unit',
    rakeType: 'DMU 8 Coaches',
    origin: 'Firozpur Cantt (FZR)',
    destination: 'Amritsar Jn (ASR)',
    corridorId: 'CORR_ASR_ATT',
    direction: 'DOWN',
    speedKmH: 42,
    currentCoordIndex: 2.1,
    lat: 31.6288,
    lng: 74.8495,
    bearing: 65,
    status: 'CROSSING_GATE',
    telemetrySource: 'NTES GPS + Loco Pilot RTIS Relay',
    lastPing: new Date().toISOString(),
    isStale: false,
    distanceToNextCrossingKm: 0.15,
    targetCrossingId: 'LC-C22'
  },
  {
    id: '14632',
    number: '14632',
    name: 'Amritsar - Dehradun Express',
    type: 'Mail / Express',
    rakeType: 'ICF 20 Coaches',
    origin: 'Amritsar Jn (ASR)',
    destination: 'Dehradun (DDN)',
    corridorId: 'CORR_ASR_PTK',
    direction: 'UP',
    speedKmH: 54,
    currentCoordIndex: 0.8,
    lat: 31.6355,
    lng: 74.8745,
    bearing: 52,
    status: 'APPROACHING_STATION',
    telemetrySource: 'RTIS ISRO GPS Satellite Feed',
    lastPing: new Date().toISOString(),
    isStale: false,
    distanceToNextCrossingKm: 1.85,
    targetCrossingId: 'LC-S27'
  },
  {
    id: 'BTPN-882',
    number: 'BTPN-882',
    name: 'Northern Petroleum Rake',
    type: 'Heavy Freight (BTPN Tankers)',
    rakeType: '58 BTPN Wagons + WAG-9 Loco',
    origin: 'Bhagtanwala Yard',
    destination: 'Bhatinda Refinery',
    corridorId: 'CORR_ASR_TT',
    direction: 'DOWN',
    speedKmH: 35,
    currentCoordIndex: 3.5,
    lat: 31.6075,
    lng: 74.8610,
    bearing: 220,
    status: 'YARD_DEPARTURE',
    telemetrySource: 'FOIS (Freight Operating Information System)',
    lastPing: new Date().toISOString(),
    isStale: false,
    distanceToNextCrossingKm: 2.7,
    targetCrossingId: 'LC-C18'
  },
  {
    id: '22488',
    number: '22488',
    name: 'Amritsar - Delhi Vande Bharat',
    type: 'Semi-High Speed Vande Bharat 2.0',
    rakeType: 'Train 18 (16 Car Formation)',
    origin: 'Amritsar Jn (ASR)',
    destination: 'Delhi Jn (DLI)',
    corridorId: 'CORR_ASR_JUC',
    direction: 'UP',
    speedKmH: 0,
    currentCoordIndex: 0.1,
    lat: 31.6337,
    lng: 74.8655,
    bearing: 110,
    status: 'PLATFORM_BOARDING',
    telemetrySource: 'CRIS Train Control Computer (TCC)',
    lastPing: new Date().toISOString(),
    isStale: false,
    distanceToNextCrossingKm: 3.8,
    targetCrossingId: 'LC-S25'
  }
];

export const INITIAL_METRICS: OperationalMetrics = {
  totalCrossings: 4,
  openCount: 2,
  closedCount: 1,
  approachingCount: 1,
  upcomingPredictedClosures: 2,
  activeSectorTrains: 5,
  feedLatencyMs: 118,
  feedStatus: 'ONLINE_SYNCHRONIZED',
  lastUpdate: new Date().toISOString()
};
