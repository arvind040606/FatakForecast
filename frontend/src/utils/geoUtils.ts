import { RailwayCrossing, SectorTrain, NearbyCrossingItem } from '../types';

/**
 * Calculate great-circle distance between two GPS points using the Haversine formula
 */
export function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * Format meters into human-readable distance (e.g., "450 m" or "1.8 km")
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

/**
 * Determine authoritative data freshness for a crossing based on live sensors,
 * active sector trains, and kinematic model baseline.
 */
export function getCrossingDataFreshness(
  crossing: RailwayCrossing,
  trains?: SectorTrain[]
): 'LIVE' | 'SCHEDULED' | 'CALCULATED_BASELINE' {
  if (crossing.dataClassification === 'CLASS_A_RELAY') {
    return 'LIVE';
  }


  if (trains && trains.length > 0) {
    const matched = trains.find(
      t => t.corridorId === crossing.corridorId && t.isWithinAmritsarSector
    );
    if (matched) {
      if (matched.dataState === 'LIVE') return 'LIVE';
      if (matched.dataState === 'SCHEDULED') return 'SCHEDULED';
    }
  }

  if (crossing.upcomingTrainId) {
    return 'SCHEDULED';
  }

  return 'CALCULATED_BASELINE';
}

/**
 * Sort crossings by geographic distance from a given user coordinate, nearest first
 */
export function getCrossingsSortedByDistance(
  crossings: RailwayCrossing[],
  userLat: number,
  userLng: number,
  trains?: SectorTrain[]
): NearbyCrossingItem[] {
  return crossings
    .map(crossing => {
      const distM = haversineDistanceMeters(userLat, userLng, crossing.lat, crossing.lng);
      const distKm = Number((distM / 1000).toFixed(2));
      return {
        crossing,
        distanceMeters: distM,
        distanceKm: distKm,
        distanceLabel: formatDistance(distM),
        dataFreshness: getCrossingDataFreshness(crossing, trains)
      };
    })
    .sort((a, b) => a.distanceMeters - b.distanceMeters);
}

/**
 * Calculate geographic initial forward bearing from point 1 to point 2 (0 - 360 degrees)
 */
export function calculateBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const radLat1 = (lat1 * Math.PI) / 180;
  const radLat2 = (lat2 * Math.PI) / 180;
  const radDlon = ((lon2 - lon1) * Math.PI) / 180;

  const y = Math.sin(radDlon) * Math.cos(radRadOrLat(radLat2));
  const x =
    Math.cos(radLat1) * Math.sin(radLat2) -
    Math.sin(radLat1) * Math.cos(radLat2) * Math.cos(radDlon);

  const initialBearing = (Math.atan2(y, x) * 180) / Math.PI;
  return (initialBearing + 360) % 360;
}

function radRadOrLat(val: number) {
  return val;
}

/**
 * Compute the shortest angular difference between two bearings (-180 to +180 degrees)
 * Eliminates 360-degree rotation flips when crossing North (0° / 360°)
 */
export function normalizeBearingDiff(targetBearing: number, currentBearing: number): number {
  return ((targetBearing - currentBearing + 540) % 360) - 180;
}

/**
 * Interpolate smoothly between current and target bearing using shortest angular path
 */
export function interpolateBearing(
  currentBearing: number,
  targetBearing: number,
  factor: number
): number {
  const diff = normalizeBearingDiff(targetBearing, currentBearing);
  const clampedFactor = Math.max(0, Math.min(1, factor));
  return (currentBearing + diff * clampedFactor + 360) % 360;
}

/**
 * Project a coordinate point [lat, lng] onto a line segment [p1, p2]
 */
export function projectPointOnSegment(
  p: [number, number],
  p1: [number, number],
  p2: [number, number]
): { point: [number, number]; fraction: number; distMeters: number } {
  const x = p[1], y = p[0];
  const x1 = p1[1], y1 = p1[0];
  const x2 = p2[1], y2 = p2[0];

  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    return {
      point: p1,
      fraction: 0,
      distMeters: haversineDistanceMeters(p[0], p[1], p1[0], p1[1])
    };
  }

  let t = ((x - x1) * dx + (y - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projLat = y1 + t * dy;
  const projLng = x1 + t * dx;
  const distMeters = haversineDistanceMeters(p[0], p[1], projLat, projLng);

  return { point: [projLat, projLng], fraction: t, distMeters };
}

export interface TrackSnapResult {
  lat: number;
  lng: number;
  bearing: number;
  distanceMeters: number;
  isSnapped: boolean;
  trackId?: number | string;
  trackName?: string;
}

/**
 * Snap an observed train coordinate to the closest OpenStreetMap railway track way
 * Guarantees train models follow genuine permanent-way geometry without drifting onto roads
 */
export function snapToTrackGeometry(
  lat: number,
  lng: number,
  tracks: Array<{ id?: number | string; name?: string; coordinates: [number, number][] }>,
  preferredDirection?: 'UP' | 'DOWN',
  maxDistanceMeters = 350
): TrackSnapResult {
  if (!tracks || tracks.length === 0 || typeof lat !== 'number' || typeof lng !== 'number') {
    return { lat, lng, bearing: 0, distanceMeters: Infinity, isSnapped: false };
  }

  let bestDist = Infinity;
  let bestPoint: [number, number] = [lat, lng];
  let bestBearing = 0;
  let bestTrackId: number | string | undefined = undefined;
  let bestTrackName: string | undefined = undefined;

  const targetPoint: [number, number] = [lat, lng];

  for (const track of tracks) {
    const coords = track.coordinates;
    if (!coords || coords.length < 2) continue;

    for (let i = 0; i < coords.length - 1; i++) {
      const proj = projectPointOnSegment(targetPoint, coords[i], coords[i + 1]);
      if (proj.distMeters < bestDist) {
        bestDist = proj.distMeters;
        bestPoint = proj.point;
        bestTrackId = track.id;
        bestTrackName = track.name;

        // Calculate segment tangent bearing
        let segBearing = calculateBearing(
          coords[i][0],
          coords[i][1],
          coords[i + 1][0],
          coords[i + 1][1]
        );

        if (preferredDirection === 'DOWN') {
          segBearing = (segBearing + 180) % 360;
        }

        bestBearing = Math.round(segBearing);
      }
    }
  }

  if (bestDist <= maxDistanceMeters) {
    return {
      lat: Number(bestPoint[0].toFixed(6)),
      lng: Number(bestPoint[1].toFixed(6)),
      bearing: bestBearing,
      distanceMeters: bestDist,
      isSnapped: true,
      trackId: bestTrackId,
      trackName: bestTrackName
    };
  }

  return {
    lat,
    lng,
    bearing: bestBearing || 0,
    distanceMeters: bestDist,
    isSnapped: false
  };
}

/**
 * Validate train telemetry coordinates and rejection criteria
 */
export function validateTrainCoordinates(
  lat: unknown,
  lng: unknown,
  maxSectorRadiusMeters = 140000 // 140km Amritsar operational sector radius
): boolean {
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (isNaN(lat) || isNaN(lng)) return false;
  if (lat === 0 && lng === 0) return false;

  // Check sector bounds from Amritsar Junction (31.6338, 74.8655)
  const distFromAsr = haversineDistanceMeters(lat, lng, 31.6338, 74.8655);
  return distFromAsr <= maxSectorRadiusMeters;
}

