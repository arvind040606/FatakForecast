import {
  RailwayCrossing,
  SectorTrain,
  RailwayCorridor,
  OperationalMetrics,
  TelemetryPayload,
  ClosureForecast,
  AnalyticsData,
  HealthData
} from '../types';
import {
  INITIAL_CROSSINGS,
  INITIAL_TRAINS,
  INITIAL_CORRIDORS,
  INITIAL_METRICS
} from './amritsarData';

class RailwayAPIService {
  private ws: WebSocket | null = null;
  private reconnectTimer: any = null;
  private pollingTimer: any = null;
  private listeners: Set<(payload: TelemetryPayload) => void> = new Set();
  private audioEnabled: boolean = false;
  private audioContext: AudioContext | null = null;

  constructor() {
    this.initWebSocket();
  }

  public setAudioEnabled(enabled: boolean) {
    this.audioEnabled = enabled;
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

  private initWebSocket() {
    const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('[FatakForecast] WebSocket telemetry stream connected');
        if (this.pollingTimer) {
          clearInterval(this.pollingTimer);
          this.pollingTimer = null;
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as TelemetryPayload;
          this.notifyListeners(payload);
        } catch (err) {
          console.error('[FatakForecast] Error parsing WS telemetry payload', err);
        }
      };

      this.ws.onerror = () => {
        // Fallback to polling
        this.startFallbackPolling();
      };

      this.ws.onclose = () => {
        this.startFallbackPolling();
        this.scheduleReconnect();
      };
    } catch (err) {
      this.startFallbackPolling();
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.initWebSocket();
    }, 4000);
  }

  private startFallbackPolling() {
    if (this.pollingTimer) return;
    this.pollingTimer = setInterval(async () => {
      try {
        const res = await fetch('/api/crossings');
        if (res.ok) {
          const data = await res.json();
          const trainsRes = await fetch('/api/trains');
          const trainsData = trainsRes.ok ? await trainsRes.json() : { trains: INITIAL_TRAINS };

          const payload: TelemetryPayload = {
            type: 'TELEMETRY_UPDATE',
            timestamp: new Date().toISOString(),
            metrics: data.metrics || INITIAL_METRICS,
            crossings: data.crossings || INITIAL_CROSSINGS,
            trains: trainsData.trains || INITIAL_TRAINS,
            activeCorridors: data.corridors || INITIAL_CORRIDORS
          };
          this.notifyListeners(payload);
        }
      } catch (e) {
        // Local simulation fallback
        this.emitLocalSimulation();
      }
    }, 2000);
  }

  private emitLocalSimulation() {
    const payload: TelemetryPayload = {
      type: 'TELEMETRY_UPDATE',
      timestamp: new Date().toISOString(),
      metrics: INITIAL_METRICS,
      crossings: INITIAL_CROSSINGS,
      trains: INITIAL_TRAINS,
      activeCorridors: INITIAL_CORRIDORS
    };
    this.notifyListeners(payload);
  }

  public subscribe(callback: (payload: TelemetryPayload) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notifyListeners(payload: TelemetryPayload) {
    this.listeners.forEach((callback) => callback(payload));
  }

  // REST endpoints
  public async getCrossings(): Promise<{ crossings: RailwayCrossing[]; corridors: RailwayCorridor[]; metrics: OperationalMetrics }> {
    try {
      const res = await fetch('/api/crossings');
      if (res.ok) return await res.json();
    } catch (e) {}
    return {
      crossings: INITIAL_CROSSINGS,
      corridors: INITIAL_CORRIDORS,
      metrics: INITIAL_METRICS
    };
  }

  public async getCrossingDetail(id: string): Promise<any> {
    try {
      const res = await fetch(`/api/crossings/${id}`);
      if (res.ok) return await res.json();
    } catch (e) {}
    const c = INITIAL_CROSSINGS.find(item => item.id.toLowerCase() === id.toLowerCase());
    return { crossing: c, historicalStats: { dailyClosuresAvg: 24, avgGateDwellMinutes: 8.5, peakClosureHours: ['08:00 - 10:00', '17:00 - 19:30'] } };
  }

  public async getTrains(): Promise<SectorTrain[]> {
    try {
      const res = await fetch('/api/trains');
      if (res.ok) {
        const data = await res.json();
        return data.trains;
      }
    } catch (e) {}
    return INITIAL_TRAINS;
  }

  public async getForecasts(): Promise<ClosureForecast[]> {
    try {
      const res = await fetch('/api/forecasts');
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
      predictedDurationSec: Math.round(c.avgClosureDurationMin * 60),
      confidenceScore: c.status === 'CLOSED' ? 0.99 : 0.91,
      upcomingTrain: INITIAL_TRAINS.find(t => t.number === c.upcomingTrainId) || null,
      reliabilityTag: 'CALIBRATED_BLOCK_RELAY',
      reopeningEstimate: c.predictedReopenTime
    }));
  }

  public async getAnalytics(): Promise<AnalyticsData | null> {
    try {
      const res = await fetch('/api/analytics');
      if (res.ok) return await res.json();
    } catch (e) {}
    return null;
  }

  public async getHealth(): Promise<HealthData | null> {
    try {
      const res = await fetch('/api/health');
      if (res.ok) return await res.json();
    } catch (e) {}
    return null;
  }

  public async triggerDrill(crossingId: string, action: 'CLOSE_NOW' | 'APPROACH_NOW' | 'OPEN_NOW'): Promise<any> {
    try {
      const res = await fetch('/api/drill/trigger', {
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
}

export const railwayApi = new RailwayAPIService();
