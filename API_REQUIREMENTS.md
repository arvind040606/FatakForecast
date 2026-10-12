# FATAKFORECAST — EXTERNAL API & SERVICES ARCHITECTURE SPECIFICATION
**Version:** 2.5.0 (Multi-Provider Live Aggregation: RailRadar, RailKit SDK, IPstack)  
**Security Policy:** Server-Side Credential Isolation Only (`backend/.env`). Zero client-side API key leakage.  
**Operational Doctrine:** Honest Scientific Disclosures — Predicted crossing statuses are transparently labeled as `ESTIMATED` unless connected to certified physical interlocking/axle-counter field hardware.

---

## 1. Architectural Overview & System Topology

FatakForecast combines multi-provider railway tracking, urban road routing, OpenStreetMap geographic infrastructure, server-side IP geolocation, and real-time crossing conflict detection into a cross-platform web and Android application.

```
+-----------------------------------------------------------------------------------+
|                           FATAKFORECAST ANDROID / WEB UI                          |
|  - React 19 + TypeScript + Vite + Capacitor 8 Native Plugins                      |
|  - Leaflet Map (CartoDB Dark Matter Raster Tiles)                                 |
|  - Local Storage / Capacitor Preferences Fallback Cache                           |
|  - Capacitor Local Notifications (@capacitor/local-notifications)                 |
|  - Capacitor Geolocation (@capacitor/geolocation)                                 |
|  - Zero API Keys in Client / Android Assets                                       |
+-----------------------------------------+-----------------------------------------+
                                          | JSON REST & WebSocket Telemetry
                                          v
+-----------------------------------------------------------------------------------+
|                        FATAKFORECAST BACKEND SERVER (Node.js)                     |
|  - Port 8787 (Express + `ws` WebSocket Engine)                                    |
|  - Multi-Provider Ingestion & Deduplication Pipeline (`trainAggregationService`)  |
|  - Credential Vault: backend/.env (Strict Server-Only)                            |
+---------+--------------------+-------------------+--------------------+-----------+
          |                    |                   |                    |
          +--------------------+                   |                    |
          |                    |                   |                    |
          v                    v                   v                    v
   [RailRadar Live]     [RailKit SDK v6]     [IPstack Geo]       [OSRM Routing]
   Live Train GPS       Station Boards &     Server-Side IP      Road Polyline &
   Sector Telemetry     Schedule Progress    Approximate Geo     ETAs (Car/Bike)
          |                    |                   |                    |
          +---------+----------+                   |                    |
                    |                              |                    |
                    v                              v                    v
        [Aggregation & Arbitration]         [Nominatim OSM]      [Overpass OSM]
        5-Digit Deduplication Engine        Live Geocoding       Level Crossings
        Freshness Timestamp Selection       Search & Reverse     & Track Vectors
```

---

## 2. Itemized Category Specifications

---

### Category A: Live Railway Tracking — RailRadar Telemetry Feed

* **Provider & Documentation:** RailRadar API (`https://railradar.in`)
* **API Purpose:** Real-time kinematic tracking of passenger and freight trains traversing the Northern Railway network (Ferozepur Division, Amritsar Junction sector).
* **Required Endpoints / Methods:**
  * `GET https://railradar.in/api/v1/trains/{trainNumber}/live` (Single train live status)
  * `GET https://railradar.in/api/v1/trains/{trainNumber}/schedule` (Timetable & station stops)
  * `GET /api/trains` (FatakForecast Server aggregation endpoint for client)
* **Authentication Method & Storage:**
  * Header: `x-api-key: <RAILRADAR_API_KEY>`
  * Storage: `backend/.env` under `RAILRADAR_API_KEY`. Excluded from version control. Never exposed to frontend clients.
* **Registration & Billing:**
  * Requires API registration on RailRadar developer portal.
* **Rate Limits & Applicable Terms:**
  * Free/Developer Tier: Rate-limited to ~60 requests per minute with Cloudflare DDoS mitigation.
  * Rapid consecutive parallel requests trigger HTTP 429 / Cloudflare handshake timeout; sequential polling with 600ms pauses between train queries is enforced by `telemetryService.js`.
* **Integration Status:**
  * Operational & Verified.
* **Test Results:**
  * Live queries to `https://railradar.in/api/v1/trains/12014/live` return HTTP 200 with ~425ms latency.
  * Verified response fields: `train_number`, `train_name`, `current_lat`, `current_lng`, `speed_kmh`, `delay_minutes`, `current_station_code`, `status`.
* **Fallback Strategy:**
  * When out-of-sector (>50 km from Amritsar) or unavailable, records seamlessly arbitrate to RailKit schedule/progress or cached NTES timetable schedules with transparent `SCHEDULED` or `TERMINATED` state badges.
