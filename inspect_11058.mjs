const key = 'rg_e2e9f6953f1946d6b7bdbf4ff0a8f433';

async function check() {
  const res = await fetch('https://railradar.in/api/v1/trains/11058/live', {
    headers: { 'Authorization': `Bearer ${key}` }
  });
  const json = await res.json();
  console.log('Train 11058:', json.data?.train?.name);
  console.log('Origin:', json.data?.train?.source?.name, '-> Destination:', json.data?.train?.destination?.name);
  console.log('currentLocation:', JSON.stringify(json.data?.currentLocation, null, 2));
  console.log('nextHalt:', JSON.stringify(json.data?.nextHalt, null, 2));
}

check();
