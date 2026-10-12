const key = 'rg_e2e9f6953f1946d6b7bdbf4ff0a8f433';

async function check() {
  const res = await fetch('https://railradar.in/api/v1/trains/11058/live', {
    headers: { 'Authorization': `Bearer ${key}` }
  });
  const j = await res.json();
  console.log('11058 Current Location:', JSON.stringify(j.data?.currentLocation, null, 2));
  const route = j.data?.route || [];
  const near = route.filter(r => ['ASR', 'MOW', 'JNL', 'BEAS', 'BBSL', 'JUC'].includes(r.stationCode));
  near.forEach(s => console.log('  Stop:', s.stationName, s.stationCode, s.status, s.actualDeparture || s.actualArrival, 'Speed to next:', s.speedToNextStationKmph));
}

check();
