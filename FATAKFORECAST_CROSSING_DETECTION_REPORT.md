# FatakForecast — Railway Crossing Intelligence & Provider Comparison Report

**System**: FatakForecast — Amritsar Railway Intelligence Platform  
**Target Corridor**: Northern Railway — Amritsar Operational Sector (JUC, TT, PTK, ATT)  
**Date**: October 10, 2026  
**Auditor**: Senior Railway Intelligence & Safety Infrastructure Engineer  

---

## Executive Summary

A forensic review of the railway crossing detection pipeline and live train telemetry providers (**RailRadar** and **RailKit**) was conducted. Targeted architectural improvements were implemented and verified across 168 automated regression tests, live REST endpoints, and the running user interface.

### Key Outcomes:
1. **Reliable Crossing Status Detection**: Corrected train-to-crossing association, route boundary checks, sectional speed distinctions, and provider freshness checks. Crossings now transition accurately between `OPEN`, `APPROACHING`, `CLOSURE_EXPECTED`, and `UNKNOWN`.
2. **Provider Evaluation**: **RailRadar** supplies complete stop-by-stop route timetables, locomotive GPS/bearing where available, delay minutes, and sectional track speeds. **RailKit** provides no unique necessary capability beyond static station dictionaries, and its API quota is exhausted (`QUOTA_EXCEEDED`).
3. **Repeated Requests Eliminated**: Added an automated quota circuit breaker in `backend/railkitService.js` and `backend/trainAggregationService.js`, completely stopping futile polling requests while RailKit quota is exhausted.
4. **Zero Fabrication**: Physical gate state is strictly separated and reported as `UNKNOWN` (no CRIS hardware relay exists). Stale or offline feeds report `UNKNOWN` rather than faking an `OPEN` road.

---

## Part 1: Forensic Comparison of RailRadar vs. RailKit

### 1.1 Architecture & Endpoints

| Attribute | RailRadar Live Tracking Gateway | RailKit Indian Railways SDK |
| :--- | :--- | :--- |
| **Protocol / Transport** | Direct HTTPS REST API (`fetch`) with in-memory 40s caching | Node.js SDK wrapper (`railkit` package) calling HTTPS endpoints |
| **Primary Endpoints** | `GET /trains/{trainNumber}/live` via `https://railradar.in/api/v1` | `railkit.trackTrainV2(cleanNum, date)` & `railkit.liveAtStation(stnCode, hours)` |
| **Authentication** | Bearer Token (`TRAIN_API_KEY`, masked: `rg_e2e9****f433`) | API Key via `railkit.configure()` (masked: `railkit_****29c93b`) |
| **Current Operational Status** | **CONNECTED** (HTTP 200, Latency: ~370–498 ms) | **QUOTA_EXCEEDED** ("Usage limit exceeded for current billing cycle") |

---

### 1.2 Data Fields & Capabilities Consumed

| Data Field / Capability | RailRadar (`telemetryService.js`) | RailKit (`railkitService.js`) | Advantage / Assessment |
| :--- | :--- | :--- | :--- |
| **Train Number & Name** | `payload.data.trainNumber`, `payload.data.trainName` | `data.trainInfo[0].name`, `data.trainNo` | **Identical** |
| **Route Origin & Terminus** | `train.source.name` & `code`, `train.destination.name` & `code` | `info.source.code`, `info.destination.code` | **RailRadar** (provides codes & human names) |
| **Station Progress Tracking** | `currentLocation.stationCode`, `currentLocation.stationName` | `currentLocation.stnCode`, `currentLocation.stnName` | **Identical** |
| **Geographic Positioning** | Authentic GPS coordinates when locomotive equipped (`hasLocomotiveGps: true`); fallback to route-stop linear interpolation | Maps station code to static station coordinate lookup table (`STATION_COORDINATES[code]`) | **RailRadar is superior** (supports authentic GPS + bearing angles) |
| **Speed Measurements** | Genuine live speedometer (`currentLocation.speedKmh`) or per-stop sectional speed (`route[].speedToNextStationKmph`) | Static overall journey average speed (`info.avgSpeed`), never raw live speedometer | **RailRadar is superior** |
| **Timetable / Schedule Stops** | Full 20+ station stop route with scheduled arrival/departure, actual times, delay arrival/departure, platforms, and sectional speeds | Not parsed in train tracking; V2 SDK only returned summary train info array | **RailRadar is far superior** |
| **Live Station Departures** | Derived from active sector trains in `TRAINS` database | `railkit.liveAtStation('ASR', 2)` (throws 404 or quota exceeded) | **RailRadar** handles station departures cleanly via fallback |

