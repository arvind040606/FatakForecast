// =========================================================================
// FATAKFORECAST — ANDROID NATIVE & PLATFORM INTEGRATION SERVICE
// Capacitor Native Plugins with Universal Web & Desktop Fallbacks
// Features: Geolocation, Local Notifications, Haptics, Preferences, Privacy,
// Real Geocoding (OSM Nominatim) and Persistent Database-backed Saved Places
// =========================================================================

import { Geolocation, Position } from '@capacitor/geolocation';
import { LocalNotifications, ScheduleOptions } from '@capacitor/local-notifications';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Preferences } from '@capacitor/preferences';
import { StatusBar, Style } from '@capacitor/status-bar';
import { 
  SavedPlace, 
  SavedPlaceCategory, 
  NotificationPreferences, 
  AppNotification, 
  TravelMode,
  PlaceSearchResult,
  SmartCommuteAlarm,
  AlarmRecurrence,
  CommuteAlarmDepartureEstimate
} from '../types';
import { AMRITSAR_LANDMARKS } from '../data/landmarks';
import { INITIAL_CROSSINGS } from './amritsarData';

const DEFAULT_NOTIFICATION_PREFS: NotificationPreferences = {
  departureReminders: true,
  crossingStatusChanges: true,
  routeEtaChanges: true,
  activeRouteWarnings: true,
  providerOutages: true
};

// Demo places are isolated here and ONLY returned when demoMode is explicitly toggled by user
export const DEMO_PRESET_PLACES: SavedPlace[] = [
  {
    id: 'demo_place_home',
    name: 'Home (Ranjit Avenue B-Block)',
    category: 'HOME',
    lat: 31.6540,
    lng: 74.8580,
    address: 'Ranjit Avenue, Amritsar, Punjab',
    createdAt: '2026-10-09T00:00:00.000Z'
  },
  {
    id: 'demo_place_college',
    name: 'Guru Nanak Dev University (GNDU Campus)',
    category: 'COLLEGE',
    lat: 31.6366,
    lng: 74.8258,
    address: 'Grand Trunk Road, Kot Khalsa, Amritsar, Punjab',
    createdAt: '2026-10-09T00:00:00.000Z'
  },
  {
    id: 'demo_place_work',
    name: 'Northern Railway Divisional Office (ASR)',
    category: 'WORK',
    lat: 31.6338,
    lng: 74.8655,
    address: 'Railway Station Road, Amritsar Junction',
    createdAt: '2026-10-09T00:00:00.000Z'
  }
];

class NativeService {
  private isCapacitorNative: boolean = false;
  private backendBaseUrl: string = '';
  private notificationHistory: AppNotification[] = [];
  private notificationPrefs: NotificationPreferences = { ...DEFAULT_NOTIFICATION_PREFS };
  private savedPlaces: SavedPlace[] = []; // Starts completely empty in production
  private smartAlarms: SmartCommuteAlarm[] = []; // User-configured smart departure alarms
  private recentNotificationsSent: Set<string> = new Set();
  private travelModePreference: TravelMode = 'car';
  private demoModeActive: boolean = false;
  private audioCtx: AudioContext | null = null;
  private searchPlacesCache = new Map<string, { data: PlaceSearchResult[]; timestamp: number }>();
  private readonly SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;

  constructor() {
    this.isCapacitorNative = typeof (window as any)?.Capacitor !== 'undefined' && 
                             (window as any)?.Capacitor?.isNativePlatform?.() === true;
    this.initPlatformSettings();
    this.loadPersistedData();
  }

  public isNative(): boolean {
    return this.isCapacitorNative;
  }

  public isDemoMode(): boolean {
    return this.demoModeActive;
  }

  public setDemoMode(active: boolean) {
    this.demoModeActive = active;
  }

  private async initPlatformSettings() {
    try {
      if (this.isCapacitorNative) {
        await StatusBar.setStyle({ style: Style.Dark });
        await StatusBar.setBackgroundColor({ color: '#070b14' });
        await LocalNotifications.registerActionTypes({
          types: [
            {
              id: 'COMMUTE_ALARM_ACTIONS',
              actions: [
                { id: 'VIEW_ROUTE', title: 'View Route' },
                { id: 'SNOOZE', title: 'Snooze 5m' }
              ]
            }
          ]
        });
        LocalNotifications.addListener('localNotificationActionPerformed', async (action) => {
          if (action.actionId === 'SNOOZE') {
            const snoozeDate = new Date(Date.now() + 5 * 60 * 1000);
            await this.scheduleNotification({
              title: `⏰ Snoozed Commute Alarm`,
              body: `Snooze period finished. Depart now to avoid fatak closures.`,
              category: 'departureReminders',
              scheduledDate: snoozeDate
            });
            this.triggerHaptic('warning');
          } else if (action.actionId === 'VIEW_ROUTE') {
            if (typeof window !== 'undefined' && window.location) {
              window.history.pushState({}, '', '/planner');
              window.dispatchEvent(new PopStateEvent('popstate'));
            }
          }
        });
      }
    } catch (e) {
      // Non-critical platform setting
    }
  }

