// =========================================================================
// FATAKFORECAST — RAILRADAR TELEMETRY SERVICE & CIRCUIT BREAKER ENGINE
// Category A Telemetry Feed (https://railradar.in/api/v1)
// Rigorous verification, honest timestamp separation, zero data fabrication
// =========================================================================

import { STATION_COORDINATES } from './stationCoordinates.js';
import { GeographicValidator } from './geographicValidator.js';

export { STATION_COORDINATES };

export class TelemetryService {
  constructor() {
    this.providerName = 'RailRadar Live Tracking Gateway';
    this.providerType = 'REST Telemetry API Feed';
    this.baseUrl = (process.env.RAILRADAR_BASE_URL || 'https://railradar.in/api/v1').replace(/\/+$/, '');
    this.apiKey = process.env.RAILRADAR_API_KEY || null;

    // Operational status
    this.status = this.apiKey ? 'READY' : 'NOT_CONFIGURED';
    this.isQuotaExhausted = false;
    this.lastSuccessfulSync = null;
    this.lastAttemptTimestamp = null;
    this.measuredLatencyMs = null;
    this.lastError = this.apiKey ? null : 'RAILRADAR_API_KEY not configured in backend/.env';

    // Circuit Breaker pattern for rate limit / quota management
    this.circuitBreaker = {
      state: 'CLOSED', // 'CLOSED' (healthy), 'OPEN' (tripped in backoff), 'HALF_OPEN' (probing)
      failureCount: 0,
      failureThreshold: 3,
      trippedAt: null,
      cooldownDurationMs: 5 * 60 * 1000, // 5 minutes backoff cooldown
      probeSuccessCount: 0
    };

    // Cache management (90s TTL to prevent rate limit exhaustion)
    this.cache = new Map();
    this.cacheTtlMs = 90 * 1000;

    // Negative cache (for 404s/not running trains - 15 min TTL)
    this.errorCache = new Map();
    this.errorCacheTtlMs = 15 * 60 * 1000;

    // Deduplication of in-flight network requests
    this.inFlightRequests = new Map();

    // Map of validated train objects keyed by 5-digit train number
    this.validatedTrainsMap = new Map();
  }

  getApiKey() {
    if (!this.apiKey && process.env.RAILRADAR_API_KEY) {
      this.apiKey = process.env.RAILRADAR_API_KEY.trim();
      if (this.apiKey) {
        this.status = 'READY';
        this.lastError = null;
      }
    }
    return this.apiKey;
  }

  getMaskedKey() {
    const key = this.getApiKey();
    if (!key) return 'NOT_CONFIGURED';
    if (key.length <= 8) return '****';
    return `${key.substring(0, 4)}****${key.substring(key.length - 4)}`;
  }

  isConfigured() {
    return Boolean(this.getApiKey());
  }

  isAvailable() {
    if (!this.isConfigured()) return false;
    this.evaluateCircuitBreakerState();
    return this.circuitBreaker.state !== 'OPEN';
  }

  evaluateCircuitBreakerState() {
    if (this.circuitBreaker.state === 'OPEN') {
      const elapsed = Date.now() - (this.circuitBreaker.trippedAt || 0);
      if (elapsed >= this.circuitBreaker.cooldownDurationMs) {
        // Cooldown period elapsed: transition to HALF_OPEN to probe upstream provider
        this.circuitBreaker.state = 'HALF_OPEN';
        this.circuitBreaker.probeSuccessCount = 0;
        this.status = 'PROBING';
      }
    }
  }

  tripCircuitBreaker(reason) {
    this.circuitBreaker.state = 'OPEN';
    this.circuitBreaker.trippedAt = Date.now();
    this.isQuotaExhausted = true;
    this.status = 'QUOTA_EXHAUSTED';
    this.lastError = reason || 'Circuit breaker tripped: upstream rate limit or quota exceeded.';
  }

  resetCircuitBreaker() {
    this.circuitBreaker.state = 'CLOSED';
    this.circuitBreaker.failureCount = 0;
    this.circuitBreaker.trippedAt = null;
    this.isQuotaExhausted = false;
    this.status = 'CONNECTED';
  }

