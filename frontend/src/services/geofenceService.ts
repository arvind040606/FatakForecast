// =========================================================================
// FATAKFORECAST — GEOFENCE & LOCAL SURVEY NOTIFICATIONS ENGINE
// Monitors Device Proximity to Mapped Level Crossings with Safety Safeguards,
// Cooldown Deduplication, and Graceful Offline / Background Handling
// =========================================================================

import { LocalNotifications } from '@capacitor/local-notifications';
import { Geolocation, Position } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';
import { RailwayCrossing } from '../types';
import { nativeService } from './nativeService';

export interface GeofenceAlertEvent {
  crossing: RailwayCrossing;
  distanceMeters: number;
  timestamp: number;
}

class GeofenceService {
  private isMonitoring: boolean = false;
  private geofenceRadiusMeters: number = 500;
  private crossingCooldownMs: number = 30 * 60 * 1000; // 30-minute repeat cooldown per crossing
  private globalCooldownMs: number = 10 * 60 * 1000;   // 10-minute global cooldown between alerts
  private lastGlobalNotificationTime: number = 0;
  private crossingCooldownMap: Map<string, number> = new Map();
  private watchId: string | number | null = null;
  private lastKnownPosition: { lat: number; lng: number } | null = null;
  private crossingsList: RailwayCrossing[] = [];

  constructor() {
    this.loadPersistedCooldowns();
  }

  public setCrossings(crossings: RailwayCrossing[]) {
    if (Array.isArray(crossings) && crossings.length > 0) {
      this.crossingsList = crossings;
    }
  }

  public setGeofenceRadius(radiusMeters: number) {
    if (radiusMeters >= 100 && radiusMeters <= 2000) {
      this.geofenceRadiusMeters = radiusMeters;
    }
  }

  public getGeofenceRadius(): number {
    return this.geofenceRadiusMeters;
  }

  private async loadPersistedCooldowns() {
    try {
      if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem('fatak_geofence_cooldowns');
        if (stored) {
          const parsed = JSON.parse(stored);
          const now = Date.now();
          Object.entries(parsed).forEach(([id, ts]) => {
            if (typeof ts === 'number' && now - ts < this.crossingCooldownMs) {
              this.crossingCooldownMap.set(id, ts);
            }
          });
        }
      }
    } catch (e) {}
  }

  private async savePersistedCooldowns() {
    try {
      if (typeof localStorage !== 'undefined') {
        const obj: Record<string, number> = {};
        this.crossingCooldownMap.forEach((ts, id) => {
          obj[id] = ts;
        });
        localStorage.setItem('fatak_geofence_cooldowns', JSON.stringify(obj));
      }
    } catch (e) {}
  }

  private calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // Earth radius in meters
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  public checkProximity(lat: number, lng: number): GeofenceAlertEvent | null {
    this.lastKnownPosition = { lat, lng };
    if (!this.crossingsList || this.crossingsList.length === 0) return null;

    const now = Date.now();
    // Global cooldown check
    if (now - this.lastGlobalNotificationTime < this.globalCooldownMs) {
      return null;
    }

    // Find closest crossing within geofence radius
    let closestCrossing: RailwayCrossing | null = null;
    let minDistance = Infinity;

    for (const c of this.crossingsList) {
      const dist = this.calculateDistanceMeters(lat, lng, c.lat, c.lng);
      if (dist <= this.geofenceRadiusMeters && dist < minDistance) {
        // Check per-crossing cooldown
        const lastAlert = this.crossingCooldownMap.get(c.id) || 0;
        if (now - lastAlert >= this.crossingCooldownMs) {
          minDistance = dist;
          closestCrossing = c;
        }
      }
    }

    if (closestCrossing) {
      this.lastGlobalNotificationTime = now;
      this.crossingCooldownMap.set(closestCrossing.id, now);
      this.savePersistedCooldowns();

      const event: GeofenceAlertEvent = {
        crossing: closestCrossing,
        distanceMeters: Math.round(minDistance),
        timestamp: now
      };

      this.triggerSurveyNotification(event);
      return event;
    }

    return null;
  }

  private async triggerSurveyNotification(event: GeofenceAlertEvent) {
    const { crossing, distanceMeters } = event;
    const title = 'Railway Crossing Nearby';
    const body = `You're near ${crossing.name} (~${distanceMeters}m). Can you help verify its current status?`;

    // 1. Dispatch custom in-app event for immediate UI prompt banner
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('fatak:geofence-crossing-entered', {
        detail: { crossing, distanceMeters }
      }));
    }

    // 2. Dispatch Local Notification via Capacitor Native Plugin
    try {
      const hasPerm = await LocalNotifications.checkPermissions();
      if (hasPerm.display === 'granted') {
        const notifId = Math.floor(Math.random() * 899999) + 100000;
        await LocalNotifications.schedule({
          notifications: [
            {
              id: notifId,
              title,
              body,
              channelId: 'fatak_alerts',
              smallIcon: 'ic_stat_notification',
              schedule: { at: new Date(Date.now() + 100) },
              extra: {
                type: 'SURVEY_PROMPT',
                crossingId: crossing.id,
                crossingName: crossing.name
              }
            }
          ]
        });
      }
    } catch (err) {
      console.warn('[GeofenceService] Local notification schedule error:', err);
    }
  }

  public async startMonitoring(crossings?: RailwayCrossing[]): Promise<boolean> {
    if (crossings) this.setCrossings(crossings);
    if (this.isMonitoring) return true;

    try {
      // Check Geolocation permission
      const perm = await Geolocation.checkPermissions();
      if (perm.location !== 'granted') {
        const req = await Geolocation.requestPermissions();
        if (req.location !== 'granted') {
          console.warn('[GeofenceService] Geolocation permission not granted for geofencing.');
          return false;
        }
      }

      this.isMonitoring = true;

      // Watch position changes
      const isNative = Capacitor.isNativePlatform();
      this.watchId = await Geolocation.watchPosition(
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 5000
        },
        (position: Position | null, err) => {
          if (err || !position) return;
          this.checkProximity(position.coords.latitude, position.coords.longitude);
        }
      );

      console.log(`[GeofenceService] Proximity monitoring active (${this.crossingsList.length} crossings, radius: ${this.geofenceRadiusMeters}m)`);
      return true;
    } catch (e: any) {
      console.warn('[GeofenceService] Start monitoring error:', e.message);
      this.isMonitoring = false;
      return false;
    }
  }

  public stopMonitoring() {
    if (this.watchId !== null) {
      try {
        Geolocation.clearWatch({ id: String(this.watchId) });
      } catch (e) {}
      this.watchId = null;
    }
    this.isMonitoring = false;
  }

  public getLastKnownPosition() {
    return this.lastKnownPosition;
  }
}

export const geofenceService = new GeofenceService();
