async function test() {
  const h = await fetch('http://localhost:8787/api/health').then(r => r.json());
  console.log('Health:', h.status, 'Total crossings:', h.metrics?.totalCrossings);

  const c = await fetch('http://localhost:8787/api/crossings').then(r => r.json());
  console.log('Crossings count:', c.crossings?.length);

  const f = await fetch('http://localhost:8787/api/forecasts').then(r => r.json());
  console.log('Forecasts count:', f.forecasts?.length);

  const a = await fetch('http://localhost:8787/api/analytics').then(r => r.json());
  console.log('Analytics accuracy status:', a.accuracyMeasurement?.status);

  const e = await fetch('http://localhost:8787/api/engine/status').then(r => r.json());
  console.log('Engine status:', e.status, 'Masked key:', e.apiKeyMasked, 'Configured:', e.configured);

  const single = await fetch('http://localhost:8787/api/crossings/osm/node/1006212111').then(r => r.json());
  console.log('Single crossing query:', single.crossing?.name, single.crossing?.id);
}
test();
