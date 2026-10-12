import { useState, useEffect } from 'react';
import { RailwayCrossing } from '../types';

/**
 * Shared Timer Scheduler (Singleton)
 * Maintains a single, synchronized interval loop across the entire application.
 * Automatically starts on first subscriber and terminates on zero subscribers.
 * Immediately resynchronizes on tab visibilitychange, window focus, or app resume.
 */
class SharedTimerManager {
  private subscribers = new Set<(now: number) => void>();
  private intervalId: any = null;
  private currentEpochMs: number = Date.now();
  private isListeningToVisibility = false;

  constructor() {
    this.handleVisibilityOrFocus = this.handleVisibilityOrFocus.bind(this);
  }

  public getNow(): number {
    return this.currentEpochMs;
  }

  public subscribe(callback: (now: number) => void): () => void {
    this.subscribers.add(callback);
    // Deliver initial tick synchronously to subscriber
    callback(this.currentEpochMs);

    if (this.subscribers.size === 1) {
      this.startScheduler();
    }

    return () => {
      this.subscribers.delete(callback);
      if (this.subscribers.size === 0) {
        this.stopScheduler();
      }
    };
  }

  private startScheduler(): void {
    if (this.intervalId) return;

    this.currentEpochMs = Date.now();
    this.intervalId = setInterval(() => {
      this.tick();
    }, 1000);

    if (!this.isListeningToVisibility) {
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', this.handleVisibilityOrFocus);
      }
      if (typeof window !== 'undefined') {
        window.addEventListener('focus', this.handleVisibilityOrFocus);
        window.addEventListener('pageshow', this.handleVisibilityOrFocus);
      }
      this.isListeningToVisibility = true;
    }
  }

  private stopScheduler(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.isListeningToVisibility) {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', this.handleVisibilityOrFocus);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', this.handleVisibilityOrFocus);
        window.removeEventListener('pageshow', this.handleVisibilityOrFocus);
      }
      this.isListeningToVisibility = false;
    }
  }

  private handleVisibilityOrFocus(): void {
    // When returning to tab/app, immediately recalculate against wall-clock time
    this.tick();
  }

  public tick(): void {
    this.currentEpochMs = Date.now();
    this.subscribers.forEach((cb) => {
      try {
        cb(this.currentEpochMs);
      } catch (err) {
        console.error('Error in shared timer callback', err);
      }
    });
  }

  /**
   * Testing hook for deterministic test suites
   */
  public setMockTime(epochMs: number): void {
    this.currentEpochMs = epochMs;
    this.subscribers.forEach((cb) => cb(this.currentEpochMs));
  }
}

export const sharedTimer = new SharedTimerManager();

/**
 * React Hook subscribing to the shared timer scheduler.
 * Returns current epoch timestamp (ms), continuously updated every second
 * and synchronized on app/tab resume.
 */
export function useSharedTimer(): number {
  const [now, setNow] = useState<number>(() => sharedTimer.getNow());

  useEffect(() => {
    return sharedTimer.subscribe((currentEpoch) => {
      setNow(currentEpoch);
    });
  }, []);

  return now;
}

/**
 * Authoritative Countdown Rounding Convention: Math.floor
 * 
 * Formula:
 * remainingMs = targetTimestampMs - currentTimeMs
 * remainingSec = Math.max(0, Math.floor(remainingMs / 1000))
 * 
 * Documentation:
 * Math.floor is applied consistently across all countdown displays in FatakForecast.
 * For example:
 * - 35,900 ms -> 35 seconds (displays 00:35)
 * - 35,100 ms -> 35 seconds (displays 00:35)
 * - 34,900 ms -> 34 seconds (displays 00:34)
 * - 0 to 999 ms -> 0 seconds (displays 00:00)
 * - <= 0 ms -> 0 seconds (strictly bounded to non-negative)
 * 
 * This prevents fractional millisecond jitter and ensures every component displays
 * the exact same integer seconds at any given timestamp.
 */
export function calculateRemainingSeconds(
  targetTimestampMs: number | null | undefined,
  currentTimeMs: number
): number {
  if (!targetTimestampMs || isNaN(targetTimestampMs) || targetTimestampMs <= 0) {
    return 0;
  }
  const remainingMs = targetTimestampMs - currentTimeMs;
  return Math.max(0, Math.floor(remainingMs / 1000));
}

/**
 * Format total seconds into MM:SS components consistently
 */
