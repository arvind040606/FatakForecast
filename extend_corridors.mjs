import fs from 'fs';

const backendPath = './backend/amritsar_corridors_osm.json';
const frontendPath = './frontend/src/data/amritsar_corridors_osm.json';

const corridors = JSON.parse(fs.readFileSync(backendPath, 'utf8'));
const juc = corridors.find(c => c.id === 'CORR_ASR_JUC');

if (!juc) {
  console.error('CORR_ASR_JUC not found!');
  process.exit(1);
}

const extension = [
  [31.5750, 75.0950],
  [31.5450, 75.1250], // Tangra (TRA)
  [31.5200, 75.1600],
  [31.5028, 75.1972], // Butari (BTR)
  [31.5122, 75.2981], // Beas Jn (BEAS)
  [31.5200, 75.3500], // Dhilwan (DIW)
  [31.4700, 75.4400], // Hamira (HRP)
  [31.4400, 75.5000], // Kartarpur (KRE)
  [31.37694, 75.559741], // Sura Nussi (SRX)
  [31.3557, 75.5627], // Baba Sodhal Nagar (BBSL)
  [31.3325, 75.5800]  // Jalandhar City (JUC)
];

// Check if already extended
const lastPt = juc.coordinates[juc.coordinates.length - 1];
if (lastPt[0] === 31.3325 && lastPt[1] === 75.58) {
  console.log('CORR_ASR_JUC already extended to Jalandhar City.');
} else {
  juc.coordinates.push(...extension);
  fs.writeFileSync(backendPath, JSON.stringify(corridors, null, 2));
  fs.writeFileSync(frontendPath, JSON.stringify(corridors, null, 2));
  console.log(`Extended CORR_ASR_JUC successfully to Jalandhar City! New total points: ${juc.coordinates.length}`);
}