  // ==========================================
  // PERSISTENCE (Preferences / LocalStorage / Server DB)
  // ==========================================

  private async loadPersistedData() {
    try {
      // 1. Backend URL
      const storedUrl = await this.storageGet('fatak_backend_url');
      if (storedUrl) {
        this.backendBaseUrl = storedUrl;
      } else {
        this.backendBaseUrl = this.getDefaultBackendUrl();
      }

      // 2. Fetch Saved Places from Server Database
      await this.refreshSavedPlacesFromServer();

      // 3. Notification Preferences
      const storedPrefs = await this.storageGet('fatak_notification_prefs');
      if (storedPrefs) {
        try {
          this.notificationPrefs = { ...DEFAULT_NOTIFICATION_PREFS, ...JSON.parse(storedPrefs) };
        } catch (e) {}
      }

      // 4. Notification History
      const storedHistory = await this.storageGet('fatak_notification_history');
      if (storedHistory) {
        try {
          this.notificationHistory = JSON.parse(storedHistory);
        } catch (e) {}
      }

      // 5. Travel Mode Preference
      const storedMode = await this.storageGet('fatak_travel_mode');
      if (storedMode && (storedMode === 'car' || storedMode === 'motorcycle' || storedMode === 'walking')) {
        this.travelModePreference = storedMode as TravelMode;
      }

      // 6. Smart Commute Alarms
      const storedAlarms = await this.storageGet('fatak_smart_alarms');
      if (storedAlarms) {
        try {
          this.smartAlarms = JSON.parse(storedAlarms);
        } catch (e) {}
      }
    } catch (err) {
      console.warn('[NativeService] Load persisted data error:', err);
    }
  }

  private async storageGet(key: string): Promise<string | null> {
    try {
      if (this.isCapacitorNative) {
        const { value } = await Preferences.get({ key });
        return value;
      }
    } catch (e) {}
    return localStorage.getItem(key);
  }

  private async storageSet(key: string, value: string): Promise<void> {
    try {
      if (this.isCapacitorNative) {
        await Preferences.set({ key, value });
      }
    } catch (e) {}
    try {
      localStorage.setItem(key, value);
    } catch (e) {}
  }

  // ==========================================
  // BACKEND SERVER URL MANAGEMENT
  // ==========================================

