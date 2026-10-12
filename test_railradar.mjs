const key = 'rg_e2e9f6953f1946d6b7bdbf4ff0a8f433';
const trains = [
  // Major Amritsar corridor trains
  '12014', '14673', '12053', '22488', '14632', '12013',
  '12029', '12030', '12031', '12032', // Swarna Shatabdi / Amritsar Shatabdi
  '12925', '12926', // Paschim Express (Bandra - Amritsar)
  '18237', '18238', // Chhattisgarh Express (Bilaspur - Amritsar)
  '11057', '11058', // Amritsar Express (CSMT - Amritsar)
  '13005', '13006', // Amritsar Mail (Howrah - Amritsar)
  '12459', '12460', // New Delhi - Amritsar Intercity
  '12411', '12412', // Chandigarh - Amritsar Intercity
  '14631', // Dehradun - Amritsar Express
  '12379', '12380', // Jallianwala Bagh Express
  '14653', '14654', // Hisar - Amritsar
  '22423', '22424', // Gorakhpur - Amritsar
  '19611', '19612', // Ajmer - Amritsar
  '15707', '15708'  // Amrapali Express (Katihar - Amritsar)
];

async function check() {
  console.log('Querying RailRadar for ' + trains.length + ' Amritsar trains...');
  for (const t of trains) {
    try {
      const res = await fetch(`https://railradar.in/api/v1/trains/${t}/live`, {
        headers: { 'Authorization': `Bearer ${key}` }
      });
      if (res.ok) {
        const json = await res.json();
        const d = json.data;
        const cur = d?.currentLocation;
        console.log(`[${t}] ${d?.train?.name || 'TRAIN'}: Status=${d?.status}, Delay=${cur?.delayMinutes || 0}m, Stn=${cur?.stationName} (${cur?.stationCode}), Lat=${cur?.lat}, Lng=${cur?.lng}, Speed=${cur?.speedKmh}`);
      } else {
        console.log(`[${t}] HTTP ${res.status}`);
      }
    } catch (e) {
      console.log(`[${t}] Error: ${e.message}`);
    }
  }
}

check();
