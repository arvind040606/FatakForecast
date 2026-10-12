// =========================================================================
// FATAKFORECAST — RAILKIT TRAIN TELEMETRY AGGREGATION & PIPELINE ENGINE
// Deduplication, Sector Geocoding, Freshness Validation & Crossing Interface
// Strictly powered by RailKit Official Indian Railways Telemetry Gateway
// =========================================================================

import { railkitService } from './railkitService.js';

export class TrainAggregationService {
  constructor() {
    this.monitoredTrainNumbers = railkitService.monitoredTrainNumbers;
    this.aggregatedTrainsMap = new Map();
    this.pollingIntervalMs = railkitService.pollingIntervalMs;
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
   * Main polling & aggregation loop powered strictly by RailKit.
   * Runs ONLY when the app is active / open to conserve API tokens!
   */
  async aggregateFeeds(force = false) {
    if (this.activePollPromise) {
      return await this.activePollPromise;
    }
    if (!force && !this.isAppActive()) {
      // App is closed: do not poll!
      return { success: true, paused: true, reason: 'App closed, polling paused to save credits' };
    }
    this.isPolling = true;

    this.activePollPromise = (async () => {
      const aggregateStart = Date.now();
      try {
        if (railkitService.isAvailable()) {
          await railkitService.pollLiveProvider(force);
        }

        const updatedAggregateMap = new Map();

        railkitService.validatedTrainsMap.forEach((mapped, key) => {
          const normKey = this.normalizeTrainNumber(key);
          if (mapped) {
            updatedAggregateMap.set(normKey, mapped);
          }
        });

        this.aggregatedTrainsMap = updatedAggregateMap;
        this.lastAggregateTimestamp = new Date().toISOString();

        if (this.onUpdateCallback) {
          try { this.onUpdateCallback(); } catch (e) {}
        }

        return {
          success: true,
          durationMs: Date.now() - aggregateStart,
          trainsCount: updatedAggregateMap.size
        };
      } catch (err) {
        console.warn('[Aggregation] Error during RailKit telemetry cycle:', err.message);
        return { success: false, error: err.message };
      } finally {
        this.isPolling = false;
        this.activePollPromise = null;
      }
    })();

    return await this.activePollPromise;
  }

  /**
   * Return verified live trains list.
   * Strictly live telemetry from RailKit — zero dummy / synthetic trains injected!
   */
  getAggregatedTrainsList() {
    return Array.from(this.aggregatedTrainsMap.values());
  }

  /**
   * Trigger immediate live detection when user opens the app (if data is older than 75s)
   */
  async triggerImmediateSyncIfDue() {
    const ageMin = this.getAgeMinutes(this.lastAggregateTimestamp);
    if (ageMin > 1.25) {
      return await this.aggregateFeeds(true);
    }
    return { success: true, cached: true };
  }

  getDiagnostics() {
    const rkStatus = railkitService.getStatus();

    const trainsList = Array.from(this.aggregatedTrainsMap.values());
    const liveCount = trainsList.filter(t => t.dataState === 'LIVE').length;
    const staleCount = trainsList.filter(t => t.dataState === 'STALE').length;
    const scheduledCount = trainsList.filter(t => t.dataState === 'SCHEDULED' || t.dataState === 'NOT_STARTED').length;

    let overallStatus = rkStatus.status || 'DISCONNECTED';

    return {
      overallStatus,
      lastAggregateTimestamp: this.lastAggregateTimestamp || rkStatus.lastSuccessfulSync,
      totalTrackedTrains: trainsList.length,
      liveCount,
      staleCount,
      scheduledCount,
      providers: [
        {
          name: rkStatus.provider,
          type: 'Indian Railways Official Telemetry Gateway (RailKit)',
          status: rkStatus.status,
          latencyMs: rkStatus.latencyMs,
          lastSuccessfulSync: rkStatus.lastSuccessfulSync,
          configured: rkStatus.configured,
          maskedKey: rkStatus.maskedKey,
          lastError: rkStatus.lastError,
          quotaExhausted: rkStatus.quotaExhausted
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