  public getDefaultBackendUrl(): string {
    if (typeof window !== 'undefined') {
      const viteEnvUrl = (import.meta as any).env?.VITE_BACKEND_URL;
      if (viteEnvUrl) return String(viteEnvUrl).replace(/\/+$/, '');

      // In Capacitor native mobile app
      if (this.isCapacitorNative) {
        return 'http://10.59.115.230:8787';
      }

      const hostname = window.location.hostname;
      // Local development on PC loopback
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'http://localhost:8787';
      }

      // If browsing via LAN IP on Wi-Fi (e.g., http://10.59.115.230:5173)
      if (/^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(hostname)) {
        return `http://${hostname}:8787`;
      }

      // If hosted on Vercel, route to same-origin APIs
      if (window.location.hostname.includes('vercel.app')) {
        return window.location.origin;
      }

      // If hosted on general HTTPS
      if (window.location.protocol === 'https:') {
        return window.location.origin;
      }

      return window.location.origin || 'http://localhost:8787';
    }
    return 'http://localhost:8787';
  }

  public getBackendUrl(): string {
    if (this.backendBaseUrl) return this.backendBaseUrl;
    return this.getDefaultBackendUrl();
  }

  public async setBackendUrl(url: string): Promise<void> {
    const cleanUrl = url.trim().replace(/\/+$/, '');
    this.backendBaseUrl = cleanUrl;
    await this.storageSet('fatak_backend_url', cleanUrl);
    await this.refreshSavedPlacesFromServer();
  }

  public async testBackendReachability(url?: string): Promise<{ success: boolean; latencyMs?: number; error?: string }> {
    const target = (url || this.getBackendUrl()).replace(/\/+$/, '');
    const startTime = Date.now();
    try {
      const res = await fetch(`${target}/api/ping`, {
        signal: AbortSignal.timeout(4000)
      });
      const latencyMs = Date.now() - startTime;
      if (res.ok) {
        return { success: true, latencyMs };
      }
      return { success: false, error: `HTTP ${res.status}: ${res.statusText}` };
    } catch (err: any) {
      return { success: false, error: err.message || 'Connection timed out' };
    }
  }

  // ==========================================
  // REAL PLACE SEARCH & GEOCODING (OSM NOMINATIM)
  // ==========================================

  public searchLocalLandmarks(query: string, limit: number = 6): PlaceSearchResult[] {
    const q = (query || '').trim().toLowerCase();
    if (q.length < 2) return [];

    const matches: PlaceSearchResult[] = [];

    // 1. Saved Places
    for (const sp of this.savedPlaces) {
      if (sp.name.toLowerCase().includes(q) || (sp.address && sp.address.toLowerCase().includes(q))) {
        matches.push({
          placeId: `saved_${sp.id}`,
          name: sp.name,
          displayName: sp.address || `${sp.name}, Amritsar`,
          locality: 'Saved Location',
          lat: sp.lat,
          lng: sp.lng,
          category: sp.category,
          provider: 'Saved Locations'
        });
      }
    }

    // 2. Verified Amritsar Landmarks
    for (const lm of AMRITSAR_LANDMARKS) {
      if (lm.name.toLowerCase().includes(q) || lm.punjabi.toLowerCase().includes(q) || lm.category.toLowerCase().includes(q)) {
        matches.push({
          placeId: `landmark_${lm.id}`,
          name: lm.name,
          displayName: `${lm.name}, Amritsar, Punjab`,
          locality: lm.category,
          lat: lm.lat,
          lng: lm.lng,
          category: lm.category,
          provider: 'Amritsar Authoritative Landmarks'
        });
      }
    }

    // 3. Railway Crossings (Jaura Phatak, Verka, etc.)
    for (const cr of INITIAL_CROSSINGS) {
      if (cr.name.toLowerCase().includes(q) || (cr.punjabiName && cr.punjabiName.toLowerCase().includes(q)) || (cr.locality && cr.locality.toLowerCase().includes(q))) {
        matches.push({
          placeId: `crossing_${cr.id}`,
          name: cr.name,
          displayName: `${cr.name} Level Crossing (${cr.punjabiName || ''}), Amritsar`,
          locality: cr.locality || 'Railway Crossing',
          lat: cr.lat,
          lng: cr.lng,
          category: 'Level Crossing',
          provider: 'OpenStreetMap Rail Network'
        });
      }
    }

    return matches.slice(0, limit);
  }

  public async searchPlaces(query: string, limit: number = 6): Promise<PlaceSearchResult[]> {
    const q = (query || '').trim().toLowerCase();
    if (q.length < 2) return [];

    const cacheKey = `${q}_${limit}`;
    const cached = this.searchPlacesCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.SEARCH_CACHE_TTL_MS) {
      return cached.data;
    }

    try {
      const target = this.getBackendUrl();
      const url = `${target}/api/places/search?q=${encodeURIComponent(query.trim())}&limit=${limit}`;

      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (res.ok) {
        const data = await res.json();
        const results: PlaceSearchResult[] = data.results || [];
        if (results.length > 0) {
          this.searchPlacesCache.set(cacheKey, { data: results, timestamp: Date.now() });
          return results;
        }
      }
    } catch (e) {
      console.warn('[NativeService] Online place search unavailable, using local landmarks fallback', e);
    }

    // High quality offline fallback across Amritsar points of interest
    const fallbackResults = this.searchLocalLandmarks(query, limit);
    this.searchPlacesCache.set(cacheKey, { data: fallbackResults, timestamp: Date.now() });
    return fallbackResults;
  }

  public async reverseGeocode(lat: number, lng: number): Promise<PlaceSearchResult | null> {
    try {
      const target = this.getBackendUrl();
      const url = `${target}/api/places/reverse?lat=${lat}&lng=${lng}`;

      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (res.ok) {
        const data = await res.json();
        if (data.place) return data.place;
      }
    } catch (e) {
      console.warn('[NativeService] Reverse geocode network error, using proximity resolver', e);
    }

    // Proximity fallback to nearest Amritsar landmark or crossing
    let nearest: { name: string; distM: number; category: string } | null = null;
    for (const lm of AMRITSAR_LANDMARKS) {
      const d = Math.hypot((lm.lat - lat) * 111000, (lm.lng - lng) * 111000);
      if (!nearest || d < nearest.distM) {
        nearest = { name: lm.name, distM: d, category: lm.category };
      }
    }

    if (nearest && nearest.distM < 3000) {
      return {
        placeId: `rev_prox_${Date.now()}`,
        name: `Near ${nearest.name}`,
        displayName: `Near ${nearest.name}, Amritsar (${Math.round(nearest.distM)}m)`,
        locality: nearest.category,
        lat,
        lng,
        category: 'Proximity',
        provider: 'Local Geographic Proximity'
      };
    }

    return {
      placeId: `rev_coord_${Date.now()}`,
      name: `Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
      displayName: `Map Point (${lat.toFixed(4)}, ${lng.toFixed(4)}), Amritsar`,
      locality: 'Amritsar District',
      lat,
      lng,
      category: 'Map Selection',
      provider: 'Direct Map Coordinates'
    };
  }

  // ==========================================
  // GEOLOCATION & GPS PERMISSIONS
  // ==========================================

  public async checkLocationPermission(): Promise<'prompt' | 'granted' | 'denied'> {
    try {
      if (this.isCapacitorNative) {
        const status = await Geolocation.checkPermissions();
        if (status.location === 'granted') return 'granted';
        if (status.location === 'denied') return 'denied';
        return 'prompt';
      }
      if ('permissions' in navigator) {
        const res = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
        return res.state as 'prompt' | 'granted' | 'denied';
      }
    } catch (e) {}
    return 'prompt';
  }

  public async requestLocationPermission(): Promise<boolean> {
    try {
      if (this.isCapacitorNative) {
        const res = await Geolocation.requestPermissions();
        return res.location === 'granted';
      }
      return new Promise<boolean>((resolve) => {
        if (!navigator.geolocation) return resolve(false);
        navigator.geolocation.getCurrentPosition(
          () => resolve(true),
          () => resolve(false),
          { timeout: 5000 }
        );
      });
    } catch (e) {
      return false;
    }
  }

  public async getCurrentPosition(): Promise<{ lat: number; lng: number; accuracyMeters: number } | null> {
    try {
      if (this.isCapacitorNative) {
        const pos: Position = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 3000
        });
        return {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyMeters: Math.round(pos.coords.accuracy || 10)
        };
      }

      return new Promise((resolve) => {
        if (!navigator.geolocation) return resolve(null);
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            resolve({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracyMeters: Math.round(pos.coords.accuracy || 15)
            });
          },
          (err) => {
            console.warn('[NativeService] GPS position lookup failed', err);
            resolve(null);
          },
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 5000 }
        );
      });
    } catch (err) {
      console.warn('[NativeService] Error acquiring position', err);
      return null;
    }
  }

  /**
   * Approximate Geolocation from Server-Side IPstack API
   * Secure: key never leaks to client; clearly labeled as approximate
   */
  public async getIpLocation(): Promise<{
    lat: number;
    lng: number;
    city: string;
    region: string;
    isApproximate: boolean;
    accuracy: string;
    provider: string;
  } | null> {
    try {
      const url = `${this.getBackendUrl()}/api/location/ip`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = await res.json();
        if (data.success && typeof data.lat === 'number' && typeof data.lng === 'number') {
          return {
            lat: data.lat,
            lng: data.lng,
            city: data.city || 'Punjab',
            region: data.region || 'India',
            isApproximate: true,
            accuracy: 'APPROXIMATE_IP',
            provider: 'IPstack Geolocation API'
          };
        }
      }
    } catch (e) {
      console.warn('[NativeService] IP location lookup failed', e);
    }
    return null;
  }

  /**
   * Acquire Position preferring Device GPS, falling back gracefully to IPstack
   */
  public async getPositionWithFallback(): Promise<{
    lat: number;
    lng: number;
    source: 'GPS_HARDWARE' | 'APPROXIMATE_IP';
    label: string;
    accuracyMeters?: number;
  } | null> {
    const gps = await this.getCurrentPosition();
    if (gps) {
      return {
        lat: gps.lat,
        lng: gps.lng,
        source: 'GPS_HARDWARE',
        label: 'Device GPS (Precise)',
        accuracyMeters: gps.accuracyMeters
      };
    }

    const ipLoc = await this.getIpLocation();
    if (ipLoc) {
      return {
        lat: ipLoc.lat,
        lng: ipLoc.lng,
        source: 'APPROXIMATE_IP',
        label: `Approximate IP Location (${ipLoc.city}, ${ipLoc.region})`
      };
    }

    return null;
  }

  // ==========================================
  // HAPTIC FEEDBACK
  // ==========================================

  public async triggerHaptic(type: 'light' | 'medium' | 'warning' | 'success') {
    try {
      if (this.isCapacitorNative) {
        if (type === 'light') {
          await Haptics.impact({ style: ImpactStyle.Light });
        } else if (type === 'medium') {
          await Haptics.impact({ style: ImpactStyle.Medium });
        } else if (type === 'warning') {
          await Haptics.notification({ type: NotificationType.Warning });
        } else {
          await Haptics.notification({ type: NotificationType.Success });
        }
        return;
      }

      if ('vibrate' in navigator) {
        if (type === 'light') navigator.vibrate(25);
        else if (type === 'medium') navigator.vibrate(50);
        else if (type === 'warning') navigator.vibrate([80, 50, 80]);
        else navigator.vibrate([40, 30, 40]);
      }
    } catch (e) {}
  }

  // ==========================================
  // NOTIFICATIONS (Local Scheduled & Real-Time)
  // ==========================================

  public async checkNotificationPermission(): Promise<'prompt' | 'granted' | 'denied'> {
    try {
      if (this.isCapacitorNative) {
        const perm = await LocalNotifications.checkPermissions();
        if (perm.display === 'granted') return 'granted';
        if (perm.display === 'denied') return 'denied';
        return 'prompt';
      }

      if ('Notification' in window) {
        if (Notification.permission === 'granted') return 'granted';
        if (Notification.permission === 'denied') return 'denied';
        return 'prompt';
      }
    } catch (e) {}
    return 'prompt';
  }

  public async requestNotificationPermission(): Promise<boolean> {
    try {
      if (this.isCapacitorNative) {
        const res = await LocalNotifications.requestPermissions();
        return res.display === 'granted';
      }

      if ('Notification' in window) {
        const res = await Notification.requestPermission();
        return res === 'granted';
      }
    } catch (e) {}
    return false;
  }

  public async scheduleNotification(options: {
    title: string;
    body: string;
    category: keyof NotificationPreferences;
    scheduledDate?: Date;
    crossingId?: string;
  }): Promise<boolean> {
    const { title, body, category, scheduledDate, crossingId } = options;

    if (!this.notificationPrefs[category]) {
      return false;
    }

    const dedupeKey = `${category}_${title}_${body.slice(0, 30)}`;
    if (this.recentNotificationsSent.has(dedupeKey)) {
      return false;
    }
    this.recentNotificationsSent.add(dedupeKey);
    setTimeout(() => this.recentNotificationsSent.delete(dedupeKey), 4 * 60 * 1000);

    const notificationId = Math.floor(Math.random() * 1000000);
    const newRecord: AppNotification = {
      id: String(notificationId),
      title,
      body,
      category,
      timestamp: new Date().toISOString(),
      crossingId,
      isRead: false,
      scheduledFor: scheduledDate ? scheduledDate.toISOString() : undefined
    };

    this.notificationHistory.unshift(newRecord);
    if (this.notificationHistory.length > 50) {
      this.notificationHistory = this.notificationHistory.slice(0, 50);
    }
    this.saveNotificationHistory();
    this.triggerHaptic(category === 'activeRouteWarnings' ? 'warning' : 'medium');

    try {
      if (this.isCapacitorNative) {
        const schedulePayload: ScheduleOptions = {
          notifications: [
            {
              id: notificationId,
              title,
              body,
              schedule: scheduledDate ? { at: scheduledDate } : undefined,
              sound: 'beep.wav',
              smallIcon: 'ic_stat_train',
              extra: { crossingId, category }
            }
          ]
        };
        await LocalNotifications.schedule(schedulePayload);
        return true;
      }

      if ('Notification' in window && Notification.permission === 'granted') {
        if (scheduledDate) {
          const delayMs = scheduledDate.getTime() - Date.now();
          if (delayMs > 0) {
            setTimeout(() => {
              new Notification(title, { body, icon: '/favicon.ico' });
            }, delayMs);
            return true;
          }
        }
        new Notification(title, { body, icon: '/favicon.ico' });
        return true;
      }
    } catch (err) {
      console.warn('[NativeService] Failed to schedule notification', err);
    }

    return true;
  }

  public async cancelAllScheduledNotifications(): Promise<void> {
    try {
      if (this.isCapacitorNative) {
        const pending = await LocalNotifications.getPending();
        if (pending.notifications.length > 0) {
          await LocalNotifications.cancel({ notifications: pending.notifications });
        }
      }
    } catch (e) {}
  }

  public getNotificationPreferences(): NotificationPreferences {
    return { ...this.notificationPrefs };
  }

  public async updateNotificationPreferences(prefs: Partial<NotificationPreferences>): Promise<void> {
    this.notificationPrefs = { ...this.notificationPrefs, ...prefs };
    await this.storageSet('fatak_notification_prefs', JSON.stringify(this.notificationPrefs));
  }

  public getNotificationHistory(): AppNotification[] {
    return [...this.notificationHistory];
  }

  public async markNotificationAsRead(id: string): Promise<void> {
    this.notificationHistory = this.notificationHistory.map(n => n.id === id ? { ...n, isRead: true } : n);
    await this.saveNotificationHistory();
  }

  // ==========================================
  // SMART COMMUTE ALARMS & DEPARTURE REMINDERS
  // ==========================================

  public getSmartAlarms(): SmartCommuteAlarm[] {
    return [...this.smartAlarms];
  }

  public async saveSmartAlarm(alarm: SmartCommuteAlarm): Promise<void> {
    const existingIdx = this.smartAlarms.findIndex(a => a.id === alarm.id);
    if (existingIdx !== -1) {
      this.smartAlarms[existingIdx] = alarm;
    } else {
      this.smartAlarms.unshift(alarm);
    }
    await this.storageSet('fatak_smart_alarms', JSON.stringify(this.smartAlarms));
  }

  public async deleteSmartAlarm(id: string): Promise<void> {
    this.smartAlarms = this.smartAlarms.filter(a => a.id !== id);
    await this.storageSet('fatak_smart_alarms', JSON.stringify(this.smartAlarms));
  }

  public async toggleSmartAlarm(id: string, enabled: boolean): Promise<void> {
    this.smartAlarms = this.smartAlarms.map(a => a.id === id ? { ...a, enabled } : a);
    await this.storageSet('fatak_smart_alarms', JSON.stringify(this.smartAlarms));
  }

  /**
   * Intelligent departure calculation for a smart commute alarm (Requirement 6)
   * Arrival deadline - Preparation time - Estimated route duration - Crossing delay allowance
   */
  public calculateAlarmDeparture(
    alarm: SmartCommuteAlarm,
    routeDurationSec?: number | null,
    routeDistanceMeters?: number | null,
    crossingDelaySec?: number | null
  ): CommuteAlarmDepartureEstimate {
    // 1. Target Arrival Time (HH:mm)
    const [tHours, tMinutes] = alarm.targetTime.split(':').map(Number);
    const now = new Date();
    const targetDate = new Date();
    targetDate.setHours(tHours, tMinutes, 0, 0);

    // If target time is earlier than current time today, compute for tomorrow
    if (targetDate.getTime() <= now.getTime()) {
      targetDate.setDate(targetDate.getDate() + 1);
    }

    const prepTimeMin = alarm.advanceNoticeMin || 10;
    
    // 2. Travel duration and distance (from route or calibrated travel mode baseline)
    let travelDurationMin = Math.round((routeDurationSec || 1200) / 60);
    let distanceKm = Number(((routeDistanceMeters || 6500) / 1000).toFixed(1));
    let potentialCrossingDelayMin = Math.round((crossingDelaySec || 0) / 60);

    // 3. Recommended Departure Time = Target - Travel Duration - Potential Crossing Delay
    const totalTransitMin = travelDurationMin + potentialCrossingDelayMin;
    const recommendedDepMs = targetDate.getTime() - totalTransitMin * 60 * 1000;
    const recommendedDepDate = new Date(recommendedDepMs);

    // 4. Prep Start Time = Recommended Departure - Prep Time
    const prepStartMs = recommendedDepMs - prepTimeMin * 60 * 1000;
    const prepStartDate = new Date(prepStartMs);

    // 5. Urgency evaluation
    const nowMs = now.getTime();
    let urgency: 'LEAVE_IMMEDIATELY' | 'LEAVE_SOON' | 'ON_TRACK' | 'PASSED' = 'ON_TRACK';
    if (nowMs >= recommendedDepMs) {
      urgency = 'LEAVE_IMMEDIATELY';
    } else if (nowMs >= prepStartMs || (recommendedDepMs - nowMs) <= 15 * 60 * 1000) {
      urgency = 'LEAVE_SOON';
    }

    // 6. Formatting (12-hour AM/PM)
    const format12h = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const targetStr = format12h(targetDate);
    const recDepStr = format12h(recommendedDepDate);
    const prepStartStr = format12h(prepStartDate);

    // 7. Clear explanatory reason text
    let reason = `Based on travel distance of ${distanceKm} km (${travelDurationMin}m drive)`;
    if (potentialCrossingDelayMin > 0) {
      reason += ` and ~${potentialCrossingDelayMin}m anticipated railway barrier delay, departing at ${recDepStr} ensures arriving by ${targetStr}.`;
    } else {
      reason += `, departing at ${recDepStr} provides safe track crossing buffers.`;
    }

    return {
      alarmId: alarm.id,
      destinationName: alarm.destinationName,
      targetArrivalTime: targetStr,
      prepTimeMin,
      travelDurationMin,
      distanceKm,
      potentialCrossingDelayMin,
      recommendedDepartureTime: recDepStr,
      prepStartTime: prepStartStr,
      urgency,
      reason
    };
  }

  /**
   * Play loud, audible alarm tone using Web Audio API
   */
  public playAlarmAudio(type: 'warning' | 'chime' | 'urgent' = 'urgent') {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!this.audioCtx) {
        this.audioCtx = new AudioCtx();
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      const now = this.audioCtx.currentTime;
      const freqs = type === 'urgent' 
        ? [587.33, 880, 587.33, 880, 1174.66] // D5, A5, D5, A5, D6 (Pulsing alarm)
        : [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6 (Pleasant chime)

      freqs.forEach((freq, idx) => {
        const osc = this.audioCtx!.createOscillator();
        const gain = this.audioCtx!.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.18);
        gain.gain.setValueAtTime(0.25, now + idx * 0.18);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.18 + 0.22);
        osc.connect(gain);
        gain.connect(this.audioCtx!.destination);
        osc.start(now + idx * 0.18);
        osc.stop(now + idx * 0.18 + 0.22);
      });
    } catch (e) {
      console.warn('[NativeService] Audio alarm playback error', e);
    }
  }

  /**
   * Check if any alarms are due right now, auto-detect location, plan route, and trigger alert
   */
  public async evaluateAndTriggerDueAlarms(
    onTriggerCallback?: (alarm: SmartCommuteAlarm, advice: string) => void
  ): Promise<{ alarm: SmartCommuteAlarm; advice: string }[]> {
    const now = new Date();
    const currentDay = now.getDay(); // 0 = Sun, 1 = Mon ... 6 = Sat
    const currentHours = String(now.getHours()).padStart(2, '0');
    const currentMinutes = String(now.getMinutes()).padStart(2, '0');
    const currentTimeStr = `${currentHours}:${currentMinutes}`;
    const todayDateStr = now.toISOString().split('T')[0];

    const isWeekday = currentDay >= 1 && currentDay <= 5;
    const isWeekend = currentDay === 0 || currentDay === 6;

    const triggeredList: { alarm: SmartCommuteAlarm; advice: string }[] = [];

    for (const alarm of this.smartAlarms) {
      if (!alarm.enabled) continue;
      if (alarm.lastTriggeredDate === todayDateStr) continue;

      let dayMatches = false;
      if (alarm.recurrence === 'DAILY') dayMatches = true;
      else if (alarm.recurrence === 'WEEKDAYS' && isWeekday) dayMatches = true;
      else if (alarm.recurrence === 'WEEKENDS' && isWeekend) dayMatches = true;
      else if (alarm.recurrence === 'ONCE') dayMatches = true;

      if (!dayMatches) continue;

      // Check time match (HH:mm)
      if (alarm.targetTime === currentTimeStr) {
        alarm.lastTriggeredDate = todayDateStr;
        if (alarm.recurrence === 'ONCE') {
          alarm.enabled = false;
        }
        await this.storageSet('fatak_smart_alarms', JSON.stringify(this.smartAlarms));

        let advice = `Optimal departure window active! Proceed towards ${alarm.destinationName} without fatak closure.`;

        // Auto-detect current GPS location and plan route dynamically if enabled
        if (alarm.autoDetectLocation) {
          try {
            const gps = await this.getCurrentPosition();
            const originCoord: [number, number] = gps ? [gps.lat, gps.lng] : [31.6338, 74.8655];
            const planUrl = `${this.getBackendUrl()}/api/plan-journey`;
            const planRes = await fetch(planUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                origin: originCoord,
                destination: alarm.destinationCoords,
                departureOffsetSec: 0,
                travelMode: alarm.travelMode
              })
            });
            if (planRes.ok) {
              const plan = await planRes.json();
              if (plan.recommendation?.summary) {
                advice = `${plan.recommendation.summary} Depart now to cross before barriers close.`;
              }
            }
          } catch (e) {
            advice = `Smart commute alert: Proceed now towards ${alarm.destinationName}.`;
          }
        }

        if (alarm.soundAlarm) {
          this.playAlarmAudio('urgent');
        }
        this.triggerHaptic('warning');

        await this.scheduleNotification({
          title: `⏰ Commute Alarm: Depart for ${alarm.destinationName}`,
          body: advice,
          category: 'departureReminders'
        });

        triggeredList.push({ alarm, advice });
        if (onTriggerCallback) {
          onTriggerCallback(alarm, advice);
        }
      }
    }

    return triggeredList;
  }

  public async clearNotificationHistory(): Promise<void> {
    this.notificationHistory = [];
    await this.saveNotificationHistory();
  }

  private async saveNotificationHistory() {
    await this.storageSet('fatak_notification_history', JSON.stringify(this.notificationHistory));
  }

  // ==========================================
  // PERSISTENT SAVED PLACES MANAGEMENT (DATABASE BACKED)
  // ==========================================

  public async refreshSavedPlacesFromServer(): Promise<SavedPlace[]> {
    try {
      const url = `${this.getBackendUrl()}/api/saved-places${this.demoModeActive ? '?demo=true' : ''}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.places)) {
          this.savedPlaces = data.places;
          await this.storageSet('fatak_saved_places', JSON.stringify(this.savedPlaces));
          return this.savedPlaces;
        }
      }
    } catch (err) {
      console.debug('[NativeService] Backend not reachable for saved places, using cached storage');
    }

    // Fallback to local storage if offline
    const stored = await this.storageGet('fatak_saved_places');
    if (stored) {
      try {
        this.savedPlaces = JSON.parse(stored);
      } catch (e) {}
    }
    return this.savedPlaces;
  }

  public getSavedPlaces(): SavedPlace[] {
    if (this.demoModeActive && this.savedPlaces.length === 0) {
      return [...DEMO_PRESET_PLACES];
    }
    return [...this.savedPlaces];
  }

  public async addSavedPlace(place: Omit<SavedPlace, 'id' | 'createdAt'>): Promise<SavedPlace> {
    try {
      const url = `${this.getBackendUrl()}/api/saved-places`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(place)
      });

      if (res.ok) {
        const data = await res.json();
        const saved: SavedPlace = data.place;
        this.savedPlaces.push(saved);
        await this.storageSet('fatak_saved_places', JSON.stringify(this.savedPlaces));
        return saved;
      }
    } catch (err) {
      console.warn('[NativeService] Server save failed, saving to local device storage', err);
    }

    // Local device fallback
    const localPlace: SavedPlace = {
      ...place,
      id: `place_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      createdAt: new Date().toISOString()
    };
    this.savedPlaces.push(localPlace);
    await this.storageSet('fatak_saved_places', JSON.stringify(this.savedPlaces));
    return localPlace;
  }

  public async updateSavedPlace(id: string, updates: Partial<Omit<SavedPlace, 'id' | 'createdAt'>>): Promise<boolean> {
    try {
      const url = `${this.getBackendUrl()}/api/saved-places/${id}`;
      await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
    } catch (e) {}

    const index = this.savedPlaces.findIndex(p => p.id === id);
    if (index === -1) return false;
    this.savedPlaces[index] = { ...this.savedPlaces[index], ...updates };
    await this.storageSet('fatak_saved_places', JSON.stringify(this.savedPlaces));
    return true;
  }

  public async deleteSavedPlace(id: string): Promise<boolean> {
    try {
      const url = `${this.getBackendUrl()}/api/saved-places/${id}`;
      await fetch(url, { method: 'DELETE' });
    } catch (e) {}

    this.savedPlaces = this.savedPlaces.filter(p => p.id !== id);
    await this.storageSet('fatak_saved_places', JSON.stringify(this.savedPlaces));
    return true;
  }

  // ==========================================
  // TRAVEL MODE PREFERENCE
  // ==========================================

  public getTravelMode(): TravelMode {
    return this.travelModePreference;
  }

  public async setTravelMode(mode: TravelMode): Promise<void> {
    this.travelModePreference = mode;
    await this.storageSet('fatak_travel_mode', mode);
  }

  // ==========================================
  // PLANNER CONTEXT BRIDGING
  // ==========================================

  private activePlannerOrigin: SavedPlace | null = null;
  private activePlannerDestination: SavedPlace | null = null;

  public setActivePlannerOrigin(place: SavedPlace | null) {
    this.activePlannerOrigin = place;
  }

  public getActivePlannerOrigin(): SavedPlace | null {
    return this.activePlannerOrigin;
  }

  public setActivePlannerDestination(place: SavedPlace | null) {
    this.activePlannerDestination = place;
  }

  public getActivePlannerDestination(): SavedPlace | null {
    return this.activePlannerDestination;
  }

  public async loadDemoPlaces(): Promise<SavedPlace[]> {
    this.demoModeActive = true;
    for (const demoPlace of DEMO_PRESET_PLACES) {
      if (!this.savedPlaces.some(p => p.name === demoPlace.name)) {
        await this.addSavedPlace({
          name: demoPlace.name,
          category: demoPlace.category,
          lat: demoPlace.lat,
          lng: demoPlace.lng,
          address: demoPlace.address
        });
      }
    }
    return this.savedPlaces;
  }

  public async removeAllDemoPlaces(): Promise<void> {
    this.demoModeActive = false;
    const demoNames = new Set(DEMO_PRESET_PLACES.map(d => d.name));
    const toDelete = this.savedPlaces.filter(p => demoNames.has(p.name));
    for (const p of toDelete) {
      await this.deleteSavedPlace(p.id);
    }
  }

  // ==========================================
  // PRIVACY: FULL DATA ERASURE
  // ==========================================

  public async clearAllUserData(): Promise<void> {
    try {
      const url = `${this.getBackendUrl()}/api/saved-places`;
      await fetch(url, { method: 'DELETE' });
    } catch (e) {}

    this.savedPlaces = [];
    this.notificationHistory = [];
    try {
      if (this.isCapacitorNative) {
        await Preferences.clear();
      }
    } catch (e) {}
    try {
      localStorage.clear();
    } catch (e) {}
  }
}

export const nativeService = new NativeService();
