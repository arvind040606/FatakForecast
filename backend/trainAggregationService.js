// =========================================================================
// FATAKFORECAST — DUAL-PROVIDER TRAIN TELEMETRY AGGREGATION & PIPELINE ENGINE
// Integrations: RailKit Official SDK & RailRadar Live REST Feed
// Deduplication, Sector Geocoding, Freshness Validation & Crossing Interface
// Strictly distinguishes LIVE, STALE, SCHEDULED, SIMULATED, and UNAVAILABLE states
// Circuit-breaker guarded, quota backoff, zero data fabrication
// =========================================================================

import { railkitService } from './railkitService.js';
import { telemetryService as railRadarService } from './telemetryService.js';

export class TrainAggregationService {
  constructor() {
    this.monitoredTrainNumbers = railkitService.monitoredTrainNumbers;
    this.aggregatedTrainsMap = new Map();
    this.pollingIntervalMs = railkitService.pollingIntervalMs || 90000;
    this.timer = null;
    this.isPolling = false;
    this.activePollPromise = null;
    this.onUpdateCallback = null;
    this.lastAggregateTimestamp = null;
    this.appActiveChecker = null;
  }

  setAppActiveChecker(checkerFn) {
    this.appActiveChecker = checkerFn;
    railkitService.setAppActiveChecker(checkerFn);
  }

  notifyAppActive() {
    railkitService.notifyAppActive();
  }

  async triggerImmediateSyncIfDue() {
    this.notifyAppActive();
    if (this.activePollPromise) {
      await this.activePollPromise;
      return;
    }
    const ageMs = this.lastAggregateTimestamp ? (Date.now() - new Date(this.lastAggregateTimestamp).getTime()) : Infinity;
    if (ageMs > 75000) {
      await this.aggregateFeeds(true).catch(() => {});
    }
  }

  isAppActive() {
    if (typeof this.appActiveChecker === 'function') {
      try { return this.appActiveChecker(); } catch (e) { return true; }
    }
    return railkitService.isAppActive();
  }

  onUpdate(callback) {
    this.onUpdateCallback = callback;
  }

  normalizeTrainNumber(num) {
    if (!num) return '';
    return String(num).trim().padStart(5, '0').slice(-5);
  }

  getAgeMinutes(timestamp) {
    if (!timestamp) return 9999;
    const ms = new Date(timestamp).getTime();
    if (isNaN(ms)) return 9999;
    return Math.max(0, (Date.now() - ms) / (60 * 1000));
  }

  /**
   * State priority hierarchy for arbitration between multiple telemetry feeds:
   * Higher number = higher confidence / priority
   */
  getStatePriority(state) {
    switch (String(state || '').toUpperCase()) {
      case 'LIVE': return 100;
      case 'STALE': return 50;
      case 'SCHEDULED': return 30;
      case 'NOT_STARTED': return 30;
      case 'TERMINATED': return 20;
      case 'CANCELLED': return 10;
      case 'SIMULATED': return 5;
      case 'UNAVAILABLE': return 0;
      default: return 0;
    }
  }

  /**
   * Arbitrate between two candidate train records for the same physical train
   * Never overwrites fresh live telemetry with older stale or scheduled data.
   */
  arbitrateRecords(recordA, recordB) {
    if (!recordA) return recordB;
    if (!recordB) return recordA;

    const prioA = this.getStatePriority(recordA.dataState);
    const prioB = this.getStatePriority(recordB.dataState);

    // 1. Definite state preference (e.g., LIVE beats STALE / SCHEDULED)
    if (prioA !== prioB) {
      return prioA > prioB ? recordA : recordB;
    }

    // 2. If both records share the same state, check GPS fidelity
    const aHasGps = recordA.observationAccuracy === 'LOCOMOTIVE_GPS' || recordA.hasLiveSpeedMeasurement;
    const bHasGps = recordB.observationAccuracy === 'LOCOMOTIVE_GPS' || recordB.hasLiveSpeedMeasurement;
    if (aHasGps && !bHasGps) return recordA;
    if (!aHasGps && bHasGps) return recordB;

    // 3. Compare genuine provider observation timestamps (fresher observation wins)
    const timeA = recordA.providerObservationTimestamp ? new Date(recordA.providerObservationTimestamp).getTime() : 0;
    const timeB = recordB.providerObservationTimestamp ? new Date(recordB.providerObservationTimestamp).getTime() : 0;
    if (!isNaN(timeA) && !isNaN(timeB) && timeA !== timeB) {
      return timeA > timeB ? recordA : recordB;
    }

    // 4. Default: prefer record with confirmed schedule array
    if (Array.isArray(recordA.schedule) && recordA.schedule.length > 0 && (!Array.isArray(recordB.schedule) || recordB.schedule.length === 0)) {
      return recordA;
    }

    return recordB;
  }

