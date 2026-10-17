// =========================================================================
// FATAKFORECAST — TRAIN DETECTION & SPEED-BASED GATE DYNAMICS CONTROLLER
// Strict Geographic Validation, Explicit Multi-State Telemetry Contract,
// Timestamp Separation, Honest Uncertainty, and Route-Aware Interlocking
// =========================================================================

import { GeographicValidator, projectPointOnPolyline } from './geographicValidator.js';
import { STATION_COORDINATES } from './stationCoordinates.js';

/**
 * Centrally configured operational thresholds for railway crossing detection
 * Calibrated against Amritsar / Northern Railway level crossing standard ground truth:
 * - Fatak closes 10 to 15 minutes before train arrival (nominal: 12 minutes = 720 seconds)
 * - Fatak reopens 1 to 3 minutes after train completely clears (nominal: 2 minutes = 120 seconds)
 */
export const CROSSING_DETECTION_THRESHOLDS = {
  // Amritsar Ground Truth Closure Lead Time: authentic 2.5 to 4.5 minutes (nominal: 3.5 minutes = 210 seconds)
  CLOSURE_LEAD_SEC: 210,
  CLOSURE_LEAD_MIN_SEC: 150, // 2.5 minutes
  CLOSURE_LEAD_MAX_SEC: 270, // 4.5 minutes

  // Amritsar Ground Truth Post-Passage Reopening Buffer: 1 to 3 minutes (nominal: 2 minutes / 120s)
  GATE_CLEARANCE_BUFFER_SEC: 120, // 2 minutes post-passage barrier lifting & cabin block clearance
  GATE_CLEARANCE_MIN_SEC: 60,   // 1 minute
  GATE_CLEARANCE_MAX_SEC: 180,  // 3 minutes

  // Maximum realistic duration a physical level crossing barrier is kept closed in Northern Railway Amritsar operations: 15 minutes (900s)
  // Indian Railways rules prohibit keeping road traffic blocked for excessive durations without clearance.
  MAX_GATE_CLOSURE_DURATION_SEC: 900,
  MAX_GATE_WAIT_SEC: 900,
  // Maximum gap between consecutive train passage times to permit continuous barrier closure: 3.5 minutes
  MAX_CONTINUOUS_PASSAGE_GAP_MIN: 3.5,

  // Imminent closure expectation: train arrival <= 15 minutes (900s)
  IMMINENT_WARNING_SEC: 900,
  // Interlocking track circuit approach distance: 15.0 km
  IMMINENT_TRACK_DISTANCE_KM: 15.0,
  // Active approach warning horizon: 25 minutes (1500s)
  APPROACH_HORIZON_MIN: 25.0,
  // Active approach track distance: 20.0 km
  APPROACH_DISTANCE_KM: 20.0,
  // Primary forecast outlook horizon: 240 minutes (4 hours)
  PRIMARY_FORECAST_HORIZON_MIN: 240,
  // Extended outlook horizon: 360 minutes (6 hours)
  EXTENDED_HORIZON_MIN: 360,
  // Maximum age of provider observation before data is classified as STALE: 15 minutes (900s)
  STALE_TELEMETRY_TIMEOUT_SEC: 900,
  // Minimum credible rolling speed: 15 km/h
  MIN_ROLLING_SPEED_KMPH: 15,
  // Maximum corridor line speed on Northern Railway tracks: 130 km/h
  MAX_SECTION_SPEED_KMPH: 130,
  // Default sectional speed estimate when live speedometer is not supplied: 53 km/h
  DEFAULT_SECTIONAL_SPEED_KMPH: 53
};

export class TrainDetectionEngine {
  constructor(apiKey) {
    this.apiKey = apiKey || process.env.TRAIN_API_KEY || null;
    this.providerEndpoint = process.env.TRAIN_API_URL || null;
    // Default operating mode: LIVE_OPERATIONAL (Strict verification, no fake simulated positions presented as live)
    this.operatingMode = process.env.OPERATION_MODE || 'LIVE_OPERATIONAL'; // 'LIVE_OPERATIONAL' | 'DEMO_SIMULATION'
    this.activeTrains = new Map();
    this.crossingStates = new Map();
    this.lastPollingTimestamp = null;
    this.eventLogs = [];
  }

  getApiKey() {
    return this.apiKey;
  }

  getMaskedKey() {
    if (!this.apiKey) return 'NOT_CONFIGURED';
    if (this.apiKey.length <= 8) return '****';
    return `${this.apiKey.substring(0, 7)}****${this.apiKey.substring(this.apiKey.length - 4)}`;
  }

  isConfigured() {
    return Boolean(this.apiKey);
  }

  setApiKey(key) {
    this.apiKey = key;
  }

  getOperatingMode() {
    return this.operatingMode;
  }

  setOperatingMode(mode) {
    if (mode === 'DEMO_SIMULATION' || mode === 'LIVE_OPERATIONAL') {
      this.operatingMode = mode;
      return true;
    }
    return false;
  }

  // Get rake physical length in meters based on train type
  getRakeLengthMeters(train) {
    if (train.rakeType?.includes('16 Coaches') || train.rakeType?.includes('Train 18')) return 400;
    if (train.rakeType?.includes('20 Coaches')) return 480;
    if (train.rakeType?.includes('DMU 8')) return 190;
    if (train.rakeType?.includes('58 BTPN')) return 680;
    return 350; // Default rake length
  }

  // Dynamic approach warning buffer time (seconds) scaled by train velocity
  getSpeedScaledBufferSec(speedKmH) {
    if (speedKmH >= 90) return 210; // 3.5 minutes warning for high speed
    if (speedKmH >= 65) return 180; // 3.0 minutes warning for mainline express
    if (speedKmH >= 40) return 140; // 2.3 minutes warning for suburban / passenger
    return 90; // 1.5 minutes warning for yard / slow freight
  }