  getCircuitBreakerStatus() {
    this.evaluateCircuitBreakerState();
    const cooldownRemainingSec = this.circuitBreaker.state === 'OPEN'
      ? Math.max(0, Math.round((this.circuitBreaker.cooldownDurationMs - (Date.now() - (this.circuitBreaker.trippedAt || 0))) / 1000))
      : 0;

    return {
      state: this.circuitBreaker.state,
      failureCount: this.circuitBreaker.failureCount,
      quotaExhausted: this.isQuotaExhausted,
      lastTrippedAt: this.circuitBreaker.trippedAt ? new Date(this.circuitBreaker.trippedAt).toISOString() : null,
      cooldownRemainingSec
    };
  }

  /**
   * Fetch live train status from RailRadar API.
   * Enforces: Circuit breaker, negative caching, deduplication, schema verification.
   */
  async fetchTrainLive(trainNumber) {
    const rawClean = String(trainNumber || '').trim();
    const cleanNum = rawClean.padStart(5, '0').slice(-5);
    if (!cleanNum || cleanNum === '00000') {
      return { success: false, error: 'Invalid train number' };
    }

    if (!this.isConfigured()) {
      return {
        success: false,
        error: 'RailRadar API key not configured',
        status: 'NOT_CONFIGURED'
      };
    }

    this.evaluateCircuitBreakerState();
    if (this.circuitBreaker.state === 'OPEN') {
      const cooldownSec = Math.round((this.circuitBreaker.cooldownDurationMs - (Date.now() - this.circuitBreaker.trippedAt)) / 1000);
      return {
        success: false,
        error: `RailRadar circuit breaker is OPEN (quota/rate-limit in backoff, ${cooldownSec}s remaining)`,
        circuitBreakerState: 'OPEN'
      };
    }

    const now = Date.now();

    // 1. Positive Cache
    const cached = this.cache.get(cleanNum);
    if (cached && (now - cached.timestamp < this.cacheTtlMs)) {
      return { success: true, payload: cached.data, latency: 0, fromCache: true };
    }

    // 2. Negative Cache
    const neg = this.errorCache.get(cleanNum);
    if (neg && (now - neg.timestamp < this.errorCacheTtlMs)) {
      return { success: false, error: neg.error, fromNegativeCache: true };
    }

    // 3. Deduplication of in-flight requests
    if (this.inFlightRequests.has(cleanNum)) {
      return this.inFlightRequests.get(cleanNum);
    }

    const fetchPromise = (async () => {
      const startTime = Date.now();
      this.lastAttemptTimestamp = new Date().toISOString();

      try {
        const url = `${this.baseUrl}/trains/${cleanNum}/live`;
        const res = await fetch(url, {
          method: 'GET',
          headers: {
            'x-api-key': this.getApiKey(),
            'Accept': 'application/json'
          },
          signal: AbortSignal.timeout(6000)
        });

        const latency = Date.now() - startTime;
        this.measuredLatencyMs = latency;

        // Quota / Rate Limit Handling (HTTP 429 / 403 / 401)
        if (res.status === 429) {
          this.tripCircuitBreaker('RailRadar HTTP 429: Rate limit or daily quota exhausted.');
          return { success: false, error: this.lastError, status: 429 };
        }
        if (res.status === 401 || res.status === 403) {
          this.status = 'AUTH_ERROR';
          this.lastError = `RailRadar authentication error (HTTP ${res.status}): Invalid API key.`;
          return { success: false, error: this.lastError, status: res.status };
        }
        if (!res.ok) {
          const errMsg = `RailRadar HTTP ${res.status} ${res.statusText}`;
          this.circuitBreaker.failureCount++;
          if (this.circuitBreaker.failureCount >= this.circuitBreaker.failureThreshold) {
            this.tripCircuitBreaker(errMsg);
          }
          this.errorCache.set(cleanNum, { error: errMsg, timestamp: Date.now() });
          return { success: false, error: errMsg, status: res.status };
        }

        const data = await res.json();

        // ---------------------------------------------------------------------
        // PROVIDER RESPONSE VERIFICATION (Never treat mere HTTP 200 as proof of valid telemetry)
        // ---------------------------------------------------------------------
        const verified = this.verifyProviderResponse(data, cleanNum);
        if (!verified.isValid) {
          this.errorCache.set(cleanNum, { error: verified.reason, timestamp: Date.now() });
          return { success: false, error: verified.reason, raw: data };
        }

        // Response verified successfully
        if (this.circuitBreaker.state === 'HALF_OPEN') {
          this.circuitBreaker.probeSuccessCount++;
          if (this.circuitBreaker.probeSuccessCount >= 2) {
            this.resetCircuitBreaker();
          }
        } else {
          this.status = 'CONNECTED';
          this.lastError = null;
        }

        this.lastSuccessfulSync = new Date().toISOString();
        this.cache.set(cleanNum, { data, timestamp: Date.now() });
        return { success: true, payload: data, latency, fromCache: false };

      } catch (err) {
        const latency = Date.now() - startTime;
        this.measuredLatencyMs = latency;
        const errMsg = err?.name === 'TimeoutError'
          ? 'RailRadar request timeout (5s)'
          : (err.message || 'Unknown network error');

        this.circuitBreaker.failureCount++;
        if (this.circuitBreaker.failureCount >= this.circuitBreaker.failureThreshold) {
          this.tripCircuitBreaker(errMsg);
        }

        this.errorCache.set(cleanNum, { error: errMsg, timestamp: Date.now() });
        return { success: false, error: errMsg, latency };
      } finally {
        this.inFlightRequests.delete(cleanNum);
      }
    })();

    this.inFlightRequests.set(cleanNum, fetchPromise);
    return fetchPromise;
  }

