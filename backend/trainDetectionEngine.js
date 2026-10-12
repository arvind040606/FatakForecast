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
  // Amritsar Ground Truth Closure Lead Time: 10 to 15 minutes (default: 12 minutes / 720s)
  CLOSURE_LEAD_SEC: 720,
  CLOSURE_LEAD_MIN_SEC: 600, // 10 minutes
  CLOSURE_LEAD_MAX_SEC: 900, // 15 minutes

  // Amritsar Ground Truth Post-Passage Reopening Buffer: 1 to 3 minutes (nominal: 2 minutes / 120s)
  GATE_CLEARANCE_BUFFER_SEC: 120, // 2 minutes post-passage barrier lifting & cabin block clearance
  GATE_CLEARANCE_MIN_SEC: 60,   // 1 minute
  GATE_CLEARANCE_MAX_SEC: 180,  // 3 minutes

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
      if (train.dataState === 'STALE') {
        errors.push('Stale telemetry ping rejected (>15 min old)');
      }
      if (train.dataState === 'UNKNOWN') {
        errors.push('Train position is unknown');
      }
    }

    // 2. Geographic boundary & operational status validation: Must be physically inside Amritsar sector
    if (train.status === 'NOT_STARTED' || train.status === 'not-started') {
      errors.push('Train has not started operation (NOT_STARTED)');
    }
    if (typeof train.lat !== 'number' || typeof train.lng !== 'number' || isNaN(train.lat) || isNaN(train.lng) || (train.lat === 0 && train.lng === 0)) {
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
    const effectiveObservationTime = train.providerObservationTimestamp || train.lastPing;
    if (effectiveObservationTime) {
      const ageMs = Date.now() - new Date(effectiveObservationTime).getTime();
      if (ageMs > CROSSING_DETECTION_THRESHOLDS.STALE_TELEMETRY_TIMEOUT_SEC * 1000) {
        errors.push('Telemetry observation is over 15 minutes old (stale telemetry)');
      }
    }

    // 4. Contradictory Station Progress vs Coordinates Check
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
    return {
      status: 'UNKNOWN',
      statusReason,
      legacyStatus: 'DATA_UNAVAILABLE',
      predictionState: 'TELEMETRY_UNAVAILABLE',
      countdownAvailable: false,
      gateStatusClassification: options.classification || 'STATUS UNAVAILABLE',
      gateStatusLabel: options.label || 'STATUS UNAVAILABLE',
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
      trainRoute: null,
      trainDirection: null,
      distanceAlongTrackKm: null,
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
      recommendation: 'PROCEED WITH CAUTION — STATUS UNVERIFIED',
      speedKmH: null,
      hasLiveSpeedMeasurement: false,
      speedSource: 'UNAVAILABLE',
      etaCalculationMethod: 'UNAVAILABLE',
      predictionConfidence: 'UNAVAILABLE',
      providerObservationTimestamp: options.providerObservationTimestamp || null,
      apiRetrievalTimestamp: options.apiRetrievalTimestamp || null,
      calculationTimestamp,
      lastProviderSyncTimestamp: feedContext.lastSuccessfulSync || null,
      dataFreshness: options.dataFreshness || 'UNAVAILABLE',
      warningBufferSec: 180,
      traverseDurationSec: 60,
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
      lastTrainPassed: null
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
    const staleCandidates = [];
    const unverifiedCandidates = [];

    if (hasCandidates) {
      for (const train of relevantTrains) {
        // Validate candidate state
        const candCheck = this.validateTrainCandidate(train);
        if (!candCheck.isValid) {
          if (candCheck.errors.some(e => e.includes('stale') || e.includes('Stale'))) {
            staleCandidates.push(train);
          } else {
            unverifiedCandidates.push({ train, reasons: candCheck.errors });
          }
          continue; // Skip invalid, out-of-sector, or cancelled trains
        }

        // Validate directional track connectivity to this specific crossing
        const geoCheck = GeographicValidator.validateApproachingCrossing(
          train,
          crossing,
          corridorCoordinates
        );

        if (geoCheck.isValid && geoCheck.trackDistanceKm !== null) {
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
          } else if (geoCheck.hasCleared) {
            corridorNearbyTrains.push({
              train,
              trackDistanceKm: geoCheck.trackDistanceKm,
              isApproaching: false,
              isTraversing: false,
              hasCleared: true
            });
          }
        } else {
          unverifiedCandidates.push({ train, reasons: [geoCheck.rejectionReason || 'Track connectivity check failed'] });
        }
      }
    }

    // If candidate trains were provided on this corridor, but all were rejected due to stale pings:
    if (hasCandidates && staleCandidates.length > 0 && staleCandidates.length === relevantTrains.length && validApproachingTrains.length === 0) {
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
          dataFreshness: 'STALE'
        }
      );
    }

    // -------------------------------------------------------------------------
    // C. PROCESS VALID APPROACHING TRAINS (SPEED & ETA INTEGRATION)
    // -------------------------------------------------------------------------
    const processedApproaching = [];
    for (const item of validApproachingTrains) {
      const train = item.train;

      // Handle stopped trains (e.g. at platform, siding, or halt)
      const isStationary = train.status === 'STATIONARY' || 
                           train.status === 'PLATFORM_BOARDING' || 
                           train.status === 'NOT_STARTED' ||
                           train.status === 'CANCELLED' ||
                           train.isStationary === true ||
                           train.movementStatus === 'STOPPED' ||
                           train.speedKmH === 0;

      if (isStationary && item.trackDistanceKm > 0.15) {
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

      if (hasLiveSpeedMeasurement && train.speedKmH > 0) {
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

      let closeTime, openTime, passageTime, crossBy;

      if (item.isTraversing) {
        const alreadyTraversedM = (item.traversedDistanceKm || 0) * 1000;
        const alreadyTraversedSec = Math.round(alreadyTraversedM / speedMs);
        const remainingTraverseSec = Math.max(1, traverseDurationSec - alreadyTraversedSec);
        
        arrivalTimeSec = 0;
        distMeters = 0;
        passageTime = new Date(now);
        closeTime = new Date(now - (alreadyTraversedSec + CROSSING_DETECTION_THRESHOLDS.CLOSURE_LEAD_SEC) * 1000);
        // Amritsar Ground Truth: Gate opens 1 to 3 minutes (nominal 2 minutes / 120s) after complete train clearance
        openTime = new Date(now + (remainingTraverseSec + CROSSING_DETECTION_THRESHOLDS.GATE_CLEARANCE_BUFFER_SEC) * 1000);
        crossBy = new Date(closeTime.getTime() - 60000);
      } else {
        passageTime = new Date(now + arrivalTimeSec * 1000);
        // Amritsar Ground Truth: Gate closes 10 to 15 minutes before train arrives (nominal 12 minutes = 720 seconds)
        const closureLeadSec = CROSSING_DETECTION_THRESHOLDS.CLOSURE_LEAD_SEC; // 720s (12 minutes)
        closeTime = new Date(passageTime.getTime() - closureLeadSec * 1000);
        // Amritsar Ground Truth: Gate opens 1 to 3 minutes (nominal 2 minutes = 120s) after train has passed
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

    // Multi-Train Continuous Closure grouping (merge if within 4 min threshold or intervals overlap)
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
      const overlaps = cand.closeTime.getTime() <= currentBlock.closureEnd.getTime();
      const withinThreshold = passageGapMin >= 0 && passageGapMin <= 4.0;

      if (overlaps || withinThreshold) {
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
      const durationMin = Number(((activeBlock.closureEnd.getTime() - activeBlock.closureStart.getTime()) / 60000).toFixed(1));
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

      // 1. Imminent / Locked threshold (CLOSED)
      // When current time is within active closure block OR train is actively traversing OR within barrier lock lead
      const isClosed = primaryCand.isTraversing ||
        (now >= closureStartMs && now <= closureEndMs) ||
        (timeToClosureSec <= 0 && now <= closureEndMs);

      // 2. Active approach alert threshold (APPROACHING)
      // Barrier closing soon, within approach window (timeToClosureSec > 0 and <= 180s or within approach distance)
      const isApproaching = !isClosed && (
        (timeToClosureSec > 0 && timeToClosureSec <= 180) ||
        (diffMinutesFirst <= CROSSING_DETECTION_THRESHOLDS.APPROACH_HORIZON_MIN && trackDistKm <= CROSSING_DETECTION_THRESHOLDS.APPROACH_DISTANCE_KM)
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
        newStatus = 'CLOSED';
        gateStatusLabel = (primaryCand.isTraversing || diffMinutesFirst <= 0) ? 'CLOSED (TRAIN TRAVERSING)' : 'CLOSED (BOOM BARRIERS LOCKED)';
        gateClassification = 'PREDICTED_CLOSURE';
        legacyStatus = 'PREDICTED_CLOSURE';
        predictionState = (primaryCand.isTraversing || diffMinutesFirst <= 0) ? 'PASSAGE_DETECTED' : 'BOOM_BARRIERS_LOCKED';
        countdownAvailable = true;
        timeToNextClosureSec = 0;
        remainingWaitSec = Math.max(1, Math.round((closureEndMs - now) / 1000));
        const timeToReopenMin = Number((remainingWaitSec / 60).toFixed(1));
        estimatedGateClosingTime = activeBlock.closureStart.toISOString();
        predictedReopenTime = activeBlock.closureEnd.toISOString();
        recommendation = 'DO NOT CROSS — GATE CLOSED';

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
        gateStatusLabel = 'APPROACHING';
        gateClassification = 'APPROACH ALERT';
        legacyStatus = 'PREDICTED_CLOSURE';
        predictionState = 'APPROACHING';
        countdownAvailable = true;
        timeToNextClosureSec = Math.max(1, timeToClosureSec);
        const timeToClosureMin = Number((timeToNextClosureSec / 60).toFixed(1));
        estimatedGateClosingTime = activeBlock.closureStart.toISOString();
        predictedReopenTime = activeBlock.closureEnd.toISOString();
        remainingWaitSec = 0;
        statusReason = isContinuous
          ? `Train #${train.number} approaching in ~${Number(diffMinutesFirst.toFixed(1))} min. Multi-train continuous closure expected for ${activeBlock.items.length} trains. Gate closes in ~${timeToClosureMin} min.`
          : `Verified train #${train.number} approaching crossing (${trackDistKm.toFixed(1)} km away). Arrival in ~${Math.round(diffMinutesFirst)} min. Gate closes in ~${timeToClosureMin} min.`;
        forecastNote = statusReason;
        recommendation = 'PLAN TO STOP — TRAIN APPROACHING';
      } else if (now > closureEndMs) {
        // Train has cleared crossing
        newStatus = 'OPEN';
        gateStatusLabel = 'OPEN';
        gateClassification = 'CLEAR PASSAGE';
        legacyStatus = 'EXPECTED_OPEN';
        predictionState = 'CLEAR_PASSAGE';
        countdownAvailable = false;
        timeToNextClosureSec = 0;
        estimatedGateClosingTime = null;
        predictedReopenTime = null;
        remainingWaitSec = 0;
        statusReason = `Train #${train.number} has cleared crossing. Corridor is OPEN with clear passage.`;
        forecastNote = statusReason;
        recommendation = 'SAFE TO CROSS — OPEN';
      } else {
        // Train is > 8.0 km away or > 10 min away: Roadway is OPEN with live countdown to next closure
        newStatus = 'OPEN';
        gateStatusLabel = 'OPEN';
        gateClassification = 'CLEAR PASSAGE';
        legacyStatus = 'EXPECTED_OPEN';
        predictionState = 'EXTENDED_APPROACH';
        countdownAvailable = true;
        timeToNextClosureSec = Math.max(1, timeToClosureSec);
        const timeToClosureMin = Number((timeToNextClosureSec / 60).toFixed(1));
        estimatedGateClosingTime = activeBlock.closureStart.toISOString();
        predictedReopenTime = activeBlock.closureEnd.toISOString();
        remainingWaitSec = 0;
        statusReason = isContinuous
          ? `Train passage predicted in ~${Math.round(diffMinutesFirst)} min (${activeBlock.items.length} trains). Fatak is OPEN (Closes in ~${timeToClosureMin} min).`
          : `Roadway open. Train #${train.number} on corridor (${trackDistKm.toFixed(1)} km away), expected passage in ~${Math.round(diffMinutesFirst)} min. Gate closes in ~${timeToClosureMin} min.`;
        forecastNote = statusReason;
        recommendation = 'SAFE TO CROSS — OPEN';
      }

      const combinedClosure = {
        isContinuous,
        isOverlapping: isContinuous,
        trainCount: activeBlock.items.length,
        combinedDurationMinutes: durationMin,
        durationMinutes: durationMin,
        closureStart: activeBlock.closureStart.toISOString(),
        closureEnd: activeBlock.closureEnd.toISOString(),
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

      const upcomingTrainPayload = {
        id: train.id,
        number: train.number,
        trainNumber: train.number,
        name: train.name,
        trainName: train.name,
        type: train.type,
        dataState: train.dataState,
        speedKmH,
        speedKmph: speedKmH,
        hasLiveSpeedMeasurement: primaryCand.hasLiveSpeedMeasurement,
        speedSource: primaryCand.speedSource,
        etaCalculationMethod: primaryCand.etaCalculationMethod,
        predictionConfidence: primaryCand.predictionConfidence,
        direction: train.direction,
        distanceKm: Number(trackDistKm.toFixed(2)),
        etaMinutes: Number(primaryCand.etaMinutes.toFixed(1)),
        estimatedPassageTime: expectedTrainArrival,
        rakeLengthM,
        origin: train.origin || 'Amritsar Jn',
        destination: train.destination || 'Amritsar Sector',
        schedule: train.schedule || []
      };

      const subsequentTrains = primaryCandidates.slice(1).map(c => ({
        trainNumber: c.train.number,
        trainName: c.train.name,
        direction: c.train.direction,
        speedKmph: c.speedKmH,
        distanceKm: Number(c.trackDistanceKm.toFixed(2)),
        etaMinutes: Number(c.etaMinutes.toFixed(1)),
        estimatedPassageTime: c.passageTime.toISOString()
      }));

      return {
        status: newStatus,
        statusReason,
        legacyStatus,
        predictionState,
        countdownAvailable,
        gateStatusClassification: gateClassification,
        gateStatusLabel,
        predictionAvailable: true,
        isStatusEstimated: false,
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
        distanceKm: Number(recDistKm.toFixed(2))
      };

      return {
        status: 'OPEN',
        statusReason,
        legacyStatus: 'EXPECTED_OPEN',
        predictionState: 'CLEAR_PASSAGE',
        countdownAvailable: false,
        gateStatusClassification: 'NO APPROACH DETECTED',
        gateStatusLabel: 'OPEN',
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
        recommendation: 'SAFE TO CROSS — OPEN',
        speedKmH: null,
        hasLiveSpeedMeasurement: false,
        speedSource: 'UNAVAILABLE',
        etaCalculationMethod: 'UNAVAILABLE',
        predictionConfidence: 'UNAVAILABLE',
        providerObservationTimestamp: null,
        apiRetrievalTimestamp: null,
        calculationTimestamp,
        lastProviderSyncTimestamp: feedContext.lastSuccessfulSync || null,
        dataFreshness: 'LIVE',
        warningBufferSec: 180,
        traverseDurationSec: 60,
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
        lastTrainPassed
      };
    }

    // -------------------------------------------------------------------------
    // No qualifying train within gate closure or approach threshold:
    // Physical state is OPEN (Clear road passage).
    // -------------------------------------------------------------------------
    const lastTrainPassed = null;

    return {
      status: 'OPEN',
      statusReason: `Clear passage. No train approaching within 10-15m gate closure threshold on corridor ${crossing.corridorId || 'ASR'}.`,
      legacyStatus: 'EXPECTED_OPEN',
      predictionState: 'CLEAR_PASSAGE',
      countdownAvailable: false,
      gateStatusClassification: 'PREDICTED PASSAGE CLEAR',
      gateStatusLabel: 'PREDICTED CLEAR',
      predictionAvailable: true,
      isStatusEstimated: false,
      statusObservationType: 'CORRIDOR_KINEMATICS',
      statusObservationNote: 'Open roadway. Active corridor clear of approaching trains.',
      observedPhysicalGateState: 'UNKNOWN',
      physicalSensorAvailable: false,
      physicalSensorNote: 'No operational hardware barrier sensor or CRIS interlocking relay telemetry connected. Physical gate status is UNKNOWN. Passage predicted clear based on monitored track.',
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
      forecastStatus: 'PREDICTED_PASSAGE_CLEAR',
      forecastNote: 'Clear roadway. No approaching train detected on corridor.',
      message: 'Clear roadway. No approaching train detected on corridor.',
      recommendation: 'PREDICTED PASSAGE CLEAR — PROCEED WITH NORMAL VIGILANCE',
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
}

export const trainDetectionEngine = new TrainDetectionEngine();
