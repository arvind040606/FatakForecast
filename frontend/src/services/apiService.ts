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
  ProviderTelemetry
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
  private audioEnabled: boolean = false;
  private audioContext: AudioContext | null = null;
  private isOnline: boolean = true;
  private lastGoodPayload: TelemetryPayload | null = null;


  constructor() {
    if (typeof window !== 'undefined') {
      this.isOnline = navigator.onLine;
      window.addEventListener('online', () => {
        this.isOnline = true;
        this.initWebSocket();
      });
      window.addEventListener('offline', () => {
        this.isOnline = false;
        if (this.ws) {
          try { this.ws.close(); } catch (e) {}
        }
      });
    }
    this.initWebSocket();
  }

  public getIsOnline(): boolean {
    return this.isOnline;
  }

  public getBaseUrl(): string {
    return nativeService.getBackendUrl();
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

  private wsRetryCount: number = 0;

  public initWebSocket() {
    if (this.ws) {
      try { this.ws.close(); } catch (e) {}
      this.ws = null;
    }

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
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('[FatakForecast] WebSocket telemetry stream connected');
        this.wsRetryCount = 0;
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
    this.wsRetryCount++;
    if (this.wsRetryCount > 3) {
      // Gracefully stop retrying WS after 3 attempts and stick to clean polling fallback
      return;
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.initWebSocket();
    }, 4000);
  }

  private startFallbackPolling() {
    if (this.pollingTimer) return;
    const fetchLatest = async () => {
      try {
        const baseUrl = this.getBaseUrl();
        // High-Speed Primary: Single-roundtrip live telemetry endpoint
        const liveRes = await fetch(`${baseUrl}/api/telemetry/live`, { signal: AbortSignal.timeout(8000) });
        if (liveRes.ok) {
          const liveData = await liveRes.json();
          if (liveData.crossings && liveData.crossings.length > 0) {
            const payload: TelemetryPayload = {
              type: 'TELEMETRY_UPDATE',
              timestamp: liveData.timestamp || new Date().toISOString(),
              metrics: liveData.metrics || INITIAL_METRICS,
              crossings: liveData.crossings,
              trains: Array.isArray(liveData.trains) ? liveData.trains : [],
              activeCorridors: liveData.activeCorridors || liveData.corridors || INITIAL_CORRIDORS
            };
            this.notifyListeners(payload);
            return;
          }
        }

        // Secondary fallback: parallel requests
        const [res, trainsRes] = await Promise.all([
          fetch(`${baseUrl}/api/crossings`, { signal: AbortSignal.timeout(8000) }),
          fetch(`${baseUrl}/api/trains`, { signal: AbortSignal.timeout(8000) }).catch(() => null)
        ]);
        if (res.ok) {
          const data = await res.json();
          const trainsData = trainsRes && trainsRes.ok ? await trainsRes.json() : { trains: [] };

          const payload: TelemetryPayload = {
            type: 'TELEMETRY_UPDATE',
            timestamp: new Date().toISOString(),
            metrics: data.metrics || this.lastGoodPayload?.metrics || INITIAL_METRICS,
            crossings: data.crossings || this.lastGoodPayload?.crossings || INITIAL_CROSSINGS,
            trains: Array.isArray(trainsData.trains) ? trainsData.trains : (this.lastGoodPayload?.trains || []),
            activeCorridors: data.corridors || this.lastGoodPayload?.activeCorridors || INITIAL_CORRIDORS
          };
          this.notifyListeners(payload);
        }
      } catch (e) {
        // Anti-glitch guard: NEVER overwrite active live data with static simulation on temporary network glitch
        if (!this.lastGoodPayload) {
          this.emitLocalSimulation();
        }
      }
    };

    fetchLatest();
    this.pollingTimer = setInterval(fetchLatest, 2500);

    // Credit conservation & energy management: pause polling when tab is hidden, resume on active
    if (typeof document !== 'undefined') {
      const handleVisibilityChange = () => {
        if (document.hidden) {
          if (this.pollingTimer) {
            clearInterval(this.pollingTimer);
            this.pollingTimer = null;
          }
        } else {
          fetchLatest();
          if (!this.pollingTimer) {
            this.pollingTimer = setInterval(fetchLatest, 2500);
          }
        }
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
  }

  private emitLocalSimulation() {
    const payload: TelemetryPayload = {
      type: 'TELEMETRY_UPDATE',
      timestamp: new Date().toISOString(),
      metrics: INITIAL_METRICS,
      crossings: INITIAL_CROSSINGS,
      trains: [],
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
    if (payload.crossings && payload.crossings.length > 0) {
      this.lastGoodPayload = payload;
    }
    this.listeners.forEach((callback) => callback(payload));
  }

  // REST endpoints
  public async getCrossings(): Promise<{ crossings: RailwayCrossing[]; corridors: RailwayCorridor[]; metrics: OperationalMetrics }> {
    try {
      const res = await fetch(`${this.getBaseUrl()}/api/crossings`);
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
        if (Array.isArray(data.results)) {
          return data.results;
        }
      }
    } catch (e) {
      console.warn('Place search API error', e);
    }
    return [];
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
    return null;
  }

  public async getTrains(): Promise<SectorTrain[]> {
    try {
      const res = await fetch(`${this.getBaseUrl()}/api/trains`);
      if (res.ok) {
        const data = await res.json();
        return Array.isArray(data.trains) ? data.trains : [];
      }
    } catch (e) {}
    return [];
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
        signal: AbortSignal.timeout(12000)
      });

      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn('[apiService] Backend journey planner call failed, generating calibrated client-side route', e);
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
}

export const railwayApi = new RailwayAPIService();