  /**
   * Main polling & aggregation loop across RailKit and RailRadar.
   * Runs ONLY when the app is active / open to conserve API quotas.
   */
  async aggregateFeeds(force = false) {
    if (this.activePollPromise) {
      return await this.activePollPromise;
    }
    if (!force && !this.isAppActive()) {
      return { success: true, paused: true, reason: 'App closed, polling paused to save credits' };
    }
    this.isPolling = true;

    this.activePollPromise = (async () => {
      const aggregateStart = Date.now();
      try {
        const pollPromises = [];

        // Query RailKit if available (has API key and not tripped in backoff)
        if (railkitService.isAvailable()) {
          pollPromises.push(
            railkitService.pollLiveProvider(force).catch(err => {
              console.warn('[Aggregation] RailKit poll error:', err.message);
              return { success: false, error: err.message };
            })
          );
        }

        // Query RailRadar if available (has API key and not tripped in backoff)
        if (railRadarService.isAvailable()) {
          const discovered = railkitService.discoveredTrainNumbers || [];
          pollPromises.push(
            railRadarService.pollLiveProvider(discovered.length > 0 ? discovered : null).catch(err => {
              console.warn('[Aggregation] RailRadar poll error:', err.message);
              return { success: false, error: err.message };
            })
          );
        }

        if (pollPromises.length > 0) {
          await Promise.allSettled(pollPromises);
        }

        const updatedAggregateMap = new Map();

        // Collect all distinct normalized 5-digit train numbers
        const candidateKeys = new Set();
        railkitService.validatedTrainsMap.forEach((_, key) => candidateKeys.add(this.normalizeTrainNumber(key)));
        railRadarService.validatedTrainsMap.forEach((_, key) => candidateKeys.add(this.normalizeTrainNumber(key)));

        if (candidateKeys.size > 0) {
          candidateKeys.forEach(normKey => {
            const rkTrain = railkitService.validatedTrainsMap.get(normKey);
            const rrTrain = railRadarService.validatedTrainsMap.get(normKey);
            const chosen = this.arbitrateRecords(rkTrain, rrTrain);
            if (chosen) {
              updatedAggregateMap.set(normKey, chosen);
            }
          });

          // Preserve active, non-stale previously verified trains as well as scheduled services so chunked batching never causes trains to pop in and out
          this.aggregatedTrainsMap.forEach((prevTrain, prevKey) => {
            if (!updatedAggregateMap.has(prevKey)) {
              const obsTime = prevTrain.providerObservationTimestamp || prevTrain.lastPing;
              const ageMs = obsTime ? (Date.now() - new Date(obsTime).getTime()) : Infinity;
              const isScheduledOrNotStarted = prevTrain.status === 'NOT_STARTED' || prevTrain.status === 'not-started' || prevTrain.dataState === 'SCHEDULED';
              if ((ageMs < 15 * 60 * 1000 || isScheduledOrNotStarted) && prevTrain.status !== 'TERMINATED' && prevTrain.status !== 'CANCELLED') {
                updatedAggregateMap.set(prevKey, prevTrain);
              }
            }
          });

          this.aggregatedTrainsMap = updatedAggregateMap;
          this.lastAggregateTimestamp = new Date().toISOString();
        }

        if (this.onUpdateCallback) {
          try { this.onUpdateCallback(); } catch (e) {}
        }

        return {
          success: true,
          durationMs: Date.now() - aggregateStart,
          trainsCount: updatedAggregateMap.size
        };
      } catch (err) {
        console.warn('[Aggregation] Error during train telemetry cycle:', err.message);
        return { success: false, error: err.message };
      } finally {
        this.isPolling = false;
        this.activePollPromise = null;
      }
    })();

    return await this.activePollPromise;
  }

  /**
   * Return verified trains list.
   * Strictly verified telemetry — zero fabricated dummy/synthetic trains.
   */
  getAggregatedTrainsList() {
    return Array.from(this.aggregatedTrainsMap.values()).sort((a, b) => {
      const inSecA = a.isWithinAmritsarSector ? 1 : 0;
      const inSecB = b.isWithinAmritsarSector ? 1 : 0;
      if (inSecA !== inSecB) return inSecB - inSecA;
      return String(a.number || a.id || '').localeCompare(String(b.number || b.id || ''));
    });
  }

