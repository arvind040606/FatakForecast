import fs from 'fs';

const crossingsData = JSON.parse(fs.readFileSync('osm_crossings.json', 'utf8')).elements;
const waysData = JSON.parse(fs.readFileSync('osm_crossing_ways.json', 'utf8')).elements;
const tracksData = JSON.parse(fs.readFileSync('osm_tracks.json', 'utf8')).elements;

// Build map of nodes -> ways
const nodeToWays = new Map();
waysData.forEach(w => {
  if (w.nodes) {
    w.nodes.forEach(nid => {
      if (!nodeToWays.has(nid)) nodeToWays.set(nid, []);
      nodeToWays.get(nid).push(w);
    });
  }
});

// Also check tracksData nodes
tracksData.forEach(w => {
  if (w.nodes) {
    w.nodes.forEach(nid => {
      if (!nodeToWays.has(nid)) nodeToWays.set(nid, []);
      nodeToWays.get(nid).push(w);
    });
  }
});

function getDistMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

const levelCrossingNodes = crossingsData.filter(c => c.tags?.railway === 'level_crossing');

// Group within 50m (twin tracks)
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
    if (dist < 50) {
      group.push(levelCrossingNodes[j]);
      visited.add(levelCrossingNodes[j].id);
    }
  }
  groups.push(group);
}

console.log(`Analyzing ${groups.length} distinct crossing groups:`);

groups.forEach((g, idx) => {
  const primary = g[0];
  const nodeIds = g.map(n => n.id);
  const matchedWays = [];
  nodeIds.forEach(nid => {
    const ws = nodeToWays.get(nid) || [];
    matchedWays.push(...ws);
  });

  const highways = matchedWays.filter(w => w.tags?.highway);
  const railways = matchedWays.filter(w => w.tags?.railway);

  const hwNames = Array.from(new Set(highways.map(w => w.tags?.name || w.tags?.ref || w.tags?.highway))).filter(Boolean);
  const rwNames = Array.from(new Set(railways.map(w => w.tags?.name || w.tags?.usage || w.tags?.railway))).filter(Boolean);
  const explicitName = g.map(n => n.tags?.name).filter(Boolean)[0] || null;

  console.log(`[#${idx+1}] ID: osm/node/${primary.id} (${primary.lat.toFixed(5)}, ${primary.lon.toFixed(5)}) | Explicit: ${explicitName || 'None'} | Roads: ${hwNames.join(', ') || 'Unclassified road'} | Rail: ${rwNames.join(', ') || 'Rail Line'}`);
});
