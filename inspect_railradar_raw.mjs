const key = 'rg_e2e9f6953f1946d6b7bdbf4ff0a8f433';

async function check() {
  const res = await fetch('https://railradar.in/api/v1/trains/12411/live', {
    headers: { 'Authorization': `Bearer ${key}` }
  });
  const json = await res.json();
  console.log('Keys in data:', Object.keys(json.data || {}));
  console.log('currentLocation:', JSON.stringify(json.data?.currentLocation, null, 2));
  console.log('train:', JSON.stringify(json.data?.train, null, 2));
  if (json.data?.route) {
    console.log('route length:', json.data.route.length);
    console.log('first 2 stops:', JSON.stringify(json.data.route.slice(0, 2), null, 2));
    const currentStop = json.data.route.find(r => r.stationCode === json.data?.currentLocation?.stationCode);
    console.log('current stop in route:', JSON.stringify(currentStop, null, 2));
  }
}

check();