---

### 1.3 Does RailKit Provide Any Unique Necessary Information?
**Verdict: NO.**

1. **Timetables & Schedules**: RailRadar provides complete route station timetables, platforms, and sectional speeds. RailKit only supplied summary train info.
2. **Speed & Velocity**: RailKit never provided live speedometer measurements (`hasLiveSpeedMeasurement: false`). RailRadar provides both live locomotive speed and sectional speed profiles.
3. **Coordinates**: Both providers resolve station coordinates using Northern Railway station coordinates when GPS is absent. RailRadar can also ingest raw locomotive GPS.
4. **Live Station Board**: RailKit's `liveAtStation` was throwing 404 / quota exceeded errors. `server.js` already features a robust sector-train derivation that provides the live station departure board without RailKit.

### 1.4 Recommendation Regarding RailKit
- **Primary Recommendation**: **Make RailRadar the sole primary provider.**
- **Safe Transition**: Rather than immediately deleting the `railkit` package dependency, RailKit is now gated behind `railkitService.isAvailable()`.
- **Repeated Polling Disabled**: The circuit breaker flags `this.isQuotaExhausted = true` upon detecting quota limits, skipping all 10 polling requests per cycle.
- **Can RailKit be safely removed?** **YES.** RailKit can be completely decommissioned without any loss of functionality, schedules, route data, or crossing detection accuracy.

---

## Part 2: Railway Crossing Detection Pipeline Audit

### 2.1 Complete Data Flow & Pipeline Architecture

```mermaid
graph TD
    A["RailRadar Live Telemetry Response (/trains/{number}/live)"] --> B["Normalization & Timestamp Separation (telemetryService.js)"]
    B --> C["Candidate Validation (trainDetectionEngine.js)"]
    C -->|Valid| D["Corridor & Direction Filtering (CORR_ASR_JUC, TT, PTK, ATT)"]
    C -->|Invalid (Not Started, Stale, Off-Corridor)| X["Rejected from Crossing Processing"]
    D --> E["Geographic Polyline Projection (geographicValidator.js)"]
    E --> F["Route Origin & Topology Boundary Checks"]
    F --> G["Speed & ETA Integration (trainDetectionEngine.js)"]
    G --> H["Multi-Train Interlocking & Grouping"]
    H --> I["Explicit Status Classification (OPEN, APPROACHING, CLOSURE_EXPECTED, UNKNOWN)"]
    I --> J["REST API (/api/crossings, /api/forecasts) & WebSocket Broadcast"]
    J --> K["Frontend Presentation (CrossingsView, UpcomingClosuresView, 3D Map)"]
```

---

### 2.2 Root Causes Identified in Legacy Code

1. **Fabricated Default `OPEN` on Feed Outage**:
   - *Legacy Behavior*: When feeds were disconnected or data was missing, `evaluateCrossingGateState()` found 0 candidates and returned `status: 'OPEN'`, falsely assuring drivers that crossings were clear during a telemetry blackout.
   - *Fix*: Added feed health context inspection. If `feedStatus === 'DISCONNECTED'` or `isFeedFresh === false`, the engine returns `status: 'UNKNOWN'` and `gateStatusClassification: 'DATA UNAVAILABLE'`.
