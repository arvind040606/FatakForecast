import fs from 'fs';

const crossings = JSON.parse(fs.readFileSync('osm_crossings.json', 'utf8')).elements;
const levelCrossings = crossings.filter(c => c.tags?.railway === 'level_crossing');

const waysData = JSON.parse(fs.readFileSync('osm_crossing_ways.json', 'utf8')).elements;
const ways = waysData.filter(e => e.type === 'way');

console.log(`Total Level Crossing Nodes: ${levelCrossings.length}`);
console.log(`Total Intersecting Ways: ${ways.length}`);

// Map node id -> list of ways that contain it
// Notice Overpass query was: node(id:...); <; out tags;
// When querying < with out tags, does it include node list for ways? Let's check ways[0]
console.log('Sample way:', JSON.stringify(ways[0], null, 2));

// Let's print out all way tags
ways.forEach((w, i) => {
  if (w.tags?.highway) {
    console.log(`Highway: ${w.tags.name || 'Unnamed'} (${w.tags.highway}) - ref: ${w.tags.ref || 'none'}`);
  }
});
