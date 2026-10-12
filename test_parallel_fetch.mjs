const key = 'rg_e2e9f6953f1946d6b7bdbf4ff0a8f433';
const trains = [
  '12411', '11058', '12029', '22488', '15708', '12926',
  '14673', '14631', '12014', '12013', '12412', '12030',
  '12925', '15707', '18237', '18238', '13005', '13006'
];

async function testParallel() {
  const start = Date.now();
  console.log(`Starting parallel fetch of ${trains.length} trains...`);
  const promises = trains.map(t => 
    fetch(`https://railradar.in/api/v1/trains/${t}/live`, {
      headers: { 'Authorization': `Bearer ${key}` }
    })
    .then(async res => {
      if (res.ok) {
        const j = await res.json();
        return { train: t, ok: true, name: j.data?.train?.name, status: j.data?.status, loc: j.data?.currentLocation?.stationName };
      }
      return { train: t, ok: false, status: res.status };
    })
    .catch(err => ({ train: t, ok: false, error: err.message }))
  );

  const results = await Promise.all(promises);
  const elapsed = Date.now() - start;
  console.log(`Finished ${trains.length} fetches in ${elapsed}ms:`);
  results.forEach(r => {
    if (r.ok) {
      console.log(`  ✓ Train #${r.train}: ${r.name} (${r.status}) at ${r.loc}`);
    } else {
      console.log(`  ✗ Train #${r.train}: failed (${r.status || r.error})`);
    }
  });
}

testParallel();
