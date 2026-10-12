import fs from 'fs';

const crossings = JSON.parse(fs.readFileSync('osm_crossings.json', 'utf8')).elements;
const levelCrossingNodes = crossings.filter(c => c.tags?.railway === 'level_crossing');

const nodeIds = levelCrossingNodes.map(n => n.id).join(',');
const query = `[out:json][timeout:60];
(
  node(id:${nodeIds});
  <;
);
out body;
`;

async function fetchIntersectingWaysBody() {
  const ep = 'https://overpass-api.de/api/interpreter';
  const res = await fetch(ep, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'FatakForecast-Amritsar/1.0 (https://fatakforecast.in; dev@fatakforecast.in)'
    },
    body: 'data=' + encodeURIComponent(query)
  });
  if (!res.ok) {
    console.error('Failed HTTP', res.status);
    return;
  }
  const json = await res.json();
  fs.writeFileSync('osm_crossing_ways_body.json', JSON.stringify(json, null, 2));
  console.log(`Saved osm_crossing_ways_body.json with ${json.elements?.length} elements`);
}

fetchIntersectingWaysBody();
