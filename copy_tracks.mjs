import fs from 'fs';

const tracks = JSON.parse(fs.readFileSync('osm_processed_tracks.json', 'utf8'));
fs.writeFileSync('frontend/src/data/amritsar_tracks_osm.json', JSON.stringify(tracks, null, 2));
fs.writeFileSync('backend/amritsar_tracks_osm.json', JSON.stringify(tracks, null, 2));
console.log(`Saved ${tracks.length} track ways into frontend and backend data dirs.`);
