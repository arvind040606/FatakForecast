import fs from 'fs';

const crossingsData = JSON.parse(fs.readFileSync('osm_crossings.json', 'utf8')).elements;
const waysData = JSON.parse(fs.readFileSync('osm_crossing_ways_body.json', 'utf8')).elements;

// Build map of nodes -> ways
const nodeToWays = new Map();
waysData.forEach(w => {
  if (w.type === 'way' && w.nodes) {
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

console.log(`Analyzing ${groups.length} distinct crossing groups with road metadata:`);

const results = [];

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

  const hwNames = Array.from(new Set(highways.map(w => w.tags?.name || (w.tags?.ref ? `${w.tags.ref} (${w.tags.highway})` : w.tags?.highway)))).filter(Boolean);
  const rwNames = Array.from(new Set(railways.map(w => w.tags?.name || w.tags?.usage || w.tags?.railway))).filter(Boolean);
  const explicitName = g.map(n => n.tags?.name).filter(Boolean)[0] || null;
  const barriers = g.map(n => n.tags?.barrier).filter(Boolean);
  const supervised = g.map(n => n.tags?.supervised).filter(Boolean);

  const item = {
    index: idx + 1,
    id: `osm/node/${primary.id}`,
    allNodes: g.map(n => `osm/node/${n.id}`),
    name: explicitName || (hwNames.length > 0 ? `${hwNames[0]} Level Crossing` : `Amritsar Level Crossing #${idx + 1}`),
    explicitName: explicitName,
    lat: primary.lat,
    lon: primary.lon,
    roadNames: hwNames,
    railCorridors: rwNames,
    barrier: barriers[0] || (highways.length > 0 ? 'unknown' : 'none'),
    supervised: supervised[0] || 'unknown',
    osmTags: primary.tags
  };
  results.push(item);
  console.log(`[#${idx+1}] ID: ${item.id} | Name: ${item.name} | Lat: ${item.lat.toFixed(6)}, Lon: ${item.lon.toFixed(6)} | Roads: ${hwNames.join(', ')} | Rail: ${rwNames.join(', ')}`);
});

fs.writeFileSync('osm_distinct_crossings.json', JSON.stringify(results, null, 2));