* **Known Data Limitations:**
  * GPS coordinates occasionally experience signal loss between rural stations; speed is calculated from inter-station interval.
* **Required Environment Variables:**
  ```env
  RAILRADAR_API_KEY=your_railradar_api_key_here
  RAILRADAR_BASE_URL=https://railradar.in/api/v1
  TRAIN_POLL_INTERVAL_SEC=30
  SECTOR_RADIUS_KM=50
  ```

---

### Category B: Official Indian Railways Telemetry — RailKit SDK

* **Provider & Documentation:** RailKit (`https://www.npmjs.com/package/railkit`) — Official Node.js SDK for Indian Railways data.
* **API Purpose:**
  * Live train running status and station-level movement tracking.
  * Comprehensive train timetable and scheduled route information.
  * Station metadata and geographic coordinates.
  * Real-time station departure and arrival boards (`liveAtStation`).
* **Required Endpoints / SDK Methods:**
  * `railkit.stationByCode(stationCode)` — Station name, state, and geographic coordinates.
  * `railkit.getTrainInfo(trainNumber)` — Train details, days of run, classes, and complete station stop timetable.
  * `railkit.trackTrainV2(trainNumber, formattedDate)` — Live running status, current station, delay minutes, and status (`arrived` | `departed`).
  * `railkit.liveAtStation(stationCode, hoursWindow)` — Live arrival/departure board for a station within 2-4 hours.
* **Authentication Method & Storage:**
  * SDK Constructor: `new RailKit(process.env.RAILKIT_API_KEY)`
  * Storage: `backend/.env` under `RAILKIT_API_KEY`. Excluded from version control. Never exposed to frontend clients.
* **Registration & Billing:**
  * Requires developer API key issued by RailKit.
* **Rate Limits & Applicable Terms:**
  * Rate-limited according to developer tier. Mitigated by `railkitService.js` in-memory caching (60s TTL for live boards and running status; 24h TTL for station metadata and static schedules).
* **Integration Status:**
  * Operational & Verified against live endpoints.
* **Test Results:**
  * `railkit.stationByCode('ASR')`: Returned Amritsar Jn (`lat: 31.631752, lon: 74.858265, state: "Punjab"`).
  * `railkit.getTrainInfo('12014')`: Returned Amritsar Shatabdi timetable with 7 intermediate halts.
  * `railkit.trackTrainV2('12014', '09-10-2026')`: Returned live station code, delay, and arrival state.
  * `railkit.liveAtStation('ASR', 2)`: Returned 12 live trains scheduled at Amritsar Junction with platform numbers and delay status.
* **Verified Response Fields:**
  * Station Board: `trainNumber`, `trainName`, `scheduledArrival`, `scheduledDeparture`, `actualArrival`, `actualDeparture`, `delayMinutes`, `platform`.
  * Track Train V2: `trainNumber`, `trainName`, `stnCode`, `status`, `delayMinutes`, `currentLocation`.
* **Known Data Limitations:**
  * **Station Progress vs Raw GPS:** RailKit provides station-progress progress indicators (`stnCode`, `status: "departed"`), not continuous GPS satellite coordinates. FatakForecast cross-references `stnCode` against our verified station coordinate registry (`STATION_COORDINATES`) and OSM railway track curvature to determine physical position along the corridor.
  * **Strict Date Formatting:** `trackTrain` and `trackTrainV2` reject `"today"` with `"Invalid date format."`. They strictly require `DD-MM-YYYY` (e.g., `09-10-2026`). Handled automatically via `railkitService.getFormattedDate()`.
* **Required Environment Variables:**
  ```env
  RAILKIT_API_KEY=your_railkit_api_key_here
  ```

---

### Category C: Multi-Provider Aggregation & Arbitration Layer

* **Service Module:** `backend/trainAggregationService.js`
* **Purpose:** Combines RailRadar and RailKit feeds into a single unified telemetry pipeline without duplicating train records or fabricating data.
* **Aggregation & Deduplication Rules:**
  1. **Normalized Train Identifiers:** All train numbers are normalized to 5-digit strings (e.g. `12014`).
  2. **Deduplication:** When both RailRadar and RailKit return records for the same train number, the candidate with the fresher `lastPing` timestamp is selected as primary.
  3. **Secondary Validation:** The secondary provider's presence is annotated (`secondaryProvider: 'RailKit SDK'`) for cross-validation confidence.
  4. **Strict Status Classifications:**
     * `LIVE`: Valid, sufficiently recent live telemetry returned by a verified upstream provider (<120s old).
     * `STALE`: Provider previously responded with live data, but last successful ping is >120s old.
     * `SCHEDULED`: Train timetable schedule information is available, but train is not currently reporting live track movement.
     * `SIMULATED`: Test bench records active only when `DEMO_SIMULATION=true`.
     * `UNAVAILABLE`: Telemetry stream disconnected or unmapped.
  5. **No Silent Synthetic Substitution:** Provider outages are never masked by silently generating fake live train coordinates. Outages are surfaced transparently in health telemetry.