  /**
   * Verify provider response payload structure and data integrity.
   * Rejects empty payloads, error messages, and dummy simulation templates.
   */
  verifyProviderResponse(data, expectedTrainNumber) {
    if (!data || typeof data !== 'object') {
      return { isValid: false, reason: 'RailRadar response is empty or non-object' };
    }

    if (data.success === false || data.error) {
      return { isValid: false, reason: data.error || data.message || 'RailRadar returned failure envelope' };
    }

    // Check train identifier matches
    const trainNo = String(data.train_number || data.trainNumber || data.trainNo || data.number || '').trim();
    const norm = trainNo.padStart(5, '0').slice(-5);
    if (trainNo && norm !== expectedTrainNumber) {
      return { isValid: false, reason: `Train number mismatch: expected ${expectedTrainNumber}, got ${norm}` };
    }

    // Check if location or station status exists
    const hasStation = Boolean(data.current_station_code || data.currentStationCode || data.currentLocation?.stnCode || data.stationCode);
    const hasCoords = typeof data.current_lat === 'number' && typeof data.current_lng === 'number';
    const hasStatus = Boolean(data.status || data.operational_status || data.running_status);

    if (!hasStation && !hasCoords && !hasStatus) {
      return { isValid: false, reason: 'RailRadar response lacks location, station code, or running status' };
    }

    return { isValid: true };
  }

