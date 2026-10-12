import fs from 'fs';

const tracks = JSON.parse(fs.readFileSync('backend/amritsar_tracks_osm.json', 'utf8'));

// Sort tracks into corridors based on geographic sector
// Trunk JUC: lat between 31.57 and 31.64, lon between 74.865 and 75.02 (eastwards)
// Pathankot PTK: lat between 31.63 and 31.72, lon between 74.865 and 75.00 (northeast)
// Attari ATT: lon between 74.75 and 74.865, lat between 31.61 and 31.65 (westwards)
// Tarn Taran TT: lon between 74.85 and 74.91, lat between 31.55 and 31.63 (southwards)

// We can build 4 corridor objects that contain:
// id, name, type, speedLimitKmH, ways: array of way IDs, coordinates: combined continuous points
// Let's create an assembler script that chains connected segments from Amritsar Jn outwards

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Function to chain segments into a continuous polyline starting from startPt
function chainSegments(segmentList, startPt) {
  const remaining = segmentList.map(s => [...s.coordinates]);
  const chain = [];
  
  // Find segment closest to startPt
  let bestIdx = -1;
  let minDist = Infinity;
  let reverseFirst = false;

  remaining.forEach((seg, idx) => {
    const dStart = haversineKm(startPt[0], startPt[1], seg[0][0], seg[0][1]);
    const dEnd = haversineKm(startPt[0], startPt[1], seg[seg.length - 1][0], seg[seg.length - 1][1]);
    if (dStart < minDist) {
      minDist = dStart;
      bestIdx = idx;
      reverseFirst = false;
    }
    if (dEnd < minDist) {
      minDist = dEnd;
      bestIdx = idx;
      reverseFirst = true;
    }
  });

  if (bestIdx === -1) return [];

  let currentSeg = remaining.splice(bestIdx, 1)[0];
  if (reverseFirst) currentSeg.reverse();
  chain.push(...currentSeg);

  while (remaining.length > 0) {
    const tip = chain[chain.length - 1];
    let nextIdx = -1;
    let nextMinDist = Infinity;
    let nextReverse = false;

    remaining.forEach((seg, idx) => {
      const dStart = haversineKm(tip[0], tip[1], seg[0][0], seg[0][1]);
      const dEnd = haversineKm(tip[0], tip[1], seg[seg.length - 1][0], seg[seg.length - 1][1]);
      if (dStart < nextMinDist) {
        nextMinDist = dStart;
        nextIdx = idx;
        nextReverse = false;
      }
      if (dEnd < nextMinDist) {
        nextMinDist = dEnd;
        nextIdx = idx;
        nextReverse = true;
      }
    });

    // If gap is less than 500m, connect them
    if (nextMinDist < 0.8) {
      let nextSeg = remaining.splice(nextIdx, 1)[0];
      if (nextReverse) nextSeg.reverse();
      chain.push(...nextSeg);
    } else {
      break;
    }
  }

  return chain;
}

const asrJn = [31.6337, 74.8655];

// Filter segments for each corridor
const eastTracks = tracks.filter(t => t.coordinates.some(c => c[1] >= 74.865 && c[0] <= 31.635 && c[1] <= 75.03));
const northeastTracks = tracks.filter(t => t.coordinates.some(c => c[1] >= 74.865 && c[0] >= 31.634));
const westTracks = tracks.filter(t => t.coordinates.some(c => c[1] <= 74.865 && c[0] >= 31.615));
const southTracks = tracks.filter(t => t.coordinates.some(c => c[0] <= 31.633 && c[1] >= 74.845 && c[1] <= 74.91));

const chainJUC = chainSegments(eastTracks, asrJn);
const chainPTK = chainSegments(northeastTracks, asrJn);
const chainATT = chainSegments(westTracks, asrJn);
const chainTT = chainSegments(southTracks, asrJn);

console.log(`Corridor JUC chain points: ${chainJUC.length}`);
console.log(`Corridor PTK chain points: ${chainPTK.length}`);
console.log(`Corridor ATT chain points: ${chainATT.length}`);
console.log(`Corridor TT chain points: ${chainTT.length}`);

const corridors = [
  {
    id: 'CORR_ASR_JUC',
    name: 'Northern Railway Main Line (Amritsar - Jalandhar Section)',
    type: 'Double Broad Gauge Electrified (25kV AC)',
    speedLimitKmH: 110,
    coordinates: chainJUC.length > 5 ? chainJUC : eastTracks.flatMap(t => t.coordinates),
    osmDataSource: 'OpenStreetMap railway=rail way geometry (ODbL)'
  },
  {
    id: 'CORR_ASR_PTK',
    name: 'Amritsar - Verka - Pathankot Line',
    type: 'Single Broad Gauge Electrified',
    speedLimitKmH: 90,
    coordinates: chainPTK.length > 5 ? chainPTK : northeastTracks.flatMap(t => t.coordinates),
    osmDataSource: 'OpenStreetMap railway=rail way geometry (ODbL)'
  },
  {
    id: 'CORR_ASR_ATT',
    name: 'Amritsar - Chheharta - Attari Line',
    type: 'Single Broad Gauge Electrified',
    speedLimitKmH: 80,
    coordinates: chainATT.length > 5 ? chainATT : westTracks.flatMap(t => t.coordinates),
    osmDataSource: 'OpenStreetMap railway=rail way geometry (ODbL)'
  },
  {
    id: 'CORR_ASR_TT',
    name: 'Amritsar - Bhagtanwala - Khemkaran Line',
    type: 'Single Broad Gauge Diesel/Electrified',
    speedLimitKmH: 70,
    coordinates: chainTT.length > 5 ? chainTT : southTracks.flatMap(t => t.coordinates),
    osmDataSource: 'OpenStreetMap railway=rail way geometry (ODbL)'
  }
];

fs.writeFileSync('backend/amritsar_corridors_osm.json', JSON.stringify(corridors, null, 2));
fs.writeFileSync('frontend/src/data/amritsar_corridors_osm.json', JSON.stringify(corridors, null, 2));
console.log('Saved amritsar_corridors_osm.json successfully!');