2. **Artificial Rolling Speeds for Stopped Trains**:
   - *Legacy Behavior*: When a train was stopped at a platform (`speedKmH: 0`), the code evaluated `train.sectionalSpeedKmH || train.speedKmH || 45` and defaulted to 45 km/h, generating fake ETAs and countdowns for stationary trains.
   - *Fix*: Stopped/stationary trains (`speedKmH === 0`, `isStationary: true`) away from crossings are recognized. Their ETA is set to `null` and no countdown is generated.
3. **Frontend Association Fallback Guesswork**:
   - *Legacy Behavior*: `CrossingsView.tsx` and `UpcomingClosuresView.tsx` contained `findImpactingTrainForCrossing()` fallbacks that could associate a nearby train even when the backend had no verified association.
   - *Fix*: Frontend strictly renders the backend's authoritative `crossing.upcomingTrainId` or `crossing.upcomingTrain`.
4. **Lack of Imminent vs. Approach Distinction**:
   - *Legacy Behavior*: Only binary `OPEN` or `CLOSED` states existed, forcing premature closure predictions.
   - *Fix*: Standardized on the 5-state contract: `OPEN`, `APPROACHING`, `CLOSURE_EXPECTED`, `CLOSURE_REPORTED`, and `UNKNOWN`.

---

### 2.3 Exact State Classification Rules & Centralized Thresholds

Configured in `CROSSING_DETECTION_THRESHOLDS` (`backend/trainDetectionEngine.js`):

```javascript
export const CROSSING_DETECTION_THRESHOLDS = {
  IMMINENT_WARNING_SEC: 150,           // 2.5 min boom barrier closure lead time
  IMMINENT_TRACK_DISTANCE_KM: 1.8,     // 1.8 km track circuit boundary
  APPROACH_HORIZON_MIN: 10.0,          // 10.0 min approach alert horizon
  APPROACH_DISTANCE_KM: 8.0,           // 8.0 km spatial approach boundary
  PRIMARY_FORECAST_HORIZON_MIN: 60,    // 60 min primary operational window
  EXTENDED_HORIZON_MIN: 120,           // 120 min extended timetable window
  STALE_TELEMETRY_TIMEOUT_SEC: 900,    // 15 min stale telemetry timeout
  GATE_CLEARANCE_BUFFER_SEC: 45,       // 45s safety clearance buffer after train clears
  MIN_ROLLING_SPEED_KMPH: 15,          // Minimum physical rolling velocity
  MAX_SECTION_SPEED_KMPH: 130,         // Maximum permanent-way sectional speed
  DEFAULT_SECTIONAL_SPEED_KMPH: 45     // Default Northern Railway sectional speed
};
```

#### Status Classification Logic:
- **`CLOSURE_EXPECTED`**:
  - A verified train on the same corridor is approaching ahead of the crossing.
  - Predicted arrival $\le 150\text{ s}$ OR track distance $\le 1.8\text{ km}$, OR current time falls within active closure block $[T_{\text{close}}, T_{\text{open}}]$.
- **`APPROACHING`**:
  - A verified train is approaching ahead of the crossing.
  - Predicted arrival $> 150\text{ s}$ AND arrival $\le 10\text{ min}$ (or track distance $\le 8.0\text{ km}$).
- **`OPEN`**:
  - No qualifying approaching train within the 10-minute approach horizon AND provider data is fresh.
  - (If a train is $8\text{--}60\text{ km}$ away, roadway is `OPEN` with an extended passage outlook; if a train just passed, `OPEN` with clear passage confirmation).
- **`CLOSURE_REPORTED`**:
  - Reserved exclusively for authoritative physical barrier sensors or CRIS interlocking relays.
- **`UNKNOWN`**:
  - Telemetry feed is offline/disconnected, observation is $> 15\text{ min}$ stale, or conflicting coordinates exist.

---

### 2.4 Timestamp Separation Integrity

To prevent kinematic loops from disguising stale provider data, four distinct timestamps are maintained:
1. `providerObservationTimestamp`: Timestamp of the train position observation provided by RailRadar.
2. `apiRetrievalTimestamp`: Exact time the server fetched the payload from the provider.
3. `calculationTimestamp`: Exact time the detection engine computed the crossing state.
4. `lastProviderSyncTimestamp`: Time of the last successful provider sync loop.

