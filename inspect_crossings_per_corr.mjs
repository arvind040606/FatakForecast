import fs from 'fs';

const crossings = JSON.parse(fs.readFileSync('./backend/amritsar_crossings_osm.json', 'utf8'));

const byCorr = {};
for (const c of crossings) {
  if (!byCorr[c.corridorId]) byCorr[c.corridorId] = [];
  byCorr[c.corridorId].push(c);
}

for (const [corr, list] of Object.entries(byCorr)) {
  console.log(`\nCorridor: ${corr} (${list.length} crossings)`);
  list.forEach(c => {
    console.log(`  - ${c.id}: ${c.name} [${c.lat}, ${c.lng}]`);
  });
}