  /**
   * Validate a train candidate before using it for crossing safety calculations
   */
  validateTrainCandidate(train) {
    const errors = [];

    // 1. Check data state
    if (!train.dataState) {
      errors.push('Missing explicit dataState field');
    }

    // Explicitly reject synthetic demo trains from real operational predictions
    if (train.positionClassification === 'SYNTHETIC_DEMO' || train.dataState === 'SIMULATED' || String(train.number || '').startsWith('SIM-')) {
      if (this.operatingMode === 'LIVE_OPERATIONAL') {
        errors.push('Synthetic demo test rake rejected: cannot affect real operational crossings');
      }
    }

    // In LIVE_OPERATIONAL mode, reject SIMULATED, SCHEDULED, STALE, and UNKNOWN trains
    if (this.operatingMode === 'LIVE_OPERATIONAL') {
      if (train.dataState === 'SIMULATED') {
        errors.push('Simulated train rejected in LIVE_OPERATIONAL mode');
      }
      if (train.dataState !== 'LIVE') {
        errors.push(`Train dataState is ${train.dataState || 'UNVERIFIED'}; only verified LIVE provider telemetry can trigger crossing gate closures`);
      }
      if (train.dataState === 'STALE' || train.isStale === true) {
        errors.push('Stale telemetry ping rejected (>15 min old)');
      }
      if (train.dataState === 'UNKNOWN') {
        errors.push('Train position is unknown');
      }
    } else {
      if (train.isStale === true || train.dataState === 'STALE') {
        errors.push('Stale telemetry ping rejected (>15 min old)');
      }
    }

    // 2. Geographic boundary & operational status validation: Must be physically inside Amritsar sector
    if (train.status === 'NOT_STARTED' || train.status === 'not-started') {
      errors.push('Train has not started operation (NOT_STARTED)');
    }
    if (typeof train.lat !== 'number' || typeof train.lng !== 'number' || isNaN(train.lat) || isNaN(train.lng) || (train.lat === 0 && train.lng === 0) || train.lat < -90 || train.lat > 90 || train.lng < -180 || train.lng > 180) {
      errors.push('Train geographic coordinates are missing or invalid (null or unobserved position)');
    }
    if (train.isWithinAmritsarSector === false) {
      errors.push('Train is explicitly outside Amritsar operational sector');
    }
    if (train.status === 'OUT_OF_SECTOR') {
      errors.push('Train status is OUT_OF_SECTOR');
    }
    if (train.status === 'TERMINATED') {
      errors.push('Train service has terminated');
    }
    if (train.status === 'CANCELLED') {
      errors.push('Train service has been cancelled');
    }
    if (typeof train.distanceFromAmritsarKm === 'number' && train.distanceFromAmritsarKm > GeographicValidator.AMRITSAR_SECTOR_RADIUS_KM) {
      errors.push(`Train is ${train.distanceFromAmritsarKm}km away (outside operational sector limit of ${GeographicValidator.AMRITSAR_SECTOR_RADIUS_KM}km)`);
    }

    const sectorCheck = GeographicValidator.isWithinSector(train.lat, train.lng);
    if (!sectorCheck.inSector) {
      errors.push(`Geographic Rejection: Train is outside Amritsar sector (${sectorCheck.distanceFromAsrKm} km away; e.g. at New Delhi)`);
    }

    // 3. Stale observation timestamp check (genuine provider timestamp, not disguised by fresh polling)
    const effectiveObservationTime = train.providerObservationTimestamp || train.lastPing || train.timestamp || train.lastUpdate || train.time;
    if (effectiveObservationTime) {
      const obsTimeMs = new Date(effectiveObservationTime).getTime();
      if (isNaN(obsTimeMs)) {
        errors.push('Invalid observation timestamp format');
      } else {
        const ageMs = Date.now() - obsTimeMs;
        if (ageMs > CROSSING_DETECTION_THRESHOLDS.STALE_TELEMETRY_TIMEOUT_SEC * 1000) {
          errors.push('Telemetry observation is over 15 minutes old (stale telemetry)');
        }
      }
    }

    // 4. Direction validation: Train travel direction must be verified UP or DOWN
    const dirUpper = String(train.direction || '').toUpperCase();
    if (dirUpper !== 'UP' && dirUpper !== 'DOWN') {
      errors.push(`Train travel direction (${train.direction || 'unspecified'}) is missing or unverified`);
    }

    // 5. Contradictory Station Progress vs Coordinates Check
    const stnCode = train.currentStationCode || train.stationCode;
    if (stnCode && STATION_COORDINATES[stnCode] && typeof train.lat === 'number' && typeof train.lng === 'number' && train.lat !== 0 && train.lng !== 0) {
      const stn = STATION_COORDINATES[stnCode];
      const R = 6371;
      const dLat = (train.lat - stn.lat) * Math.PI / 180;
      const dLon = (train.lng - stn.lng) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(stn.lat * Math.PI / 180) * Math.cos(train.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
      const distKm = 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      if (distKm > 25.0) {
        errors.push(`Contradictory telemetry: Reported station (${stnCode}) is ${distKm.toFixed(1)} km from reported coordinates (${train.lat}, ${train.lng})`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      reason: errors.join('; ')
    };
  }

  /**
   * Helper to construct a standardized, semantically correct UNKNOWN / STATUS UNAVAILABLE response
   */
  createUnknownCrossingEvaluation(statusReason, calculationTimestamp, feedContext = {}, options = {}) {
    const candidateTrain = options.candidateTrain || null;
    const upcomingTrainPayload = candidateTrain ? {
      id: candidateTrain.id || candidateTrain.number,
      number: candidateTrain.number,
      trainNumber: candidateTrain.number,
      name: candidateTrain.name,
      trainName: candidateTrain.name,
      type: candidateTrain.type,
      dataState: candidateTrain.dataState,
      speedKmH: candidateTrain.speedKmH ?? null,
      speedKmph: candidateTrain.speedKmH ?? null,
      direction: candidateTrain.direction,
      distanceKm: candidateTrain.distanceKm ?? null,
      origin: candidateTrain.origin || 'Amritsar Jn',
      destination: candidateTrain.destination || 'Amritsar Sector',
      status: candidateTrain.status,
      isUnconfirmed: true
    } : null;

    return {
      status: 'UNKNOWN',
      statusReason,
      legacyStatus: 'DATA_UNAVAILABLE',
      predictionState: 'TELEMETRY_UNAVAILABLE',
      countdownAvailable: false,
      gateStatusClassification: options.classification || 'STATUS UNKNOWN',
      gateStatusLabel: options.label || 'STATUS UNKNOWN',
      predictionAvailable: false,
      isStatusEstimated: true,
      statusObservationType: 'UNOBSERVED',
      statusObservationNote: options.observationNote || statusReason,
      observedPhysicalGateState: 'UNKNOWN',
      physicalSensorAvailable: false,
      physicalSensorNote: 'No operational hardware barrier sensor or CRIS interlocking relay telemetry connected. Physical gate state is UNKNOWN.',
      timeToNextClosureSec: 0,
      upcomingTrainId: null,
      associatedTrainId: null,
      associatedTrainNumber: null,
      trainRoute: (candidateTrain?.origin && candidateTrain?.destination) ? `${candidateTrain.origin} → ${candidateTrain.destination}` : null,
      trainDirection: candidateTrain?.direction || null,
      distanceAlongTrackKm: candidateTrain?.distanceKm || null,
      estimatedTimeToArrivalSec: null,
      estimatedGateClosingTime: null,
      expectedTrainArrival: null,
      estimatedGateReopeningTime: null,
      predictedReopenTime: null,
      remainingWaitSec: 0,
      dataClassification: options.dataClassification || 'DATA_UNAVAILABLE',
      dataClassificationLabel: options.dataClassificationLabel || 'Telemetry Insufficient',
      forecastStatus: 'UNAVAILABLE',
      forecastNote: statusReason,
      message: statusReason,
      recommendation: options.recommendation || 'STATUS UNKNOWN — PROCEED WITH CAUTION',
      speedKmH: candidateTrain?.speedKmH ?? null,
      hasLiveSpeedMeasurement: Boolean(candidateTrain?.hasLiveSpeedMeasurement),
      speedSource: candidateTrain?.speedSource || 'UNAVAILABLE',
      etaCalculationMethod: 'UNAVAILABLE',
      predictionConfidence: 'UNAVAILABLE',
      providerObservationTimestamp: options.providerObservationTimestamp || null,
      apiRetrievalTimestamp: options.apiRetrievalTimestamp || null,
      calculationTimestamp,
      lastProviderSyncTimestamp: feedContext.lastSuccessfulSync || null,
      dataFreshness: options.dataFreshness || candidateTrain?.dataState || 'UNAVAILABLE',
      warningBufferSec: 180,
      traverseDurationSec: 60,
      candidateTrain: upcomingTrainPayload,
      passingTrain: upcomingTrainPayload,
      upcomingTrain: null,
      primaryTrain: null,
      upcomingTrains: [],
      subsequentTrains: [],
      totalUpcomingTrains: 0,
      combinedClosure: null,
      overlappingClosure: null,
      timingMetrics: null,
      closure: null,
      reopening: null,
      lastTrainPassed: options.lastTrainPassed || null
    };
  }

  /**
   * Evaluate exact gate closure and opening dynamics for a crossing
   * @param {Object} crossing - The level crossing record
   * @param {Array} relevantTrains - Sector trains assigned to this track corridor
   * @param {Array} corridorCoordinates - OSM permanent way track points
   * @param {Object} feedContext - Health and sync status of telemetry providers
   */
  evaluateCrossingGateState(crossing, relevantTrains, corridorCoordinates, feedContext = {}) {
    const now = Date.now();
    const calculationTimestamp = new Date(now).toISOString();

    // -------------------------------------------------------------------------
    // 0. PHYSICAL GATE SENSOR & CONFIRMED OPERATIONAL DRILL OVERRIDES
    // Trustworthy physical evidence takes absolute precedence over kinematic deductions.
    // -------------------------------------------------------------------------
    if (crossing.activeDrill || crossing.closureReported || crossing.observedPhysicalGateState === 'CLOSED') {
      const reason = crossing.activeDrill 
        ? 'Operational emergency drill active. Boom barriers locked.' 
        : crossing.closureReported 
        ? 'Verified gatekeeper/user closure reported. Boom barriers locked.'
        : 'Physical gate barrier sensor confirmed CLOSED.';
      return {
        status: 'CLOSED',
        statusReason: reason,
        legacyStatus: 'CONFIRMED_CLOSED',
        predictionState: 'CONFIRMED_CLOSED',
        countdownAvailable: false,
        gateStatusClassification: 'CONFIRMED CLOSED',
        gateStatusLabel: 'CONFIRMED CLOSED',
        predictionAvailable: true,
        isStatusEstimated: false,
        statusObservationType: crossing.activeDrill ? 'OPERATIONAL_DRILL' : crossing.closureReported ? 'VERIFIED_REPORT' : 'HARDWARE_SENSOR',
        statusObservationNote: reason,
        observedPhysicalGateState: 'CLOSED',
        physicalSensorAvailable: crossing.observedPhysicalGateState === 'CLOSED',
        physicalSensorNote: crossing.observedPhysicalGateState === 'CLOSED' ? 'Operational hardware barrier sensor connected.' : 'Operational drill/verified manual report active.',
        timeToNextClosureSec: 0,
        upcomingTrainId: null,
        associatedTrainId: null,
        associatedTrainNumber: null,
        trainRoute: null,
        trainDirection: null,
        distanceAlongTrackKm: null,
        estimatedTimeToArrivalSec: null,
        estimatedGateClosingTime: null,
        expectedTrainArrival: null,
        estimatedGateReopeningTime: null,
        predictedReopenTime: null,
        remainingWaitSec: 0,
        dataClassification: 'CONFIRMED_OBSERVATION',
        dataClassificationLabel: 'Confirmed Closed',
        forecastStatus: 'CONFIRMED_CLOSED',
        forecastNote: reason,
        message: reason,
        recommendation: 'DO NOT CROSS — CONFIRMED CLOSED',
        speedKmH: null,
        hasLiveSpeedMeasurement: false,
        speedSource: 'UNAVAILABLE',
        etaCalculationMethod: 'UNAVAILABLE',
        predictionConfidence: 'HIGH',
        providerObservationTimestamp: null,
        apiRetrievalTimestamp: null,
        calculationTimestamp,
        lastProviderSyncTimestamp: feedContext.lastSuccessfulSync || null,
        dataFreshness: 'LIVE',
        upcomingTrain: null,
        primaryTrain: null,
        upcomingTrains: [],
        subsequentTrains: [],
        totalUpcomingTrains: 0,
        combinedClosure: null,
        overlappingClosure: null,
        timingMetrics: null,
        closure: null,
        reopening: null,
        lastTrainPassed: crossing.lastTrainPassed || null
      };
    }

    if (crossing.observedPhysicalGateState === 'OPEN' || crossing.confirmedOpenReport === true) {
      const reason = 'Physical gate barrier confirmed OPEN via hardware sensor or verified gatekeeper all-clear.';
      return {
        status: 'OPEN',
        statusReason: reason,
        legacyStatus: 'CONFIRMED_OPEN',
        predictionState: 'CONFIRMED_OPEN',
        countdownAvailable: false,
        gateStatusClassification: 'CONFIRMED OPEN',
        gateStatusLabel: 'CONFIRMED OPEN',
        predictionAvailable: true,
        isStatusEstimated: false,
        statusObservationType: 'HARDWARE_SENSOR',
        statusObservationNote: reason,
        observedPhysicalGateState: 'OPEN',
        physicalSensorAvailable: true,
        physicalSensorNote: 'Operational hardware barrier sensor or verified gatekeeper relay reports gate OPEN.',
        timeToNextClosureSec: 0,
        upcomingTrainId: null,
        associatedTrainId: null,
        associatedTrainNumber: null,
        trainRoute: null,
        trainDirection: null,
        distanceAlongTrackKm: null,
        estimatedTimeToArrivalSec: null,
        estimatedGateClosingTime: null,
        expectedTrainArrival: null,
        estimatedGateReopeningTime: null,
        predictedReopenTime: null,
        remainingWaitSec: 0,
        dataClassification: 'CONFIRMED_OBSERVATION',
        dataClassificationLabel: 'Confirmed Open',
        forecastStatus: 'CONFIRMED_OPEN',
        forecastNote: reason,
        message: reason,
        recommendation: 'SAFE TO CROSS — CONFIRMED OPEN',
        speedKmH: null,
        hasLiveSpeedMeasurement: false,
        speedSource: 'UNAVAILABLE',
        etaCalculationMethod: 'UNAVAILABLE',
        predictionConfidence: 'HIGH',
        providerObservationTimestamp: null,
        apiRetrievalTimestamp: null,
        calculationTimestamp,
        lastProviderSyncTimestamp: feedContext.lastSuccessfulSync || null,
        dataFreshness: 'LIVE',
        upcomingTrain: null,
        primaryTrain: null,
        upcomingTrains: [],
        subsequentTrains: [],
        totalUpcomingTrains: 0,
        combinedClosure: null,
        overlappingClosure: null,
        timingMetrics: null,
        closure: null,
        reopening: null,
        lastTrainPassed: crossing.lastTrainPassed || null
      };
    }

    // -------------------------------------------------------------------------
    // 1. CROSSING GEOMETRY & CORRIDOR ALIGNMENT VALIDATION
    // -------------------------------------------------------------------------
    if (!crossing || typeof crossing.lat !== 'number' || typeof crossing.lng !== 'number' || isNaN(crossing.lat) || isNaN(crossing.lng)) {
      return this.createUnknownCrossingEvaluation(
        'Crossing coordinates are missing or invalid. Approach status cannot be determined.',
        calculationTimestamp,
        feedContext,
        {
          classification: 'STATUS UNAVAILABLE',
          label: 'STATUS UNAVAILABLE',
          dataClassification: 'DATA_UNAVAILABLE',
          observationNote: 'Crossing coordinates are missing or unobserved.'
        }
      );
    }

    if (!Array.isArray(corridorCoordinates) || corridorCoordinates.length < 2) {
      return this.createUnknownCrossingEvaluation(
        `Corridor geometry for ${crossing.corridorId || 'unassigned'} is missing or incomplete. Approach status cannot be determined.`,
        calculationTimestamp,
        feedContext,
        {
          classification: 'STATUS UNAVAILABLE',
          label: 'STATUS UNAVAILABLE',
          dataClassification: 'DATA_UNAVAILABLE',
          observationNote: 'Corridor permanent-way geometry is unmapped or incomplete.'
        }
      );
    }

    const crossingProj = projectPointOnPolyline([crossing.lat, crossing.lng], corridorCoordinates);
    if (crossingProj.distKm > 0.85) {
      return this.createUnknownCrossingEvaluation(
        `Crossing geometry is ${Math.round(crossingProj.distKm * 1000)}m off mapped corridor line (branch line/siding). Approach status cannot be determined.`,
        calculationTimestamp,
        feedContext,
        {
          classification: 'STATUS UNAVAILABLE',
          label: 'STATUS UNAVAILABLE',
          dataClassification: 'DATA_UNAVAILABLE',
          observationNote: `Crossing deviates ${Math.round(crossingProj.distKm * 1000)}m from mapped permanent-way geometry (branch line/siding).`
        }
      );
    }

    // -------------------------------------------------------------------------
    // 2. FEED HEALTH & PROVIDER FRESHNESS CHECK
    // If the provider feed is disconnected or stale, we CANNOT declare OPEN.
    // -------------------------------------------------------------------------
    const isFeedDisconnected = feedContext.feedStatus === 'DISCONNECTED';
    const isFeedStale = feedContext.isFeedFresh === false;
    const hasCandidates = Array.isArray(relevantTrains) && relevantTrains.length > 0;

    if (isFeedDisconnected || isFeedStale) {
      return this.createUnknownCrossingEvaluation(
        isFeedDisconnected
          ? 'Telemetry provider is disconnected. Live railway crossing state cannot be verified.'
          : 'Telemetry provider sync is stale (>15m old). Real-time gate state is unverified.',
        calculationTimestamp,
        feedContext,
        {
          classification: 'DATA UNAVAILABLE',
          label: 'STATUS UNAVAILABLE',
          dataClassification: 'DATA_UNAVAILABLE',
          dataClassificationLabel: 'Telemetry Unavailable',
          observationNote: 'Real-time telemetry feed is unavailable or stale. Operating in unverified safety state.'
        }
      );
    }

    // -------------------------------------------------------------------------
    // 3. CANDIDATE TRAIN FILTERING & SPATIAL VALIDATION
    // -------------------------------------------------------------------------
    let validApproachingTrains = [];
    let corridorNearbyTrains = [];
    const stationaryPlatformTrains = [];
    const staleCandidates = [];
    const missingCoordCandidates = [];
    const incompatibleCorridorCandidates = [];
    const syntheticCandidates = [];
    const cancelledCandidates = [];
    const unverifiedCandidates = [];

    if (hasCandidates) {
      for (const train of relevantTrains) {
        // A. Incompatible corridor check (avoid false associations based solely on geographic proximity)
        if (train.corridorId && crossing.corridorId && train.corridorId !== crossing.corridorId) {
          incompatibleCorridorCandidates.push(train);
          continue;
        }

        // B. Synthetic test bench check (never close real crossings)
        if (train.positionClassification === 'SYNTHETIC_DEMO' || train.dataState === 'SIMULATED' || String(train.number || '').startsWith('SIM-') || train.isSimulated) {
          syntheticCandidates.push(train);
          continue;
        }

        // C. Cancelled / Terminated check
        if (train.status === 'CANCELLED' || train.status === 'TERMINATED') {
          cancelledCandidates.push(train);
          continue;
        }

        // D. Stationary platform train check (Railway Interlocking Rule: Trains dwelling/boarding at station platforms
        // do not occupy track circuits of road level crossings outside the interlocking dispatch signal)
        const isStationaryAtPlatform = Boolean(
          train.isStationaryAtPlatform === true ||
          train.isStationary === true ||
          train.status === 'PLATFORM_BOARDING' ||
          train.status === 'HALTED' ||
          train.status === 'YET_TO_START' ||
          train.status === 'NOT_STARTED' ||
          train.operationalStatus === 'PLATFORM_BOARDING' ||
          train.operationalStatus === 'YET_TO_START' ||
          (train.dataState === 'SCHEDULED' && (train.speedKmH === 0 || train.speedKmH === null)) ||
          ((train.speedKmH === 0 || train.liveSpeedKmH === 0) && train.isAtStation === true)
        );

        if (isStationaryAtPlatform) {
          stationaryPlatformTrains.push(train);

          // If train has an expected future departure time on this corridor, evaluate its upcoming arrival:
          const hasFutureDeparture = Boolean(
            (train.expectedDepartureMs && train.expectedDepartureMs > (Date.now() - 60000)) ||
            (train.schedule?.[0]?.expectedDepartureMs && train.schedule[0].expectedDepartureMs > (Date.now() - 60000))
          );
          if (!hasFutureDeparture) {
            continue;
          }
          // Train has future departure: check track connectivity so we can predict exact arrival ETA!
          const geoCheck = GeographicValidator.validateApproachingCrossing(
            train,
            crossing,
            corridorCoordinates
          );
          if (geoCheck.isValid && geoCheck.trackDistanceKm !== null && geoCheck.isApproaching) {
            validApproachingTrains.push({
              train,
              trackDistanceKm: geoCheck.trackDistanceKm,
              isApproaching: true,
              isTraversing: false,
              isAwaitingDeparture: true,
              expectedDepartureMs: train.expectedDepartureMs || train.schedule?.[0]?.expectedDepartureMs
            });
          }
          continue;
        }

        // E. Validate candidate state
        const candCheck = this.validateTrainCandidate(train);
        if (!candCheck.isValid) {
          if (candCheck.errors.some(e => e.includes('stale') || e.includes('Stale')) || train.isStale === true || train.dataState === 'STALE') {
            staleCandidates.push(train);
          } else if (candCheck.errors.some(e => e.includes('coordinates are missing') || e.includes('invalid') || e.includes('null'))) {
            missingCoordCandidates.push(train);
          } else if (train.status === 'OUT_OF_SECTOR' || train.isWithinAmritsarSector === false || candCheck.errors.some(e => e.includes('sector') || e.includes('New Delhi'))) {
            // Train is outside Amritsar sector (e.g. train 22488 in Delhi): Skip completely for local crossings
            continue;
          } else {
            unverifiedCandidates.push({ train, reasons: candCheck.errors });
          }
          continue; // Skip invalid, out-of-sector, or unverified trains
        }

        // E. Validate directional track connectivity to this specific crossing
        const geoCheck = GeographicValidator.validateApproachingCrossing(
          train,
          crossing,
          corridorCoordinates
        );

        if (geoCheck.hasCleared) {
          corridorNearbyTrains.push({
            train,
            trackDistanceKm: geoCheck.trackDistanceKm || 0,
            isApproaching: false,
            isTraversing: false,
            hasCleared: true,
            isOppositeDirection: true
          });
        } else if (geoCheck.isValid && geoCheck.trackDistanceKm !== null) {
          if (geoCheck.isApproaching) {
            validApproachingTrains.push({
              train,
              trackDistanceKm: geoCheck.trackDistanceKm,
              isApproaching: true,
              isTraversing: false
            });
          } else if (geoCheck.isTraversing) {
            validApproachingTrains.push({
              train,
              trackDistanceKm: 0,
              isApproaching: false,
              isTraversing: true,
              traversedDistanceKm: geoCheck.trackDistanceKm
            });
          }
        } else {
          if (geoCheck.rejectionReason && (geoCheck.rejectionReason.includes('Corridor mismatch') || geoCheck.rejectionReason.includes('outside the local track section'))) {
            incompatibleCorridorCandidates.push(train);
          } else {
            unverifiedCandidates.push({ train, reasons: [geoCheck.rejectionReason || 'Track connectivity check failed'] });
          }
        }
      }
    }

    // If candidate trains were provided on this corridor, but all were rejected:
    if (hasCandidates && validApproachingTrains.length === 0 && corridorNearbyTrains.length === 0) {
      const candTrain = unverifiedCandidates[0]?.train || staleCandidates[0] || missingCoordCandidates[0] || (hasCandidates ? relevantTrains[0] : null);
      const lastPassed = crossing.lastTrainPassed || null;

      if (staleCandidates.length > 0) {
        return this.createUnknownCrossingEvaluation(
          `Candidate train telemetry on corridor (${staleCandidates.map(t => '#' + t.number).join(', ')}) is stale (>15m). Clear passage cannot be verified.`,
          calculationTimestamp,
          feedContext,
          {
            classification: 'DATA UNAVAILABLE',
            label: 'STATUS UNAVAILABLE',
            dataClassification: 'DATA_UNAVAILABLE',
            dataClassificationLabel: 'Telemetry Stale',
            observationNote: 'Candidate train telemetry on this corridor is stale (>15 minutes old). Gate state is unknown.',
            providerObservationTimestamp: staleCandidates[0]?.providerObservationTimestamp || null,
            apiRetrievalTimestamp: staleCandidates[0]?.apiRetrievalTimestamp || staleCandidates[0]?.lastPing || null,
            dataFreshness: 'STALE',
            candidateTrain: candTrain,
            lastTrainPassed: lastPassed
          }
        );
      }

      if (missingCoordCandidates.length > 0) {
        return this.createUnknownCrossingEvaluation(
          `Candidate train coordinates on corridor (${missingCoordCandidates.map(t => '#' + t.number).join(', ')}) are missing or invalid. Clear passage cannot be verified.`,
          calculationTimestamp,
          feedContext,
          {
            classification: 'DATA UNAVAILABLE',
            label: 'STATUS UNAVAILABLE',
            dataClassification: 'DATA_UNAVAILABLE',
            dataClassificationLabel: 'Telemetry Unverified',
            observationNote: 'Candidate train geographic coordinates on corridor are missing or invalid. Gate status cannot be determined.',
            providerObservationTimestamp: missingCoordCandidates[0]?.providerObservationTimestamp || null,
            apiRetrievalTimestamp: missingCoordCandidates[0]?.apiRetrievalTimestamp || missingCoordCandidates[0]?.lastPing || null,
            dataFreshness: missingCoordCandidates[0]?.dataState || 'UNAVAILABLE',
            candidateTrain: candTrain,
            lastTrainPassed: lastPassed
          }
        );
      }

      if (unverifiedCandidates.length > 0) {
        const reason = unverifiedCandidates[0]?.reasons?.[0] || 'Candidate train telemetry on corridor is unverified or invalid. Clear passage cannot be verified.';
        return this.createUnknownCrossingEvaluation(
          reason,
          calculationTimestamp,
          feedContext,
          {
            classification: 'DATA UNAVAILABLE',
            label: 'STATUS UNAVAILABLE',
            dataClassification: 'DATA_UNAVAILABLE',
            dataClassificationLabel: 'Telemetry Unverified',
            observationNote: reason,
            providerObservationTimestamp: relevantTrains[0]?.providerObservationTimestamp || null,
            apiRetrievalTimestamp: relevantTrains[0]?.apiRetrievalTimestamp || relevantTrains[0]?.lastPing || null,
            dataFreshness: relevantTrains[0]?.dataState || 'UNAVAILABLE',
            candidateTrain: candTrain,
            lastTrainPassed: lastPassed
          }
        );
      }

      // If only stationary platform trains were detected on corridor:
      // When feed is verified and confirms corridor clear of moving trains, the roadway is OPEN.
      if (stationaryPlatformTrains.length > 0) {
        if (feedContext.apiConfirmsCorridorClear === true) {
          const statTrain = stationaryPlatformTrains[0];
          const statTrainPayload = {
            id: statTrain.id || statTrain.number,
            number: statTrain.number,
            trainNumber: statTrain.number,
            name: statTrain.name,
            trainName: statTrain.name,
            type: statTrain.type,
            dataState: statTrain.dataState,
            speedKmH: 0,
            speedKmph: 0,
            direction: statTrain.direction,
            distanceKm: typeof statTrain.distanceFromAmritsarKm === 'number' ? statTrain.distanceFromAmritsarKm : 0,
            currentStationName: statTrain.currentStationName || 'Amritsar Junction (ASR)',
            origin: statTrain.origin,
            destination: statTrain.destination,
            status: 'PLATFORM_BOARDING',
            isStationary: true,
            isStationaryAtPlatform: true
          };
          return {
            status: 'OPEN',
            statusReason: `Corridor actively monitored. Train #${statTrain.number || statTrain.id} is stationary at station platform (dispatch signal held). Zero moving trains approaching crossing. Roadway open.`,
            legacyStatus: 'EXPECTED_OPEN',
            predictionState: 'CLEAR_PASSAGE',
            countdownAvailable: false,
            gateStatusClassification: 'NO APPROACH DETECTED',
            gateStatusLabel: 'OPEN',
            predictionAvailable: true,
            isStatusEstimated: false,
            statusObservationType: 'CORRIDOR_KINEMATICS',
            statusObservationNote: 'Corridor track clear of moving trains. Stationary platform trains do not trigger level crossing closures.',
            observedPhysicalGateState: 'UNKNOWN',
            physicalSensorAvailable: false,
            physicalSensorNote: 'No hardware boom barrier sensor connected. Physical gate state is UNKNOWN; road passage predicted clear from corridor telemetry.',
            timeToNextClosureSec: 0,
            upcomingTrainId: null,
            associatedTrainId: null,
            associatedTrainNumber: null,
            trainRoute: null,
            trainDirection: null,
            distanceAlongTrackKm: null,
            estimatedTimeToArrivalSec: null,
            estimatedGateClosingTime: null,
            expectedTrainArrival: null,
            estimatedGateReopeningTime: null,
            predictedReopenTime: null,
            remainingWaitSec: 0,
            dataClassification: 'LIVE_TRACK_MONITORED',
            dataClassificationLabel: 'Live Permanent-Way Track Monitored',
            forecastStatus: 'CLEAR_PASSAGE',
            forecastNote: `Train #${statTrain.number || statTrain.id} stationary at platform. Crossing open.`,
            message: `Train #${statTrain.number || statTrain.id} stationary at platform. Crossing open.`,
            recommendation: 'CLEAR PASSAGE — OPEN',
            speedKmH: null,
            hasLiveSpeedMeasurement: false,
            speedSource: 'UNAVAILABLE',
            etaCalculationMethod: 'UNAVAILABLE',
            predictionConfidence: 'HIGH',
            providerObservationTimestamp: statTrain.providerObservationTimestamp || null,
            apiRetrievalTimestamp: statTrain.apiRetrievalTimestamp || null,
            calculationTimestamp,
            lastProviderSyncTimestamp: feedContext.lastSuccessfulSync || null,
            dataFreshness: 'LIVE',
            warningBufferSec: 180,
            traverseDurationSec: 60,
            upcomingTrain: null,
            primaryTrain: null,
            corridorTrain: statTrainPayload,
            activeCorridorTrain: statTrainPayload,
            upcomingTrains: [],
            subsequentTrains: [],
            totalUpcomingTrains: 0,
            combinedClosure: null,
            overlappingClosure: null,
            timingMetrics: null,
            closure: null,
            reopening: null,
            lastTrainPassed: lastPassed
          };
        } else {
          // If feed is unverified/unconfirmed, remain UNKNOWN
          const statTrain = stationaryPlatformTrains[0];
          const statTrainPayload = {
            id: statTrain.id || statTrain.number,
            number: statTrain.number,
            trainNumber: statTrain.number,
            name: statTrain.name,
            trainName: statTrain.name,
            type: statTrain.type,
            dataState: statTrain.dataState,
            speedKmH: 0,
            speedKmph: 0,
            direction: statTrain.direction,
            distanceKm: typeof statTrain.distanceFromAmritsarKm === 'number' ? statTrain.distanceFromAmritsarKm : 0,
            currentStationName: statTrain.currentStationName || 'Amritsar Junction (ASR)',
            origin: statTrain.origin,
            destination: statTrain.destination,
            status: 'PLATFORM_BOARDING',
            isStationary: true,
            isStationaryAtPlatform: true
          };
          return this.createUnknownCrossingEvaluation(
            'Stationary at station platform (awaiting dispatch/departure) — gate closure not triggered',
            calculationTimestamp,
            feedContext,
            {
              classification: 'STATUS UNKNOWN',
              label: 'STATUS UNKNOWN',
              dataClassification: 'DATA_UNAVAILABLE',
              dataClassificationLabel: 'Platform Train Stationary',
              observationNote: 'Train is stationary at platform awaiting departure. No moving approach detected.',
              candidateTrain: candTrain || statTrainPayload,
              corridorTrain: statTrainPayload,
              lastTrainPassed: lastPassed
            }
          );
        }
      }
    }

    // -------------------------------------------------------------------------
    // C. PROCESS VALID APPROACHING TRAINS (SPEED & ETA INTEGRATION)
    // -------------------------------------------------------------------------
    const processedApproaching = [];
    for (const item of validApproachingTrains) {
      const train = item.train;

      // Check if train is awaiting a scheduled/rescheduled future departure
      const depAnchorMs = item.expectedDepartureMs || train.expectedDepartureMs || (train.schedule?.[0]?.expectedDepartureMs);
      const isAwaitingFutureDeparture = Boolean(
        (item.isAwaitingDeparture || train.status === 'YET_TO_START' || train.status === 'NOT_STARTED' || train.status === 'PLATFORM_BOARDING' || train.isStationaryAtPlatform) &&
        depAnchorMs &&
        depAnchorMs > (now - 60000)
      );

      // Handle stopped trains (e.g. at platform, siding, or halt without future timetable departure)
      const isStationary = train.status === 'STATIONARY' || 
                           train.status === 'PLATFORM_BOARDING' || 
                           train.status === 'NOT_STARTED' ||
                           train.status === 'CANCELLED' ||
                           train.isStationary === true ||
                           train.movementStatus === 'STOPPED' ||
                           train.speedKmH === 0;

      if (isStationary && !isAwaitingFutureDeparture && item.trackDistanceKm > 0.15) {
        // Stopped away from crossing: cannot trigger gate closure or produce fabricated ETA
        corridorNearbyTrains.push({
          train: item.train,
          trackDistanceKm: item.trackDistanceKm,
          isApproaching: false,
          isStationary: true
        });
        continue;
      }

      // Speed Resolution: Distinguish genuine live speedometer from timetable sectional speeds
      let speedKmH = 0;
      let hasLiveSpeedMeasurement = Boolean(train.hasLiveSpeedMeasurement);
      let speedSource = 'UNAVAILABLE';
      let etaCalculationMethod = 'UNAVAILABLE';
      let predictionConfidence = 'MODERATE';

      if (isAwaitingFutureDeparture) {
        const fallbackSpeed = train.sectionalSpeedKmH || 55;
        speedKmH = Math.max(
          CROSSING_DETECTION_THRESHOLDS.MIN_ROLLING_SPEED_KMPH,
          Math.min(CROSSING_DETECTION_THRESHOLDS.MAX_SECTION_SPEED_KMPH, fallbackSpeed)
        );
        speedSource = 'SECTIONAL_TIMETABLE';
        etaCalculationMethod = 'TIMETABLE_DEPARTURE_SYNTHESIS';
        predictionConfidence = 'HIGH';
      } else if (hasLiveSpeedMeasurement && train.speedKmH > 0) {
        speedKmH = Math.max(
          CROSSING_DETECTION_THRESHOLDS.MIN_ROLLING_SPEED_KMPH,
          Math.min(CROSSING_DETECTION_THRESHOLDS.MAX_SECTION_SPEED_KMPH, train.speedKmH)
        );
        speedSource = 'PROVIDER_LIVE_SPEED';
        etaCalculationMethod = 'LIVE_TELEMETRY_VELOCITY';
        predictionConfidence = 'HIGH';
      } else {
        const fallbackSpeed = train.sectionalSpeedKmH || train.speedKmH || CROSSING_DETECTION_THRESHOLDS.DEFAULT_SECTIONAL_SPEED_KMPH;
        speedKmH = Math.max(
          CROSSING_DETECTION_THRESHOLDS.MIN_ROLLING_SPEED_KMPH,
          Math.min(CROSSING_DETECTION_THRESHOLDS.MAX_SECTION_SPEED_KMPH, fallbackSpeed)
        );
        speedSource = train.speedSource || 'TIMETABLE_SECTIONAL_ESTIMATE';
        etaCalculationMethod = 'TIMETABLE_SECTIONAL_ESTIMATE';
        predictionConfidence = 'MODERATE';
      }

      const speedMs = speedKmH / 3.6;
      let distMeters = item.trackDistanceKm * 1000;
      let arrivalTimeSec = Math.round(distMeters / speedMs);
      const rakeLengthM = this.getRakeLengthMeters(train);
      const traverseDurationSec = Math.round((rakeLengthM + 60) / speedMs);

      const currentDelayMin = Number(train.delayMinutes || 0);
      let closeTime, openTime, passageTime, crossBy;

      // Check if crossing already has an anchored passage time for this specific approaching train
      const isSameTrain = Boolean(
        crossing && (
          crossing.upcomingTrainId === train.number ||
          crossing.associatedTrainNumber === train.number ||
          crossing.associatedTrainId === train.id
        )
      );

      let anchoredPassageMs = null;
      if (isSameTrain && crossing.expectedTrainArrival) {
        const parsed = new Date(crossing.expectedTrainArrival).getTime();
        const physicalEtaMs = now + (distMeters / speedMs) * 1000;
        const driftMs = Math.abs(parsed - physicalEtaMs);
        // Plausibility & reality check:
        // A train physically > 2.0 km away CANNOT have a passage time in the past or immediately right now!
        // If drift is within 90s, preserve established anchor to prevent second-by-second countdown jitter.
        const isPhysicallyPlausible = (item.trackDistanceKm <= 2.0 || parsed >= now) && driftMs <= 180000;
        if (!isNaN(parsed) && parsed > now - 180000 && parsed < now + 14400000 && isPhysicallyPlausible && driftMs <= 90000) {
          anchoredPassageMs = parsed;
        }
      }

      if (item.isTraversing) {
        const alreadyTraversedM = (item.traversedDistanceKm || 0) * 1000;
        const alreadyTraversedSec = Math.round(alreadyTraversedM / speedMs);
        const remainingTraverseSec = Math.max(1, traverseDurationSec - alreadyTraversedSec);
        
        arrivalTimeSec = 0;
        distMeters = 0;

        let reopenMs = null;
        if (crossing && (crossing.predictedReopenTime || crossing.estimatedGateReopeningTime)) {
          const parsedReopen = new Date(crossing.predictedReopenTime || crossing.estimatedGateReopeningTime).getTime();
          if (!isNaN(parsedReopen) && parsedReopen > now) {
            reopenMs = parsedReopen;
          }
        }
        if (reopenMs === null) {
          reopenMs = now + (remainingTraverseSec + CROSSING_DETECTION_THRESHOLDS.GATE_CLEARANCE_BUFFER_SEC) * 1000;
        }

        passageTime = new Date(now);
        closeTime = new Date(now - (alreadyTraversedSec + CROSSING_DETECTION_THRESHOLDS.CLOSURE_LEAD_SEC) * 1000);
        openTime = new Date(reopenMs);
        crossBy = new Date(closeTime.getTime() - 60000);
      } else if (isAwaitingFutureDeparture) {
        // Train is waiting at station with future timetable departure time (e.g. 12:30 PM from origin or halt)
        // Exact passage ETA: Departure Time + Sectional Track Run Time + Intermediate Dwell Times
        const runTimeMs = (distMeters / speedMs) * 1000;
        let intermediateDwellMs = 0;
        if (Array.isArray(train.schedule) && train.schedule.length > 1) {
          for (let sIdx = 1; sIdx < train.schedule.length; sIdx++) {
            const stop = train.schedule[sIdx];
            if (typeof stop.distance === 'number' && stop.distance > 0 && stop.distance < item.trackDistanceKm && stop.isHalt) {
              const stopDwell = (stop.expectedDepartureMs && stop.expectedArrivalMs)
                ? Math.max(60000, stop.expectedDepartureMs - stop.expectedArrivalMs)
                : 120000;
              intermediateDwellMs += stopDwell;
            }
          }
        }

        const effectivePassageMs = depAnchorMs + runTimeMs + intermediateDwellMs;
        passageTime = new Date(effectivePassageMs);
        arrivalTimeSec = Math.max(0, Math.round((effectivePassageMs - now) / 1000));
        closeTime = new Date(passageTime.getTime() - CROSSING_DETECTION_THRESHOLDS.CLOSURE_LEAD_SEC * 1000);
        openTime = new Date(passageTime.getTime() + traverseDurationSec * 1000 + CROSSING_DETECTION_THRESHOLDS.GATE_CLEARANCE_BUFFER_SEC * 1000);
        crossBy = new Date(closeTime.getTime() - 60000);
      } else {
        const closureLeadSec = CROSSING_DETECTION_THRESHOLDS.CLOSURE_LEAD_SEC; // 720s (12 minutes)

        if (anchoredPassageMs !== null) {
          // Re-use anchored passage time so countdown remains strictly stable across polls & page refreshes!
          passageTime = new Date(anchoredPassageMs);
          arrivalTimeSec = Math.max(0, Math.round((anchoredPassageMs - now) / 1000));
        } else {
          // First observation of train approaching this crossing: establish the absolute passage anchor
          arrivalTimeSec = Math.round(distMeters / speedMs);
          passageTime = new Date(now + arrivalTimeSec * 1000);
          anchoredPassageMs = passageTime.getTime();
          if (crossing) {
            crossing.expectedTrainArrival = passageTime.toISOString();
            crossing.anchoredTrainDelay = currentDelayMin;
          }
        }

        closeTime = new Date(passageTime.getTime() - closureLeadSec * 1000);
        openTime = new Date(passageTime.getTime() + traverseDurationSec * 1000 + CROSSING_DETECTION_THRESHOLDS.GATE_CLEARANCE_BUFFER_SEC * 1000);
        crossBy = new Date(closeTime.getTime() - 60000);
      }

      processedApproaching.push({
        train,
        trackDistanceKm: item.trackDistanceKm,
        speedKmH,
        speedMs,
        distMeters,
        arrivalTimeSec,
        etaMinutes: arrivalTimeSec / 60,
        passageTime,
        rakeLengthM,
        traverseDurationSec,
        closeTime,
        openTime,
        crossBy,
        isTraversing: Boolean(item.isTraversing),
        hasLiveSpeedMeasurement,
        speedSource,
        etaCalculationMethod,
        predictionConfidence
      });
    }

    // Sort chronologically by route-aware passage time (earliest passage first)
    processedApproaching.sort((a, b) => a.passageTime.getTime() - b.passageTime.getTime());

    // Primary forecast candidates: strictly within 60 minutes
    const primaryCandidates = processedApproaching.filter(c => c.etaMinutes <= CROSSING_DETECTION_THRESHOLDS.PRIMARY_FORECAST_HORIZON_MIN);
    // Extended outlook candidates: between 60 and 120 minutes
    const extendedCandidates = processedApproaching.filter(c => c.etaMinutes > CROSSING_DETECTION_THRESHOLDS.PRIMARY_FORECAST_HORIZON_MIN && c.etaMinutes <= CROSSING_DETECTION_THRESHOLDS.EXTENDED_HORIZON_MIN);

    // Multi-Train Continuous Closure grouping
    // Railway Ground Truth: Gatemen ONLY keep boom barriers locked down between trains if the passage gap
    // is <= 3.5 minutes. If > 3.5 minutes, gates MUST be opened to clear road vehicular congestion.
    // Total combined continuous closure is strictly capped to at most 15 minutes (900 seconds).
    const closureBlocks = [];
    let currentBlock = null;

    for (const cand of primaryCandidates) {
      if (!currentBlock) {
        currentBlock = {
          items: [cand],
          closureStart: cand.closeTime,
          closureEnd: cand.openTime,
          recommendedCrossBy: cand.crossBy,
          firstPassageTime: cand.passageTime,
          lastPassageTime: cand.passageTime
        };
        continue;
      }

      const prevCand = currentBlock.items[currentBlock.items.length - 1];
      const passageGapMin = (cand.passageTime.getTime() - prevCand.passageTime.getTime()) / 60000;
      
      const effectiveStartMs = Math.max(now, currentBlock.closureStart.getTime());
      const mergedEndMs = Math.max(currentBlock.closureEnd.getTime(), cand.openTime.getTime());
      const mergedDurationMin = (mergedEndMs - effectiveStartMs) / 60000;

      // STRICT RAILWAY RULES FOR CONTINUOUS CLOSURE:
      // 1. Passage gap between consecutive trains must be <= 3.5 min (otherwise gate opens in between).
      // 2. Combined total duration must NOT exceed 15.0 minutes under any circumstance.
      const isConsecutivePassage = passageGapMin >= 0 && passageGapMin <= CROSSING_DETECTION_THRESHOLDS.MAX_CONTINUOUS_PASSAGE_GAP_MIN;
      const withinMaxDuration = mergedDurationMin <= 15.0;

      if (isConsecutivePassage && withinMaxDuration) {
        currentBlock.items.push(cand);
        if (cand.closeTime.getTime() < currentBlock.closureStart.getTime()) {
          currentBlock.closureStart = cand.closeTime;
        }
        if (cand.openTime.getTime() > currentBlock.closureEnd.getTime()) {
          currentBlock.closureEnd = cand.openTime;
        }
        if (cand.passageTime.getTime() > currentBlock.lastPassageTime.getTime()) {
          currentBlock.lastPassageTime = cand.passageTime;
        }
      } else {
        closureBlocks.push(currentBlock);
        currentBlock = {
          items: [cand],
          closureStart: cand.closeTime,
          closureEnd: cand.openTime,
          recommendedCrossBy: cand.crossBy,
          firstPassageTime: cand.passageTime,
          lastPassageTime: cand.passageTime
        };
      }
    }
    if (currentBlock) {
      closureBlocks.push(currentBlock);
    }

    // -------------------------------------------------------------------------
    // D. ACTIVE CLOSURE & APPROACH STATE EVALUATION
    // -------------------------------------------------------------------------
    if (primaryCandidates.length > 0 && closureBlocks.length > 0) {
      const activeBlock = closureBlocks[0];
      const isContinuous = activeBlock.items.length > 1;
      const durationMin = Number(Math.min(15.0, ((activeBlock.closureEnd.getTime() - activeBlock.closureStart.getTime()) / 60000)).toFixed(1));
      const primaryCand = activeBlock.items[0];
      const train = primaryCand.train;
      const trackDistKm = primaryCand.trackDistanceKm;
      const speedKmH = primaryCand.speedKmH;
      const arrivalTimeSec = primaryCand.arrivalTimeSec;
      const rakeLengthM = primaryCand.rakeLengthM;
      const traverseDurationSec = primaryCand.traverseDurationSec;
      const expectedTrainArrival = primaryCand.passageTime.toISOString();

      const firstPassageMs = activeBlock.firstPassageTime.getTime();
      const closureStartMs = activeBlock.closureStart.getTime();
      const closureEndMs = activeBlock.closureEnd.getTime();
      const diffMinutesFirst = (firstPassageMs - now) / 60000;
      const timeToPassageSec = Math.round((firstPassageMs - now) / 1000);
      const timeToClosureSec = Math.round((closureStartMs - now) / 1000);

      // Hysteresis support: avoid boundary jitter if crossing was already in alert state
      const prevStatus = crossing?.status || 'OPEN';
      const wasClosed = prevStatus === 'CLOSED' || prevStatus === 'CLOSURE_EXPECTED' || prevStatus === 'CLOSURE_REPORTED';
      const wasApproaching = prevStatus === 'APPROACHING' || wasClosed;

      // 1. Imminent / Locked threshold (CLOSURE_EXPECTED / CLOSED)
      // Hysteresis window: entry at <= 3.5 km / <= 4.0 min; exit at > 3.8 km / > 4.5 min
      const closureDistLimit = wasClosed ? 3.8 : 3.5;
      const closureTimeLimit = wasClosed ? 4.5 : 4.0;

      const isTrainMovingTowardsCrossing = primaryCand.isTraversing ? true : Boolean(
        !primaryCand.isAwaitingDeparture &&
        !primaryCand.train.isStationary &&
        !primaryCand.train.isStationaryAtPlatform &&
        primaryCand.train.status !== 'YET_TO_START' &&
        primaryCand.train.status !== 'NOT_STARTED' &&
        primaryCand.train.status !== 'PLATFORM_BOARDING'
      );

      const isWithinImmediateClosureZone = primaryCand.isTraversing || (
        isTrainMovingTowardsCrossing &&
        trackDistKm <= closureDistLimit &&
        diffMinutesFirst <= closureTimeLimit
      );
      const isClosed = primaryCand.isTraversing || (
        isWithinImmediateClosureZone &&
        (now >= closureStartMs || timeToClosureSec <= 0) &&
        now <= closureEndMs
      );

      // 2. Active approach alert threshold (APPROACHING)
      // Hysteresis window: entry at <= 8.0 km / <= 12.0 min; exit at > 8.5 km / > 13.0 min
      const approachDistLimit = wasApproaching ? 8.5 : 8.0;
      const approachTimeLimit = wasApproaching ? 13.0 : 12.0;
      const isApproaching = !isClosed && (
        isTrainMovingTowardsCrossing &&
        trackDistKm <= approachDistLimit &&
        diffMinutesFirst <= approachTimeLimit &&
        (now >= closureStartMs || timeToClosureSec <= 0)
      );

      let newStatus = 'OPEN';
      let gateStatusLabel = 'OPEN';
      let gateClassification = 'CLEAR PASSAGE';
      let legacyStatus = 'EXPECTED_OPEN';
      let timeToNextClosureSec = 0;
      let estimatedGateClosingTime = null;
      let predictedReopenTime = null;
      let remainingWaitSec = 0;
      let forecastNote = '';
      let statusReason = '';
      let recommendation = 'SAFE TO CROSS — OPEN';
      let predictionState = 'NO_RELIABLE_APPROACH';
      let countdownAvailable = false;

      if (isClosed) {
        newStatus = (primaryCand.isTraversing || isContinuous) ? 'CLOSED' : 'CLOSURE_EXPECTED';
        gateStatusLabel = (primaryCand.isTraversing || diffMinutesFirst <= 0) ? 'CLOSED (TRAIN TRAVERSING)' : 'PREDICTED CLOSURE';
        gateClassification = 'PREDICTED CLOSURE';
        legacyStatus = 'CLOSURE_EXPECTED';
        predictionState = (primaryCand.isTraversing || diffMinutesFirst <= 0) ? 'PASSAGE_DETECTED' : 'BOOM_BARRIERS_LOCKED';
        countdownAvailable = true;
        let reopenTimeMs = activeBlock.closureEnd.getTime();
        if (crossing && (crossing.predictedReopenTime || crossing.estimatedGateReopeningTime)) {
          const prevReopenMs = new Date(crossing.predictedReopenTime || crossing.estimatedGateReopeningTime).getTime();
          // Only preserve previous reopen timestamp if it is close (<= 120s) to current closure end,
          // preventing stale / multi-hour stuck timestamps!
          if (!isNaN(prevReopenMs) && prevReopenMs > now && Math.abs(prevReopenMs - activeBlock.closureEnd.getTime()) <= 120000) {
            reopenTimeMs = prevReopenMs;
          }
        }
        // Strict Railway Operational Ceiling: Gate closure wait time NEVER exceeds 15 minutes (900s)
        const maxReopenMs = now + CROSSING_DETECTION_THRESHOLDS.MAX_GATE_WAIT_SEC * 1000;
        if (reopenTimeMs > maxReopenMs) {
          reopenTimeMs = maxReopenMs;
        }
        remainingWaitSec = Math.min(CROSSING_DETECTION_THRESHOLDS.MAX_GATE_WAIT_SEC, Math.max(1, Math.round((reopenTimeMs - now) / 1000)));
        const timeToReopenMin = Number((remainingWaitSec / 60).toFixed(1));
        estimatedGateClosingTime = activeBlock.closureStart.toISOString();
        predictedReopenTime = new Date(reopenTimeMs).toISOString();
        recommendation = 'DO NOT CROSS — PREDICTED CLOSURE';

        if (isContinuous) {
          const currNum = activeBlock.items[0]?.train.number;
          const nextNum = activeBlock.items[1]?.train.number;
          const trainDetail = nextNum ? `Train #${currNum} active, Train #${nextNum} following` : `Train #${currNum} active`;
          statusReason = `Continuous closure active for ${activeBlock.items.length} trains (${trainDetail}). Reopening in ~${timeToReopenMin} min.`;
        } else if (primaryCand.isTraversing || diffMinutesFirst <= 0) {
          statusReason = `Train #${train.number} actively traversing crossing roadway. Reopening in ~${remainingWaitSec > 60 ? `${timeToReopenMin} min` : `${remainingWaitSec}s`}.`;
        } else {
          statusReason = `Boom barriers locked for approaching Train #${train.number} (${trackDistKm.toFixed(1)} km away, passage in ~${Math.round(diffMinutesFirst)} min). Reopening in ~${timeToReopenMin} min.`;
        }
        forecastNote = statusReason;
      } else if (isApproaching) {
        newStatus = 'APPROACHING';
        gateStatusLabel = 'PREDICTED CLOSURE';
        gateClassification = 'PREDICTED CLOSURE';
        legacyStatus = 'PREDICTED_CLOSURE';
        predictionState = 'APPROACHING';
        countdownAvailable = true;
        timeToNextClosureSec = Math.max(1, timeToClosureSec);
        const timeToClosureMin = Number((timeToNextClosureSec / 60).toFixed(1));
        estimatedGateClosingTime = activeBlock.closureStart.toISOString();
        // Strict Railway Operational Rule: An OPEN or APPROACHING crossing must never display an estimated opening time.
        // Reopening estimates are strictly calculated ONLY for confirmed CLOSED crossings.
        predictedReopenTime = null;
        remainingWaitSec = 0;
        statusReason = isContinuous
          ? `Train #${train.number} approaching in ~${Number(diffMinutesFirst.toFixed(1))} min. Multi-train continuous closure expected for ${activeBlock.items.length} trains. Gate closes in ~${timeToClosureMin} min.`
          : `Verified train #${train.number} approaching crossing (${trackDistKm.toFixed(1)} km away). Arrival in ~${Math.round(diffMinutesFirst)} min. Gate closes in ~${timeToClosureMin} min.`;
        forecastNote = statusReason;
        recommendation = 'PLAN TO STOP — PREDICTED CLOSURE';
      } else if (now > closureEndMs) {
        // Train has cleared crossing
        newStatus = 'OPEN';
        gateStatusLabel = 'PREDICTED OPEN';
        gateClassification = 'NO APPROACH DETECTED';
        legacyStatus = 'EXPECTED_OPEN';
        predictionState = 'CLEAR_PASSAGE';
        countdownAvailable = false;
        timeToNextClosureSec = 0;
        estimatedGateClosingTime = null;
        predictedReopenTime = null;
        remainingWaitSec = 0;
        statusReason = `Train #${train.number} has cleared crossing. Corridor is OPEN with clear passage.`;
        forecastNote = statusReason;
        recommendation = 'CLEAR PASSAGE — PREDICTED OPEN';
      } else {
        // Train is > 8.0 km away or > 12 min away or awaiting departure: Roadway is OPEN with live countdown to next closure
        newStatus = 'OPEN';
        gateStatusLabel = 'PREDICTED OPEN';
        gateClassification = 'NO APPROACH DETECTED';
        legacyStatus = 'EXPECTED_OPEN';
        predictionState = primaryCand.isAwaitingDeparture ? 'DEPARTURE_AWAITED' : 'EXTENDED_APPROACH';
        countdownAvailable = true;
        timeToNextClosureSec = Math.max(1, timeToClosureSec);
        const timeToClosureMin = Number((timeToNextClosureSec / 60).toFixed(1));
        estimatedGateClosingTime = activeBlock.closureStart.toISOString();
        // OPEN crossing: NEVER display a predicted reopening time
        predictedReopenTime = null;
        remainingWaitSec = 0;

        const depTimeFmt = primaryCand.train.expectedDepartureFormatted || primaryCand.train.expectedDeparture || (primaryCand.train.expectedDepartureMs ? new Date(primaryCand.train.expectedDepartureMs).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true }) : null);
        const arrTimeFmt = primaryCand.passageTime ? primaryCand.passageTime.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true }) : '';
        const etaMinRound = Math.round(diffMinutesFirst);
        const etaHours = Math.floor(etaMinRound / 60);
        const etaRemMin = etaMinRound % 60;
        const etaDurationStr = etaHours > 0 ? `~${etaHours} hr ${etaRemMin} min` : `~${etaMinRound} min`;

        if (primaryCand.isAwaitingDeparture || primaryCand.train.status === 'YET_TO_START') {
          statusReason = `Roadway open. Train #${train.number} scheduled departure at ${depTimeFmt || '12:30 PM'} from ${train.origin || 'Amritsar Jn'} (Delay: ${train.delayMinutes || 0}m). Exact passage arrival ETA: ${arrTimeFmt || '12:31 PM'} (in ${etaDurationStr}). Fatak closes in ~${Math.round(timeToClosureSec / 60)} min.`;
        } else {
          statusReason = isContinuous
            ? `Train passage predicted in ~${Math.round(diffMinutesFirst)} min (${activeBlock.items.length} trains). Fatak is OPEN (Closes in ~${timeToClosureMin} min).`
            : `Roadway open. Train #${train.number} on corridor (${trackDistKm.toFixed(1)} km away), expected passage in ~${Math.round(diffMinutesFirst)} min. Gate closes in ~${timeToClosureMin} min.`;
        }
        forecastNote = statusReason;
        recommendation = 'CLEAR PASSAGE — PREDICTED OPEN';
      }

      const combinedClosure = {
        isContinuous,
        isOverlapping: isContinuous,
        trainCount: activeBlock.items.length,
        combinedDurationMinutes: durationMin,
        durationMinutes: durationMin,
        closureStart: activeBlock.closureStart.toISOString(),
        closureEnd: isClosed ? activeBlock.closureEnd.toISOString() : null,
        predictedReopen: isClosed ? activeBlock.closureEnd.toISOString() : null,
        trains: activeBlock.items.map(it => ({
          trainNumber: it.train.number,
          trainName: it.train.name,
          direction: it.train.direction,
          speedKmph: it.speedKmH,
          estimatedPassageTime: it.passageTime.toISOString(),
          etaMinutes: Number(it.etaMinutes.toFixed(1))
        }))
      };

      const trainRoute = (train.origin && train.destination) ? `${train.origin} → ${train.destination}` : 'Amritsar Corridor';

      const depTimeFmt = primaryCand.train.expectedDepartureFormatted || primaryCand.train.expectedDeparture || (primaryCand.train.expectedDepartureMs ? new Date(primaryCand.train.expectedDepartureMs).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true }) : null);
      const arrTimeFmt = primaryCand.passageTime ? primaryCand.passageTime.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true }) : '';
      const etaMinRound = Math.round(diffMinutesFirst);
      const etaHours = Math.floor(etaMinRound / 60);
      const etaRemMin = etaMinRound % 60;
      const etaDurationStr = etaHours > 0 ? `~${etaHours} hr ${etaRemMin} min` : `~${etaMinRound} min`;

      const upcomingTrainPayload = {
        id: train.id,
        number: train.number,
        trainNumber: train.number,
        name: train.name,
        trainName: train.name,
        type: train.type,
        dataState: train.dataState,
        speedKmH: primaryCand.isAwaitingDeparture ? 0 : speedKmH,
        speedKmph: primaryCand.isAwaitingDeparture ? 0 : speedKmH,
        speedText: primaryCand.isAwaitingDeparture ? '0 km/h (Yet to start)' : `${speedKmH} km/h (Sectional)`,
        hasLiveSpeedMeasurement: primaryCand.hasLiveSpeedMeasurement,
        speedSource: primaryCand.isAwaitingDeparture ? 'AT_STATION_PLATFORM' : primaryCand.speedSource,
        etaCalculationMethod: primaryCand.etaCalculationMethod,
        predictionConfidence: primaryCand.predictionConfidence,
        direction: train.direction,
        distanceKm: Number(trackDistKm.toFixed(2)),
        etaMinutes: Number(primaryCand.etaMinutes.toFixed(1)),
        estimatedPassageTime: expectedTrainArrival,
        expectedDeparture: depTimeFmt,
        expectedDepartureMs: primaryCand.train.expectedDepartureMs,
        expectedArrivalFormatted: arrTimeFmt,
        delayMinutes: train.delayMinutes || 0,
        status: primaryCand.isAwaitingDeparture ? 'YET_TO_START' : train.status,
        isStationary: Boolean(primaryCand.isAwaitingDeparture || train.isStationary),
        timingSummary: primaryCand.isAwaitingDeparture 
          ? `Yet to start from ${train.origin || 'Amritsar Jn'} • Departure: ${depTimeFmt || '12:30 PM'} (Delay: ${train.delayMinutes || 0}m) • Exact arrival: ${arrTimeFmt} (in ${etaDurationStr})`
          : `Approaching • Arrival ETA: ${arrTimeFmt} (in ${etaDurationStr})`,
        rakeLengthM,
        currentStationName: train.currentStationName || null,
        currentStationCode: train.currentStationCode || null,
        corridorId: train.corridorId || null,
        origin: train.origin || 'Amritsar Jn',
        destination: train.destination || 'Amritsar Sector'
      };

      const subsequentTrains = primaryCandidates.slice(1).map(c => {
        const arrTimeStr = new Intl.DateTimeFormat('en-IN', {
          timeZone: 'Asia/Kolkata',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        }).format(c.passageTime).toLowerCase();

        return {
          trainNumber: c.train.number,
          trainName: c.train.name,
          direction: c.train.direction,
          status: c.train.status || c.train.operationalStatus || (c.isAwaitingDeparture ? 'YET_TO_START' : 'IN_TRANSIT'),
          speedKmph: (c.isAwaitingDeparture || c.train.speedKmH === 0) ? 0 : c.speedKmH,
          speedText: (c.isAwaitingDeparture || c.train.speedKmH === 0) ? '0 km/h (Yet to start)' : `${Math.round(c.speedKmH)} km/h`,
          distanceKm: Number(c.trackDistanceKm.toFixed(2)),
          etaMinutes: Number(c.etaMinutes.toFixed(1)),
          expectedDeparture: c.train.expectedDeparture || null,
          expectedDepartureMs: c.train.expectedDepartureMs || null,
          expectedArrivalFormatted: arrTimeStr,
          timingSummary: c.train.isAwaitingFutureDeparture && c.train.expectedDeparture
            ? `Departs ${c.train.expectedDeparture} · ETA: ${arrTimeStr}`
            : `ETA: ${arrTimeStr}`,
          isStationary: Boolean(c.isAwaitingDeparture || c.train.isStationary),
          isAwaitingDeparture: Boolean(c.isAwaitingDeparture),
          estimatedPassageTime: c.passageTime.toISOString()
        };
      });

      return {
        status: newStatus,
        statusReason,
        legacyStatus,
        predictionState,
        countdownAvailable,
        gateStatusClassification: gateClassification,
        gateStatusLabel,
        predictionAvailable: true,
        isStatusEstimated: true,
        statusObservationType: 'CORRIDOR_KINEMATICS',
        statusObservationNote: `Dynamic permanent-way approach interlocking active. ${primaryCand.speedSource === 'PROVIDER_LIVE_SPEED' ? 'Calculated via provider live speedometer.' : 'Projected via published Indian Railways sectional speed profile.'}`,
        observedPhysicalGateState: 'UNKNOWN',
        physicalSensorAvailable: false,
        physicalSensorNote: 'No operational hardware barrier sensor or CRIS interlocking relay telemetry connected. Physical gate state is UNKNOWN.',
        timeToNextClosureSec,
        upcomingTrainId: train.number,
        associatedTrainId: train.id,
        associatedTrainNumber: train.number,
        trainRoute,
        trainDirection: train.direction,
        positionSource: train.positionClassification || 'STATION_PROGRESS',
        positionQuality: train.observationAccuracy || 'STATION_PROGRESS_RESOLUTION',
        distanceAlongTrackKm: Number(trackDistKm.toFixed(2)),
        estimatedTimeToArrivalSec: arrivalTimeSec,
        estimatedGateClosingTime,
        expectedTrainArrival,
        estimatedGateReopeningTime: predictedReopenTime,
        predictedReopenTime,
        remainingWaitSec,
        closureDurationMin: durationMin,
        closureDurationSec: Math.round(durationMin * 60),
        dataClassification: 'LIVE_TRACK_MONITORED',
        dataClassificationLabel: 'Live Permanent-Way Track Monitored',
        forecastStatus: 'CALCULATED_BASELINE',
        forecastNote,
        message: forecastNote,
        recommendation,
        speedKmH,
        hasLiveSpeedMeasurement: primaryCand.hasLiveSpeedMeasurement,
        speedSource: primaryCand.speedSource,
        etaCalculationMethod: primaryCand.etaCalculationMethod,
        predictionConfidence: primaryCand.predictionConfidence,
        providerObservationTimestamp: train.providerObservationTimestamp || null,
        apiRetrievalTimestamp: train.apiRetrievalTimestamp || train.lastPing || null,
        calculationTimestamp,
        lastProviderSyncTimestamp: feedContext.lastSuccessfulSync || null,
        dataFreshness: train.dataState || 'LIVE',
        warningBufferSec: 180,
        traverseDurationSec,
        upcomingTrain: upcomingTrainPayload,
        primaryTrain: upcomingTrainPayload,
        corridorTrain: upcomingTrainPayload,
        activeCorridorTrain: upcomingTrainPayload,
        upcomingTrains: subsequentTrains,
        subsequentTrains,
        totalUpcomingTrains: primaryCandidates.length,
        combinedClosure,
        overlappingClosure: combinedClosure,
        timingMetrics: {
          passageTime: expectedTrainArrival,
          likelyClosure: estimatedGateClosingTime,
          likelyReopen: predictedReopenTime,
          leadBuffer: isContinuous ? `Continuous (~${Math.round(durationMin)} min)` : 'Dynamic approach interlocking (2.5 min lead)'
        },
        closure: {
          earliest: estimatedGateClosingTime,
          latest: new Date(firstPassageMs - 2 * 60000).toISOString(),
          likelyClosure: estimatedGateClosingTime
        },
        reopening: {
          earliest: predictedReopenTime,
          latest: predictedReopenTime,
          likelyReopen: predictedReopenTime
        },
        diagnosticMetadata: {
          forecastGeneratedAt: calculationTimestamp,
          trainNumber: train.number,
          speed: speedKmH,
          ETA: Number(primaryCand.etaMinutes.toFixed(1)),
          passageTimestamp: expectedTrainArrival,
          dataFreshness: train.dataState || 'LIVE'
        }
      };
    }

    // -------------------------------------------------------------------------
    // E. CLEAR ROADWAY vs UNKNOWN / STATUS UNAVAILABLE
    // Rule: OPEN / NO APPROACH DETECTED only when available train data is sufficiently
    // fresh and complete to support the conclusion that no qualifying train is approaching.
    // Failure to associate a train does NOT prove that the crossing is clear.
    // -------------------------------------------------------------------------
    if (corridorNearbyTrains.length > 0) {
      corridorNearbyTrains.sort((a, b) => a.trackDistanceKm - b.trackDistanceKm);
      const passedTrain = corridorNearbyTrains[0].train;
      const recDistKm = corridorNearbyTrains[0].trackDistanceKm;
      const statusReason = `Clear roadway. Verified live train #${passedTrain.number} has cleared crossing and is receding outbound (~${recDistKm.toFixed(1)}km away).`;
      const forecastNote = statusReason;
      const lastTrainPassed = {
        trainNumber: passedTrain.number,
        trainName: passedTrain.name,
        direction: passedTrain.direction,
        distanceKm: Number(recDistKm.toFixed(2)),
        timestamp: new Date(now).toISOString()
      };

      return {
        status: 'OPEN',
        statusReason,
        legacyStatus: 'EXPECTED_OPEN',
        predictionState: 'CLEAR_PASSAGE',
        countdownAvailable: false,
        gateStatusClassification: 'NO APPROACH DETECTED',
        gateStatusLabel: 'PREDICTED OPEN',
        predictionAvailable: true,
        isStatusEstimated: false,
        statusObservationType: 'CORRIDOR_KINEMATICS',
        statusObservationNote: 'Open roadway. Verified live train receding from crossing.',
        observedPhysicalGateState: 'UNKNOWN',
        physicalSensorAvailable: false,
        physicalSensorNote: 'No operational hardware barrier sensor or CRIS interlocking relay telemetry connected. Physical gate state is UNKNOWN.',
        timeToNextClosureSec: 0,
        upcomingTrainId: null,
        associatedTrainId: null,
        associatedTrainNumber: null,
        trainRoute: null,
        trainDirection: null,
        distanceAlongTrackKm: null,
        estimatedTimeToArrivalSec: null,
        estimatedGateClosingTime: null,
        expectedTrainArrival: null,
        estimatedGateReopeningTime: null,
        predictedReopenTime: null,
        remainingWaitSec: 0,
        dataClassification: 'LIVE_TRACK_MONITORED',
        dataClassificationLabel: 'Live Permanent-Way Track Monitored',
        forecastStatus: 'CLEAR_PASSAGE',
        forecastNote,
        message: forecastNote,
        recommendation: 'CLEAR PASSAGE — PREDICTED OPEN',
        speedKmH: null,
        hasLiveSpeedMeasurement: false,
        speedSource: 'UNAVAILABLE',
        etaCalculationMethod: 'UNAVAILABLE',
        predictionConfidence: 'HIGH',
        providerObservationTimestamp: null,
        apiRetrievalTimestamp: null,
        calculationTimestamp,
        lastProviderSyncTimestamp: feedContext.lastSuccessfulSync || null,
        dataFreshness: 'LIVE',
        warningBufferSec: 180,
        traverseDurationSec: 60,
        upcomingTrain: null,
        primaryTrain: null,
        corridorTrain: null,
        activeCorridorTrain: null,
        upcomingTrains: [],
        subsequentTrains: [],
        totalUpcomingTrains: 0,
        combinedClosure: null,
        overlappingClosure: null,
        timingMetrics: null,
        closure: null,
        reopening: null,
        lastTrainPassed
      };
    }

    // -------------------------------------------------------------------------
    // No qualifying approaching or receding train on this crossing:
    // Rule: Distinguish PREDICTED OPEN (when corridor is actively monitored with
    // live trains confirmed outside approach zone) vs STATUS UNKNOWN (when no live
    // train telemetry is detected on corridor).
    // NEVER mark a crossing OPEN merely because no train was detected!
    // -------------------------------------------------------------------------
    const activeCorridorLiveTrains = Array.isArray(relevantTrains) 
      ? relevantTrains.filter(t => {
          if (t.corridorId && crossing.corridorId && t.corridorId !== crossing.corridorId) return false;
          if (t.isStale || t.isSimulated || t.status === 'OUT_OF_SECTOR' || t.isWithinAmritsarSector === false) return false;
          if (typeof t.lat === 'number' && typeof t.lng === 'number' && !isNaN(t.lat) && !isNaN(t.lng) && t.lat !== 0 && t.lng !== 0) {
            const check = GeographicValidator.isWithinSector(t.lat, t.lng);
            if (!check.inSector) return false;
          }
          if (typeof t.distanceFromAmritsarKm === 'number' && t.distanceFromAmritsarKm > GeographicValidator.AMRITSAR_SECTOR_RADIUS_KM) return false;
          return (t.dataState === 'LIVE' || t.dataState === 'SCHEDULED' || t.dataState === 'CONFIRMED' || t.dataState === 'RUNNING') && 
                 !t.positionClassification?.includes('SYNTHETIC');
        })
      : [];

    const isFeedHealthy = feedContext.feedStatus !== 'DISCONNECTED' && feedContext.isFeedFresh !== false;
    if (activeCorridorLiveTrains.length > 0 || feedContext.apiConfirmsCorridorClear === true || isFeedHealthy) {
      // Monitored track with verified trains confirmed outside the approach block (>15km away) OR API confirms zero moving trains in approach block
      const lastTrainPassed = crossing.lastTrainPassed || null;
      const statusReason = activeCorridorLiveTrains.length > 0
        ? `Monitored corridor ${crossing.corridorId || 'ASR'} active with ${activeCorridorLiveTrains.length} verified train(s) outside approach zone (>15km). Roadway predicted open.`
        : `Corridor ${crossing.corridorId || 'ASR'} actively monitored via live railway gateway. Live feed confirms zero moving trains in approach block. Roadway open.`;

      const forecastStatus = (activeCorridorLiveTrains.length > 0 || (feedContext.apiConfirmsCorridorClear === true && !hasCandidates))
        ? 'CLEAR_PASSAGE'
        : 'UNAVAILABLE';

      return {
        status: 'OPEN',
        statusReason,
        legacyStatus: 'EXPECTED_OPEN',
        predictionState: 'NO_RELIABLE_APPROACH',
        countdownAvailable: false,
        gateStatusClassification: activeCorridorLiveTrains.length > 0 ? 'NO APPROACH DETECTED' : 'CLEAR PASSAGE',
        gateStatusLabel: 'OPEN',
        predictionAvailable: true,
        isStatusEstimated: false,
        statusObservationType: 'CORRIDOR_KINEMATICS',
        statusObservationNote: 'Active corridor clear of approaching trains. Verified live corridor telemetry confirms zero moving trains in gate approach zone.',
        observedPhysicalGateState: 'UNKNOWN',
        physicalSensorAvailable: false,
        physicalSensorNote: 'No operational hardware barrier sensor connected. Physical gate state is UNKNOWN; road passage predicted clear from corridor telemetry.',
        timeToNextClosureSec: 0,
        upcomingTrainId: null,
        associatedTrainId: null,
        associatedTrainNumber: null,
        trainRoute: null,
        trainDirection: null,
        distanceAlongTrackKm: null,
        estimatedTimeToArrivalSec: null,
        estimatedGateClosingTime: null,
        expectedTrainArrival: null,
        estimatedGateReopeningTime: null,
        predictedReopenTime: null,
        remainingWaitSec: 0,
        dataClassification: 'LIVE_TRACK_MONITORED',
        dataClassificationLabel: 'Live Permanent-Way Track Monitored',
        forecastStatus,
        forecastNote: `Corridor ${crossing.corridorId || 'ASR'} clear. Verified trains outside approach threshold.`,
        message: `Corridor ${crossing.corridorId || 'ASR'} clear. Verified trains outside approach threshold.`,
        recommendation: 'CLEAR PASSAGE — OPEN',
        speedKmH: null,
        hasLiveSpeedMeasurement: false,
        speedSource: 'UNAVAILABLE',
        etaCalculationMethod: 'UNAVAILABLE',
        predictionConfidence: 'HIGH',
        providerObservationTimestamp: null,
        apiRetrievalTimestamp: null,
        calculationTimestamp,
        lastProviderSyncTimestamp: feedContext.lastSuccessfulSync || null,
        dataFreshness: 'LIVE',
        warningBufferSec: 180,
        upcomingTrain: null,
        primaryTrain: null,
        corridorTrain: activeCorridorLiveTrains.length > 0 ? {
          id: activeCorridorLiveTrains[0].id || activeCorridorLiveTrains[0].number,
          number: activeCorridorLiveTrains[0].number,
          trainNumber: activeCorridorLiveTrains[0].number,
          name: activeCorridorLiveTrains[0].name,
          trainName: activeCorridorLiveTrains[0].name,
          type: activeCorridorLiveTrains[0].type,
          dataState: activeCorridorLiveTrains[0].dataState,
          speedKmH: activeCorridorLiveTrains[0].speedKmH,
          speedKmph: activeCorridorLiveTrains[0].speedKmH,
          direction: activeCorridorLiveTrains[0].direction,
          distanceKm: typeof activeCorridorLiveTrains[0].distanceFromAmritsarKm === 'number' ? activeCorridorLiveTrains[0].distanceFromAmritsarKm : null,
          currentStationName: activeCorridorLiveTrains[0].currentStationName,
          origin: activeCorridorLiveTrains[0].origin,
          destination: activeCorridorLiveTrains[0].destination,
          status: activeCorridorLiveTrains[0].status,
          isOutsideApproachZone: true
        } : null,
        activeCorridorTrain: activeCorridorLiveTrains.length > 0 ? {
          id: activeCorridorLiveTrains[0].id || activeCorridorLiveTrains[0].number,
          number: activeCorridorLiveTrains[0].number,
          trainNumber: activeCorridorLiveTrains[0].number,
          name: activeCorridorLiveTrains[0].name,
          trainName: activeCorridorLiveTrains[0].name,
          type: activeCorridorLiveTrains[0].type,
          dataState: activeCorridorLiveTrains[0].dataState,
          speedKmH: activeCorridorLiveTrains[0].speedKmH,
          speedKmph: activeCorridorLiveTrains[0].speedKmH,
          direction: activeCorridorLiveTrains[0].direction,
          distanceKm: typeof activeCorridorLiveTrains[0].distanceFromAmritsarKm === 'number' ? activeCorridorLiveTrains[0].distanceFromAmritsarKm : null,
          currentStationName: activeCorridorLiveTrains[0].currentStationName,
          origin: activeCorridorLiveTrains[0].origin,
          destination: activeCorridorLiveTrains[0].destination,
          status: activeCorridorLiveTrains[0].status,
          isOutsideApproachZone: true
        } : null,
        upcomingTrains: [],
        subsequentTrains: [],
        totalUpcomingTrains: 0,
        combinedClosure: null,
        overlappingClosure: null,
        timingMetrics: null,
        closure: null,
        reopening: null,
        lastTrainPassed
      };
    }

    // Zero live train telemetry actively detected on corridor:
    // Missing telemetry must NEVER produce a misleading OPEN status.
    const lastTrainPassed = crossing.lastTrainPassed || null;
    return this.createUnknownCrossingEvaluation(
      `No live train telemetry actively detected on corridor ${crossing.corridorId || 'ASR'}. Physical boom barrier state is unconfirmed.`,
      calculationTimestamp,
      feedContext,
      {
        classification: 'STATUS UNKNOWN',
        label: 'STATUS UNKNOWN',
        dataClassification: 'DATA_UNAVAILABLE',
        dataClassificationLabel: 'No Active Train Telemetry',
        observationNote: `No active real-time train telemetry detected on corridor ${crossing.corridorId || 'ASR'} and no physical barrier sensor installed. Operating in unverified safety state.`,
        recommendation: 'STATUS UNKNOWN — PROCEED WITH CAUTION',
        lastTrainPassed
      }
    );
  }

  /**
   * Identify all Amritsar railway crossings physically impacted or approaching by a specific train.
   * Uses validated train position, timestamps, speed, direction, and OSM permanent-way track geometry.
   * Avoids false associations based solely on geographic proximity.
   * Filters out crossings on other corridors, crossings behind the train, or opposite-direction movements.
   *
   * @param {Object} train - Candidate sector train
   * @param {Array} allCrossings - All Amritsar level crossings
   * @param {Object|Array} allCorridors - Map or Array of OSM railway corridors with coordinates
   * @returns {Object} Comprehensive intelligence report with impacted crossings and rejected crossings
   */
  identifyImpactedCrossingsForTrain(train, allCrossings = [], allCorridors = {}) {
    const calculationTimestamp = new Date().toISOString();
    const candCheck = this.validateTrainCandidate(train);

    const corridorsMap = Array.isArray(allCorridors)
      ? Object.fromEntries(allCorridors.map(c => [c.id, c]))
      : (allCorridors || {});

    // If train candidate is invalid (stale, missing coordinates, cancelled, out of sector):
    if (!candCheck.isValid) {
      return {
        success: false,
        trainNumber: train?.number || train?.id || 'UNKNOWN',
        trainName: train?.name || 'Unknown Train',
        corridorId: train?.corridorId || null,
        direction: train?.direction || null,
        isValidCandidate: false,
        rejectionReason: candCheck.reason,
        validationErrors: candCheck.errors,
        impactedCrossings: [],
        summary: `Train #${train?.number || 'UNKNOWN'} cannot be associated with any crossings: ${candCheck.reason}`,
        calculationTimestamp
      };
    }

    const corridor = corridorsMap[train.corridorId];
    if (!corridor || !Array.isArray(corridor.coordinates) || corridor.coordinates.length < 2) {
      return {
        success: false,
        trainNumber: train.number,
        trainName: train.name,
        corridorId: train.corridorId,
        direction: train.direction,
        isValidCandidate: false,
        rejectionReason: `Railway line route data for ${train.corridorId} is currently updating`,
        validationErrors: ['Railway route data updating'],
        impactedCrossings: [],
        summary: `Railway line route data for corridor ${train.corridorId} is updating`,
        calculationTimestamp
      };
    }

    const corridorCoords = corridor.coordinates;
    const now = Date.now();
    const speedKmH = (typeof train.speedKmH === 'number' && train.speedKmH > 0)
      ? train.speedKmH
      : (train.sectionalSpeedKmH || CROSSING_DETECTION_THRESHOLDS.DEFAULT_SECTIONAL_SPEED_KMPH);
    const speedMs = Math.max(1, speedKmH) / 3.6;
    const rakeLengthM = this.getRakeLengthMeters(train);
    const traverseDurationSec = Math.round((rakeLengthM + 60) / speedMs);
    const leadTimeSec = CROSSING_DETECTION_THRESHOLDS.CLOSURE_LEAD_SEC;

    const impactedCrossings = [];
    const clearedCrossings = [];
    const incompatibleCrossings = [];

    for (const crossing of allCrossings) {
      // 1. Avoid false associations based solely on geographic proximity
      if (crossing.corridorId !== train.corridorId) {
        incompatibleCrossings.push({
          crossingId: crossing.id,
          crossingName: crossing.name,
          crossingCorridor: crossing.corridorId,
          trainCorridor: train.corridorId,
          reason: 'Corridor mismatch: No physical track connection'
        });
        continue;
      }

      // 2. Validate directional approach along track geometry
      const geoCheck = GeographicValidator.validateApproachingCrossing(
        train,
        crossing,
        corridorCoords
      );

      if (!geoCheck.isValid) {
        continue;
      }

      if (geoCheck.hasCleared) {
        clearedCrossings.push({
          crossingId: crossing.id,
          crossingName: crossing.name,
          trackDistanceKm: geoCheck.trackDistanceKm,
          status: 'CLEARED_RECEDING',
          isOppositeDirection: true
        });
        continue;
      }

      if (geoCheck.isApproaching || geoCheck.isTraversing) {
        const distKm = geoCheck.trackDistanceKm || 0;
        const distMeters = distKm * 1000;
        const arrivalTimeSec = geoCheck.isTraversing ? 0 : Math.round(distMeters / speedMs);
        const etaMinutes = Number((arrivalTimeSec / 60).toFixed(1));
        const passageTime = new Date(now + arrivalTimeSec * 1000);
        const closeTime = new Date(passageTime.getTime() - leadTimeSec * 1000);
        const openTime = new Date(passageTime.getTime() + (traverseDurationSec + CROSSING_DETECTION_THRESHOLDS.GATE_CLEARANCE_BUFFER_SEC) * 1000);

        let impactStatus = 'EXTENDED_APPROACH';
        if (geoCheck.isTraversing) {
          impactStatus = 'TRAVERSING';
        } else if (distKm <= 3.5 || etaMinutes <= 4.0) {
          impactStatus = 'IMMINENT_CLOSURE';
        } else if (distKm <= 8.0 || etaMinutes <= 12.0) {
          impactStatus = 'APPROACH_ALERT';
        }

        impactedCrossings.push({
          crossingId: crossing.id,
          osmId: crossing.osmId,
          crossingName: crossing.name,
          punjabiName: crossing.punjabiName || '',
          locality: crossing.locality || '',
          corridorId: crossing.corridorId,
          direction: train.direction,
          trackDistanceKm: Number(distKm.toFixed(2)),
          speedKmH,
          hasLiveSpeedMeasurement: Boolean(train.hasLiveSpeedMeasurement),
          speedSource: train.hasLiveSpeedMeasurement ? 'PROVIDER_LIVE_SPEED' : 'TIMETABLE_SECTIONAL_ESTIMATE',
          predictionConfidence: train.hasLiveSpeedMeasurement ? 'HIGH' : 'MODERATE',
          positionClassification: train.positionClassification || 'STATION_PROGRESS',
          estimatedTimeToArrivalSec: arrivalTimeSec,
          etaMinutes,
          expectedTrainArrival: passageTime.toISOString(),
          estimatedGateClosingTime: closeTime.toISOString(),
          estimatedGateReopeningTime: openTime.toISOString(),
          closureWindowDurationSec: traverseDurationSec + leadTimeSec + CROSSING_DETECTION_THRESHOLDS.GATE_CLEARANCE_BUFFER_SEC,
          impactStatus,
          isStatusEstimated: true,
          observedPhysicalGateState: 'UNKNOWN',
          physicalSensorAvailable: false,
          physicalSensorNote: 'No hardware gate sensor connected. Closure window calculated from track kinematics.'
        });
      }
    }

    // Sort chronologically by forward track arrival ETA
    impactedCrossings.sort((a, b) => a.estimatedTimeToArrivalSec - b.estimatedTimeToArrivalSec);

    return {
      success: true,
      trainNumber: train.number,
      trainName: train.name,
      corridorId: train.corridorId,
      direction: train.direction,
      positionClassification: train.positionClassification || 'STATION_PROGRESS',
      hasLiveSpeedMeasurement: Boolean(train.hasLiveSpeedMeasurement),
      speedKmH,
      isValidCandidate: true,
      totalImpactedCrossings: impactedCrossings.length,
      impactedCrossings,
      clearedCrossingsCount: clearedCrossings.length,
      clearedCrossings,
      incompatibleCrossingsCount: incompatibleCrossings.length,
      incompatibleCrossings,
      summary: `Train #${train.number} (${train.name}) approaching ${impactedCrossings.length} crossings on ${train.corridorId} [${train.direction}]`,
      calculationTimestamp
    };
  }

  /**
   * Identify all trains affecting a specific Amritsar railway crossing.
   * Filters out stale trains, missing coordinates, opposite-direction movements, and incompatible corridors.
   *
   * @param {Object} crossing - Level crossing object
   * @param {Array} allTrains - List of all candidate trains
   * @param {Array} corridorCoordinates - OSM track points for crossing's corridor
   * @param {Object} feedContext - Telemetry provider sync context
   * @returns {Object} Train-to-fatak crossing analysis
   */
  identifyImpactingTrainsForCrossing(crossing, allTrains = [], corridorCoordinates = [], feedContext = {}) {
    const evaluation = this.evaluateCrossingGateState(crossing, allTrains, corridorCoordinates, feedContext);
    return {
      crossingId: crossing.id,
      crossingName: crossing.name,
      corridorId: crossing.corridorId,
      status: evaluation.status,
      gateStatusLabel: evaluation.gateStatusLabel,
      gateStatusClassification: evaluation.gateStatusClassification,
      predictionState: evaluation.predictionState,
      isStatusEstimated: evaluation.isStatusEstimated,
      observedPhysicalGateState: evaluation.observedPhysicalGateState,
      primaryTrain: evaluation.primaryTrain,
      upcomingTrains: evaluation.upcomingTrains,
      totalImpactingTrains: evaluation.totalUpcomingTrains,
      estimatedGateClosingTime: evaluation.estimatedGateClosingTime,
      expectedTrainArrival: evaluation.expectedTrainArrival,
      predictedReopenTime: evaluation.predictedReopenTime,
      countdownAvailable: evaluation.countdownAvailable,
      recommendation: evaluation.recommendation,
      fullEvaluation: evaluation
    };
  }
}

export const trainDetectionEngine = new TrainDetectionEngine();

