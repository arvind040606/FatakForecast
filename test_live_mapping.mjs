import { TelemetryService } from './backend/telemetryService.js';
import { TrainDetectionEngine } from './backend/trainDetectionEngine.js';
import fs from 'fs';

const ts = new TelemetryService();
const engine = new TrainDetectionEngine('test_key');
const corridors = JSON.parse(fs.readFileSync('./backend/amritsar_corridors_osm.json', 'utf8'));
const crossings = JSON.parse(fs.readFileSync('./backend/amritsar_crossings_osm.json', 'utf8'));

const corrJuc = corridors.find(c => c.id === 'CORR_ASR_JUC');
const jauraCrossing = crossings.find(c => c.id === 'osm/node/1006212111'); // Jaura Phatak

async function test() {
  const trainsToTest = ['12411', '11058', '12029', '14673'];
  for (const t of trainsToTest) {
    const res = await ts.fetchTrainLive(t);
    if (res.success && res.payload?.data) {
      const mapped = ts.mapRailRadarTrain(res.payload.data, new Date().toISOString());
      console.log(`\n=== Mapped Train #${t} ===`);
      console.log(`Name: ${mapped.name}`);
      console.log(`Origin: ${mapped.origin} -> Destination: ${mapped.destination}`);
      console.log(`Direction: ${mapped.direction}`);
      console.log(`Status: ${mapped.status}, DataState: ${mapped.dataState}`);
      console.log(`Station: ${mapped.currentStationName}, Lat: ${mapped.lat}, Lng: ${mapped.lng}`);
      console.log(`Distance from Amritsar: ${mapped.distanceFromAmritsarKm}km, InSector: ${mapped.isWithinAmritsarSector}`);
      console.log(`Speed: ${mapped.speedKmH}km/h (Live: ${mapped.hasLiveSpeedMeasurement}), Sectional: ${mapped.sectionalSpeedKmH}km/h`);

      const evalResult = engine.evaluateCrossingGateState(jauraCrossing, [mapped], corrJuc.coordinates, {
        isFeedFresh: true,
        feedStatus: 'CONNECTED'
      });
      console.log(`Jaura Phatak Evaluation: status=${evalResult.status}, classification=${evalResult.gateStatusClassification}, reason=${evalResult.statusReason}`);
    }
  }
}

test();
