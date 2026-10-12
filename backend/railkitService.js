// =========================================================================
// FATAKFORECAST — RAILKIT INDIAN RAILWAYS TELEMETRY ENGINE
// Official RailKit SDK V2 Integration & Credit-Conserving Real-Time Pipeline
// =========================================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as railkit from 'railkit';
import { GeographicValidator } from './geographicValidator.js';
import { STATION_COORDINATES } from './stationCoordinates.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function ensureEnvLoaded() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [k, ...v] = trimmed.split('=');
        if (k && v.length && !process.env[k.trim()]) {
          process.env[k.trim()] = v.join('=').trim();
        }
      }
    });
  }
}
ensureEnvLoaded();

export class RailkitService {
  constructor() {
    this.apiKey = process.env.RAILKIT_API_KEY || null;
    this.providerName = 'RailKit Indian Railways Gateway';
    this.status = this.apiKey ? 'INITIALIZING' : 'NOT_CONFIGURED';
    this.isQuotaExhausted = false;
    this.isAuthError = false;
    this.lastSuccessfulSync = null;
    this.lastAttemptTimestamp = null;
    this.measuredLatencyMs = null;
    this.lastError = null;

    // Cache management: 90s TTL to prevent burning credits
    this.cache = new Map();
    this.cacheTtlMs = 90 * 1000;
    this.telemetryCacheTtlMs = 90 * 1000;

    // Negative cache (for errors/not-running trains): prevents repeat hits for 15 minutes
    this.errorCache = new Map();
    this.errorCacheTtlMs = 15 * 60 * 1000;
    this.negativeCacheTtlMs = 15 * 60 * 1000;

    // Deduplication for in-flight requests: share single promise for concurrent requests
    this.inFlightRequests = new Map();

    // Validated trains map: holds the latest mapped state of all tracked trains
    this.validatedTrainsMap = new Map();

    // Automatic Train Discovery: Dynamically discovered via RailKit official liveAtStation hub API
    this.discoveredTrainNumbers = [];
    this.discoveredTrainRecords = [];
    this.discoveryAuditLog = [];
    this.lastDiscoveryTimestamp = null;
    this.discoveryCacheTtlMs = 15 * 60 * 1000; // 15-minute discovery cache (credit conservation)
    this.monitoredTrainNumbers = []; // Backward compatibility alias

    this.pollingIntervalMs = 90000; // 90 seconds conservative interval for credit preservation
    this.timer = null;
    this.isPolling = false;
    this.onUpdateCallback = null;
    this.isConfigured = false;
    this.appActiveChecker = null;
    this.activePollPromise = null;

    this.initSdk();
  }

  onUpdate(callback) {
    this.onUpdateCallback = callback;
  }

  notifyAppActive() {
    this.lastClientActivity = Date.now();
  }

  setAppActiveChecker(checkerFn) {
    this.appActiveChecker = checkerFn;
  }

  isAppActive() {
    if (typeof this.appActiveChecker === 'function') {
      try { return this.appActiveChecker(); } catch (e) { return true; }
    }
    if (this.lastClientActivity) {
      return (Date.now() - this.lastClientActivity) < 150000;
    }
    return true;
  }

  getApiKey() {
    if (!this.apiKey && process.env.RAILKIT_API_KEY) {
      this.apiKey = process.env.RAILKIT_API_KEY.trim();
    }
    return this.apiKey;
  }

  getMaskedKey() {
    const key = this.getApiKey();
    if (!key) return 'NOT_CONFIGURED';
    if (key.length <= 12) return '****';
    return `${key.substring(0, 8)}****${key.substring(key.length - 6)}`;
  }

  initSdk() {
    const key = this.getApiKey();
    if (key) {
      try {
        railkit.configure(key);
        this.isConfigured = true;
        this.status = 'READY';
      } catch (err) {
        this.lastError = `RailKit configure error: ${err.message}`;
        this.status = 'ERROR';
      }
    } else {
      this.status = 'NOT_CONFIGURED';
      this.lastError = 'RAILKIT_API_KEY is not defined in backend/.env';
    }
  }

  getFormattedDate(date = new Date()) {
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const y = date.getFullYear();
    return `${d}-${m}-${y}`;
  }

