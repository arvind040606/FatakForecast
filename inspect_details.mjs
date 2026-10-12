import fs from 'fs';

const crossings = JSON.parse(fs.readFileSync('osm_crossings.json', 'utf8')).elements;
const otherCrossings = crossings.filter(c => c.tags?.railway !== 'level_crossing');

console.log('Other crossings (railway=crossing or other):', otherCrossings.length);
otherCrossings.forEach((c, i) => {
  console.log(`${i+1}. [${c.type}/${c.id}] (${c.lat}, ${c.lon}) tags:`, JSON.stringify(c.tags));
});

// Let's also inspect tracks
const trackData = JSON.parse(fs.readFileSync('osm_tracks.json', 'utf8')).elements;
console.log('Track elements count:', trackData.length);
const ways = trackData.filter(e => e.type === 'way');
const nodes = trackData.filter(e => e.type === 'node');
console.log(`Ways: ${ways.length}, Nodes: ${nodes.length}`);

// Sample track names
const trackNames = new Set();
ways.forEach(w => {
  if (w.tags?.name) trackNames.add(w.tags.name);
  if (w.tags?.usage) trackNames.add(`usage:${w.tags.usage}`);
  if (w.tags?.service) trackNames.add(`service:${w.tags.service}`);
});
console.log('Track names/tags:', Array.from(trackNames));
