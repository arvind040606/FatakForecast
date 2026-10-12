const key = 'rg_e2e9f6953f1946d6b7bdbf4ff0a8f433';

async function check() {
  const res = await fetch('https://railradar.in/api/v1/trains/12411/live', {
    headers: { 'Authorization': `Bearer ${key}` }
  });
  const json = await res.json();
  const route = json.data?.route || [];
  const jucToAsr = route.filter(r => ['JUC', 'JRC', 'PGW', 'BEAS', 'JNL', 'MOW', 'ASR'].includes(r.stationCode));
  console.log('Stops on 12411 route:');
  jucToAsr.forEach(s => {
    console.log(`  Seq ${s.sequence}: ${s.stationName} (${s.stationCode}) - status: ${s.status}, schedArr: ${s.scheduledArrival}, actualArr: ${s.actualArrival}, delay: ${s.delayArrival}m, speed: ${s.speedToNextStationKmph} km/h`);
  });
}

check();