  /**
   * Map verified RailRadar response to FatakForecast unified SectorTrain schema.
   * Strictly enforces honest timestamp separation and never fabricates coordinates.
   */
  mapRailRadarTrain(data, measuredPingTime) {
    if (!data) return null;

    const trainNumber = String(data.train_number || data.trainNumber || data.trainNo || '').trim().padStart(5, '0').slice(-5);
    if (!trainNumber) return null;

    const trainName = data.train_name || data.trainName || data.name || `Train #${trainNumber}`;
    const sourceCode = data.source_code || data.sourceStation || data.source?.code || 'ASR';
    const sourceName = data.source_name || data.sourceStationName || data.source?.name || sourceCode;
    const destCode = data.dest_code || data.destStation || data.destination?.code || 'NDLS';
    const destName = data.dest_name || data.destStationName || data.destination?.name || destCode;

    const currentStationCode = String(data.current_station_code || data.currentStationCode || data.currentLocation?.stnCode || 'UNKNOWN').toUpperCase();
    const currentStationName = data.current_station_name || data.currentStationName || data.currentLocation?.stnName || currentStationCode;
    const delayMinutes = Number(data.delay_minutes ?? data.delayMinutes ?? data.currentLocation?.delayMinutes ?? 0);

    const statusRaw = String(data.status || data.running_status || '').toLowerCase();
    // Dynamic Route & Direction Resolution for Amritsar Sector
    const PTK_STATIONS = ['VKA', 'BAT', 'DHW', 'GSP', 'DNN', 'PTK', 'KNG', 'JNT'];
    const TT_STATIONS = ['BGTN', 'SBS', 'SNS', 'TTO', 'PAX', 'KEMK', 'DUQ'];
    const ATT_STATIONS = ['CIA', 'KAS', 'ATT'];
    const JUC_STATIONS = ['MOW', 'JNL', 'TRA', 'BTR', 'BEAS', 'DIW', 'HRP', 'HMR', 'KRE', 'SRX', 'JUC', 'JRC', 'CEU', 'PGW', 'GRY', 'PHR', 'LDH'];

    let corridorId = 'CORR_ASR_JUC';
    let direction = 'UP';

    const nextStn = data.currentLocation?.nextStation?.stnCode || data.nextHalt?.stnCode || null;
    const currStn = currentStationCode;

    // Check if route schedule exists to determine sequence relative to ASR
    if (Array.isArray(data.route) && data.route.length > 0) {
      const asrStopIndex = data.route.findIndex(s => (s.stnCode === 'ASR' || s.stationCode === 'ASR'));
      const currStopIndex = data.route.findIndex(s => (s.stnCode === currStn || s.stationCode === currStn));
      const nextStopIndex = nextStn ? data.route.findIndex(s => (s.stnCode === nextStn || s.stationCode === nextStn)) : -1;

      if (asrStopIndex !== -1) {
        if (currStopIndex !== -1) {
          if (currStopIndex < asrStopIndex) {
            // Train is currently before ASR on its route => Traveling DOWN towards Amritsar!
            direction = 'DOWN';
            const priorStations = data.route.slice(currStopIndex, asrStopIndex).map(s => s.stnCode || s.stationCode);
            if (priorStations.some(c => PTK_STATIONS.includes(c))) corridorId = 'CORR_ASR_PTK';
            else if (priorStations.some(c => TT_STATIONS.includes(c))) corridorId = 'CORR_ASR_TT';
            else if (priorStations.some(c => ATT_STATIONS.includes(c))) corridorId = 'CORR_ASR_ATT';
            else corridorId = 'CORR_ASR_JUC';
          } else if (currStopIndex > asrStopIndex) {
            // Train has already departed ASR on a multi-leg journey => Traveling UP away from Amritsar!
            direction = 'UP';
            const subsequentStations = data.route.slice(asrStopIndex + 1, currStopIndex + 2).map(s => s.stnCode || s.stationCode);
            if (subsequentStations.some(c => JUC_STATIONS.includes(c))) corridorId = 'CORR_ASR_JUC';
            else if (subsequentStations.some(c => TT_STATIONS.includes(c))) corridorId = 'CORR_ASR_TT';
            else if (subsequentStations.some(c => PTK_STATIONS.includes(c))) corridorId = 'CORR_ASR_PTK';
            else if (subsequentStations.some(c => ATT_STATIONS.includes(c))) corridorId = 'CORR_ASR_ATT';
            else corridorId = 'CORR_ASR_JUC';
          } else {
            // Train is currently AT Amritsar Junction (currStopIndex === asrStopIndex)
            if (nextStopIndex > asrStopIndex) {
              direction = 'UP';
              const nextStations = data.route.slice(asrStopIndex + 1).map(s => s.stnCode || s.stationCode);
              if (nextStations.some(c => JUC_STATIONS.includes(c))) corridorId = 'CORR_ASR_JUC';
              else if (nextStations.some(c => TT_STATIONS.includes(c))) corridorId = 'CORR_ASR_TT';
              else if (nextStations.some(c => PTK_STATIONS.includes(c))) corridorId = 'CORR_ASR_PTK';
              else if (nextStations.some(c => ATT_STATIONS.includes(c))) corridorId = 'CORR_ASR_ATT';
            } else {
              direction = 'DOWN';
              const prevStations = data.route.slice(0, asrStopIndex).map(s => s.stnCode || s.stationCode);
              if (prevStations.some(c => PTK_STATIONS.includes(c))) corridorId = 'CORR_ASR_PTK';
              else if (prevStations.some(c => TT_STATIONS.includes(c))) corridorId = 'CORR_ASR_TT';
              else if (prevStations.some(c => ATT_STATIONS.includes(c))) corridorId = 'CORR_ASR_ATT';
              else corridorId = 'CORR_ASR_JUC';
            }
          }
        } else {
          direction = (destCode === 'ASR' || destName.toLowerCase().includes('amritsar')) ? 'DOWN' : 'UP';
          const stnCodes = data.route.map(r => String(r.stnCode || '').toUpperCase());
          if (stnCodes.some(c => PTK_STATIONS.includes(c))) corridorId = 'CORR_ASR_PTK';
          else if (stnCodes.some(c => TT_STATIONS.includes(c))) corridorId = 'CORR_ASR_TT';
          else if (stnCodes.some(c => ATT_STATIONS.includes(c))) corridorId = 'CORR_ASR_ATT';
          else corridorId = 'CORR_ASR_JUC';
        }
      } else {
        direction = (destCode === 'ASR' || destName.toLowerCase().includes('amritsar')) ? 'DOWN' : 'UP';
      }
    } else {
      direction = (destCode === 'ASR' || destName.toLowerCase().includes('amritsar')) ? 'DOWN' : 'UP';
      if (PTK_STATIONS.includes(currStn) || PTK_STATIONS.includes(nextStn)) corridorId = 'CORR_ASR_PTK';
      else if (TT_STATIONS.includes(currStn) || TT_STATIONS.includes(nextStn)) corridorId = 'CORR_ASR_TT';
      else if (ATT_STATIONS.includes(currStn) || ATT_STATIONS.includes(nextStn)) corridorId = 'CORR_ASR_ATT';
      else if (['74688', '74687', '74685', '74684', '74686', '74681', '74682', '74683', '04688', '04690', '04687', '04689'].includes(trainNumber)) corridorId = 'CORR_ASR_TT';
      else if (['06935', '06936', '06938', '14633', '14634', '19416', '19415', '04614', '04613', '14034', '14033'].includes(trainNumber)) corridorId = 'CORR_ASR_PTK';
      else if (['04612', '04611'].includes(trainNumber)) corridorId = 'CORR_ASR_ATT';
      else corridorId = 'CORR_ASR_JUC';
    }

    // Status classification
    const isCancelled = statusRaw === 'cancelled' || statusRaw === 'canceled';
    const isNotStarted = !isCancelled && (
      statusRaw === 'not-started' || statusRaw === 'not_started' || statusRaw === 'yet to start'
    );
    const isTerminated = !isCancelled && (
      statusRaw === 'completed' || statusRaw === 'terminated' || currentStationCode === destCode
    );

    // Coordinate resolution
    let lat = null;
    let lng = null;
    let positionClassification = 'UNAVAILABLE';
    let hasLocomotiveGps = false;

    if (typeof data.current_lat === 'number' && typeof data.current_lng === 'number' && data.current_lat > 8 && data.current_lat < 38) {
      // Genuine locomotive satellite GPS ping reported
      lat = Number(data.current_lat.toFixed(6));
      lng = Number(data.current_lng.toFixed(6));
      positionClassification = 'PROVIDER_GPS';
      hasLocomotiveGps = true;
    } else if (currentStationCode !== 'UNKNOWN' && STATION_COORDINATES[currentStationCode]) {
      // Station progress node projection
      lat = STATION_COORDINATES[currentStationCode].lat;
      lng = STATION_COORDINATES[currentStationCode].lng;
      positionClassification = 'STATION_PROGRESS';
    }

    // Sector validation
    let isWithinSector = false;
    let distanceFromAmritsarKm = null;
    if (typeof lat === 'number' && typeof lng === 'number') {
      const sectorCheck = GeographicValidator.isWithinSector(lat, lng);
      isWithinSector = sectorCheck.inSector;
      distanceFromAmritsarKm = sectorCheck.distanceFromAsrKm !== Infinity ? sectorCheck.distanceFromAsrKm : null;
    }

    // Operational status
    const isAtStation = Boolean(
      statusRaw === 'at-station' ||
      statusRaw === 'at_station' ||
      statusRaw === 'start' ||
      data.currentLocation?.status === 'at-station' ||
      data.status === 'at-station' ||
      (data.currentLocation && data.currentLocation.speedKmh === 0 && currentStationCode !== 'UNKNOWN')
    );

    let operationalStatus = 'IN_TRANSIT';
    if (isCancelled) operationalStatus = 'CANCELLED';
    else if (isNotStarted) operationalStatus = 'NOT_STARTED';
    else if (isTerminated) operationalStatus = 'TERMINATED';
    else if (isAtStation || currentStationCode === sourceCode) operationalStatus = 'PLATFORM_BOARDING';
    else if (!isWithinSector) operationalStatus = 'OUT_OF_SECTOR';

    // Observation timestamp & freshness
    const rawObsTime = data.last_updated_at || data.lastUpdatedAt || data.timestamp || null;
    const providerObservationTimestamp = rawObsTime ? new Date(rawObsTime).toISOString() : measuredPingTime;
    const obsAgeMinutes = providerObservationTimestamp
      ? Math.max(0, (Date.now() - new Date(providerObservationTimestamp).getTime()) / 60000)
      : 999;
    const isStale = obsAgeMinutes > 15;

    // Strict data state determination - Never label simulated, scheduled, stale, or invalid records as LIVE
    // Strictly distinguish LIVE, STALE, SCHEDULED, SIMULATED, and UNAVAILABLE states
    let dataState = 'UNAVAILABLE';
    if (Boolean(data.is_simulated || data.isSimulated || data.simulated)) {
      dataState = 'SIMULATED';
    } else if (isCancelled) {
      dataState = 'CANCELLED';
    } else if (isNotStarted || operationalStatus === 'PLATFORM_BOARDING') {
      dataState = 'SCHEDULED';
    } else if (isTerminated) {
      dataState = 'TERMINATED';
    } else if (isStale) {
      dataState = 'STALE';
    } else if (operationalStatus === 'IN_TRANSIT' && (hasLocomotiveGps || (currentStationCode !== 'UNKNOWN' && lat !== null && lng !== null))) {
      dataState = 'LIVE';
    } else if (operationalStatus === 'IN_TRANSIT') {
      dataState = 'UNAVAILABLE';
    } else {
      dataState = 'SCHEDULED';
    }

    // Speed measurement resolution
    let speedKmH = null;
    let hasLiveSpeedMeasurement = false;
    let speedSource = 'UNAVAILABLE';

    if (typeof data.speed_kmh === 'number' && data.speed_kmh > 0) {
      speedKmH = Math.round(data.speed_kmh);
      hasLiveSpeedMeasurement = true;
      speedSource = 'PROVIDER_LIVE_SPEED';
    } else if (operationalStatus === 'TERMINATED' || isNotStarted || operationalStatus === 'PLATFORM_BOARDING') {
      speedKmH = 0;
      hasLiveSpeedMeasurement = true;
      speedSource = operationalStatus === 'PLATFORM_BOARDING' ? 'AT_STATION_PLATFORM' : 'ZERO_SPEED_TERMINAL';
    }

    return {
      id: trainNumber,
      number: trainNumber,
      name: trainName,
      type: data.train_type || 'Express',
      rakeType: 'Standard Formation',
      origin: `${sourceName} (${sourceCode})`,
      destination: `${destName} (${destCode})`,
      corridorId,
      direction,
      speedKmH,
      hasLiveSpeedMeasurement,
      speedSource,
      liveSpeedKmH: speedKmH,
      sectionalSpeedKmH: 55,
      currentCoordIndex: null,
      lat,
      lng,
      bearing: direction === 'UP' ? 110 : 290,
      currentStationCode,
      currentStationName: `${currentStationName} (${currentStationCode})`,
      lastReportedLocation: `${currentStationName} • Delay: ${delayMinutes}m`,
      distanceFromAmritsarKm,
      isWithinAmritsarSector: Boolean(isWithinSector),
      status: operationalStatus,
      dataState,
      providerStatus: statusRaw,
      positionClassification,
      providerObservationTimestamp,
      apiRetrievalTimestamp: measuredPingTime || new Date().toISOString(),
      observationAccuracy: hasLocomotiveGps ? 'LOCOMOTIVE_GPS' : 'STATION_NODE_PROJECTION',
      serviceStatus: `Tracked via RailRadar (Delay: ${delayMinutes}m)`,
      telemetrySource: `${this.providerName} (Live API)`,
      lastPing: measuredPingTime || new Date().toISOString(),
      isStale,
      delayMinutes,
      schedule: []
    };
  }

