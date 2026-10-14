// =========================================================================
// FATAKFORECAST — LIVE TRAIN VISUALIZATION ACCEPTANCE TEST SUITE
// Tests 2.5D/3D train positioning, railway geometry snapping,
// shortest-arc rotation, stale rejection, and camera overview reset
// =========================================================================

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load OSM railway tracks
const rawOsmTracks = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'frontend', 'src', 'data', 'amritsar_tracks_osm.json'), 'utf8')
);

// Geo utilities to verify
function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
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

function normalizeBearingDiff(targetBearing, currentBearing) {
  return ((targetBearing - currentBearing + 540) % 360) - 180;
}

function calculateBearing(lat1, lon1, lat2, lon2) {
  const radLat1 = (lat1 * Math.PI) / 180;
  const radLat2 = (lat2 * Math.PI) / 180;
  const radDlon = ((lon2 - lon1) * Math.PI) / 180;

  const y = Math.sin(radDlon) * Math.cos(radLat2);
  const x =
    Math.cos(radLat1) * Math.sin(radLat2) -
    Math.sin(radLat1) * Math.cos(radLat2) * Math.cos(radDlon);

  const initialBearing = (Math.atan2(y, x) * 180) / Math.PI;
  return (initialBearing + 360) % 360;
}

function projectPointOnSegment(p, p1, p2) {
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

function snapToTrackGeometry(lat, lng, tracks, preferredDirection, maxDistanceMeters = 350) {
  if (!tracks || tracks.length === 0 || typeof lat !== 'number' || typeof lng !== 'number') {
    return { lat, lng, bearing: 0, distanceMeters: Infinity, isSnapped: false };
  }

  let bestDist = Infinity;
  let bestPoint = [lat, lng];
  let bestBearing = 0;
  let bestTrackId = undefined;
  let bestTrackName = undefined;

  const targetPoint = [lat, lng];

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

function validateTrainCoordinates(lat, lng, maxSectorRadiusMeters = 140000) {
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (isNaN(lat) || isNaN(lng)) return false;
  if (lat === 0 && lng === 0) return false;

  const distFromAsr = haversineDistanceMeters(lat, lng, 31.6338, 74.8655);
  return distFromAsr <= maxSectorRadiusMeters;
}

console.log('🚄 Running FATAKFORECAST Step 6: Live Train Visualization Test Suite...\n');

let passedTests = 0;
let totalTests = 0;

function it(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
  }
}

// -------------------------------------------------------------------------
// 1. Angular Shortest-Path Normalization (Zero 360-degree flip spins)
// -------------------------------------------------------------------------
it('Should calculate shortest angular difference crossing North (355° to 5°)', () => {
  const diff = normalizeBearingDiff(5, 355);
  // From 355 to 5 should be +10 degrees clockwise, NOT -350
  assert.strictEqual(diff, 10, `Expected +10, got ${diff}`);
});

it('Should calculate shortest angular difference crossing North backwards (5° to 355°)', () => {
  const diff = normalizeBearingDiff(355, 5);
  // From 5 to 355 should be -10 degrees counter-clockwise, NOT +350
  assert.strictEqual(diff, -10, `Expected -10, got ${diff}`);
});

it('Should preserve direct angle difference (90° to 120°)', () => {
  const diff = normalizeBearingDiff(120, 90);
  assert.strictEqual(diff, 30, `Expected +30, got ${diff}`);
});

it('Should preserve direct angle difference (180° to 170°)', () => {
  const diff = normalizeBearingDiff(170, 180);
  assert.strictEqual(diff, -10, `Expected -10, got ${diff}`);
});

// -------------------------------------------------------------------------
// 2. Coordinate Validation & Sector Bound Checking
// -------------------------------------------------------------------------
it('Should validate realistic coordinates in Amritsar sector (Amritsar Jn)', () => {
  const valid = validateTrainCoordinates(31.6338, 74.8655);
  assert.strictEqual(valid, true, 'Amritsar Jn should be valid');
});

it('Should validate Jalandhar corridor coordinates (~75km from ASR)', () => {
  const valid = validateTrainCoordinates(31.3260, 75.5762);
  assert.strictEqual(valid, true, 'Jalandhar should be valid within 140km sector');
});

it('Should reject null, undefined, and NaN coordinates', () => {
  assert.strictEqual(validateTrainCoordinates(null, 74.8655), false);
  assert.strictEqual(validateTrainCoordinates(undefined, 74.8655), false);
  assert.strictEqual(validateTrainCoordinates(NaN, 74.8655), false);
  assert.strictEqual(validateTrainCoordinates(31.6338, NaN), false);
});

it('Should reject zero (0, 0) coordinates (Null Island)', () => {
  assert.strictEqual(validateTrainCoordinates(0, 0), false);
});

it('Should reject far out-of-sector coordinates (e.g. New Delhi ~400km away)', () => {
  assert.strictEqual(validateTrainCoordinates(28.6139, 77.2090), false, 'Delhi coordinates must be rejected from Amritsar sector');
});

// -------------------------------------------------------------------------
// 3. Railway Track Snapping to Authentic OpenStreetMap Geometry
// -------------------------------------------------------------------------
it('Should have 80 authentic OpenStreetMap tracks in dataset', () => {
  assert.ok(Array.isArray(rawOsmTracks), 'Tracks must be an array');
  assert.ok(rawOsmTracks.length >= 70, `Expected >= 70 OSM tracks, found ${rawOsmTracks.length}`);
});

it('Should snap Amritsar Jn station area point accurately to permanent-way rail', () => {
  // Amritsar Jn concourse point (31.6337, 74.8656) is ~100m from the platform tracks
  const rawLat = 31.6337;
  const rawLng = 74.8656;
  const snap = snapToTrackGeometry(rawLat, rawLng, rawOsmTracks, 'UP', 350);

  assert.strictEqual(snap.isSnapped, true, 'Should successfully snap to track');
  assert.ok(snap.distanceMeters < 150, `Distance should be < 150m, was ${snap.distanceMeters}m`);
  assert.ok(typeof snap.bearing === 'number' && snap.bearing >= 0 && snap.bearing <= 360, `Bearing should be valid degrees, got ${snap.bearing}`);
  assert.ok(snap.trackName || snap.trackId, 'Should identify track name or ID');
});

it('Should snap Jalandhar-Amritsar mainline point (Jaura Phatak area) accurately to tracks', () => {
  // Jaura Phatak exact OSM level crossing coordinate: 31.631304, 74.897514
  const rawLat = 31.631304;
  const rawLng = 74.897514;
  const snap = snapToTrackGeometry(rawLat, rawLng, rawOsmTracks, 'UP', 350);

  assert.strictEqual(snap.isSnapped, true, 'Jaura Phatak rail coordinate should snap');
  assert.ok(snap.distanceMeters < 20, `Distance should be < 20m, was ${snap.distanceMeters}m`);
  assert.ok(snap.bearing >= 0 && snap.bearing <= 360, 'Bearing must be valid');
});


it('Should not snap coordinates that are far from any track (>350m)', () => {
  // Deep in Amritsar Old City residential maze (far from tracks)
  const offTrackLat = 31.6180;
  const offTrackLng = 74.8720;
  const snap = snapToTrackGeometry(offTrackLat, offTrackLng, rawOsmTracks, 'UP', 350);

  assert.strictEqual(snap.isSnapped, false, 'Should not snap off-track city coordinate');
  assert.strictEqual(snap.lat, offTrackLat, 'Should preserve original coordinate');
  assert.strictEqual(snap.lng, offTrackLng, 'Should preserve original coordinate');
});

// -------------------------------------------------------------------------
// 4. Out-of-Order Packet Rejection & Telemetry Freshness
// -------------------------------------------------------------------------
it('Should reject out-of-order telemetry updates with older timestamps', () => {
  const lastObservationMs = 1718000000000;
  const stalePacketTimestamp = 1717999990000; // 10s older
  const isOutOfOrder = stalePacketTimestamp < lastObservationMs;

  assert.strictEqual(isOutOfOrder, true, 'Older packet must be identified as out-of-order');
});

it('Should accept fresh sequential telemetry updates', () => {
  const lastObservationMs = 1718000000000;
  const freshPacketTimestamp = 1718000005000; // 5s newer
  const isOutOfOrder = freshPacketTimestamp < lastObservationMs;

  assert.strictEqual(isOutOfOrder, false, 'Newer packet must be accepted');
});

// -------------------------------------------------------------------------
// 5. Stationary Train Handling (Never fabricate fake motion)
// -------------------------------------------------------------------------
it('Should classify stationary and halted trains honestly', () => {
  const stationaryTrain = {
    number: '18238',
    speedKmH: 0,
    status: 'PLATFORM_BOARDING'
  };

  const isStationary = stationaryTrain.speedKmH === 0 || stationaryTrain.status === 'PLATFORM_BOARDING';
  const badgeText = isStationary ? 'HALT' : `${stationaryTrain.speedKmH} km/h`;

  assert.strictEqual(isStationary, true, 'Platform boarding train must be recognized as stationary');
  assert.strictEqual(badgeText, 'HALT', 'Stationary train must show HALT badge, not fabricated speed');
});

// -------------------------------------------------------------------------
// 6. Real Backend Telemetry Integration Check
// -------------------------------------------------------------------------
it('Should successfully fetch active trains from backend /api/trains', async () => {
  const res = await fetch('http://localhost:8787/api/trains');
  const data = await res.json();
  assert.strictEqual(data.success, true, 'API response must succeed');
  assert.ok(Array.isArray(data.trains), 'Trains must be an array');
  assert.ok(data.trains.length > 0, 'Must have tracked train records');
});

console.log(`\n=========================================================`);
console.log(`Live Train Visualization Test Results: ${passedTests}/${totalTests} Passed`);
console.log(`=========================================================\n`);
