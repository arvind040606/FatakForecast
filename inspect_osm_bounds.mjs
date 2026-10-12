import fs from 'fs';

const tracks = JSON.parse(fs.readFileSync('backend/amritsar_tracks_osm.json', 'utf8'));
console.log('Total ways in amritsar_tracks_osm.json:', tracks.length);

let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
tracks.forEach(t => {
  t.coordinates.forEach(c => {
    if (c[0] < minLat) minLat = c[0];
    if (c[0] > maxLat) maxLat = c[0];
    if (c[1] < minLng) minLng = c[1];
    if (c[1] > maxLng) maxLng = c[1];
  });
});

console.log(`Bounds: Lat [${minLat}, ${maxLat}], Lng [${minLng}, ${maxLng}]`);
