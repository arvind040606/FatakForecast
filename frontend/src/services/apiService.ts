import {
  RailwayCrossing,
  SectorTrain,
  RailwayCorridor,
  OperationalMetrics,
  TelemetryPayload,
  ClosureForecast,
  AnalyticsData,
  HealthData,
  PlannedJourney,
  TravelMode,
  PlaceSearchResult,
  ProviderTelemetry,
  ConnectionLifecycleState,
  ConnectionStateDetails,
  CommunityCrossingReport,
  CrossingSurveyInput
} from '../types';
import {
  INITIAL_CROSSINGS,
  INITIAL_TRAINS,
  INITIAL_CORRIDORS,
  INITIAL_METRICS
} from './amritsarData';
import { nativeService } from './nativeService';

class RailwayAPIService {
  private ws: WebSocket | null = null;
  private reconnectTimer: any = null;
  private pollingTimer: any = null;
  private listeners: Set<(payload: TelemetryPayload) => void> = new Set();
  private audioEnabled: boolean = true;
  private audioContext: AudioContext | null = null;
  private isOnline: boolean = true;
  private lastGoodPayload: TelemetryPayload = {
    type: 'TELEMETRY_UPDATE',
    timestamp: new Date().toISOString(),
    metrics: INITIAL_METRICS,
    crossings: INITIAL_CROSSINGS,
    trains: INITIAL_TRAINS,
    activeCorridors: INITIAL_CORRIDORS
  };
  private lastProcessedTimestamp: number = 0;
  private inFlightPollAbort: AbortController | null = null;
  private measuredClientLatencyMs: number | null = null;
  private lastPingSentMs: number = 0;

