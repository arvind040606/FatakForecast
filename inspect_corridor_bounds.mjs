import fs from 'fs';

const corridors = JSON.parse(fs.readFileSync('./backend/amritsar_corridors_osm.json', 'utf8'));

for (const c of corridors) {
  const coords = c.coordinates;
  const start = coords[0];
  const end = coords[coords.length - 1];
  console.log(`[${c.id}] ${c.name}: ${coords.length} points, totalDist: ${c.totalDistanceKm}km`);
  console.log(`   Start: [${start[0]}, ${start[1]}], End: [${end[0]}, ${end[1]}]`);
}
