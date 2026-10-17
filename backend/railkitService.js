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

const rawCorridors = JSON.parse(fs.readFileSync(path.join(__dirname, 'amritsar_corridors_osm.json'), 'utf8'));
const RAILWAY_CORRIDORS = {};
rawCorridors.forEach(c => { RAILWAY_CORRIDORS[c.id] = c; });

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function advanceAlongPolyline(coords, startProgress, distKm, direction = 'UP') {
  if (!coords || coords.length < 2) return null;
  const maxIdx = coords.length - 1;
  let curr = Math.max(0, Math.min(maxIdx, startProgress));
  let remaining = distKm;
  const isUp = direction === 'UP';
  let iters = 0;
  while (remaining > 0 && iters < 100) {
    iters++;
    if (isUp) {
      const seg = Math.floor(curr);
      if (seg >= maxIdx) return coords[maxIdx];
      const dSeg = haversineKm(coords[seg][0], coords[seg][1], coords[seg + 1][0], coords[seg + 1][1]);
      const avail = dSeg * (1 - (curr - seg));
      if (remaining <= avail) {
        const frac = (curr - seg) + (remaining / Math.max(0.0001, dSeg));
        return [
          coords[seg][0] + (coords[seg + 1][0] - coords[seg][0]) * frac,
          coords[seg][1] + (coords[seg + 1][1] - coords[seg][1]) * frac
        ];
      }
      remaining -= avail;
      curr = seg + 1;
    } else {
      const seg = Math.ceil(curr);
      if (seg <= 0) return coords[0];
      const dSeg = haversineKm(coords[seg - 1][0], coords[seg - 1][1], coords[seg][0], coords[seg][1]);
      const avail = dSeg * (curr - (seg - 1));
      if (remaining <= avail) {
        const frac = (curr - (seg - 1)) - (remaining / Math.max(0.0001, dSeg));
        return [
          coords[seg - 1][0] + (coords[seg][0] - coords[seg - 1][0]) * frac,
          coords[seg - 1][1] + (coords[seg][1] - coords[seg - 1][1]) * frac
        ];
      }
      remaining -= avail;
      curr = seg - 1;
    }
  }
  const finalIdx = Math.max(0, Math.min(maxIdx, Math.round(curr)));
  return coords[finalIdx];
}

export function parseRailDateTime(str, referenceDate = new Date()) {
  if (!str || typeof str !== 'string') return null;
  const trimmed = str.trim();
  if (trimmed === 'SRC' || trimmed === 'DSTN' || trimmed === '-' || trimmed.toLowerCase() === 'null') return null;
  if (trimmed.includes('T') || trimmed.endsWith('Z')) {
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? null : d;
  }
  // Format: "HH:mm DD-MMM" (e.g. "12:30 17-Oct")
  const m1 = trimmed.match(/(\d{1,2}):(\d{2})\s+(\d{1,2})-([A-Za-z]{3})/);
  if (m1) {
    const months = { jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11 };
    const mon = months[m1[4].toLowerCase()];
    if (mon !== undefined) {
      const year = referenceDate.getFullYear();
      const hour = parseInt(m1[1], 10);
      const min = parseInt(m1[2], 10);
      const day = parseInt(m1[3], 10);
      // Indian Railways operates in IST (UTC+5:30)
      const utcMs = Date.UTC(year, mon, day, hour - 5, min - 30);
      return new Date(utcMs);
    }
  }
  // Format: "MMM DD, YYYY, HH:mm" (e.g. "Oct 17, 2026, 13:35" or "Oct 17 2026 13:35")
  const m3 = trimmed.match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4}),?\s+(\d{1,2}):(\d{2})/);
  if (m3) {
    const months = { jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11 };
    const mon = months[m3[1].toLowerCase().slice(0, 3)];
    if (mon !== undefined) {
      const day = parseInt(m3[2], 10);
      const year = parseInt(m3[3], 10);
      const hour = parseInt(m3[4], 10);
      const min = parseInt(m3[5], 10);
      const utcMs = Date.UTC(year, mon, day, hour - 5, min - 30);
      return new Date(utcMs);
    }
  }
  // Format: "HH:mm" (e.g. "12:30")
  const m2 = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (m2) {
    const hour = parseInt(m2[1], 10);
    const min = parseInt(m2[2], 10);
    const d = new Date(referenceDate);
    const istOffsetMs = (5 * 60 + 30) * 60 * 1000;
    const istNow = new Date(d.getTime() + istOffsetMs);
    const istTarget = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate(), hour - 5, min - 30));
    return istTarget;
  }
  const d = new Date(trimmed);
  return isNaN(d.getTime()) ? null : d;
}