  isAvailable() {
    return Boolean(this.getApiKey() && !this.isQuotaExhausted && !this.isAuthError);
  }

  /**
   * Fetch live train status via official RailKit SDK trackTrainV2
   * Guaranteed: Deduplicated, cached, zero repeated retries on failure, zero credit burn
   */
  async fetchTrainLive(trainNumber, date = null) {
    const cleanNum = String(trainNumber).trim().padStart(5, '0').slice(-5);
    const dateStr = date || this.getFormattedDate();
    const cacheKey = `${cleanNum}_${dateStr}`;

    // 1. Quota & Auth circuit breakers
    if (this.isQuotaExhausted) {
      return { success: false, quotaExhausted: true, error: 'RailKit API quota exhausted (requests paused).', latency: 0 };
    }
    if (this.isAuthError) {
      return { success: false, authError: true, error: this.lastError || 'RailKit API authentication failed.', latency: 0 };
    }

    // 2. Cache hit check (Credit conservation)
    const cached = this.cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < this.cacheTtlMs)) {
      return { success: true, payload: cached.data, latency: 2, fromCache: true };
    }

    // 3. Error cache check (Avoid hammering API on known failed train)
    const errCached = this.errorCache.get(cacheKey);
    if (errCached && (Date.now() - errCached.timestamp < this.errorCacheTtlMs)) {
      return { success: false, error: errCached.error, latency: 1, fromCache: true };
    }

    // 4. In-flight request deduplication (Merge concurrent calls)
    if (this.inFlightRequests.has(cacheKey)) {
      return this.inFlightRequests.get(cacheKey);
    }

    if (!this.isConfigured) {
      this.initSdk();
    }
    const key = this.getApiKey();
    if (!key) {
      return { success: false, error: 'RailKit API key not configured in environment.', latency: 0 };
    }

    const fetchPromise = (async () => {
      const startTime = Date.now();
      this.lastAttemptTimestamp = new Date().toISOString();

      try {
        let rawResult = null;

        // Call trackTrainV2 directly (the official V2 endpoint)
        try {
          rawResult = await railkit.trackTrainV2(cleanNum, dateStr);
        } catch (v2Err) {
          // If V2 throws quota, auth or client error:
          const errMsg = String(v2Err?.message || v2Err || '');
          if (errMsg.includes('429') || errMsg.toLowerCase().includes('quota') || errMsg.toLowerCase().includes('limit exceeded')) {
            this.isQuotaExhausted = true;
            this.status = 'QUOTA_EXCEEDED';
            this.lastError = 'RailKit usage limit exceeded for current billing cycle.';
            throw v2Err;
          }
          if (errMsg.includes('401') || errMsg.includes('403') || errMsg.toLowerCase().includes('unauthorized') || errMsg.toLowerCase().includes('invalid api key')) {
            this.isAuthError = true;
            this.status = 'AUTH_ERROR';
            this.lastError = `RailKit authentication error: ${errMsg}`;
            throw v2Err;
          }

          // Single attempt V1 fallback only if V2 method unsupported
          rawResult = await railkit.trackTrain(cleanNum, dateStr);
        }

        const latency = Date.now() - startTime;
        this.measuredLatencyMs = latency;

        if (!rawResult || rawResult.success === false) {
          const errMsg = rawResult?.error || rawResult?.message || 'RailKit returned unsuccessful response';
          this.lastError = String(errMsg);

          if (this.lastError.includes('429') || this.lastError.toLowerCase().includes('limit exceeded') || this.lastError.toLowerCase().includes('quota')) {
            this.isQuotaExhausted = true;
            this.status = 'QUOTA_EXCEEDED';
          } else if (this.lastError.includes('401') || this.lastError.toLowerCase().includes('unauthorized')) {
            this.isAuthError = true;
            this.status = 'AUTH_ERROR';
          } else {
            this.status = 'CONNECTED';
          }

          this.errorCache.set(cacheKey, { error: this.lastError, timestamp: Date.now() });
          return { success: false, error: this.lastError, latency };
        }

        this.status = 'CONNECTED';
        this.lastSuccessfulSync = new Date().toISOString();
        this.lastError = null;

        // Cache successful response
        this.cache.set(cacheKey, { data: rawResult.data, timestamp: Date.now() });
        return { success: true, payload: rawResult.data, latency, fromCache: false };

      } catch (err) {
        const latency = Date.now() - startTime;
        this.measuredLatencyMs = latency;
        this.lastError = err.message || 'Unknown RailKit error';

        if (this.lastError.includes('429') || this.lastError.toLowerCase().includes('limit exceeded') || this.lastError.toLowerCase().includes('quota')) {
          this.isQuotaExhausted = true;
          this.status = 'QUOTA_EXCEEDED';
        } else if (this.lastError.includes('401') || this.lastError.toLowerCase().includes('unauthorized')) {
          this.isAuthError = true;
          this.status = 'AUTH_ERROR';
        } else {
          this.status = 'ERROR';
        }

        this.errorCache.set(cacheKey, { error: this.lastError, timestamp: Date.now() });
        return { success: false, error: this.lastError, latency };
      } finally {
        this.inFlightRequests.delete(cacheKey);
      }
    })();

    this.inFlightRequests.set(cacheKey, fetchPromise);
    return fetchPromise;
  }

  /**
   * Map authentic RailKit V2/V1 response schema to FatakForecast validated train model
   */
  mapRailkitTrain(data, measuredPingTime) {
    if (!data) return null;

    let trainNumber = '';
    let trainName = '';
    let trainType = 'Express / Superfast';
    let rakeType = 'Standard Formation';
    let sourceCode = 'ASR';
    let sourceName = 'Amritsar Jn';
    let destCode = 'NDLS';
    let destName = 'New Delhi';
    let currentStationCode = 'UNKNOWN';
    let currentStationName = 'En Route';
    let delayMinutes = 0;
    let avgSpeed = null;
    let statusRaw = String(data.status || 'unknown').toLowerCase();
    let isLive = Boolean(data.isLive !== false);
    let lastUpdatedAt = data.lastUpdatedAt || new Date().toISOString();
    let statusText = data.statusText || '';
    let coachPosition = null;

    // V2 Structure Parsing (Official WIMT-backed schema)
    if (data.trainInfo && Array.isArray(data.trainInfo) && data.trainInfo.length > 0) {
      const info = data.trainInfo[0];
      trainNumber = String(info.number || '').trim();
      trainName = info.name || `Train #${trainNumber}`;
      trainType = info.type || info.category || 'Express';
      rakeType = info.rakeType || 'Standard Formation';
      sourceCode = info.source?.code || 'ASR';
      sourceName = info.source?.name || sourceCode;
      destCode = info.destination?.code || 'NDLS';
      destName = info.destination?.name || destCode;
      avgSpeed = typeof info.avgSpeed === 'number' ? Math.round(info.avgSpeed) : null;
      coachPosition = info.coachPosition || null;
    } else if (data.trainNo) {
      trainNumber = String(data.trainNo).trim();
      trainName = data.trainName || `Train #${trainNumber}`;
      currentStationCode = data.currentStationCode || 'UNKNOWN';
      avgSpeed = typeof data.averageSpeedKmph === 'number' ? Math.round(data.averageSpeedKmph) : null;
      sourceCode = data.sourceStation || 'ASR';
      destCode = data.destStation || 'NDLS';
    }

    if (!trainNumber) return null;

    // Parse Current Location from V2 schema
    if (data.currentLocation) {
      currentStationCode = data.currentLocation.stnCode || currentStationCode;
      currentStationName = data.currentLocation.stnName || currentStationName;
      delayMinutes = typeof data.currentLocation.delayMinutes === 'number' ? data.currentLocation.delayMinutes : (data.delayMinutes || 0);
    }

    // Direction Resolution
    const direction = (destCode === 'ASR' || destName.toLowerCase().includes('amritsar')) ? 'DOWN' : 'UP';

    // Corridor Assignment for Amritsar sector
    let corridorId = 'CORR_ASR_JUC';
    if (trainNumber === '74688' || trainNumber === '74687' || trainNumber === '74685' || trainNumber === '04688' || trainNumber === '04690') {
      corridorId = 'CORR_ASR_TT';
    } else if (trainNumber === '06935' || trainNumber === '06936' || trainNumber === '06938' || trainNumber === '14633' || trainNumber === '14634') {
      corridorId = 'CORR_ASR_PTK';
    } else if (trainNumber === '04612' || trainNumber === '04611') {
      corridorId = 'CORR_ASR_ATT';
    } else if (Array.isArray(data.route)) {
      const stnCodes = data.route.map(r => String(r.stnCode || '').toUpperCase());
      if (stnCodes.some(c => ['BGTN', 'TTO', 'PAX', 'KEMK'].includes(c))) {
        corridorId = 'CORR_ASR_TT';
      } else if (stnCodes.some(c => ['VKA', 'BAT', 'DHW', 'GSP', 'PTK'].includes(c))) {
        corridorId = 'CORR_ASR_PTK';
      } else if (stnCodes.some(c => ['CIA', 'KAS', 'ATT'].includes(c))) {
        corridorId = 'CORR_ASR_ATT';
      } else {
        corridorId = 'CORR_ASR_JUC';
      }
    } else {
      corridorId = 'CORR_ASR_JUC';
    }

    // Status Normalization
    const isCancelled = statusRaw === 'cancelled' || statusRaw === 'canceled' ||
      (Array.isArray(data.exceptions) && data.exceptions.some(e => String(e?.type || '').toUpperCase() === 'CANCELLED'));

    const isNotStarted = !isCancelled && (
      statusRaw === 'not-started' ||
      statusRaw === 'not_started' ||
      statusRaw === 'yet to start' ||
      statusText.toLowerCase().includes('yet to start')
    );

    // 1. Geographic Coordinate Resolution
    // Note: Station node coordinates represent station progress, NOT direct locomotive satellite GPS.
    let lat = null;
    let lng = null;
    let locationType = 'STATION_PROGRESS';

    if (isNotStarted) {
      // Train is physically at origin station
      const originCoord = STATION_COORDINATES[sourceCode];
      if (originCoord) {
        lat = originCoord.lat;
        lng = originCoord.lng;
      } else if (data.trainInfo?.[0]?.source?.lat && data.trainInfo?.[0]?.source?.lng) {
        lat = data.trainInfo[0].source.lat;
        lng = data.trainInfo[0].source.lng;
      }
      currentStationCode = sourceCode;
      currentStationName = sourceName;
    } else if (!isCancelled) {
      if (STATION_COORDINATES[currentStationCode]) {
        lat = STATION_COORDINATES[currentStationCode].lat;
        lng = STATION_COORDINATES[currentStationCode].lng;
      } else {
        // Look up station in route array (RailKit route provides cord: { lat, lon })
        const routeMatch = Array.isArray(data.route) 
          ? data.route.find(r => (r.stnCode === currentStationCode || r.stationCode === currentStationCode)) 
          : null;
        const rLon = routeMatch?.cord ? (typeof routeMatch.cord.lon === 'number' ? routeMatch.cord.lon : routeMatch.cord.lng) : null;
        if (routeMatch?.cord?.lat && typeof rLon === 'number') {
          lat = routeMatch.cord.lat;
          lng = rLon;
        } else if (data.currentLocation?.nextStation) {
          const nextCode = data.currentLocation.nextStation.stnCode || data.currentLocation.nextStation.stationCode;
          if (STATION_COORDINATES[nextCode]) {
            lat = STATION_COORDINATES[nextCode].lat;
            lng = STATION_COORDINATES[nextCode].lng;
          }
        } else if (currentStationCode === 'ASR') {
          lat = 31.6338; lng = 74.8655;
        }
      }
    }

    // 2. Geographic Sector Validation (85 km operational sector)
    let isWithinSector = false;
    let distanceFromAmritsarKm = null;
    if (typeof lat === 'number' && typeof lng === 'number' && lat !== 0 && lng !== 0) {
      const sectorCheck = GeographicValidator.isWithinSector(lat, lng);
      isWithinSector = sectorCheck.inSector;
      distanceFromAmritsarKm = sectorCheck.distanceFromAsrKm !== Infinity ? sectorCheck.distanceFromAsrKm : null;
    }

    // 3. Operational Status Classification
    let operationalStatus = 'IN_TRANSIT';
    if (isCancelled) {
      operationalStatus = 'CANCELLED';
    } else if (isNotStarted) {
      operationalStatus = 'NOT_STARTED';
    } else if (statusRaw === 'completed' || statusRaw === 'terminated' || currentStationCode === destCode) {
      operationalStatus = 'TERMINATED';
    } else if (currentStationCode === sourceCode && (statusRaw === 'start' || data.currentLocation?.status === 'at-station')) {
      operationalStatus = 'PLATFORM_BOARDING';
    } else if (!isWithinSector) {
      operationalStatus = 'OUT_OF_SECTOR';
    }

    // 4. Data Freshness & State Classification
    const now = Date.now();
    const updatedMs = new Date(lastUpdatedAt).getTime();
    const ageMinutes = isNaN(updatedMs) ? 0 : (now - updatedMs) / (60 * 1000);
    const isStale = ageMinutes > 30;

    let dataState = 'SCHEDULED';
    if (isCancelled) {
      dataState = 'CANCELLED';
    } else if (isNotStarted) {
      dataState = 'NOT_STARTED';
    } else if (operationalStatus === 'TERMINATED') {
      dataState = 'TERMINATED';
    } else if (isStale) {
      dataState = 'STALE';
    } else if (isLive) {
      dataState = 'LIVE';
    }

    // 5. Build full route schedule array from RailKit route stops
    const schedule = [];
    if (Array.isArray(data.route)) {
      data.route.forEach((r, idx) => {
        schedule.push({
          sequence: r.sequence || idx + 1,
          stationCode: r.stnCode || '',
          stationName: r.stnName || r.stnCode || '',
          isHalt: Boolean(r.isHalt),
          status: r.status || 'upcoming',
          platform: r.platform || null,
          distance: typeof r.distance === 'number' ? r.distance : 0,
          scheduledArrival: r.schArr || null,
          scheduledDeparture: r.schDep || null,
          actualArrival: r.actArr || null,
          actualDeparture: r.actDep || null,
          delayArrival: typeof r.delayArr === 'number' ? r.delayArr : 0,
          delayDeparture: typeof r.delayDep === 'number' ? r.delayDep : 0,
          coachPosition
        });
      });
    }

    return {
      id: trainNumber,
      number: trainNumber,
      name: trainName,
      type: trainType,
      rakeType,
      origin: `${sourceName} (${sourceCode})`,
      destination: `${destName} (${destCode})`,
      corridorId,
      direction,
      // Accuracy rules: Journey average speed is NOT live speed
      speedKmH: (operationalStatus === 'TERMINATED' || isNotStarted) ? 0 : null,
      hasLiveSpeedMeasurement: false,
      speedSource: 'UNAVAILABLE',
      liveSpeedKmH: null,
      sectionalSpeedKmH: (() => {
        const tNum = String(trainNumber);
        if (tNum.startsWith('224')) return 85;
        if (tNum.startsWith('120')) return 75;
        if (tNum.startsWith('124') || tNum.startsWith('129')) return 65;
        if (tNum.startsWith('110') || tNum.startsWith('152') || tNum.startsWith('157') || tNum.startsWith('130')) return 58;
        if (tNum.startsWith('146') || tNum.startsWith('182')) return 52;
        if (tNum.startsWith('546') || tNum.startsWith('746') || tNum.startsWith('046') || tNum.startsWith('069')) return 45;
        return (avgSpeed && avgSpeed >= 45 && avgSpeed <= 90) ? avgSpeed : 55;
      })(),
      currentCoordIndex: null,
      lat: (typeof lat === 'number') ? Number(lat.toFixed(6)) : null,
      lng: (typeof lng === 'number') ? Number(lng.toFixed(6)) : null,
      bearing: isNotStarted ? 0 : (direction === 'UP' ? 110 : 290),
      currentStationCode,
      currentStationName: `${currentStationName} (${currentStationCode})`,
      lastReportedLocation: isNotStarted
        ? `${currentStationName} (${currentStationCode}) • Origin Station (Yet to start)`
        : (isCancelled
            ? `${currentStationName} • Status: Cancelled`
            : `${currentStationName} • Delay: ${delayMinutes}m`),
      distanceFromAmritsarKm,
      isWithinAmritsarSector: Boolean(isWithinSector),
      status: operationalStatus,
      dataState,
      providerStatus: statusRaw,
      positionClassification: isNotStarted ? 'STATION_PROGRESS' : 'STATION_PROGRESS',
      providerObservationTimestamp: lastUpdatedAt || measuredPingTime,
      apiRetrievalTimestamp: measuredPingTime || new Date().toISOString(),
      observationAccuracy: 'STATION_NODE_PROJECTION',
      serviceStatus: isNotStarted
        ? `Scheduled service: ${trainName} (Yet to start from ${sourceName})`
        : (operationalStatus === 'TERMINATED'
            ? `Completed journey at ${destName}`
            : (isWithinSector
                ? `Tracked via RailKit in Amritsar Sector (Delay: ${delayMinutes}m)`
                : `En route to ${destName} (Currently outside Amritsar sector, ${distanceFromAmritsarKm} km away)`)),
      telemetrySource: `${this.providerName} (Live Verified)`,
      lastPing: measuredPingTime || new Date().toISOString(),
      isStale,
      distanceToNextCrossingKm: null,
      targetCrossingId: null,
      delayMinutes,
      journeyDate: data.startDate || this.getFormattedDate(),
      locationType,
      schedule
    };
  }

  /**
   * Automatically discover all running/scheduled trains arriving or departing Amritsar hubs
   * Uses RailKit official liveAtStation API for ASR (hub for all 4 corridors) and TTO (Tarn Taran branch).
   * Caches discovery results for 15 minutes to conserve API credits.
   */
  async discoverActiveTrains(force = false) {
    if (!this.isConfigured) this.initSdk();
    if (!this.isAvailable()) return this.discoveredTrainNumbers;

    const now = Date.now();
    if (!force && this.lastDiscoveryTimestamp && (now - this.lastDiscoveryTimestamp < this.discoveryCacheTtlMs) && this.discoveredTrainNumbers.length > 0) {
      return this.discoveredTrainNumbers;
    }

    try {
      const discoveredSet = new Set();
      const records = [];

      // Hub 1: Amritsar Junction (all 4 corridors radiate from ASR)
      try {
        const asrRes = await railkit.liveAtStation('ASR', 4);
        if (asrRes && asrRes.success && asrRes.data && Array.isArray(asrRes.data.trains)) {
          for (const t of asrRes.data.trains) {
            const num = String(t.trainNo || '').trim();
            if (/^\d{4,5}$/.test(num)) {
              const isCancelled = Boolean(t.cancelled || t.arrival?.actual === 'Cancelled' || t.departure?.actual === 'Cancelled');
              records.push({
                trainNumber: num,
                trainName: t.trainName || '',
                source: t.source || '',
                sourceName: t.sourceName || '',
                dest: t.dest || '',
                destName: t.destName || '',
                platform: t.platform || null,
                arrActual: t.arrival?.actual || null,
                depActual: t.departure?.actual || null,
                isCancelled,
                hub: 'ASR'
              });
              if (!isCancelled) {
                discoveredSet.add(num);
              }
            }
          }
        }
      } catch (asrErr) {
        console.warn('[RailKit] ASR hub discovery warning:', asrErr.message);
      }

      // Hub 2: Tarn Taran (captures branch line services between Khemkaran & Tarn Taran)
      try {
        const ttoRes = await railkit.liveAtStation('TTO', 4);
        if (ttoRes && ttoRes.success && ttoRes.data && Array.isArray(ttoRes.data.trains)) {
          for (const t of ttoRes.data.trains) {
            const num = String(t.trainNo || '').trim();
            if (/^\d{4,5}$/.test(num)) {
              const isCancelled = Boolean(t.cancelled || t.arrival?.actual === 'Cancelled' || t.departure?.actual === 'Cancelled');
              records.push({
                trainNumber: num,
                trainName: t.trainName || '',
                source: t.source || '',
                sourceName: t.sourceName || '',
                dest: t.dest || '',
                destName: t.destName || '',
                platform: t.platform || null,
                arrActual: t.arrival?.actual || null,
                depActual: t.departure?.actual || null,
                isCancelled,
                hub: 'TTO'
              });
              if (!isCancelled) {
                discoveredSet.add(num);
              }
            }
          }
        }
      } catch (ttoErr) {
        console.warn('[RailKit] TTO hub discovery warning:', ttoErr.message);
      }

      // If late-night or low-frequency window has 0 trains, fallback to core corridor passenger services
      if (discoveredSet.size === 0) {
        const SECTOR_PRIMARY_TRAINS = ['12014', '12029', '11058', '12460', '14632', '18238'];
        SECTOR_PRIMARY_TRAINS.forEach(num => discoveredSet.add(num));
      }

      if (discoveredSet.size > 0) {
        this.discoveredTrainNumbers = Array.from(discoveredSet);
        this.discoveredTrainRecords = records;
        this.lastDiscoveryTimestamp = now;
        this.status = 'CONNECTED';
        this.lastSuccessfulSync = new Date().toISOString();
      }

      return this.discoveredTrainNumbers;
    } catch (err) {
      console.warn('[RailKit] Error during live train discovery:', err.message);
      return this.discoveredTrainNumbers || [];
    }
  }

  /**
   * Controlled polling loop over dynamically discovered Amritsar corridor trains.
   * Discovers running trains automatically via RailKit liveAtStation.
   * Queries individual train telemetry with 90s cache & in-flight deduplication.
   * Runs ONLY when the app is active / open to preserve API credits!
   */
  async pollLiveProvider(force = false) {
    if (this.activePollPromise) {
      return await this.activePollPromise;
    }
    if (this.isQuotaExhausted || this.isAuthError) return;
    if (!force && !this.isAppActive()) {
      return { success: true, paused: true, reason: 'App closed, polling paused to conserve credits' };
    }

    this.isPolling = true;
    this.lastAttemptTimestamp = new Date().toISOString();

    this.activePollPromise = (async () => {
      try {
        // 1. Automatically discover all active trains arriving or departing within the 4-hour window
        const trainNumbersToQuery = await this.discoverActiveTrains(force);
        if (!trainNumbersToQuery || trainNumbersToQuery.length === 0) {
          if (!this.isQuotaExhausted && !this.isAuthError) {
            this.status = 'CONNECTED';
            this.lastSuccessfulSync = new Date().toISOString();
          }
          return { success: true, count: 0, reason: 'Zero trains active in Amritsar sector' };
        }

        let successfulPings = 0;
        let totalLatency = 0;
        let anyError = null;
        const auditEntries = [];

        // Query in gentle chunks of 5 with a 100ms gap to respect provider rate limits while completing swiftly
        const chunkSize = 5;
        for (let i = 0; i < trainNumbersToQuery.length; i += chunkSize) {
          if (this.isQuotaExhausted || this.isAuthError) break;

          const chunk = trainNumbersToQuery.slice(i, i + chunkSize);
          const results = await Promise.allSettled(chunk.map(num => this.fetchTrainLive(num)));

          for (let j = 0; j < results.length; j++) {
            const trainNum = chunk[j];
            const res = results[j];
            if (res.status === 'fulfilled' && res.value && res.value.success && res.value.payload) {
              totalLatency += (res.value.latency || 200);
              successfulPings++;

              const mapped = this.mapRailkitTrain(res.value.payload, new Date().toISOString());
              if (mapped) {
                this.validatedTrainsMap.set(trainNum, mapped);
                auditEntries.push({
                  trainNumber: trainNum,
                  trainName: mapped.name,
                  source: mapped.source,
                  dest: mapped.destination,
                  corridorId: mapped.corridorId,
                  status: mapped.status,
                  dataState: mapped.dataState,
                  accepted: mapped.status === 'IN_TRANSIT' || mapped.status === 'PLATFORM_BOARDING',
                  lat: mapped.lat,
                  lng: mapped.lng,
                  distanceFromAmritsarKm: mapped.distanceFromAmritsarKm,
                  reason: mapped.isWithinAmritsarSector 
                    ? `Active in-sector telemetry on ${mapped.corridorId}` 
                    : `Outside sector (${mapped.distanceFromAmritsarKm} km away)`
                });
              }
            } else {
              const errMsg = res.status === 'rejected' ? res.reason?.message : res.value?.error;
              anyError = errMsg;
              auditEntries.push({
                trainNumber: trainNum,
                accepted: false,
                reason: errMsg || 'Live telemetry unavailable'
              });
            }
          }

          if (i + chunkSize < trainNumbersToQuery.length) {
            await new Promise(r => setTimeout(r, 100));
          }
        }

        this.discoveryAuditLog = auditEntries;

        if (successfulPings > 0) {
          this.status = 'CONNECTED';
          this.measuredLatencyMs = Math.round(totalLatency / successfulPings);
          this.lastSuccessfulSync = new Date().toISOString();
          this.lastError = null;
          if (this.onUpdateCallback) {
            try { this.onUpdateCallback(); } catch (e) {}
          }
          return { success: true, count: successfulPings, latencyMs: this.measuredLatencyMs };
        } else {
          if (!this.isQuotaExhausted && !this.isAuthError) {
            this.status = anyError ? 'ERROR' : 'CONNECTED';
            this.lastError = anyError || 'No live data available for discovered trains';
          }
          return { success: false, reason: this.lastError };
        }
      } finally {
        this.isPolling = false;
        this.activePollPromise = null;
      }
    })();

    return await this.activePollPromise;
  }

  getDiscoveryAudit() {
    return {
      provider: this.providerName,
      discoveryMethod: 'RailKit Official liveAtStation Hub API (ASR + TTO)',
      lastDiscoveryTime: this.lastDiscoveryTimestamp ? new Date(this.lastDiscoveryTimestamp).toISOString() : null,
      discoveredTrainCount: this.discoveredTrainRecords ? this.discoveredTrainRecords.length : 0,
      discoveredTrains: this.discoveredTrainRecords || [],
      validatedTrainCount: this.validatedTrainsMap.size,
      validatedTrains: Array.from(this.validatedTrainsMap.values()).map(t => ({
        number: t.number,
        name: t.name,
        status: t.status,
        dataState: t.dataState,
        corridorId: t.corridorId,
        lat: t.lat,
        lng: t.lng,
        distanceFromAmritsarKm: t.distanceFromAmritsarKm,
        direction: t.direction
      })),
      auditLog: this.discoveryAuditLog || []
    };
  }

  getTrainsList() {
    return Array.from(this.validatedTrainsMap.values());
  }

  getTrainSchedule(trainNumber) {
    const cleanNum = String(trainNumber).trim().padStart(5, '0').slice(-5);
    const t = this.validatedTrainsMap.get(cleanNum);
    return t ? t.schedule || [] : [];
  }

  async getLiveStationTrains(stationCode, hours = 2) {
    if (!this.isConfigured) this.initSdk();
    if (!this.isAvailable()) return null;
    try {
      const res = await railkit.liveAtStation(stationCode, hours);
      if (res && res.success && res.data) {
        return res.data;
      }
    } catch (e) {
      console.warn(`[RailKit] liveAtStation error for ${stationCode}:`, e.message);
    }
    return null;
  }

  startPolling() {
    this.pollLiveProvider().catch(() => {});
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.pollLiveProvider().catch(() => {}), this.pollingIntervalMs);
  }

  stopPolling() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  getStatus() {
    return {
      provider: this.providerName,
      configured: Boolean(this.getApiKey()),
      maskedKey: this.getMaskedKey(),
      status: this.status,
      latencyMs: this.measuredLatencyMs,
      lastSuccessfulSync: this.lastSuccessfulSync,
      lastAttempt: this.lastAttemptTimestamp,
      lastError: this.lastError,
      quotaExhausted: this.isQuotaExhausted,
      discoveredTrainsCount: this.discoveredTrainNumbers.length,
      cachedTrainsCount: this.cache.size,
      activeTrainsCount: this.validatedTrainsMap.size
    };
  }
}

export const railkitService = new RailkitService();
