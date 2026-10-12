import fs from 'fs';

const crossingsData = JSON.parse(fs.readFileSync('osm_crossings.json', 'utf8')).elements;
const waysData = JSON.parse(fs.readFileSync('osm_crossing_ways.json', 'utf8')).elements;

// Map ways by their node references if present, or ways list
const ways = waysData.filter(e => e.type === 'way');

// Function to calculate distance in meters between two lat/lon
function getDistMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Inspect all 51 level_crossing nodes
const levelCrossingNodes = crossingsData.filter(c => c.tags?.railway === 'level_crossing');

console.log(`Processing ${levelCrossingNodes.length} level crossing nodes...`);

// Group near-identical / twin track crossings (within 35 meters)
const groups = [];
const visited = new Set();

for (let i = 0; i < levelCrossingNodes.length; i++) {
  if (visited.has(levelCrossingNodes[i].id)) continue;
  const group = [levelCrossingNodes[i]];
  visited.add(levelCrossingNodes[i].id);

  for (let j = i + 1; j < levelCrossingNodes.length; j++) {
    if (visited.has(levelCrossingNodes[j].id)) continue;
    const dist = getDistMeters(
      levelCrossingNodes[i].lat, levelCrossingNodes[i].lon,
      levelCrossingNodes[j].lat, levelCrossingNodes[j].lon
    );
    if (dist < 35) { // twin track crossing
      group.push(levelCrossingNodes[j]);
      visited.add(levelCrossingNodes[j].id);
    }
  }
  groups.push(group);
}

console.log(`Distinct crossing physical locations found: ${groups.length}`);

groups.forEach((g, idx) => {
  const primary = g[0];
  const ids = g.map(x => `node/${x.id}`).join(', ');
  const names = g.map(x => x.tags?.name).filter(Boolean);
  const tags = g.map(x => x.tags);
  console.log(`Group ${idx + 1}: [${ids}] @ (${primary.lat.toFixed(5)}, ${primary.lon.toFixed(5)}) - Name: ${names[0] || 'Unnamed'} - Members: ${g.length}`);
});