* **Health & Diagnostics Endpoint:**
  * `GET /api/telemetry/providers` — Returns operational status, latency, and sync timestamps for all integrated providers.

---

### Category D: Server-Side IP Geolocation — IPstack API

* **Provider & Documentation:** IPstack (`https://ipstack.com/documentation`)
* **API Purpose:** Server-side approximate IP geolocation to determine user's regional origin when device GPS is unavailable or permission is denied.
* **Required Endpoints / Methods:**
  * `GET http://api.ipstack.com/{ip}?access_key={access_key}` (Single IP lookup)
  * `GET http://api.ipstack.com/check?access_key={access_key}` (Caller IP address lookup)
  * Backend Proxy: `GET /api/location/ip` (Exposed to FatakForecast client without exposing key)
* **Authentication Method & Storage:**
  * URL Parameter: `?access_key=<IPSTACK_API_KEY>`
  * Storage: `backend/.env` under `IPSTACK_API_KEY`. Excluded from version control. Never exposed to frontend clients.
* **Registration & Billing:**
  * Free Developer Tier: 100 requests / month. Standard IP lookups.
* **Rate Limits & Applicable Terms:**
  * Free plan supports HTTP only (HTTPS requires paid subscription).
  * Request limit: 100 queries/month. To prevent quota exhaustion, `backend/ipstackService.js` implements a strict 24-hour in-memory cache (`ipstackCache`, TTL = 86,400s).
* **Security & Implementation Requirements:**
  * **Strict Server-Side Proxy:** IPstack is accessed exclusively from `backend/server.js`. The API key is never sent to the browser or Android bundle. Server-side proxying also avoids mixed-content browser blocking caused by free-tier HTTP endpoints.
  * **Private/Loopback IP Handling:** Private or loopback IPs (`127.0.0.1`, `::1`, `10.x`, `192.168.x`) automatically use `/check` to resolve the server's public gateway IP.
* **Integration Status:**
  * Operational & Verified.
* **Test Results:**
  * Query to `http://api.ipstack.com/check` returned HTTP 200 with genuine Punjab location (`lat: 31.2219, lng: 75.7671, city: "Phagwara", country: "India"`).
  * Subsequent call confirmed cache hit (`"cached": true`).
* **Operational Disclosures & Policies:**
  * **Never Substitutes Device GPS:** IP-based location is strictly a fallback. When device GPS permission is granted, device GPS is always preferred.
  * **Classification:** Labeled as `APPROXIMATE_IP` with disclaimer: `"Approximate IP-derived location. Accuracy ~5-25 km. Device GPS recommended."`
* **Required Environment Variables:**
  ```env
  IPSTACK_API_KEY=your_ipstack_api_key_here
  ```

---

### Category E: Road Routing & Kinematics — OSRM Engine

* **Provider & Documentation:** OSRM Public Routing Engine (`https://router.project-osrm.org`)
* **API Purpose:** Multi-modal urban routing (Car, Motorcycle, Walking) to compute route polyline geometries, total transit distances, normal driving durations, and intersection coordinates with railway corridors.
* **Required Endpoints / Methods:**
  * `GET https://router.project-osrm.org/route/v1/{driving|bike|foot}/{lng1},{lat1};{lng2},{lat2}?overview=full&geometries=geojson&steps=true`
  * `POST /api/journey/plan` (FatakForecast Server multi-modal routing engine)
* **Authentication Method & Storage:**
  * Public OSRM: No authentication key required.
* **Fallback Strategy:**
  * If external road router fails or times out (5000ms), `backend/journeyPlanner.js` automatically activates the calibrated `AMRITSAR_URBAN_GEOMETRY_BASELINE` routing model with urban circuity factor (1.32x road winding).
* **Required Environment Variables:**
  ```env
  OSRM_API_BASE_URL=https://router.project-osrm.org
  ROUTING_TIMEOUT_MS=5000
  ```

---

### Category F: Geocoding & Place Search — OpenStreetMap Nominatim

