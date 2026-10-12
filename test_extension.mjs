import fs from 'fs';

const corridors = JSON.parse(fs.readFileSync('./backend/amritsar_corridors_osm.json', 'utf8'));
const juc = corridors.find(c => c.id === 'CORR_ASR_JUC');
const lastPt = juc.coordinates[juc.coordinates.length - 1];

console.log('Last point in CORR_ASR_JUC:', lastPt);

// Key railway permanent-way track points along Amritsar - Jalandhar main line
const extensionPoints = [
  [31.5750, 75.0950],
  [31.5450, 75.1250], // Tangra (TRA)
  [31.5200, 75.1600],
  [31.5028, 75.1972], // Butari (BTR)
  [31.5122, 75.2981], // Beas Jn (BEAS)
  [31.5200, 75.3500], // Dhilwan (DIW)
  [31.4700, 75.4400], // Hamira (HRP)
  [31.4400, 75.5000], // Kartarpur (KRE)
  [31.3557, 75.5627], // Baba Sodhal Nagar (BBSL)
  [31.3325, 75.5800]  // Jalandhar City (JUC)
];

console.log('Distance from last point to Tangra:', extensionPoints[1]);