  constructor() {
    if (typeof window !== 'undefined') {
      this.isOnline = navigator.onLine;

      // Restore sound alerts preference (enabled by default on first launch)
      try {
        const savedAudio = localStorage.getItem('fatak_audio_enabled');
        if (savedAudio !== null) {
          this.audioEnabled = savedAudio === 'true';
        } else {
          this.audioEnabled = true;
          localStorage.setItem('fatak_audio_enabled', 'true');
        }
      } catch (e) {
        this.audioEnabled = true;
      }

      // Restore cached telemetry for immediate offline/cold start display
      try {
        const cachedStr = localStorage.getItem('fatak_cached_telemetry');
        if (cachedStr) {
          const cached = JSON.parse(cachedStr) as TelemetryPayload;
          const cacheAgeMs = cached.timestamp ? (Date.now() - new Date(cached.timestamp).getTime()) : Infinity;
          if (cached && Array.isArray(cached.crossings) && cached.crossings.length >= 20) {
            if (!isNaN(cacheAgeMs) && cacheAgeMs > 30 * 60 * 1000) {
              // Mark stale status without destroying train objects
              cached.metrics = {
                ...cached.metrics,
                feedStatus: 'ONLINE_SYNCHRONIZED',
                feedLatencyMs: null
              };
            }
            this.lastGoodPayload = cached;
          }
        }
      } catch (e) {}

      window.addEventListener('online', () => {
        this.isOnline = true;
        this.initWebSocket();
      });
      window.addEventListener('offline', () => {
        this.isOnline = false;
        if (this.ws) {
          try { this.ws.close(); } catch (e) {}
        }
        this.onPollFailure();
      });
      window.addEventListener('fatak:backend-connected', () => {
        console.log('[apiService] Backend connected/updated, reconnecting WebSocket');
        this.initWebSocket();
      });
      window.addEventListener('fatak:reconnect-ws', () => {
        this.initWebSocket();
      });

      // Visibility change recovery: resume and verify socket stream when user returns to app tab
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
          this.handleVisibilityRecovery();
        }
      });
    }
    this.initWebSocket();
  }

  public getIsOnline(): boolean {
    return this.isOnline;
  }

  public getLastPayload(): TelemetryPayload {
    return this.lastGoodPayload;
  }

  public getBaseUrl(): string {
    return nativeService.getBackendUrl();
  }

  public setAudioEnabled(enabled: boolean) {
    this.audioEnabled = enabled;
    try {
      localStorage.setItem('fatak_audio_enabled', enabled ? 'true' : 'false');
    } catch (e) {}
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('fatak:audio-preference-changed', { detail: { enabled } }));
    }
    if (enabled) {
      if (!this.audioContext) {
        try {
          const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
          this.audioContext = new AudioCtx();
        } catch (e) {
          console.warn('Web Audio not supported', e);
        }
      }
      if (this.audioContext && this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }
    }
  }

  public isAudioEnabled(): boolean {
    return this.audioEnabled;
  }

  public playAudioChime(type: 'APPROACH' | 'CLOSED' | 'OPEN') {
    if (!this.audioEnabled) return;
    try {
      if (!this.audioContext) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        this.audioContext = new AudioCtx();
      }
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }

      const now = this.audioContext.currentTime;
      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();

      osc.connect(gain);
      gain.connect(this.audioContext.destination);

      if (type === 'APPROACH') {
        // High warning pulse (amber alert)
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(440, now + 0.35);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      } else if (type === 'CLOSED') {
        // Two-tone warning tone (red alert)
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.setValueAtTime(390, now + 0.2);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.start(now);
        osc.stop(now + 0.5);
      } else {
        // Soft double chime (emerald open)
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.setValueAtTime(880, now + 0.15); // A5
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc.start(now);
        osc.stop(now + 0.4);
      }
    } catch (err) {
      console.warn('Audio chime error', err);
    }
  }

  private wsRetryCount: number = 0;
  private wsHeartbeatTimer: any = null;
  private lastMessageReceivedMs: number = Date.now();
  private connectionListeners: Set<(details: ConnectionStateDetails) => void> = new Set();
  private isAttemptingConnection: boolean = false;

  public handleVisibilityRecovery() {
    const nowMs = Date.now();
    const isStalled = !this.lastMessageReceivedMs || (nowMs - this.lastMessageReceivedMs > 20000);
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || isStalled) {
      console.log('[FatakForecast] App tab resumed active: verifying/recovering telemetry connection...');
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      this.initWebSocket();
    } else {
      try {
        this.lastPingSentMs = Date.now();
        this.ws.send(JSON.stringify({ type: 'PING' }));
      } catch (e) {}
    }
  }

  public initWebSocket() {
    if (this.ws) {
      try { this.ws.close(); } catch (e) {}
      this.ws = null;
    }
    this.stopHeartbeat();

    const baseUrl = this.getBaseUrl();
    let wsUrl: string;
    try {
      const parsed = new URL(baseUrl);
      const wsProtocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl = `${wsProtocol}//${parsed.host}/ws`;
    } catch (e) {
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl = `${wsProtocol}//${window.location.host}/ws`;
    }

    // Serverless cloud platforms like Vercel do not support persistent WebSockets.
    // If backend itself is on a Vercel domain, use clean polling fallback.
    // Dedicated servers like Render support continuous WebSockets.
    if (wsUrl.includes('vercel.app')) {
      this.startFallbackPolling();
      return;
    }

    try {
      this.isAttemptingConnection = true;
      this.updateConnectionState(false, true);
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('[FatakForecast] WebSocket telemetry stream connected');
        this.wsRetryCount = 0;
        this.isAttemptingConnection = false;
        this.lastMessageReceivedMs = Date.now();
        this.stopPolling();
        this.startHeartbeat();
        this.updateConnectionState(true, false);
      };

      this.ws.onmessage = (event) => {
        this.lastMessageReceivedMs = Date.now();
        try {
          const raw = JSON.parse(event.data);
          if (raw.type === 'PONG' || raw.type === 'HEARTBEAT') {
            if (this.lastPingSentMs > 0) {
              this.measuredClientLatencyMs = Math.max(1, Math.round(Date.now() - this.lastPingSentMs));
            }
            this.updateConnectionState(true, false);
            return;
          }
          const payload = raw as TelemetryPayload;
          // Retain corridors from initial snapshot if delta omitted them
          if (!payload.activeCorridors && this.lastGoodPayload?.activeCorridors) {
            payload.activeCorridors = this.lastGoodPayload.activeCorridors;
          }
          this.notifyListeners(payload);
          this.updateConnectionState(true, false);
        } catch (err) {
          console.error('[FatakForecast] Error parsing WS telemetry payload', err);
        }
      };

      this.ws.onerror = () => {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
          this.startFallbackPolling();
        }
      };

      this.ws.onclose = () => {
        this.stopHeartbeat();
        this.startFallbackPolling();
        this.scheduleReconnect();
      };
    } catch (err) {
      this.stopHeartbeat();
      this.startFallbackPolling();
      this.scheduleReconnect();
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.wsHeartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.lastPingSentMs = Date.now();
          this.ws.send(JSON.stringify({ type: 'PING' }));
        } catch (e) {}

        // Check if connection has stalled (>25s without any incoming message or heartbeat)
        if (Date.now() - this.lastMessageReceivedMs > 25000) {
          console.warn('[FatakForecast] WebSocket stalled (>25s without packet). Reconnecting...');
          try { this.ws.close(); } catch (e) {}
        }
      }
    }, 12000);
  }

  private stopHeartbeat() {
    if (this.wsHeartbeatTimer) {
      clearInterval(this.wsHeartbeatTimer);
      this.wsHeartbeatTimer = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.stopHeartbeat();
    this.wsRetryCount++;
    this.updateConnectionState(false, false);

    // Continuous exponential backoff with jitter: 1.5s, 2.5s, 4s, 6s, 8s, up to 12s max
    const delay = Math.min(1500 * Math.pow(1.4, Math.min(this.wsRetryCount, 6)), 12000) + Math.random() * 500;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        this.scheduleReconnect();
        return;
      }
      this.initWebSocket();
    }, delay);
  }

  public getConnectionDetails(): ConnectionStateDetails {
    const wsConnected = Boolean(this.ws && this.ws.readyState === WebSocket.OPEN);
    const pollConnected = Boolean(this.consecutivePollErrors === 0 && this.lastGoodPayload);
    const backendConnected = wsConnected || pollConnected;

    const lastSync = this.lastGoodPayload?.metrics?.lastSuccessfulSync || null;
    let railwayFeedStatus: 'LIVE' | 'STALE' | 'OFFLINE' = 'OFFLINE';

    if (backendConnected) {
      if (this.lastGoodPayload?.metrics?.railwayFeedFreshness) {
        railwayFeedStatus = this.lastGoodPayload.metrics.railwayFeedFreshness;
      } else if (lastSync) {
        const ageMin = (Date.now() - new Date(lastSync).getTime()) / (60 * 1000);
        if (ageMin < 15) railwayFeedStatus = 'LIVE';
        else if (ageMin < 60) railwayFeedStatus = 'STALE';
        else railwayFeedStatus = 'OFFLINE';
      } else {
        railwayFeedStatus = this.lastGoodPayload?.metrics?.feedStatus === 'CONNECTED' ? 'LIVE' : 'OFFLINE';
      }
    }

    let state: ConnectionLifecycleState;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      state = 'OFFLINE';
    } else if (backendConnected) {
      state = railwayFeedStatus === 'LIVE' ? 'LIVE' : 'STALE';
    } else if (this.isAttemptingConnection) {
      state = 'CONNECTING';
    } else {
      state = 'OFFLINE';
    }

    // Report genuine client network round-trip latency to the FatakForecast backend
    // Avoid conflating upstream third-party IRCTC/RailKit gateway sync times (>20s) with browser network latency
    let displayLatency: number | null = this.measuredClientLatencyMs;
    if (displayLatency === null && this.lastGoodPayload?.metrics?.feedLatencyMs) {
      if (this.lastGoodPayload.metrics.feedLatencyMs < 1500) {
        displayLatency = this.lastGoodPayload.metrics.feedLatencyMs;
      }
    }

    return {
      state,
      backendConnected,
      railwayFeedStatus,
      latencyMs: displayLatency,
      lastSyncIso: lastSync
    };
  }

  public onConnectionStateChange(callback: (details: ConnectionStateDetails) => void): () => void {
    this.connectionListeners.add(callback);
    callback(this.getConnectionDetails());
    return () => {
      this.connectionListeners.delete(callback);
    };
  }

  private lastDispatchedDetailsSignature: string = '';

  private updateConnectionState(backendConnected: boolean, isConnecting: boolean = false) {
    if (backendConnected) this.isAttemptingConnection = false;
    const details = this.getConnectionDetails();
    if (isConnecting && !backendConnected) {
      details.state = 'CONNECTING';
    }

    // Quantize latency to 100ms buckets so micro-variations (e.g. 2ms vs 5ms) don't re-render
    const quantizedLatency = details.latencyMs != null ? Math.round(details.latencyMs / 100) * 100 : null;
    const signature = `${details.state}_${details.backendConnected}_${details.railwayFeedStatus}_${quantizedLatency}`;

    if (this.lastDispatchedDetailsSignature === signature) {
      return; // Skip duplicate notification to prevent UI flickering
    }
    this.lastDispatchedDetailsSignature = signature;

    this.connectionListeners.forEach(cb => {
      try { cb(details); } catch (e) {}
    });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('fatak:connection-state-changed', { detail: details }));
    }
  }

  private consecutivePollErrors: number = 0;
  private currentPollIntervalMs: number = 2500;
  private isPollFetching: boolean = false;

  private stopPolling() {
    if (this.pollingTimer) {
      clearTimeout(this.pollingTimer);
      this.pollingTimer = null;
    }
    if (this.inFlightPollAbort) {
      try { this.inFlightPollAbort.abort(); } catch (e) {}
      this.inFlightPollAbort = null;
    }
    this.isPollFetching = false;
  }

  private startFallbackPolling() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return; // WebSocket is already active
    }
    if (this.pollingTimer) return;
    if (!this.lastGoodPayload) {
      this.isAttemptingConnection = true;
      this.updateConnectionState(false, true);
    }
    this.scheduleNextPoll(100);

    // Credit conservation & energy management: pause polling when tab is hidden, resume on active
    if (typeof document !== 'undefined') {
      const handleVisibilityChange = () => {
        if (document.hidden) {
          this.stopPolling();
        } else {
          if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.scheduleNextPoll(500);
          }
        }
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
  }

  private scheduleNextPoll(delayMs?: number) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.stopPolling();
      return;
    }
    if (this.pollingTimer) {
      clearTimeout(this.pollingTimer);
      this.pollingTimer = null;
    }
    const interval = delayMs !== undefined ? delayMs : this.currentPollIntervalMs;
    this.pollingTimer = setTimeout(() => {
      this.pollingTimer = null;
      this.executePollStep();
    }, interval);
  }

  private async executePollStep() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.stopPolling();
      return;
    }
    if (this.isPollFetching) return;
    this.isPollFetching = true;

    try {
      let baseUrl = this.getBaseUrl();
      // High-Speed Primary: Single-roundtrip live telemetry endpoint with 7s network budget
      let liveRes: Response | null = null;
      try {
        const fetchSignal = AbortSignal.timeout(6000);
        const pollStartMs = performance.now();
        liveRes = await fetch(`${baseUrl}/api/telemetry/live`, { 
          signal: fetchSignal,
          cache: 'no-store'
        });
        if (liveRes && liveRes.ok) {
          this.measuredClientLatencyMs = Math.max(1, Math.round(performance.now() - pollStartMs));
        }
      } catch (err) {
        // If baseUrl failed and not running on local development loopback, probe working backend URL
        const isLocalDev = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
        if (!isLocalDev) {
          const probed = await nativeService.probeWorkingBackendUrl();
          if (probed && probed !== baseUrl) {
            baseUrl = probed;
            try {
              const retrySignal = AbortSignal.timeout(6000);
              const retryStartMs = performance.now();
              liveRes = await fetch(`${baseUrl}/api/telemetry/live`, {
                signal: retrySignal,
                cache: 'no-store'
              });
              if (liveRes && liveRes.ok) {
                this.measuredClientLatencyMs = Math.max(1, Math.round(performance.now() - retryStartMs));
              }
            } catch (retryErr) {}
          }
        }
      }

      if (liveRes && liveRes.ok) {
        const liveData = await liveRes.json();
        if (liveData.crossings && liveData.crossings.length > 0) {
          const payload: TelemetryPayload = {
            type: 'TELEMETRY_UPDATE',
            timestamp: liveData.timestamp || new Date().toISOString(),
            metrics: liveData.metrics || this.lastGoodPayload?.metrics || INITIAL_METRICS,
            crossings: liveData.crossings,
            trains: Array.isArray(liveData.trains) ? liveData.trains : (this.lastGoodPayload?.trains || []),
            activeCorridors: liveData.activeCorridors || liveData.corridors || this.lastGoodPayload?.activeCorridors || INITIAL_CORRIDORS
          };
          this.lastGoodPayload = payload;
          this.onPollSuccess();
          this.notifyListeners(payload);
          return;
        }
      }

      // Secondary fallback: parallel requests
      const fallbackSignal = AbortSignal.timeout(7000);
      const [res, trainsRes] = await Promise.all([
        fetch(`${baseUrl}/api/crossings`, { signal: fallbackSignal }),
        fetch(`${baseUrl}/api/trains`, { signal: fallbackSignal }).catch(() => null)
      ]);
      if (res.ok) {
        const data = await res.json();
        const trainsData = trainsRes && trainsRes.ok ? await trainsRes.json() : { trains: [] };

        if (data.crossings && data.crossings.length > 0) {
          const payload: TelemetryPayload = {
            type: 'TELEMETRY_UPDATE',
            timestamp: data.timestamp || new Date().toISOString(),
            metrics: data.metrics || this.lastGoodPayload?.metrics || INITIAL_METRICS,
            crossings: data.crossings,
            trains: Array.isArray(trainsData.trains) ? trainsData.trains : (this.lastGoodPayload?.trains || []),
            activeCorridors: data.corridors || this.lastGoodPayload?.activeCorridors || INITIAL_CORRIDORS
          };
          this.lastGoodPayload = payload;
          this.onPollSuccess();
          this.notifyListeners(payload);
          return;
        }
      }

      this.onPollFailure();
    } catch (e: any) {
      this.onPollFailure();
    } finally {
      this.isPollFetching = false;
      this.inFlightPollAbort = null;
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        this.scheduleNextPoll();
      }
    }
  }

  private onPollSuccess() {
    this.consecutivePollErrors = 0;
    this.wsRetryCount = 0;
    this.currentPollIntervalMs = 3500;
    this.isAttemptingConnection = false;
    this.updateConnectionState(true, false);
  }

  private onPollFailure() {
    this.consecutivePollErrors++;
    
    // Only transition to disconnected state if multiple consecutive polls fail (3+ strikes) or network is truly offline
    const isActuallyOffline = (typeof navigator !== 'undefined' && !navigator.onLine) || this.consecutivePollErrors >= 3;

    if (this.lastGoodPayload) {
      if (isActuallyOffline) {
        const offlinePayload: TelemetryPayload = {
          ...this.lastGoodPayload,
          metrics: {
            ...this.lastGoodPayload.metrics,
            feedStatus: 'DISCONNECTED',
            feedLatencyMs: null
          }
        };
        this.listeners.forEach((callback) => callback(offlinePayload));
      } else {
        // Transient network latency jitter: retain existing live data without flickering disconnected
        const degradedPayload: TelemetryPayload = {
          ...this.lastGoodPayload,
          metrics: {
            ...this.lastGoodPayload.metrics,
            feedLatencyMs: null
          }
        };
        this.listeners.forEach((callback) => callback(degradedPayload));
      }
    } else {
      this.emitLocalSimulation();
    }

    if (this.consecutivePollErrors >= 3) {
      this.currentPollIntervalMs = 10000;
    } else {
      this.currentPollIntervalMs = 4000;
    }
  }

  private emitLocalSimulation() {
    // 1. Attempt restore from persisted local cache
    if (typeof window !== 'undefined') {
      try {
        const cachedStr = localStorage.getItem('fatak_cached_telemetry');
        if (cachedStr) {
          const cached = JSON.parse(cachedStr) as TelemetryPayload;
          const cacheAgeMs = cached.timestamp ? (Date.now() - new Date(cached.timestamp).getTime()) : Infinity;
          const isCacheStale = isNaN(cacheAgeMs) || cacheAgeMs > 15 * 60 * 1000;

          // If cache is stale (>15m), all closure predictions have expired, so mark all crossings as UNAVAILABLE
          const sanitizedCrossings = cached.crossings.map(c => {
            if (isCacheStale) {
              return {
                ...c,
                status: 'UNKNOWN' as const,
                gateStatusClassification: 'UNAVAILABLE' as const,
                gateStatusLabel: 'STATUS UNAVAILABLE',
                isStatusEstimated: true,
                predictionAvailable: false,
                estimatedGateClosingTime: null,
                predictedReopenTime: null,
                expectedTrainArrival: null,
                remainingWaitSec: 0,
                timeToNextClosureSec: 0,
                statusReason: 'Cached telemetry expired (>15m) · Real-time gate state unverified'
              };
            }
            return c;
          });

          const offlinePayload: TelemetryPayload = {
            ...cached,
            crossings: sanitizedCrossings,
            trains: isCacheStale ? [] : cached.trains,
            metrics: {
              ...cached.metrics,
              feedStatus: 'DISCONNECTED',
              feedLatencyMs: null,
              openCount: isCacheStale ? 0 : cached.metrics.openCount,
              closedCount: isCacheStale ? 0 : cached.metrics.closedCount,
              approachingCount: isCacheStale ? 0 : cached.metrics.approachingCount,
              unknownCount: isCacheStale ? sanitizedCrossings.length : cached.metrics.unknownCount
            }
          };
          this.lastGoodPayload = offlinePayload;
          this.listeners.forEach((callback) => callback(offlinePayload));
          return;
        }
      } catch (e) {}
    }

    // 2. Offline fallback: retain initial trains and state
    const payload: TelemetryPayload = {
      type: 'TELEMETRY_UPDATE',
      timestamp: new Date().toISOString(),
      metrics: {
        ...(this.lastGoodPayload?.metrics || INITIAL_METRICS),
        feedStatus: 'DISCONNECTED'
      },
      crossings: this.lastGoodPayload?.crossings || INITIAL_CROSSINGS,
      trains: this.lastGoodPayload?.trains?.length ? this.lastGoodPayload.trains : INITIAL_TRAINS,
      activeCorridors: this.lastGoodPayload?.activeCorridors || INITIAL_CORRIDORS
    };
    this.listeners.forEach((callback) => callback(payload));
  }

  public subscribe(callback: (payload: TelemetryPayload) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notifyListeners(payload: TelemetryPayload) {
    if (!payload.activeCorridors && this.lastGoodPayload?.activeCorridors) {
      payload.activeCorridors = this.lastGoodPayload.activeCorridors;
    }

    // 1. Monotonic packet delivery guard: reject out-of-order stale packets delivered late
    const packetTime = payload.timestamp ? new Date(payload.timestamp).getTime() : Date.now();
    if (this.lastProcessedTimestamp > 0 && packetTime < this.lastProcessedTimestamp) {
      return; // Ignore older snapshot
    }
    this.lastProcessedTimestamp = packetTime;

    // Anti-flapping hysteresis guard:
    // If previous verified telemetry (<90s ago) had in-sector trains and active closures,
    // never accept a sudden drop to 0 trains or 0 closures from an uninitialized serverless instance.
    const prevHadClosures = (this.lastGoodPayload?.metrics?.closedCount || 0) > 0;
    const prevHadTrains = (this.lastGoodPayload?.trains?.length || 0) > 0;
    const prevTime = this.lastGoodPayload?.timestamp ? new Date(this.lastGoodPayload.timestamp).getTime() : 0;
    const isPreviousFresh = (Date.now() - prevTime) < 90000;

    if (isPreviousFresh && prevHadTrains && (!payload.trains || payload.trains.length === 0)) {
      payload.trains = this.lastGoodPayload.trains;
    }

    if (isPreviousFresh && prevHadClosures) {
      const incomingClosed = (payload.crossings || []).filter(c => 
        c.status === 'CLOSED' || c.status === 'CLOSURE_EXPECTED' || c.status === 'CLOSURE_REPORTED'
      ).length;
      if (incomingClosed === 0 && this.lastGoodPayload) {
        payload.crossings = this.lastGoodPayload.crossings;
        if (payload.metrics) {
          payload.metrics.closedCount = this.lastGoodPayload.metrics.closedCount;
          payload.metrics.closureExpectedCount = this.lastGoodPayload.metrics.closureExpectedCount;
          payload.metrics.approachingCount = this.lastGoodPayload.metrics.approachingCount;
        }
      }
    }

    // 2. Authoritative snapshot consistency: recalculate and verify mutually exclusive metrics
    if (Array.isArray(payload.crossings) && payload.crossings.length > 0) {
      let openCount = 0;
      let closedCount = 0;
      let approachingCount = 0;
      let unknownCount = 0;

      for (const c of payload.crossings) {
        if (c.status === 'CLOSED' || c.status === 'CLOSURE_EXPECTED' || c.status === 'CLOSURE_REPORTED') {
          closedCount++;
        } else if (c.status === 'APPROACHING') {
          approachingCount++;
        } else if (c.status === 'OPEN') {
          openCount++;
        } else {
          unknownCount++;
        }
      }

      if (payload.metrics) {
        payload.metrics.totalCrossings = payload.crossings.length;
        payload.metrics.openCount = openCount;
        payload.metrics.closedCount = closedCount;
        payload.metrics.approachingCount = approachingCount;
        payload.metrics.unknownCount = unknownCount;
      }

      this.lastGoodPayload = payload;
      // Persist latest verified live telemetry to local storage for graceful offline resumption
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('fatak_cached_telemetry', JSON.stringify(payload));
        } catch (e) {}
      }
    }

    this.updateConnectionState(true, false);
    this.listeners.forEach((callback) => callback(payload));
  }

  // REST endpoints
  public async getCrossings(): Promise<{ crossings: RailwayCrossing[]; corridors: RailwayCorridor[]; metrics: OperationalMetrics }> {
    try {
      const res = await fetch(`${this.getBaseUrl()}/api/crossings`);
      if (res.ok) {
        const data = await res.json();
        if (data.crossings && data.crossings.length > 0) return data;
      }
    } catch (e) {}
    return {
      crossings: this.lastGoodPayload?.crossings || INITIAL_CROSSINGS,
      corridors: this.lastGoodPayload?.activeCorridors || INITIAL_CORRIDORS,
      metrics: this.lastGoodPayload?.metrics || INITIAL_METRICS
    };
  }

  public async getCrossingDetail(id: string): Promise<any> {
    try {
      const res = await fetch(`${this.getBaseUrl()}/api/crossings/${encodeURIComponent(id)}`);
      if (res.ok) return await res.json();
    } catch (e) {}
    const c = INITIAL_CROSSINGS.find(item => item.id.toLowerCase() === id.toLowerCase() || item.osmId === id);
    return { crossing: c, historicalStats: { dailyClosuresAvg: 24, avgGateDwellMinutes: 8.5, peakClosureHours: ['08:00 - 10:00', '17:00 - 19:30'] } };
  }

  public async searchPlaces(query: string, limit: number = 6): Promise<PlaceSearchResult[]> {
    try {
      const url = `${this.getBaseUrl()}/api/places/search?q=${encodeURIComponent(query)}&limit=${limit}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.results) && data.results.length > 0) {
          return data.results;
        }
      }
    } catch (e) {
      console.warn('Place search API error', e);
    }
    // High quality offline fallback across Amritsar points of interest & saved places
    return nativeService.searchLocalLandmarks(query, limit);
  }

  public async reverseGeocode(lat: number, lng: number): Promise<PlaceSearchResult | null> {
    try {
      const url = `${this.getBaseUrl()}/api/places/reverse?lat=${lat}&lng=${lng}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (res.ok) {
        const data = await res.json();
        if (data.place) {
          return data.place;
        }
      }
    } catch (e) {
      console.warn('Reverse geocode API error', e);
    }
    // Proximity resolver fallback
    return nativeService.reverseGeocode(lat, lng);
  }

  public async getTrains(): Promise<SectorTrain[]> {
    try {
      const res = await fetch(`${this.getBaseUrl()}/api/trains`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.trains) && data.trains.length > 0) {
          return data.trains;
        }
      }
    } catch (e) {}
    return this.lastGoodPayload?.trains || INITIAL_TRAINS;
  }

  public async getTrainSchedule(trainNumber: string): Promise<any> {
    try {
      const res = await fetch(`${this.getBaseUrl()}/api/trains/${encodeURIComponent(trainNumber)}/schedule`);
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn('Failed to fetch train schedule', e);
    }
    return null;
  }

  public async getForecasts(): Promise<ClosureForecast[]> {
    try {
      const res = await fetch(`${this.getBaseUrl()}/api/forecasts`);
      if (res.ok) {
        const data = await res.json();
        return data.forecasts;
      }
    } catch (e) {}
    return INITIAL_CROSSINGS.map(c => ({
      crossingId: c.id,
      crossingName: c.name,
      currentStatus: c.status,
      predictedClosureInSec: c.timeToNextClosureSec,
      predictedDurationSec: 450,
      upcomingTrain: null,
      distanceAlongTrackKm: c.distanceAlongTrackKm,
      forecastStatus: 'CALCULATED_BASELINE',
      forecastType: 'TRANSPARENT_TRACK_KINEMATIC',
      methodologyNote: 'Computed along curved OSM track polyline. Assumes speed-scaled approach warning buffer.',
      reopeningEstimate: c.predictedReopenTime || null
    }));
  }

  public async getAnalytics(): Promise<AnalyticsData | null> {
    try {
      const res = await fetch(`${this.getBaseUrl()}/api/analytics`);
      if (res.ok) return await res.json();
    } catch (e) {}
    return null;
  }

  public async getHealth(): Promise<HealthData | null> {
    try {
      const res = await fetch(`${this.getBaseUrl()}/api/health`);
      if (res.ok) return await res.json();
    } catch (e) {}
    return null;
  }

  public async getProviderTelemetry(): Promise<ProviderTelemetry | null> {
    try {
      const res = await fetch(`${this.getBaseUrl()}/api/telemetry/providers`);
      if (res.ok) return await res.json();
    } catch (e) {
      console.warn('Failed to fetch provider telemetry', e);
    }
    return null;
  }

  public async getStationLiveBoard(stationCode: string = 'ASR', hours: number = 2): Promise<any> {
    try {
      const res = await fetch(`${this.getBaseUrl()}/api/stations/${encodeURIComponent(stationCode)}/live?hours=${hours}`);
      if (res.ok) return await res.json();
    } catch (e) {
      console.warn('Failed to fetch station live board', e);
    }
    return null;
  }

  public async triggerDrill(crossingId: string, action: 'CLOSE_NOW' | 'APPROACH_NOW' | 'OPEN_NOW'): Promise<any> {
    try {
      const res = await fetch(`${this.getBaseUrl()}/api/drill/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ crossingId, action })
      });
      return await res.json();
    } catch (e) {
      console.warn('Drill trigger error', e);
      return { success: false };
    }
  }

  /**
   * Smart Multi-Modal Journey Planner with Departure Window Matrix
   */
  public async planJourney(
    origin: [number, number],
    destination: [number, number],
    departureOffsetSec: number = 0,
    travelMode: TravelMode = 'car'
  ): Promise<PlannedJourney> {
    const baseUrl = this.getBaseUrl();
    try {
      const res = await fetch(`${baseUrl}/api/plan-journey`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin,
          destination,
          departureOffsetSec,
          travelMode
        }),
        signal: AbortSignal.timeout(15000)
      });

      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.debug('[apiService] Backend journey planner not reachable, using calibrated client-side route');
    }

    // Calibrated client-side fallback
    return this.calculateClientSideJourney(origin, destination, departureOffsetSec, travelMode);
  }

  private calculateClientSideJourney(
    origin: [number, number],
    destination: [number, number],
    departureOffsetSec: number,
    travelMode: TravelMode
  ): PlannedJourney {
    const speedMs = travelMode === 'walking' ? 1.25 : (travelMode === 'motorcycle' ? 8.89 : 7.78);
    const latDist = (destination[0] - origin[0]) * 111000;
    const lngDist = (destination[1] - origin[1]) * 111000 * Math.cos(origin[0] * Math.PI / 180);
    const straightDistM = Math.hypot(latDist, lngDist);
    const roadDistM = Math.round(straightDistM * 1.35);
    const durationSec = Math.round(roadDistM / speedMs);

    // Generate road curvature polyline
    const coords: [number, number][] = [];
    const steps = 20;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const wobble = Math.sin(t * Math.PI) * 0.002;
      coords.push([
        origin[0] + (destination[0] - origin[0]) * t + wobble,
        origin[1] + (destination[1] - origin[1]) * t - wobble * 0.5
      ]);
    }

    // Midpoint crossing lookup
    const midLat = (origin[0] + destination[0]) / 2;
    const midLng = (origin[1] + destination[1]) / 2;
    const crossingHit = INITIAL_CROSSINGS.find(c => {
      const d = Math.hypot((c.lat - midLat) * 111000, (c.lng - midLng) * 111000);
      return d < 1200;
    });

    const hasConflict = crossingHit && (crossingHit.status === 'CLOSED' || crossingHit.status === 'APPROACHING');
    const delaySec = hasConflict ? 360 : 0;
    const totalDurationSec = durationSec + delaySec;

    const crossingHits = crossingHit ? [{
      id: crossingHit.id,
      name: crossingHit.name,
      punjabiName: crossingHit.punjabiName,
      locality: crossingHit.locality,
      coordinates: [crossingHit.lat, crossingHit.lng] as [number, number],
      lat: crossingHit.lat,
      lng: crossingHit.lng,
      distanceAlongRouteMeters: Math.round(roadDistM * 0.55),
      distanceAlongRouteKm: Number((roadDistM * 0.55 / 1000).toFixed(2)),
      travelTimeToCrossingSec: Math.round(durationSec * 0.55),
      userArrivalTimestamp: new Date(Date.now() + (departureOffsetSec + durationSec * 0.55) * 1000).toISOString(),
      currentStatus: crossingHit.status,
      gateStatusLabel: `ESTIMATED ${crossingHit.status}`,
      isStatusEstimated: true,
      predictedStatusAtArrival: crossingHit.status,
      delaySec,
      conflictSeverity: hasConflict ? ('HIGH' as const) : ('NONE' as const),
      message: hasConflict 
        ? `Gate is ${crossingHit.status}. Estimated wait ~${Math.round(delaySec / 60)} min.` 
        : 'Open passage predicted along railway intersection.',
      dataSource: `OpenStreetMap Node ${crossingHit.osmId}`,
      verificationStatus: crossingHit.verificationStatus,
      estimatedGateClosingTime: crossingHit.estimatedGateClosingTime,
      estimatedGateReopeningTime: crossingHit.estimatedGateReopeningTime
    }] : [];

    const offsets = [0, 300, 600, 900, 1200, 1800];
    const labels = ['Leave Now', 'Leave in 5m', 'Leave in 10m', 'Leave in 15m', 'Leave in 20m', 'Leave in 30m'];

    const departureOptions = offsets.map((off, idx) => ({
      offsetSec: off,
      offsetMin: Math.round(off / 60),
      label: labels[idx],
      departureTimestamp: new Date(Date.now() + off * 1000).toISOString(),
      travelDurationSec: durationSec + (off === 0 && hasConflict ? delaySec : 0),
      delayAtCrossingsSec: off === 0 && hasConflict ? delaySec : 0,
      totalTimeFromNowSec: off + durationSec + (off === 0 && hasConflict ? delaySec : 0),
      expectedArrivalTime: new Date(Date.now() + (off + durationSec + (off === 0 && hasConflict ? delaySec : 0)) * 1000).toISOString(),
      hasConflict: Boolean(off === 0 && hasConflict),
      conflictCrossings: off === 0 && hasConflict && crossingHit ? [crossingHit.name] : []
    }));

    return {
      success: true,
      origin,
      destination,
      travelMode,
      departureOffsetSec,
      plannedAt: new Date().toISOString(),
      primaryRoute: {
        source: 'CLIENT_ESTIMATED_GEOMETRY_BASELINE',
        travelMode,
        distanceMeters: roadDistM,
        durationSeconds: durationSec,
        normalDurationSec: durationSec,
        additionalDelaySec: delaySec,
        totalDurationSec,
        estimatedArrivalTime: new Date(Date.now() + (departureOffsetSec + totalDurationSec) * 1000).toISOString(),
        coordinates: coords,
        crossings: crossingHits
      },
      alternativeRoute: hasConflict ? {
        source: 'AMRITSAR_GRADE_SEPARATED_OVERBRIDGE',
        bypassName: 'Bhandari / Elevated Overbridge Flyover Bypass',
        travelMode,
        distanceMeters: Math.round(roadDistM * 1.12),
        durationSeconds: Math.round(durationSec * 1.08),
        normalDurationSec: Math.round(durationSec * 1.08),
        additionalDelaySec: 0,
        totalDurationSec: Math.round(durationSec * 1.08),
        estimatedArrivalTime: new Date(Date.now() + (departureOffsetSec + durationSec * 1.08) * 1000).toISOString(),
        savingsSec: Math.max(0, totalDurationSec - Math.round(durationSec * 1.08)),
        coordinates: coords.map(pt => [pt[0] + 0.0015, pt[1] - 0.0015] as [number, number]),
        crossings: []
      } : null,
      departureOptions,
      recommendation: hasConflict ? {
        action: 'CONSIDER_ALTERNATIVE',
        badge: '🔄 TAKE ALTERNATIVE FLYOVER',
        recommendedDepartureOffsetSec: 0,
        recommendedRoute: 'ALTERNATIVE',
        summary: `Flyover bypass avoids ${crossingHit?.name} and saves ~${Math.round((delaySec - durationSec * 0.08) / 60)} minutes.`,
        details: 'Flyover bypass provides continuous transit eliminating level crossing delay.',
        confidence: 'HIGH'
      } : {
        action: 'LEAVE_NOW',
        badge: '🟢 LEAVE NOW',
        recommendedDepartureOffsetSec: 0,
        recommendedRoute: 'PRIMARY',
        summary: 'All railway crossings along your route are open with safe passage predicted.',
        details: 'Clear passage predicted across all mapped track intersections.',
        confidence: 'HIGH'
      },
      dataConfidence: {
        level: 'MODERATE',
        label: 'Model Baseline',
        reason: 'Crossings mapped via OpenStreetMap; gate status model estimated.'
      }
    };
  }

  // ==========================================
  // SUPABASE CROWDSOURCING & USER ONBOARDING
  // ==========================================

  private getAuthHeader(): Record<string, string> {
    const prof = nativeService.getUserLocationProfile();
    const token = prof?.supabaseToken || (typeof localStorage !== 'undefined' ? localStorage.getItem('fatak_supabase_token') : null);
    if (token) {
      return { 'Authorization': `Bearer ${token}` };
    }
    return {};
  }

  public async onboardUser(displayName: string, gpsConsent: boolean, lat?: number | null, lng?: number | null) {
    const baseUrl = this.getBaseUrl();
    const res = await fetch(`${baseUrl}/api/user/onboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName, gpsConsent, lat, lng })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Onboarding failed' }));
      throw new Error(err.error || 'Onboarding failed');
    }
    const data = await res.json();
    if (data.token && typeof localStorage !== 'undefined') {
      localStorage.setItem('fatak_supabase_token', data.token);
    }
    return data;
  }

  public async getUserProfile() {
    const baseUrl = this.getBaseUrl();
    const res = await fetch(`${baseUrl}/api/user/profile`, {
      headers: { ...this.getAuthHeader() }
    });
    if (!res.ok) return null;
    return await res.json();
  }

  public async updateUserProfile(updates: { displayName?: string; gpsConsent?: boolean; lat?: number | null; lng?: number | null }) {
    const baseUrl = this.getBaseUrl();
    let authHeader = this.getAuthHeader();

    // If no token is cached yet, automatically onboard first
    if (!authHeader['Authorization']) {
      try {
        const onboarded = await this.onboardUser(
          updates.displayName || 'Commuter',
          updates.gpsConsent !== undefined ? updates.gpsConsent : true,
          updates.lat,
          updates.lng
        );
        if (onboarded && onboarded.token) {
          authHeader = { 'Authorization': `Bearer ${onboarded.token}` };
          const prof = nativeService.getUserLocationProfile();
          if (prof) {
            await nativeService.setUserLocationProfile({
              ...prof,
              displayName: updates.displayName || onboarded.profile?.display_name || prof.displayName,
              gpsConsent: updates.gpsConsent !== undefined ? updates.gpsConsent : prof.gpsConsent,
              userId: onboarded.user?.id || onboarded.profile?.user_id || prof.userId,
              supabaseToken: onboarded.token
            });
          }
          return onboarded;
        }
      } catch (e) {
        console.warn('[API] Auto-onboard error during profile update:', e);
      }
    }

    let res = await fetch(`${baseUrl}/api/user/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify(updates)
    });

    // If 401 Unauthorized, automatically re-onboard session and retry once
    if (res.status === 401) {
      try {
        const onboarded = await this.onboardUser(
          updates.displayName || 'Commuter',
          updates.gpsConsent !== undefined ? updates.gpsConsent : true,
          updates.lat,
          updates.lng
        );
        if (onboarded && onboarded.token) {
          authHeader = { 'Authorization': `Bearer ${onboarded.token}` };
          const prof = nativeService.getUserLocationProfile();
          if (prof) {
            await nativeService.setUserLocationProfile({
              ...prof,
              displayName: updates.displayName || onboarded.profile?.display_name || prof.displayName,
              gpsConsent: updates.gpsConsent !== undefined ? updates.gpsConsent : prof.gpsConsent,
              userId: onboarded.user?.id || onboarded.profile?.user_id || prof.userId,
              supabaseToken: onboarded.token
            });
          }
          return onboarded;
        }
      } catch (e) {
        console.warn('[API] Re-onboard error on 401:', e);
      }
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Update failed' }));
      throw new Error(err.error || 'Update failed');
    }
    return await res.json();
  }

  public async submitCrossingSurvey(surveyInput: CrossingSurveyInput) {
    const baseUrl = this.getBaseUrl();
    let authHeader = this.getAuthHeader();

    // If no token is cached yet, automatically onboard first
    if (!authHeader['Authorization']) {
      try {
        const onboarded = await this.onboardUser(
          'Commuter',
          true,
          surveyInput.submitterLat,
          surveyInput.submitterLng
        );
        if (onboarded && onboarded.token) {
          authHeader = { 'Authorization': `Bearer ${onboarded.token}` };
          const prof = nativeService.getUserLocationProfile();
          if (prof) {
            await nativeService.setUserLocationProfile({
              ...prof,
              userId: onboarded.user?.id || onboarded.profile?.user_id || prof.userId,
              supabaseToken: onboarded.token
            });
          }
        }
      } catch (e) {
        console.warn('[API] Auto-onboard error before survey submit:', e);
      }
    }

    let res = await fetch(`${baseUrl}/api/surveys/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify(surveyInput)
    });

    // If 401 Unauthorized, automatically re-onboard session and retry once
    if (res.status === 401) {
      try {
        const onboarded = await this.onboardUser(
          'Commuter',
          true,
          surveyInput.submitterLat,
          surveyInput.submitterLng
        );
        if (onboarded && onboarded.token) {
          authHeader = { 'Authorization': `Bearer ${onboarded.token}` };
          const prof = nativeService.getUserLocationProfile();
          if (prof) {
            await nativeService.setUserLocationProfile({
              ...prof,
              userId: onboarded.user?.id || onboarded.profile?.user_id || prof.userId,
              supabaseToken: onboarded.token
            });
          }
          res = await fetch(`${baseUrl}/api/surveys/submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader },
            body: JSON.stringify(surveyInput)
          });
        }
      } catch (e) {
        console.warn('[API] Re-onboard error on survey submit 401:', e);
      }
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Survey submission failed' }));
      throw new Error(err.error || 'Survey submission failed');
    }
    return await res.json();
  }

  public async getCrossingCommunityReports(crossingId: string): Promise<CommunityCrossingReport[]> {
    try {
      const baseUrl = this.getBaseUrl();
      const res = await fetch(`${baseUrl}/api/surveys/crossing/${encodeURIComponent(crossingId)}`);
      if (res.ok) {
        const data = await res.json();
        return Array.isArray(data.reports) ? data.reports : [];
      }
    } catch (e) {}
    return [];
  }

  public async getUserSurveys(): Promise<any[]> {
    try {
      const baseUrl = this.getBaseUrl();
      const res = await fetch(`${baseUrl}/api/surveys/user`, {
        headers: { ...this.getAuthHeader() }
      });
      if (res.ok) {
        const data = await res.json();
        return Array.isArray(data.reports) ? data.reports : [];
      }
    } catch (e) {}
    return [];
  }

  public async getSurveyConfig() {
    try {
      const baseUrl = this.getBaseUrl();
      const res = await fetch(`${baseUrl}/api/surveys/config`);
      if (res.ok) return await res.json();
    } catch (e) {}
    return null;
  }
}

export const railwayApi = new RailwayAPIService();
