const key = 'rg_e2e9f6953f1946d6b7bdbf4ff0a8f433';

async function check() {
  const trains = ['12029', '12411', '14673', '15708', '22488'];
  for (const t of trains) {
    const res = await fetch(`https://railradar.in/api/v1/trains/${t}/live`, {
      headers: { 'Authorization': `Bearer ${key}` }
    });
    const json = await res.json();
    const d = json.data;
    console.log(`[${t}] ${d?.train?.name}`);
    console.log(`    Route: ${d?.train?.source?.code} -> ${d?.train?.destination?.code}`);
    console.log(`    Location: ${d?.currentLocation?.stationName} (${d?.currentLocation?.stationCode}), status: ${d?.currentLocation?.status}, delay: ${d?.currentLocation?.delayMinutes}m`);
    console.log(`    Next: ${d?.nextHalt?.stationName} (${d?.nextHalt?.stationCode})`);
  }
}

check();