---

## Part 3: Automated Test Verification (16 Realistic Edge Cases)

All 16 edge cases (A through P) specified in the requirements were implemented and verified in `test_crossing_detection.mjs`:

| Edge Case | Description | Test Condition | Result |
| :--- | :--- | :--- | :--- |
| **A1** | Verified train in imminent window | Train 1.1 km away @ 50 km/h ($\approx 79\text{s}$) | **PASS**: Produces `CLOSURE_EXPECTED`, countdown active |
| **A2** | Verified train in approach window | Train 3.0 km away @ 40 km/h ($\approx 270\text{s}$) | **PASS**: Produces `APPROACHING`, countdown active |
| **B** | Train moving away from crossing | DOWN train past crossing traveling to Amritsar | **PASS**: Crossing remains `OPEN`, no false alerts |
| **C** | Train that has already passed crossing | UP train at Mananwala past Jaura Phatak | **PASS**: `OPEN`, `lastTrainPassed` records cleared train |
| **D** | Train route does not contain crossing | DEMU #74688 on Tarn Taran route vs Jaura Phatak | **PASS**: Crossing remains `OPEN`; Check 6 boundary rejects |
| **E** | Train outside mapped Amritsar corridor | Train 402 km away at New Delhi | **PASS**: Candidate validator rejects; crossing remains `OPEN` |
| **F** | Train that has not started | Train #12014 with `status: NOT_STARTED` | **PASS**: Candidate validator rejects; crossing remains `OPEN` |
| **G** | Terminated train | Train #12459 with `status: TERMINATED` | **PASS**: Candidate validator rejects; crossing remains `OPEN` |
| **H** | Stale provider observation | Observation timestamp 25 minutes old | **PASS**: Rejected by validator; no countdown fabricated |
| **I** | Missing train position | `lat: null, lng: null` | **PASS**: Rejected by validator; crossing remains `OPEN` |
| **J** | Missing live speed | Provider provides no raw GPS speedometer | **PASS**: Honest classification as `TIMETABLE_SECTIONAL_ESTIMATE` (Moderate confidence) |
| **K** | Contradictory station vs coordinates | Station reported as ASR, coordinates at Beas (>40 km) | **PASS**: Discrepancy > 25 km rejected with explicit reason |
| **L** | Multiple trains approaching same crossing | Train 1 @ 1.1 km, Train 2 @ 3.0 km | **PASS**: Earliest train prioritized; continuous closure block grouped |
| **M** | Sequential crossings on corridor | Gobindgarh South (1.1 km), Bhagtanwala (2.8 km), Kot Mit Singh (5.0 km) | **PASS**: Distances and ETAs increase monotonically |
| **N** | Train whose ETA cannot be established | Train stopped at platform 3 km away (`speedKmH: 0`) | **PASS**: Movement unestablished; ETA is null; crossing remains `OPEN` |
| **O** | Provider outage or quota exhaustion | `feedStatus: 'DISCONNECTED'` | **PASS**: Returns `UNKNOWN` with `DATA UNAVAILABLE` (Never fakes `OPEN`) |
| **P** | Unknown physical gate state | Any crossing prediction | **PASS**: `observedPhysicalGateState` is strictly `UNKNOWN` |

---

## Part 4: Complete Test Suite Summary

