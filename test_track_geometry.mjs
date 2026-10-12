import fs from 'fs';

const tracks = JSON.parse(fs.readFileSync('backend/amritsar_tracks_osm.json', 'utf8'));
const crossings = JSON.parse(fs.readFileSync('backend/amritsar_crossings_osm.json', 'utf8'));

// Helper: distance between two lat/lng in km
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Project point onto a segment [p1, p2], return closest point & fraction
function projectPointOnSegment(p, p1, p2) {
  const x = p[1], y = p[0];
  const x1 = p1[1], y1 = p1[0];
  const x2 = p2[1], y2 = p2[0];

  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) return { point: p1, fraction: 0, distKm: haversineKm(p[0], p[1], p1[0], p1[1]) };

  let t = ((x - x1) * dx + (y - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projLat = y1 + t * dy;
  const projLng = x1 + t * dx;
  const distKm = haversineKm(p[0], p[1], projLat, projLng);

  return { point: [projLat, projLng], fraction: t, distKm };
}

// Find closest point on a polyline
function projectPointOnPolyline(p, polyline) {
  let best = { segIndex: 0, point: polyline[0], fraction: 0, distKm: Infinity };
  for (let i = 0; i < polyline.length - 1; i++) {
    const proj = projectPointOnSegment(p, polyline[i], polyline[i+1]);
    if (proj.distKm < best.distKm) {
      best = { segIndex: i, point: proj.point, fraction: proj.fraction, distKm: proj.distKm };
    }
  }
  return best;
}

// Calculate distance along polyline between two projections
function distanceAlongPolyline(polyline, projA, projB) {
  // If projA is before projB along the polyline
  let segStart = projA.segIndex;
  let segEnd = projB.segIndex;

  if (segStart === segEnd) {
    return haversineKm(projA.point[0], projA.point[1], projB.point[0], projB.point[1]);
  }

  let totalDist = 0;
  // Distance from projA.point to end of its segment
  totalDist += haversineKm(projA.point[0], projA.point[1], polyline[segStart + 1][0], polyline[segStart + 1][1]);

  // Intermediate full segments
  for (let i = segStart + 1; i < segEnd; i++) {
    totalDist += haversineKm(polyline[i][0], polyline[i][1], polyline[i+1][0], polyline[i+1][1]);
  }

  // Distance from start of final segment to projB.point
  totalDist += haversineKm(polyline[segEnd][0], polyline[segEnd][1], projB.point[0], projB.point[1]);

  return totalDist;
}

// Test with Jaura Phatak (31.63130, 74.89751) and Amritsar Jn (31.6337, 74.8655)
// Find the railway way connecting them
console.log('Testing projection with Jaura Phatak...');
const joda = crossings.find(c => c.name.includes('Jaura'));
console.log('Joda crossing:', joda.name, joda.lat, joda.lng);

let closestTrack = null;
let minTrackDist = Infinity;
for (const t of tracks) {
  const proj = projectPointOnPolyline([joda.lat, joda.lng], t.coordinates);
  if (proj.distKm < minTrackDist) {
    minTrackDist = proj.distKm;
    closestTrack = t;
  }
}

console.log(`Closest track to Jaura Phatak is way ID: ${closestTrack.id} (name: ${closestTrack.name}), distance to track: ${(minTrackDist * 1000).toFixed(1)} meters!`);