  getDiagnostics() {
    const rkStatus = railkitService.getStatus();
    const rrStatus = railRadarService.getStatus();

    const trainsList = Array.from(this.aggregatedTrainsMap.values());
    const liveCount = trainsList.filter(t => t.dataState === 'LIVE').length;
    const staleCount = trainsList.filter(t => t.dataState === 'STALE').length;
    const scheduledCount = trainsList.filter(t => t.dataState === 'SCHEDULED' || t.dataState === 'NOT_STARTED').length;
    const simulatedCount = trainsList.filter(t => t.dataState === 'SIMULATED').length;
    const unavailableCount = trainsList.filter(t => t.dataState === 'UNAVAILABLE').length;

    // Determine overall telemetry aggregation health
    let overallStatus = 'NOT_CONFIGURED';
    const anyConfigured = rkStatus.configured || rrStatus.configured;
    const anyConnected = rkStatus.status === 'CONNECTED' || rrStatus.status === 'CONNECTED';
    const allTripped = (rkStatus.circuitBreaker?.state === 'OPEN') && (rrStatus.circuitBreaker?.state === 'OPEN' || !rrStatus.configured);

    if (allTripped) {
      overallStatus = 'CIRCUIT_BREAKER_OPEN';
    } else if (anyConnected) {
      overallStatus = (rkStatus.circuitBreaker?.state === 'OPEN' || rrStatus.circuitBreaker?.state === 'OPEN')
        ? 'DEGRADED'
        : 'CONNECTED';
    } else if (anyConfigured) {
      overallStatus = rkStatus.quotaExhausted || rrStatus.quotaExhausted ? 'QUOTA_EXHAUSTED' : 'DISCONNECTED';
    }

    return {
      overallStatus,
      lastAggregateTimestamp: this.lastAggregateTimestamp || rkStatus.lastSuccessfulSync || rrStatus.lastSuccessfulSync,
      totalTrackedTrains: trainsList.length,
      liveCount,
      staleCount,
      scheduledCount,
      simulatedCount,
      unavailableCount,
      freshnessThresholdMinutes: 15,
      arbitrationStrategy: '5-Digit Train No. + State Priority + Genuine Observation Freshness',
      providers: [
        {
          name: rkStatus.provider,
          type: 'Indian Railways Official Telemetry Gateway (RailKit)',
          status: rkStatus.status,
          isAvailable: rkStatus.isAvailable,
          latencyMs: rkStatus.latencyMs,
          lastSuccessfulSync: rkStatus.lastSuccessfulSync,
          configured: rkStatus.configured,
          maskedKey: rkStatus.maskedKey,
          lastError: rkStatus.lastError,
          quotaExhausted: rkStatus.quotaExhausted,
          circuitBreaker: rkStatus.circuitBreaker,
          dataFreshnessThresholdMinutes: rkStatus.dataFreshnessThresholdMinutes || 15
        },
        {
          name: rrStatus.provider,
          type: rrStatus.type || 'RailRadar Live Tracking Gateway',
          status: rrStatus.status,
          isAvailable: rrStatus.isAvailable,
          latencyMs: rrStatus.latencyMs,
          lastSuccessfulSync: rrStatus.lastSuccessfulSync,
          configured: rrStatus.configured,
          maskedKey: rrStatus.maskedKey,
          lastError: rrStatus.lastError,
          quotaExhausted: rrStatus.quotaExhausted,
          circuitBreaker: rrStatus.circuitBreaker,
          dataFreshnessThresholdMinutes: rrStatus.dataFreshnessThresholdMinutes || 15
        }
      ]
    };
  }

  getTrainSchedule(trainNumber) {
    const normKey = this.normalizeTrainNumber(trainNumber);
    const train = this.aggregatedTrainsMap.get(normKey);
    if (train && Array.isArray(train.schedule) && train.schedule.length > 0) {
      return train.schedule;
    }
    return railkitService.getTrainSchedule(trainNumber);
  }

  startPolling() {
    this.aggregateFeeds().catch(() => {});
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.aggregateFeeds().catch(() => {}), this.pollingIntervalMs);
  }

  stopPolling() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

export const trainAggregationService = new TrainAggregationService();
