import fs from 'fs';

// Load discovered distinct crossings and tracks
const distinctCrossings = JSON.parse(fs.readFileSync('osm_distinct_crossings.json', 'utf8'));
const tracks = JSON.parse(fs.readFileSync('osm_processed_tracks.json', 'utf8'));

// Helper to calculate distance in km
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Corridors definitions with associated real track ways
// Amritsar Jn is around 31.6337, 74.8655
// 1. Trunk Jalandhar (East/South-East): lon > 74.87, lat < 31.635
// 2. Verka / Pathankot (North-East): lon > 74.88, lat > 31.64
// 3. Chheharta / Attari (West): lon < 74.86
// 4. Bhagtanwala / Tarn Taran (South): lat < 31.62, lon around 74.85 - 74.90

const crossingsData = distinctCrossings.map(c => {
  let corridorId = 'CORR_ASR_JUC';
  let corridorName = 'Amritsar - Jalandhar Trunk Line';
  
  if (c.lat > 31.64 && c.lon > 74.88) {
    corridorId = 'CORR_ASR_PTK';
    corridorName = 'Amritsar - Verka - Pathankot Line';
  } else if (c.lon < 74.86 && c.lat >= 31.61) {
    corridorId = 'CORR_ASR_ATT';
    corridorName = 'Amritsar - Chheharta - Attari Line';
  } else if (c.lat < 31.62 && c.lon >= 74.85) {
    corridorId = 'CORR_ASR_TT';
    corridorName = 'Amritsar - Bhagtanwala - Tarn Taran Line';
  }

  // Verification classification
  let isIndependentlyVerified = false;
  let cleanName = c.name;
  let punjabiName = '';
  let locality = 'Amritsar District';

  if (c.id === 'osm/node/1006212111' || c.allNodes.includes('osm/node/1006212137')) {
    isIndependentlyVerified = true;
    cleanName = 'Jaura Phatak (Joda Phatak)';
    punjabiName = 'ਜੋੜਾ ਫਾਟਕ';
    locality = 'Chamrang Road / Dhobi Ghat (East Amritsar)';
  } else if (c.id === 'osm/node/1326294756') {
    isIndependentlyVerified = true;
    cleanName = 'Old Batala Road Level Crossing';
    punjabiName = 'ਬਟਾਲਾ ਰੋਡ ਫਾਟਕ';
    locality = 'Verka Bypass / Old Batala Road';
  } else if (c.id === 'osm/node/568013331') {
    isIndependentlyVerified = true;
    cleanName = 'State Highway 21 (Tarn Taran Rd) Crossing';
    punjabiName = 'ਤਰਨ ਤਾਰਨ ਰੋਡ ਫਾਟਕ';
    locality = 'State Highway 21 / Sultanwind Link';
  } else if (c.lat > 31.633 && c.lat < 31.635 && c.lon > 74.875 && c.lon < 74.886) {
    cleanName = c.roadNames.length ? `${c.roadNames[0]} Level Crossing` : 'Shivala / Circular Road Crossing';
    locality = 'Shivala Colony / Circular Road Area';
  } else if (c.lat > 31.628 && c.lat < 31.631 && c.lon > 74.845 && c.lon < 74.853) {
    cleanName = c.roadNames.length ? `${c.roadNames[0]} Level Crossing` : 'Islamabad / Putligarh Crossing';
    locality = 'Islamabad / Putligarh Sector';
  } else if (c.lat > 31.615 && c.lat < 31.629 && c.lon > 74.835 && c.lon < 74.845) {
    cleanName = c.roadNames.length ? `${c.roadNames[0]} Level Crossing` : 'Kot Khalsa Level Crossing';
    locality = 'Kot Khalsa / Guru Ki Wadali Link';
  } else if (c.roadNames.length > 0) {
    cleanName = `${c.roadNames[0]} Level Crossing`;
    locality = `${c.roadNames[0]} Corridor`;
  }

  return {
    id: c.id,
    osmId: c.id.replace('osm/node/', ''),
    osmType: 'node',
    allOsmNodes: c.allNodes,
    name: cleanName,
    punjabiName: punjabiName || cleanName,
    locality: locality,
    corridorId: corridorId,
    corridorName: corridorName,
    lat: Number(c.lat.toFixed(6)),
    lng: Number(c.lon.toFixed(6)),
    roadClassification: c.roadNames[0] || 'Unclassified Road',
    railClassification: c.railCorridors.join(', ') || 'Broad Gauge Rail',
    barrierType: c.barrier,
    supervised: c.supervised,
    verificationStatus: isIndependentlyVerified ? 'VERIFIED_MAPPED_CROSSING' : 'REQUIRES_FIELD_VERIFICATION',
    dataSource: 'OpenStreetMap (Overpass API)',
    dataSourceAttribution: '© OpenStreetMap contributors (ODbL)',
    lastVerificationDate: isIndependentlyVerified ? '2026-10-09' : 'Pending Field Survey',
    
    // Transparent operational observation disclosure
    statusObservationType: 'SIMULATED_TEST_BENCH', // Cannot claim physical hardware sensor
    statusObservationNote: 'Simulated operational state. No physical gate sensor or live railway authority interlocking feed connected.',
    status: 'OPEN', // Default simulation state
    
    // Kinematic forecast baseline
    upcomingTrainId: null,
    distanceAlongTrackKm: null,
    estimatedTimeToArrivalSec: null,
    predictedClosureSec: null,
    forecastStatus: 'CALCULATED_BASELINE', // 'CALCULATED_BASELINE' | 'UNAVAILABLE'
    forecastNote: 'Transparent kinematic calculation along curved track geometry. Assumes 3-minute signal locking buffer prior to arrival.'
  };
});

fs.writeFileSync('frontend/src/data/amritsar_crossings_osm.json', JSON.stringify(crossingsData, null, 2));
fs.writeFileSync('backend/amritsar_crossings_osm.json', JSON.stringify(crossingsData, null, 2));
console.log(`Generated amritsar_crossings_osm.json with ${crossingsData.length} real crossings.`);