export function formatCountdown(totalSeconds: number): {
  minutes: number;
  seconds: number;
  formatted: string;
} {
  const safeSec = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSec / 60);
  const seconds = safeSec % 60;
  return {
    minutes,
    seconds,
    formatted: `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  };
}

// In-memory stable anchor target registry
interface StableTargetEntry {
  crossingId: string;
  type: 'closure' | 'reopen';
  status: string;
  trainId: string | null;
  targetEpochMs: number;
  lastSourceEpochMs: number;
  establishedAtMs: number;
}

const stableTargetMap = new Map<string, StableTargetEntry>();

export function clearStableTargets(): void {
  stableTargetMap.clear();
}

/**
 * Resolves authoritative target timestamp epoch (ms) for a crossing.
 * 
 * ROOT CAUSE FIX:
 * Prevents countdown bouncing (e.g. 00:34 <-> 00:35) caused by server-side polling jitter:
 * When a train is en-route between GPS updates, the backend server updates its current timestamp
 * on each 2.5s poll and generates a new ISO timestamp that drifts forward by ~2.5s.
 * 
 * This resolver:
 * 1. Establishes the authoritative target on first detection or legitimate update.
 * 2. Filters out sub-5s polling drift, ensuring the client ticks strictly monotonically downward.
 * 3. Immediately adopts legitimate target updates when:
 *    - Crossing operational status changes (e.g. OPEN -> APPROACHING -> CLOSED)
 *    - Impacting train changes (trainId change)
 *    - Source prediction experiences a significant shift (>= 5000ms from RailKit update)
 *    - The previous target has expired and a valid new future target is supplied.
 */
export function getAuthoritativeTargetEpoch(
  crossing: RailwayCrossing | null | undefined,
  type: 'closure' | 'reopen',
  nowMs: number
): number | null {
  if (!crossing || !crossing.id) return null;

  const cacheKey = `${crossing.id}:${type}`;

  if (type === 'reopen') {
    const isClosed = crossing.status === 'CLOSED' || crossing.status === 'CLOSURE_REPORTED' || crossing.status === 'CLOSURE_EXPECTED';
    if (!isClosed) {
      stableTargetMap.delete(cacheKey);
      return null;
    }

    // 1. Authoritative ISO timestamp
    let rawTargetMs: number | null = null;
    const isoString = crossing.predictedReopenTime || crossing.estimatedGateReopeningTime;
    if (isoString) {
      const parsed = new Date(isoString).getTime();
      if (!isNaN(parsed) && parsed > 0) {
        rawTargetMs = parsed;
      }
    }

    // 2. Relative wait duration
    if (rawTargetMs === null && typeof crossing.remainingWaitSec === 'number' && crossing.remainingWaitSec > 0) {
      rawTargetMs = nowMs + crossing.remainingWaitSec * 1000;
    }

    if (rawTargetMs === null) {
      stableTargetMap.delete(cacheKey);
      return null;
    }

    const existing = stableTargetMap.get(cacheKey);
    if (!existing) {
      stableTargetMap.set(cacheKey, {
        crossingId: crossing.id,
        type: 'reopen',
        status: crossing.status,
        trainId: crossing.upcomingTrainId || null,
        targetEpochMs: rawTargetMs,
        lastSourceEpochMs: rawTargetMs,
        establishedAtMs: nowMs
      });
      return rawTargetMs;
    }

    // Check for genuine update vs server polling jitter (< 5s)
    const trainChanged = existing.trainId !== (crossing.upcomingTrainId || null);
    const statusChanged = existing.status !== crossing.status;
    const significantShift = Math.abs(rawTargetMs - existing.lastSourceEpochMs) >= 5000;
    const expiredTarget = nowMs > existing.targetEpochMs && rawTargetMs > nowMs + 1000;

    if (trainChanged || statusChanged || significantShift || expiredTarget) {
      existing.targetEpochMs = rawTargetMs;
      existing.lastSourceEpochMs = rawTargetMs;
      existing.status = crossing.status;
      existing.trainId = crossing.upcomingTrainId || null;
      existing.establishedAtMs = nowMs;
    } else {
      existing.lastSourceEpochMs = rawTargetMs;
    }

    return existing.targetEpochMs;
  }

  // type === 'closure'
  const isClosed = crossing.status === 'CLOSED' || crossing.status === 'CLOSURE_REPORTED';
  if (isClosed) {
    stableTargetMap.delete(cacheKey);
    return null;
  }

  // 1. Authoritative ISO timestamp
  let rawTargetMs: number | null = null;
  const isoString = crossing.estimatedGateClosingTime || crossing.expectedTrainArrival;
  if (isoString) {
    const parsed = new Date(isoString).getTime();
    if (!isNaN(parsed) && parsed > 0) {
      rawTargetMs = parsed;
    }
  }

  // 2. Relative duration
  if (rawTargetMs === null && crossing.countdownAvailable && typeof crossing.timeToNextClosureSec === 'number' && crossing.timeToNextClosureSec > 0) {
    rawTargetMs = nowMs + crossing.timeToNextClosureSec * 1000;
  }

  if (rawTargetMs === null) {
    stableTargetMap.delete(cacheKey);
    return null;
  }

  const existing = stableTargetMap.get(cacheKey);
  if (!existing) {
    stableTargetMap.set(cacheKey, {
      crossingId: crossing.id,
      type: 'closure',
      status: crossing.status,
      trainId: crossing.upcomingTrainId || null,
      targetEpochMs: rawTargetMs,
      lastSourceEpochMs: rawTargetMs,
      establishedAtMs: nowMs
    });
    return rawTargetMs;
  }

  // Check for genuine update vs server polling jitter (< 5s)
  const trainChanged = existing.trainId !== (crossing.upcomingTrainId || null);
  const statusChanged = existing.status !== crossing.status;
  const significantShift = Math.abs(rawTargetMs - existing.lastSourceEpochMs) >= 5000;
  const expiredTarget = nowMs > existing.targetEpochMs && rawTargetMs > nowMs + 1000;

  if (trainChanged || statusChanged || significantShift || expiredTarget) {
    existing.targetEpochMs = rawTargetMs;
    existing.lastSourceEpochMs = rawTargetMs;
    existing.status = crossing.status;
    existing.trainId = crossing.upcomingTrainId || null;
    existing.establishedAtMs = nowMs;
  } else {
    existing.lastSourceEpochMs = rawTargetMs;
  }

  return existing.targetEpochMs;
}
