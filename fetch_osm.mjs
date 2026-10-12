import fs from 'fs';

const bbox = '31.55,74.75,31.72,75.02';

const crossingQuery = `[out:json][timeout:60];
(
  node["railway"="level_crossing"](${bbox});
  node["railway"="crossing"](${bbox});
  way["railway"="level_crossing"](${bbox});
);
out body;
`;

const railwayTrackQuery = `[out:json][timeout:60];
(
  way["railway"~"rail|narrow_gauge"](${bbox});
);
out body;
>;
out skel qt;
`;

async function fetchOverpass(query, name) {
  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
    'https://z.overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter'
  ];

  for (const ep of endpoints) {
    try {
      console.log(`Fetching ${name} from: ${ep}`);
      const res = await fetch(ep, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'FatakForecast-Amritsar/1.0 (https://fatakforecast.in; dev@fatakforecast.in)'
        },
        body: 'data=' + encodeURIComponent(query)
      });
      if (res.ok) {
        const json = await res.json();
        console.log(`Success for ${name}: found ${json.elements?.length || 0} elements`);
        return json;
      } else {
        console.warn(`Endpoint ${ep} returned HTTP ${res.status}`);
      }
    } catch (e) {
      console.warn(`Endpoint ${ep} error:`, e.message);
    }
  }
  throw new Error(`Failed to fetch ${name}`);
}

async function run() {
  try {
    const crossingsData = await fetchOverpass(crossingQuery, 'crossings');
    fs.writeFileSync('osm_crossings.json', JSON.stringify(crossingsData, null, 2));

    const tracksData = await fetchOverpass(railwayTrackQuery, 'railway_tracks');
    fs.writeFileSync('osm_tracks.json', JSON.stringify(tracksData, null, 2));

    console.log('DONE: osm_crossings.json and osm_tracks.json saved.');
  } catch (err) {
    console.error('Fatal fetch error:', err);
  }
}

run();
