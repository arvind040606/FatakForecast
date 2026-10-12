import fs from 'fs';

const corridors = JSON.parse(fs.readFileSync('./backend/amritsar_corridors_osm.json', 'utf8'));
const juc = corridors.find(c => c.id === 'CORR_ASR_JUC');

console.log('CORR_ASR_JUC total points:', juc.coordinates.length);
console.log('First point:', juc.coordinates[0]);
console.log('Last point:', juc.coordinates[juc.coordinates.length - 1]);

// Let's check distance between start and end
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

let totalLen = 0;
for (let i = 0; i < juc.coordinates.length - 1; i++) {
  totalLen += haversineKm(juc.coordinates[i][0], juc.coordinates[i][1], juc.coordinates[i+1][0], juc.coordinates[i+1][1]);
}
console.log('Total curve track length of CORR_ASR_JUC:', totalLen.toFixed(2), 'km');