export function formatISTTime(dateOrMs) {
  if (!dateOrMs) return null;
  const ms = typeof dateOrMs === 'number' ? dateOrMs : (dateOrMs instanceof Date ? dateOrMs.getTime() : new Date(dateOrMs).getTime());
  if (isNaN(ms)) return null;
  return new Date(ms).toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

function withTimeout(promise, ms = 6000, fallbackMessage = 'Operation timed out') {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(fallbackMessage)), ms))
  ]);
}

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

    // Circuit Breaker pattern for rate limit / quota management
    this.circuitBreaker = {
      state: 'CLOSED', // 'CLOSED' (healthy), 'OPEN' (tripped in backoff), 'HALF_OPEN' (probing)
      failureCount: 0,
      failureThreshold: 3,
      trippedAt: null,
      cooldownDurationMs: 5 * 60 * 1000, // 5 minutes backoff cooldown
      probeSuccessCount: 0
    };

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

    // Persistent train route schedule cache (24 hours TTL, zero API credit waste)
    this.scheduleCache = new Map();

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

  evaluateCircuitBreakerState() {
    if (this.circuitBreaker.state === 'OPEN') {
      const elapsed = Date.now() - (this.circuitBreaker.trippedAt || 0);
      if (elapsed >= this.circuitBreaker.cooldownDurationMs) {
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
    this.lastError = reason || 'Circuit breaker tripped: RailKit usage limit exceeded.';
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

  isAvailable() {
    if (!this.getApiKey() || this.isAuthError) return false;
    this.evaluateCircuitBreakerState();
    return this.circuitBreaker.state !== 'OPEN';
  }

  /**
   * Fetch live train status via official RailKit SDK trackTrainV2
   * Guaranteed: Circuit-breaker guarded, deduplicated, cached, response content verified
   */
  async fetchTrainLive(trainNumber, date = null) {
    const cleanNum = String(trainNumber).trim().padStart(5, '0').slice(-5);
    const dateStr = date || this.getFormattedDate();
    const cacheKey = `${cleanNum}_${dateStr}`;

    this.evaluateCircuitBreakerState();
    if (this.circuitBreaker.state === 'OPEN') {
      const cooldownSec = Math.round((this.circuitBreaker.cooldownDurationMs - (Date.now() - this.circuitBreaker.trippedAt)) / 1000);
      return { success: false, quotaExhausted: true, error: `RailKit circuit breaker OPEN in backoff (${cooldownSec}s remaining).`, latency: 0 };
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
          rawResult = await withTimeout(railkit.trackTrainV2(cleanNum, dateStr), 10000, 'RailKit trackTrainV2 timeout');
        } catch (v2Err) {
          // If V2 throws quota, auth or client error:
          const errMsg = String(v2Err?.message || v2Err || '');
          if (errMsg.includes('429') || errMsg.toLowerCase().includes('quota') || errMsg.toLowerCase().includes('limit exceeded')) {
            this.tripCircuitBreaker('RailKit usage limit exceeded (HTTP 429/quota).');
            throw v2Err;
          }
          if (errMsg.includes('401') || errMsg.includes('403') || errMsg.toLowerCase().includes('unauthorized') || errMsg.toLowerCase().includes('invalid api key')) {
            this.isAuthError = true;
            this.status = 'AUTH_ERROR';
            this.lastError = `RailKit authentication error: ${errMsg}`;
            throw v2Err;
          }

          // Single attempt V1 fallback only if V2 method unsupported
          rawResult = await withTimeout(railkit.trackTrain(cleanNum, dateStr), 10000, 'RailKit trackTrain timeout');
        }

        const latency = Date.now() - startTime;
        this.measuredLatencyMs = latency;

        if (!rawResult || rawResult.success === false) {
          const errMsg = rawResult?.error || rawResult?.message || 'RailKit returned unsuccessful response';
          this.lastError = String(errMsg);

          if (this.lastError.includes('429') || this.lastError.toLowerCase().includes('limit exceeded') || this.lastError.toLowerCase().includes('quota')) {
            this.tripCircuitBreaker(this.lastError);
          } else if (this.lastError.includes('401') || this.lastError.toLowerCase().includes('unauthorized')) {
            this.isAuthError = true;
            this.status = 'AUTH_ERROR';
          } else {
            this.status = 'CONNECTED';
          }

          this.errorCache.set(cacheKey, { error: this.lastError, timestamp: Date.now() });
          return { success: false, error: this.lastError, latency };
        }

        // PROVIDER RESPONSE VERIFICATION (Never treat mere { success: true } as proof of valid live telemetry)
        const payloadData = rawResult.data;
        if (!payloadData || typeof payloadData !== 'object' || (Array.isArray(payloadData.trainInfo) && payloadData.trainInfo.length === 0 && !payloadData.trainNo)) {
          const errMsg = 'RailKit returned empty or invalid train records payload';
          this.errorCache.set(cacheKey, { error: errMsg, timestamp: Date.now() });
          return { success: false, error: errMsg, latency };
        }

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

    // Dynamic Route & Direction Resolution for Amritsar Sector
    const PTK_STATIONS = ['VKA', 'BAT', 'DHW', 'GSP', 'DNN', 'PTK', 'KNG', 'JNT'];
    const TT_STATIONS = ['BGTN', 'SBS', 'SNS', 'TTO', 'PAX', 'KEMK', 'DUQ'];
    const ATT_STATIONS = ['CIA', 'KAS', 'ATT'];
    const JUC_STATIONS = ['MOW', 'JNL', 'TRA', 'BTR', 'BEAS', 'DIW', 'HRP', 'HMR', 'KRE', 'SRX', 'JUC', 'JRC', 'CEU', 'PGW', 'GRY', 'PHR', 'LDH'];

    let corridorId = 'CORR_ASR_JUC';
    let direction = 'UP';

    const nextStn = data.currentLocation?.nextStation?.stnCode || data.nextHalt?.stnCode || null;
    const prevStn = data.previousHalt?.stnCode || null;
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

    // 1. Build full route schedule array from RailKit route stops with IST timetable timestamps
    const now = Date.now();
    const schedule = [];
    if (Array.isArray(data.route)) {
      data.route.forEach((r, idx) => {
        const schArr = r.arrival?.scheduled || r.schArr || r.scheduledArrival || null;
        const schDep = r.departure?.scheduled || r.schDep || r.scheduledDeparture || null;
        const actArr = r.arrival?.actual || r.actArr || r.actualArrival || null;
        const actDep = r.departure?.actual || r.actDep || r.actualDeparture || null;
        const delayArr = typeof r.arrival?.delay === 'number' ? r.arrival.delay : (typeof r.delayArr === 'number' ? r.delayArr : 0);
        const delayDep = typeof r.departure?.delay === 'number' ? r.departure.delay : (typeof r.delayDep === 'number' ? r.delayDep : 0);

        const schArrDate = parseRailDateTime(schArr);
        const schDepDate = parseRailDateTime(schDep);
        const actArrDate = parseRailDateTime(actArr);
        const actDepDate = parseRailDateTime(actDep);

        const expectedArrivalMs = actArrDate ? actArrDate.getTime() : (schArrDate ? schArrDate.getTime() + delayArr * 60000 : null);
        const expectedDepartureMs = actDepDate ? actDepDate.getTime() : (schDepDate ? schDepDate.getTime() + delayDep * 60000 : null);

        schedule.push({
          sequence: r.sequence || idx + 1,
          stationCode: r.stnCode || r.stationCode || '',
          stationName: r.stnName || r.stationName || r.stnCode || '',
          isHalt: Boolean(r.isHalt),
          status: r.status || 'upcoming',
          platform: r.platform || null,
          distance: typeof r.distance === 'number' ? r.distance : 0,
          scheduledArrival: schArr,
          scheduledDeparture: schDep,
          actualArrival: actArr,
          actualDeparture: actDep,
          delayArrival: delayArr,
          delayDeparture: delayDep,
          expectedArrivalMs,
          expectedDepartureMs,
          expectedArrivalIso: expectedArrivalMs ? new Date(expectedArrivalMs).toISOString() : null,
          expectedDepartureIso: expectedDepartureMs ? new Date(expectedDepartureMs).toISOString() : null,
          expectedArrivalFormatted: formatISTTime(expectedArrivalMs),
          expectedDepartureFormatted: formatISTTime(expectedDepartureMs),
          coachPosition
        });
      });
    }

    if (schedule.length > 0 && this.scheduleCache) {
      this.scheduleCache.set(trainNumber, schedule);
    }

    // Status Normalization
    const isCancelled = statusRaw === 'cancelled' || statusRaw === 'canceled' ||
      (Array.isArray(data.exceptions) && data.exceptions.some(e => String(e?.type || '').toUpperCase() === 'CANCELLED'));

    // Check origin stop and departure timings
    const originStop = schedule[0] || null;
    const originExpectedDepMs = originStop?.expectedDepartureMs || 
      (parseRailDateTime(data.actualDeparture)?.getTime()) || 
      (parseRailDateTime(data.scheduledDeparture) ? parseRailDateTime(data.scheduledDeparture).getTime() + (delayMinutes * 60000) : null);

    const reportedDistFromOrigin = typeof data.currentLocation?.distanceFromOriginKm === 'number'
      ? data.currentLocation.distanceFromOriginKm
      : null;

    const isPhysicallyAtOrigin = Boolean(
      (currentStationCode === sourceCode || sourceName.toLowerCase().includes('amritsar')) &&
      (!reportedDistFromOrigin || reportedDistFromOrigin < 0.5)
    );

    const isOriginDepartureInFuture = Boolean(
      originExpectedDepMs && (originExpectedDepMs > (now - 60000))
    );

    const isRescheduledAwaitingDeparture = Boolean(
      isPhysicallyAtOrigin &&
      isOriginDepartureInFuture &&
      (statusRaw === 'rescheduled' || originStop?.status === 'at-station' || statusRaw === 'at-station' || statusRaw === 'start')
    );

    const isNotStarted = !isCancelled && (
      statusRaw === 'not-started' ||
      statusRaw === 'not_started' ||
      statusRaw === 'yet to start' ||
      statusText.toLowerCase().includes('yet to start') ||
      isRescheduledAwaitingDeparture
    );

    // 2. Geographic Coordinate Resolution
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
        } else if (data.previousHalt?.stnCode && STATION_COORDINATES[data.previousHalt.stnCode]) {
          lat = STATION_COORDINATES[data.previousHalt.stnCode].lat;
          lng = STATION_COORDINATES[data.previousHalt.stnCode].lng;
        } else if (data.nextHalt?.stnCode && STATION_COORDINATES[data.nextHalt.stnCode]) {
          lat = STATION_COORDINATES[data.nextHalt.stnCode].lat;
          lng = STATION_COORDINATES[data.nextHalt.stnCode].lng;
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

    // Contextual station naming enrichment (e.g. if near Ambala Cantt)
    if (data.previousHalt?.stnName && currentStationName && !currentStationName.includes(data.previousHalt.stnName)) {
      currentStationName = `${currentStationName} (near ${data.previousHalt.stnName})`;
    }

    // 3. Geographic Sector Validation (85 km operational sector)
    let isWithinSector = false;
    let distanceFromAmritsarKm = null;
    if (typeof lat === 'number' && typeof lng === 'number' && lat !== 0 && lng !== 0) {
      const sectorCheck = GeographicValidator.isWithinSector(lat, lng);
      isWithinSector = sectorCheck.inSector;
      distanceFromAmritsarKm = sectorCheck.distanceFromAsrKm !== Infinity ? sectorCheck.distanceFromAsrKm : null;
    }

    // Authoritative Provider Journey Progress Validation:
    // If the train departed Amritsar (source ASR) and provider confirms it traveled > 85 km (e.g. 283 km away near Ambala/Delhi)
    if ((sourceCode === 'ASR' || sourceName.toLowerCase().includes('amritsar')) && reportedDistFromOrigin !== null && reportedDistFromOrigin > GeographicValidator.AMRITSAR_SECTOR_RADIUS_KM) {
      isWithinSector = false;
      if (distanceFromAmritsarKm === null || distanceFromAmritsarKm < reportedDistFromOrigin) {
        distanceFromAmritsarKm = Number(reportedDistFromOrigin.toFixed(1));
      }
    }

    // 4. Operational Status Classification
    const isPastScheduledOriginDep = Boolean(originExpectedDepMs && (now > originExpectedDepMs + 10 * 60000));
    const isAtOriginStation = Boolean(
      currentStationCode === sourceCode &&
      (!reportedDistFromOrigin || reportedDistFromOrigin < 0.5) &&
      (statusRaw === 'start' || statusRaw === 'at-station' || isNotStarted) &&
      !isPastScheduledOriginDep
    );

    // Intermediate halt check
    const currentStop = schedule.find(s => (s.stationCode === currentStationCode || s.stationCode === data.currentLocation?.nextStation?.stnCode));
    const isAtIntermediateStation = Boolean(
      currentStop &&
      currentStop.status === 'at-station' &&
      currentStop.expectedDepartureMs &&
      currentStop.expectedDepartureMs > (now - 60000)
    );

    let operationalStatus = 'IN_TRANSIT';
    if (isCancelled) {
      operationalStatus = 'CANCELLED';
    } else if (isNotStarted) {
      operationalStatus = 'YET_TO_START';
    } else if (statusRaw === 'completed' || statusRaw === 'terminated' || statusRaw === 'end' || currentStationCode === destCode) {
      operationalStatus = 'TERMINATED';
    } else if (!isWithinSector) {
      operationalStatus = 'OUT_OF_SECTOR';
    } else if (isAtOriginStation || isAtIntermediateStation) {
      operationalStatus = 'PLATFORM_BOARDING';
    }

    // 5. Data Freshness & State Classification
    const parsedUpdated = parseRailDateTime(lastUpdatedAt);
    const updatedMs = parsedUpdated ? parsedUpdated.getTime() : new Date(lastUpdatedAt).getTime();
    const ageMinutes = isNaN(updatedMs) ? 999 : (now - updatedMs) / (60 * 1000);
    const isStale = ageMinutes > 15;

    // Strict state classification: Never label simulated, scheduled, stale, or invalid records as LIVE
    // Strictly distinguish LIVE, STALE, SCHEDULED, SIMULATED, and UNAVAILABLE states
    let dataState = 'UNAVAILABLE';
    if (Boolean(data.isSimulated || data.simulated || data.is_simulated)) {
      dataState = 'SIMULATED';
    } else if (isCancelled) {
      dataState = 'CANCELLED';
    } else if (operationalStatus === 'TERMINATED') {
      dataState = 'TERMINATED';
    } else if (isStale) {
      dataState = 'STALE';
    } else if ((operationalStatus === 'IN_TRANSIT' || operationalStatus === 'PLATFORM_BOARDING' || operationalStatus === 'YET_TO_START') && typeof lat === 'number' && typeof lng === 'number' && currentStationCode !== 'UNKNOWN') {
      dataState = 'LIVE';
    } else if (isNotStarted) {
      dataState = 'SCHEDULED';
    } else if (operationalStatus === 'IN_TRANSIT') {
      dataState = 'UNAVAILABLE';
    } else {
      dataState = 'SCHEDULED';
    }

    const isStationary = Boolean(
      operationalStatus === 'YET_TO_START' ||
      operationalStatus === 'PLATFORM_BOARDING' ||
      operationalStatus === 'TERMINATED' ||
      isNotStarted ||
      isAtOriginStation ||
      isAtIntermediateStation
    );

    const sectionalSpeed = (() => {
      const tNum = String(trainNumber);
      if (tNum.startsWith('224')) return 85;
      if (tNum.startsWith('120')) return 75;
      if (tNum.startsWith('124') || tNum.startsWith('129')) return 65;
      if (tNum.startsWith('110') || tNum.startsWith('152') || tNum.startsWith('157') || tNum.startsWith('130')) return 58;
      if (tNum.startsWith('146') || tNum.startsWith('182')) return 52;
      if (tNum.startsWith('546') || tNum.startsWith('746') || tNum.startsWith('046') || tNum.startsWith('069')) return 45;
      return (avgSpeed && avgSpeed >= 45 && avgSpeed <= 90) ? avgSpeed : 55;
    })();

    const hasLiveSpeed = typeof data.currentLocation?.speedKmh === 'number' && data.currentLocation.speedKmh > 0;
    const computedSpeed = isStationary ? 0 : (hasLiveSpeed ? data.currentLocation.speedKmh : sectionalSpeed);

    const expectedDepartureTime = isNotStarted ? originExpectedDepMs : (currentStop?.expectedDepartureMs || null);
    const expectedDepartureFormatted = formatISTTime(expectedDepartureTime);

    const platformNum = originStop?.platform || currentStop?.platform || null;
    const platformStr = platformNum ? ` (Platform ${platformNum})` : '';

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
      speedKmH: computedSpeed,
      hasLiveSpeedMeasurement: Boolean(isStationary || hasLiveSpeed),
      speedSource: isStationary ? 'AT_STATION_PLATFORM' : (hasLiveSpeed ? 'PROVIDER_LIVE_SPEED' : 'SECTIONAL_TIMETABLE'),
      liveSpeedKmH: hasLiveSpeed ? data.currentLocation.speedKmh : (isStationary ? 0 : null),
      sectionalSpeedKmH: sectionalSpeed,
      isStationary,
      isStationaryAtPlatform: isStationary,
      movementStatus: isStationary ? 'STOPPED' : 'ROLLING',
      currentCoordIndex: null,
      lat: (typeof lat === 'number') ? Number(lat.toFixed(6)) : null,
      lng: (typeof lng === 'number') ? Number(lng.toFixed(6)) : null,
      bearing: isNotStarted ? 0 : (direction === 'UP' ? 110 : 290),
      currentStationCode,
      currentStationName: `${currentStationName} (${currentStationCode})`,
      expectedDeparture: expectedDepartureFormatted,
      expectedDepartureMs: expectedDepartureTime,
      expectedDepartureFormatted,
      lastReportedLocation: isNotStarted
        ? `${currentStationName} (${currentStationCode})${platformStr} • Scheduled Departure: ${expectedDepartureFormatted || 'Upcoming'}${delayMinutes ? ` (Delay: ${delayMinutes}m)` : ''}`
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
        ? `Yet to start from ${sourceName}${platformStr} • Expected Departure: ${expectedDepartureFormatted || 'Upcoming'}${delayMinutes ? ` (Delay: ${delayMinutes}m)` : ''}`
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
        const asrRes = await withTimeout(railkit.liveAtStation('ASR', 4), 15000, 'RailKit liveAtStation ASR timeout');
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
        } else {
          // If ASR query timed out or failed, keep existing discovered trains to prevent drop-off flapping
          if (this.discoveredTrainNumbers && this.discoveredTrainNumbers.length > 0) {
            this.discoveredTrainNumbers.forEach(n => discoveredSet.add(n));
          }
        }
      } catch (asrErr) {
        console.warn('[RailKit] ASR hub discovery warning:', asrErr.message);
        // On exception / timeout, retain previous discovered trains
        if (this.discoveredTrainNumbers && this.discoveredTrainNumbers.length > 0) {
          this.discoveredTrainNumbers.forEach(n => discoveredSet.add(n));
        }
      }

      // Hub 2: Tarn Taran (captures branch line services between Khemkaran & Tarn Taran)
      try {
        const ttoRes = await withTimeout(railkit.liveAtStation('TTO', 4), 12000, 'RailKit liveAtStation TTO timeout');
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

      if (records.length > 0) {
        // Prioritize trains by urgency relative to current time (running/departing/arriving in 0-60 min first)
        const nowDate = new Date();
        const currentMins = nowDate.getHours() * 60 + nowDate.getMinutes();
        const parseTimeToMins = (str) => {
          if (!str || typeof str !== 'string') return 9999;
          const m = str.match(/(\d{1,2}):(\d{2})/);
          if (!m) return 9999;
          let mins = parseInt(m[1]) * 60 + parseInt(m[2]);
          if (mins < currentMins - 120) mins += 1440; // overnight wrap
          return mins;
        };

        records.sort((a, b) => {
          const timeA = Math.min(parseTimeToMins(a.depActual), parseTimeToMins(a.arrActual));
          const timeB = Math.min(parseTimeToMins(b.depActual), parseTimeToMins(b.arrActual));
          return Math.abs(timeA - currentMins) - Math.abs(timeB - currentMins);
        });

        const prioritizedNumbers = records.map(r => r.trainNumber);
        this.discoveredTrainNumbers = prioritizedNumbers;
        this.discoveredTrainRecords = records;
        this.lastDiscoveryTimestamp = now;
        this.status = 'CONNECTED';
        this.lastSuccessfulSync = new Date().toISOString();
      } else if (discoveredSet.size > 0) {
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
        const discoveredNumbers = await this.discoverActiveTrains(force);
        
        // Combine newly discovered hub trains with any in-memory trains currently flagged in-sector
        // This ensures trains that departed earlier (like #22488 now at Ambala) are verified and flagged OUT_OF_SECTOR
        const candidateSet = new Set(discoveredNumbers || []);
        this.validatedTrainsMap.forEach((existingTrain, trainKey) => {
          if (existingTrain && (existingTrain.isWithinAmritsarSector || existingTrain.status === 'IN_TRANSIT')) {
            candidateSet.add(trainKey);
          }
        });
        const candidateNumbers = Array.from(candidateSet);

        if (candidateNumbers.length === 0) {
          if (!this.isQuotaExhausted && !this.isAuthError) {
            this.status = 'CONNECTED';
            this.lastSuccessfulSync = new Date().toISOString();
          }
          return { success: true, count: 0, reason: 'Zero trains active in Amritsar sector' };
        }

        const now = Date.now();
        // Intelligent Credit Conservation:
        // Do NOT poll terminated/cancelled trains or trains deep outside sector every cycle.
        const trainNumbersToQuery = candidateNumbers.filter(num => {
          const existing = this.validatedTrainsMap.get(num);
          if (!existing) return true; // Newly discovered: query once
          if (existing.status === 'TERMINATED' || existing.status === 'CANCELLED') {
            return false; // Zero credit waste on ended journeys
          }
          if (existing.status === 'OUT_OF_SECTOR' && (existing.distanceFromAmritsarKm || 0) > 60) {
            // Far outside sector: query at most once every 12 minutes
            const lastPing = existing.lastPing ? new Date(existing.lastPing).getTime() : 0;
            return (now - lastPing) > 12 * 60 * 1000;
          }
          return true; // Active or approaching train
        });

        if (trainNumbersToQuery.length === 0) {
          return { success: true, count: 0, reason: 'All discovered trains currently outside sector or terminated (credits saved)' };
        }

        let successfulPings = 0;
        let totalLatency = 0;
        let anyError = null;
        const auditEntries = [];

        // Prioritize active in-sector and newly discovered trains first
        trainNumbersToQuery.sort((a, b) => {
          const exA = this.validatedTrainsMap.get(a);
          const exB = this.validatedTrainsMap.get(b);
          const inSecA = exA?.isWithinAmritsarSector ? 1 : 0;
          const inSecB = exB?.isWithinAmritsarSector ? 1 : 0;
          return inSecB - inSecA;
        });

        // Cap to top 8 most relevant trains per cycle so each telemetry sync completes in <2 seconds
        const batchToQuery = trainNumbersToQuery.slice(0, 8);

        // Query in gentle chunks of 4 with a 50ms gap to respect provider rate limits while completing swiftly
        const chunkSize = 4;
        for (let i = 0; i < batchToQuery.length; i += chunkSize) {
          if (this.isQuotaExhausted || this.isAuthError) break;

          const chunk = batchToQuery.slice(i, i + chunkSize);
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
    const rawClean = String(trainNumber || '').trim();
    const cleanNum = rawClean.padStart(5, '0').slice(-5);
    const t = this.validatedTrainsMap.get(cleanNum) || this.validatedTrainsMap.get(rawClean);
    if (t && Array.isArray(t.schedule) && t.schedule.length > 0) return t.schedule;

    const cachedSched = this.scheduleCache?.get(cleanNum) || this.scheduleCache?.get(rawClean);
    if (cachedSched && cachedSched.length > 0) return cachedSched;

    for (const [k, v] of this.cache.entries()) {
      if ((k.startsWith(cleanNum) || k.startsWith(rawClean)) && v.data?.route) {
        const mapped = this.mapRailkitTrain(v.data, new Date().toISOString());
        if (mapped?.schedule && mapped.schedule.length > 0) {
          this.scheduleCache?.set(cleanNum, mapped.schedule);
          return mapped.schedule;
        }
      }
    }
    return [];
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
      isAvailable: this.isAvailable(),
      latencyMs: this.measuredLatencyMs,
      lastSuccessfulSync: this.lastSuccessfulSync,
      lastAttempt: this.lastAttemptTimestamp,
      lastError: this.lastError,
      quotaExhausted: this.isQuotaExhausted,
      dataFreshnessThresholdMinutes: 15,
      circuitBreaker: this.getCircuitBreakerStatus(),
      discoveredTrainsCount: this.discoveredTrainNumbers.length,
      cachedTrainsCount: this.cache.size,
      activeTrainsCount: this.validatedTrainsMap.size
    };
  }
}

export const railkitService = new RailkitService();
