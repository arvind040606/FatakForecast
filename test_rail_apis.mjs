import fs from 'fs';

const apiKey = 'rg_c4f54ed550214fbc80164ee093f29f30';

async function testEndpoints() {
  console.log('Testing potential railway API providers with key...');
  
  const tests = [
    { name: 'RailRadar (api.railradar.in)', url: 'https://api.railradar.in/api/v1/trains/12014/live', headers: { 'Authorization': `Bearer ${apiKey}`, 'x-api-key': apiKey } },
    { name: 'RailRadar (railradar.in)', url: 'https://railradar.in/api/v1/trains/12014/live', headers: { 'Authorization': `Bearer ${apiKey}` } },
    { name: 'RailwayAPI.com', url: `https://api.railwayapi.com/v2/live/train/12014/date/09-10-2026/apikey/${apiKey}/`, headers: {} },
    { name: 'RapidAPI Rail', url: 'https://irctc1.p.rapidapi.com/api/v1/liveTrainStatus?trainNo=12014&startDay=1', headers: { 'X-RapidAPI-Key': apiKey, 'X-RapidAPI-Host': 'irctc1.p.rapidapi.com' } }
  ];

  for (const t of tests) {
    try {
      console.log(`Checking ${t.name}: ${t.url}...`);
      const res = await fetch(t.url, { headers: t.headers, signal: AbortSignal.timeout(4000) });
      console.log(`  -> Status: ${res.status} ${res.statusText}`);
      const text = await res.text();
      console.log(`  -> Body snippet: ${text.slice(0, 150)}`);
    } catch (err) {
      console.log(`  -> Error: ${err.message}`);
    }
  }
}

testEndpoints();
