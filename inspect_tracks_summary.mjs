import fs from 'fs';

const tracks = JSON.parse(fs.readFileSync('osm_processed_tracks.json', 'utf8'));
console.log(`Total track features: ${tracks.length}`);

let totalPoints = 0;
tracks.forEach((t, i) => {
  totalPoints += t.coordinates.length;
});
console.log(`Total points across all tracks: ${totalPoints}`);

// Print summary of distinct track corridors/names
const names = {};
tracks.forEach(t => {
  const k = t.name || t.usage || 'unnamed';
  names[k] = (names[k] || 0) + 1;
});
console.log('Tracks breakdown:', names);
