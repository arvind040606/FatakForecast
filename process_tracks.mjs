import fs from 'fs';

const tracksData = JSON.parse(fs.readFileSync('osm_tracks.json', 'utf8')).elements;
console.log('Total elements in osm_tracks.json:', tracksData.length);

const nodesMap = new Map();
const ways = [];

for (const el of tracksData) {
  if (el.type === 'node') {
    nodesMap.set(el.id, [el.lat, el.lon]);
  } else if (el.type === 'way') {
    ways.push(el);
  }
}

console.log(`Indexed ${nodesMap.size} nodes and ${ways.length} ways.`);

// Build GeoJSON features for each railway way
const features = [];
let validWays = 0;
let missingNodes = 0;

for (const way of ways) {
  const coords = [];
  for (const nid of (way.nodes || [])) {
    const latlon = nodesMap.get(nid);
    if (latlon) {
      coords.push(latlon);
    } else {
      missingNodes++;
    }
  }

  if (coords.length >= 2) {
    validWays++;
    features.push({
      id: way.id,
      name: way.tags?.name || 'Railway Track',
      railway: way.tags?.railway,
      usage: way.tags?.usage || 'main',
      service: way.tags?.service || null,
      electrified: way.tags?.electrified || null,
      coordinates: coords // array of [lat, lon]
    });
  }
}

console.log(`Valid track polylines built: ${validWays}, features count: ${features.length}, missing nodes: ${missingNodes}`);
fs.writeFileSync('osm_processed_tracks.json', JSON.stringify(features, null, 2));