* **Provider & Documentation:** OpenStreetMap Nominatim (`https://nominatim.openstreetmap.org`)
* **API Purpose:** Real forward address geocoding (searching landmarks, bazaars, institutions) and reverse geocoding (converting GPS coordinates to street addresses).
* **Required Endpoints / Methods:**
  * `GET https://nominatim.openstreetmap.org/search?q={query}&format=json&addressdetails=1&countrycodes=in&limit={limit}`
  * `GET https://nominatim.openstreetmap.org/reverse?lat={lat}&lon={lng}&format=json&addressdetails=1`
  * Backend Proxy: `GET /api/places/search?q={query}&limit=6`
  * Backend Proxy: `GET /api/places/reverse?lat={lat}&lng={lng}`
* **Rate Limits & Terms:**
  * 1 request/second maximum; identifying User-Agent enforced. In-memory cache with 1-hour TTL avoids redundant calls.
* **Required Environment Variables:**
  ```env
  NOMINATIM_BASE_URL=https://nominatim.openstreetmap.org
  GEOCODING_USER_AGENT=FatakForecast-Amritsar/2.5 (https://fatakforecast.in; contact@fatakforecast.in)
  GEOCODING_CACHE_TTL_MS=3600000
  ```

---

### Category G: Map Tiles & Cartography

* **Provider:** CartoDB Dark Matter Basemaps (`https://carto.com/basemaps`)
* **Tile URL:** `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png`
* **Fallback:** Standard OSM tile server `tile.openstreetmap.org`.
* **Terms:** Free for open-source / non-commercial use with visual attribution.

---

### Category H: Railway Track Geometry & Crossing Infrastructure

* **Provider:** OpenStreetMap Overpass API (`https://overpass-api.de/api/interpreter`)
* **Purpose:** Verified spatial data for physical railway level crossings, rail corridors, track alignments, and grade-separated road overbridges (ROBs) in the Amritsar metropolitan area.
* **Verification Status:**
  * 37 real Amritsar level crossings (Jaura Phatak, Khalsa College, Putlighar, Batala Road, Vallah, Kot Khalsa, etc.) verified with genuine OSM node IDs, latitude, and longitude.
  * Grade-separated flyover bypasses (Bhandari Bridge, Elevated Road) mapped for alternate routing.
* **Classification:** `CLASS_A` (Verified Ground Truth Infrastructure).

---

### Category I: Physical Crossing Gate Status (Honest Telemetry Disclosure)

* **Operational Reality:**
  * **Indian Railways does NOT provide an open public API for field level crossing barrier positions.**
  * Field status can only be:
    1. **Estimated via Train Kinematics (`ESTIMATED`):** Predicted based on validated train position along track geometry (warning buffer ~90-120s before train arrival at crossing node).
    2. **Field Sensor Ground Truth (`UNAVAILABLE` without IoT):** Requires physical axle counters, track circuits, or optical barrier sensors.
* **System Policy & Rule Enforcement:**
  * **Never claim gate status is known from train telemetry alone.**
  * All crossing status badges on Web, Android, and API responses must explicitly include:
    * `isStatusEstimated: true`
    * `gateStatusLabel: "Estimated (Train Kinematics)"`
    * `dataClassification: "CLASS_B_CALCULATED" | "CLASS_D_UNAVAILABLE"`

---

## 3. Consolidated Environment Variables Reference

Below is the complete configuration template for `backend/.env` (and documented in `backend/.env.example`):

```env
# =========================================================================
# FATAKFORECAST BACKEND SERVER CONFIGURATION TEMPLATE
# =========================================================================
PORT=8787
NODE_ENV=production

# Category A: Live Train Tracking Feed (RailRadar)
RAILRADAR_API_KEY=your_railradar_api_key_here
RAILRADAR_BASE_URL=https://railradar.in/api/v1
TRAIN_POLL_INTERVAL_SEC=30
SECTOR_RADIUS_KM=50

# Category B: Official Indian Railways SDK (RailKit)
RAILKIT_API_KEY=your_railkit_api_key_here

# Category D: Server-Side IP Geolocation (IPstack)
IPSTACK_API_KEY=your_ipstack_api_key_here

# Category E: Road Routing & Kinematics (OSRM)
OSRM_API_BASE_URL=https://router.project-osrm.org
ROUTING_TIMEOUT_MS=5000

# Category F: Geocoding & Place Search (OSM Nominatim)
NOMINATIM_BASE_URL=https://nominatim.openstreetmap.org
GEOCODING_USER_AGENT=FatakForecast-Amritsar/2.5 (https://fatakforecast.in; contact@fatakforecast.in)
GEOCODING_CACHE_TTL_MS=3600000

# Category Storage & Persistence
SAVED_PLACES_DB_PATH=backend/saved_places_db.json

# Operational Safety & Gate Sensor Telemetry
FIELD_GATE_SENSOR_CONNECTED=false
REQUIRE_ESTIMATED_DISCLOSURE=true
```