| Test Suite | Purpose | Tests Passed | Tests Failed | Success Rate |
| :--- | :--- | :---: | :---: | :---: |
| `test_crossing_detection.mjs` | 16 Realistic Edge Cases (A through P) | **55** | **0** | **100%** |
| `test_prediction_integrity.mjs` | Regression Suite (Synthetic, Stale, #12014, #74688) | **51** | **0** | **100%** |
| `test_complete_pipeline.mjs` | Data Pipeline & Sector Bounds Verification | **33** | **0** | **100%** |
| `test_smart_journey.mjs` | Smart Journey & Overbridge Bypass Integration | **29** | **0** | **100%** |
| `frontend` production build (`tsc -b && vite build`) | Type Safety & Component Assembly | **Done** | **0** | **100%** |
| **Total Automated Assertions** | **All Verification Scripts** | **168** | **0** | **100%** |

---

## Part 5: Real API Runtime Verification

Live runtime verification was performed against the live backend (`http://localhost:8787`):

### 5.1 Telemetry Health (`/api/health`)
```json
{
  "status": "healthy",
  "engineStatus": "OK",
  "metrics": {
    "totalCrossings": 36,
    "openCount": 36,
    "closureExpectedCount": 0,
    "approachingCount": 0,
    "unknownCount": 0,
    "activeSectorTrains": 5,
    "feedLatencyMs": 373,
    "feedStatus": "CONNECTED",
    "feedProvider": "RailRadar + RailKit Dual Provider Engine"
  },
  "providers": [
    {
      "name": "RailRadar Live Tracking Gateway",
      "status": "CONNECTED",
      "latencyMs": 373,
      "lastError": null
    },
    {
      "name": "RailKit Indian Railways SDK",
      "status": "QUOTA_EXCEEDED",
      "lastError": "Usage limit exceeded for current billing cycle (requests paused)"
    }
  ]
}
```

### 5.2 Live Sector Trains (`/api/trains`)
- **Train #74688** (*Bhagtanwala - Khem Karan DEMU*):  
  Reported at Khem Karan (`KEMK`, lat: 31.15, lng: 74.56). Status: `OUT_OF_SECTOR`, `speedKmH: 0`.  
  **Result**: Accurately isolated. Zero false alerts on Gobindgarh South or Bhagtanwala Yard crossings.
- **Train #12014** (*Amritsar - New Delhi Shatabdi Express*):  
  Reported `status: NOT_STARTED`, `lat: null, lng: null`.  
  **Result**: Fabricated New Delhi coordinates completely eliminated.
- **Train #22488** (*Vande Bharat Express*):  
  Reported `status: NOT_STARTED`, `lat: null, lng: null`.  
  **Result**: Correctly recognized as stationary platform service without artificial speed.

### 5.3 Live Crossings Sample (`/api/crossings` — Jaura Phatak)
```json
{
  "id": "osm/node/1006212111",
  "name": "Jaura Phatak (Joda Phatak)",
  "status": "OPEN",
  "statusReason": "No qualifying approaching train detected on corridor. Roadway clear.",
  "gateStatusLabel": "OPEN",
  "gateStatusClassification": "CLEAR PASSAGE",
  "observedPhysicalGateState": "UNKNOWN",
  "physicalSensorAvailable": false,
  "upcomingTrainId": null,
  "calculationTimestamp": "2026-10-10T15:39:10.227Z",
  "lastProviderSyncTimestamp": "2026-10-10T15:39:10.226Z"
}
```

---

## Part 6: Remaining Limitations

1. **Hardware Barrier Sensor Absence**: No physical CRIS interlocking relays or boom barrier microswitches are connected. Physical gate state remains strictly `UNKNOWN`.
2. **Provider Telemetry Latency**: Upstream railway telemetry updates every 30–60 seconds. Crossings within 1 km rely on the permanent-way track velocity projection between provider updates.
3. **RailKit Quota Exhaustion**: RailKit’s external account has hit its monthly quota limit. FatakForecast functions with 100% capability using RailRadar.

---

## Conclusion & Architectural Sign-off

FatakForecast now operates on an evidence-based crossing intelligence model:
- Verified approaching trains trigger `APPROACHING` and `CLOSURE_EXPECTED` windows along curved OSM permanent way track geometry.
- Cleared trains transition immediately to `OPEN` with clear passage confirmation.
- Stationary and unstarted trains do not trigger false alerts.
- Offline or stale telemetry yields `UNKNOWN` rather than faking an `OPEN` road.
- RailRadar serves as the primary live telemetry gateway with repeated RailKit requests paused.
