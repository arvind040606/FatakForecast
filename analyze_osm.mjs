import fs from 'fs';

const crossings = JSON.parse(fs.readFileSync('osm_crossings.json', 'utf8')).elements;
console.log(`Total crossing elements: ${crossings.length}`);

const types = {};
const withName = [];
const levelCrossings = [];

for (const c of crossings) {
  types[c.type] = (types[c.type] || 0) + 1;
  const tags = c.tags || {};
  if (tags.name) {
    withName.push({ id: `${c.type}/${c.id}`, name: tags.name, lat: c.lat, lon: c.lon, tags });
  }
  if (tags.railway === 'level_crossing') {
    levelCrossings.push({ id: `${c.type}/${c.id}`, name: tags.name || tags.ref || 'Unnamed Level Crossing', lat: c.lat, lon: c.lon, tags });
  }
}

console.log('Types distribution:', types);
console.log(`Elements with railway=level_crossing: ${levelCrossings.length}`);
console.log('Level crossings details:');
levelCrossings.forEach((lc, i) => {
  console.log(`${i + 1}. [${lc.id}] (${lc.lat}, ${lc.lon}) - ${lc.name} - barrier: ${lc.tags.barrier || 'none'} - supervised: ${lc.tags.supervised || 'unknown'}`);
});

console.log('\nAll elements with names:');
withName.forEach((n, i) => {
  console.log(`${i + 1}. [${n.id}] ${n.name} (${n.lat}, ${n.lon}) - railway: ${n.tags.railway}`);
});