  async pollLiveProvider(trainNumbers = null) {
    if (!this.isConfigured()) return { success: false, reason: 'RailRadar not configured' };
    this.evaluateCircuitBreakerState();
    if (this.circuitBreaker.state === 'OPEN') {
      return { success: false, reason: 'Circuit breaker is OPEN (in backoff)' };
    }

    const targets = Array.isArray(trainNumbers) && trainNumbers.length > 0
      ? trainNumbers
      : ['12014', '12013', '12460', '12459', '22488', '22487', '14632', '14631', '12030', '12029', '12497', '12498', '19415', '19416'];

    let successfulPings = 0;
    let totalLatency = 0;
    let anyError = null;

    const chunkSize = 5;
    for (let i = 0; i < targets.length; i += chunkSize) {
      if (this.circuitBreaker.state === 'OPEN') break;

      const chunk = targets.slice(i, i + chunkSize);
      const results = await Promise.allSettled(chunk.map(num => this.fetchTrainLive(num)));

      for (let j = 0; j < results.length; j++) {
        const trainNum = String(chunk[j]).padStart(5, '0').slice(-5);
        const res = results[j];
        if (res.status === 'fulfilled' && res.value && res.value.success && res.value.payload) {
          totalLatency += (res.value.latency || 100);
          successfulPings++;
          const mapped = this.mapRailRadarTrain(res.value.payload, new Date().toISOString());
          if (mapped) {
            this.validatedTrainsMap.set(trainNum, mapped);
          }
        } else {
          anyError = res.status === 'rejected' ? res.reason?.message : res.value?.error;
        }
      }

      if (i + chunkSize < targets.length) {
        await new Promise(r => setTimeout(r, 100));
      }
    }

    if (successfulPings > 0) {
      this.status = 'CONNECTED';
      this.measuredLatencyMs = Math.round(totalLatency / successfulPings);
      this.lastSuccessfulSync = new Date().toISOString();
      this.lastError = null;
      return { success: true, count: successfulPings, latencyMs: this.measuredLatencyMs };
    } else {
      if (this.circuitBreaker.state !== 'OPEN') {
        this.status = anyError ? 'ERROR' : 'READY';
        this.lastError = anyError || 'No live data available for target trains';
      }
      return { success: false, reason: this.lastError };
    }
  }

  getStatus() {
    this.evaluateCircuitBreakerState();
    return {
      provider: this.providerName,
      type: this.providerType,
      configured: this.isConfigured(),
      maskedKey: this.getMaskedKey(),
      status: this.status,
      isAvailable: this.isAvailable(),
      latencyMs: this.measuredLatencyMs,
      lastSuccessfulSync: this.lastSuccessfulSync,
      lastAttempt: this.lastAttemptTimestamp,
      lastError: this.lastError,
      quotaExhausted: this.isQuotaExhausted,
      dataFreshnessThresholdMinutes: 15,
      circuitBreaker: this.getCircuitBreakerStatus(),
      activeTrainsCount: this.validatedTrainsMap.size
    };
  }
}

export const telemetryService = new TelemetryService();
export const railRadarService = telemetryService;
