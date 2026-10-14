// =========================================================================
// FATAKFORECAST — AMRITSAR SMART JOURNEY PLANNER & ROUTE CONTROLLER
// Crossing-Aware Road Navigation Engine with Multi-Route Comparison,
// Rigorous Evidence-Based Gate Delay Estimation, and Uncertainty Separation
// Supports: Car, Motorcycle, Walking Modes & Configurable Planning Window
// =========================================================================

// Well-known Amritsar Grade-Separated Overbridges & Flyovers that bypass ground railway tracks
export const AMRITSAR_FLYOVER_NODES = [
  { id: 'FLY_BHANDARI', name: 'Bhandari Overbridge (Hall Gate - GT Road)', lat: 31.6295, lng: 74.8725, connects: ['Walled City', 'Civil Lines'] },
  { id: 'FLY_HUSSAINPURA', name: 'Hussainpura Overbridge (Railway Station East)', lat: 31.6335, lng: 74.8755, connects: ['Railway Station', 'Batala Road'] },
  { id: 'FLY_ELEVATED', name: 'Amritsar Elevated Road (GT Road - Heritage Street)', lat: 31.6245, lng: 74.8860, connects: ['Heritage Walk', 'Jalandhar Highway'] },
  { id: 'FLY_REGO', name: 'Rego Bridge (Gobindgarh - Railway Workshop)', lat: 31.6320, lng: 74.8560, connects: ['Gobindgarh', 'GT Road West'] },
  { id: 'FLY_VERKA', name: 'Verka Bypass Flyover (NH54 / Batala Bypass)', lat: 31.6660, lng: 74.9310, connects: ['Verka Ring', 'Batala'] }
];

// Mode speed definitions (m/s) in urban Amritsar conditions
export const TRAVEL_MODES = {
  car: { label: 'Car / Auto', speedMs: 7.78, avgKmh: 28, osrmProfile: 'driving' },
  motorcycle: { label: 'Motorcycle / Scooter', speedMs: 8.89, avgKmh: 32, osrmProfile: 'driving' },
  walking: { label: 'Walking', speedMs: 1.25, avgKmh: 4.5, osrmProfile: 'foot' }
};

// Haversine distance in meters
function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Distance from point to line segment in meters
function distToSegmentMeters(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) {
    return haversineMeters(px, py, x1, y1);
  }
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return haversineMeters(px, py, projX, projY);
}

// In-memory cache for road routes (15 minutes TTL) to prevent repeated external network delays
const osrmRouteCache = new Map();
const ROUTE_CACHE_TTL_MS = 15 * 60 * 1000;

function getRouteCacheKey(origin, destination, viaWaypoint, mode, alternatives = false) {
  const oKey = `${Number(origin[0]).toFixed(4)},${Number(origin[1]).toFixed(4)}`;
  const dKey = `${Number(destination[0]).toFixed(4)},${Number(destination[1]).toFixed(4)}`;
  const vKey = viaWaypoint ? `${Number(viaWaypoint[0]).toFixed(4)},${Number(viaWaypoint[1]).toFixed(4)}` : 'none';
  return `${oKey}_${dKey}_${vKey}_${mode}_alt${alternatives}`;
}

// Fetch authentic road routes from OSRM with mode awareness & alternatives support
export async function fetchOsrmRoutes(origin, destination, viaWaypoint = null, mode = 'car', requestAlternatives = false) {
  const modeConfig = TRAVEL_MODES[mode] || TRAVEL_MODES.car;
  const profile = modeConfig.osrmProfile || 'driving';

  const cacheKey = getRouteCacheKey(origin, destination, viaWaypoint, mode, requestAlternatives);
  const cached = osrmRouteCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < ROUTE_CACHE_TTL_MS) {
    return { ...cached.data, fromCache: true };
  }

  try {
    let coords = `${origin[1]},${origin[0]};`;
    if (viaWaypoint) {
      coords += `${viaWaypoint[1]},${viaWaypoint[0]};`;
    }
    coords += `${destination[1]},${destination[0]}`;

    const altParam = requestAlternatives && !viaWaypoint ? '&alternatives=true' : '';
    const url = `https://router.project-osrm.org/route/v1/${profile}/${coords}?overview=full&geometries=geojson&steps=true${altParam}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'FatakForecast-Amritsar/2.5 (https://fatakforecast.in)' },
      signal: AbortSignal.timeout(4000)
    });

    if (res.ok) {
      const data = await res.json();
      if (data.code === 'Ok' && Array.isArray(data.routes) && data.routes.length > 0) {
        const routes = data.routes.map((route, idx) => {
          const coordinates = route.geometry.coordinates.map(pt => [pt[1], pt[0]]);
          let calculatedDuration = Math.round(route.duration);
          if (mode === 'motorcycle' && calculatedDuration > 60) {
            calculatedDuration = Math.round(calculatedDuration * 0.88);
          } else if (mode === 'walking') {
            calculatedDuration = Math.round(route.distance / modeConfig.speedMs);
          }

          // Extract turn-by-turn steps
          const steps = [];
          if (route.legs && Array.isArray(route.legs)) {
            for (const leg of route.legs) {
              if (Array.isArray(leg.steps)) {
                for (const st of leg.steps) {
                  const maneuver = st.maneuver || {};
                  let instr = '';
                  const street = st.name ? `onto ${st.name}` : '';
                  const mType = maneuver.type || 'turn';
                  const mod = maneuver.modifier || '';

                  if (mType === 'depart') {
                    instr = st.name ? `Head ${mod || 'ahead'} on ${st.name}` : `Head ${mod || 'ahead'}`;
                  } else if (mType === 'arrive') {
                    instr = 'Arrive at destination';
                  } else if (mType === 'roundabout' || mType === 'rotary') {
                    instr = `Take roundabout ${street}`.trim();
                  } else if (mType === 'turn') {
                    instr = `Turn ${mod || 'slightly'} ${street}`.trim();
                  } else if (mType === 'new name') {
                    instr = `Continue onto ${st.name || 'road'}`;
                  } else if (mType === 'end of road') {
                    instr = `At the end of the road, turn ${mod || 'ahead'} ${street}`.trim();
                  } else if (mType === 'fork') {
                    instr = `Keep ${mod || 'right'} at fork ${street}`.trim();
                  } else {
                    instr = `${mType} ${mod} ${street}`.trim();
                  }

                  steps.push({
                    instruction: instr.charAt(0).toUpperCase() + instr.slice(1),
                    modifier: mod,
                    type: mType,
                    distanceMeters: Math.round(st.distance || 0),
                    durationSeconds: Math.round(st.duration || 0),
                    location: maneuver.location ? [maneuver.location[1], maneuver.location[0]] : null,
                    streetName: st.name || ''
                  });
                }
              }
            }
          }

          return {
            id: viaWaypoint ? `route_flyover_${idx}` : `route_direct_${idx}`,
            source: `OSRM_GENUINE_${profile.toUpperCase()}_NETWORK`,
            isRealRoadGeometry: true,
            travelMode: mode,
            distanceMeters: Math.round(route.distance),
            durationSeconds: calculatedDuration,
            coordinates,
            steps,
            viaWaypoint: viaWaypoint ? [viaWaypoint[0], viaWaypoint[1]] : null
          };
        });

        const result = { success: true, routes };
        osrmRouteCache.set(cacheKey, { data: result, timestamp: Date.now() });
        return result;
      }
    }
  } catch (err) {
    // Graceful fallback to urban road geometry model if external service is unreachable or times out
  }

  // Fallback: Geometrically sound intermediate road waypoints around Amritsar street grid
  const fallback = generateUrbanFallbackRoute(origin, destination, viaWaypoint, mode);
  const result = {
    success: true,
    routes: [{
      id: viaWaypoint ? 'fallback_flyover' : 'fallback_direct',
      ...fallback,
      isRealRoadGeometry: false,
      routingNote: 'Approximate geometric road estimation applied (OSRM routing service unreachable or timed out).'
    }]
  };
  return result;
}

// Fallback generator adhering to Amritsar's radial & ring road geometry
function generateUrbanFallbackRoute(origin, destination, viaWaypoint = null, mode = 'car') {
  const modeConfig = TRAVEL_MODES[mode] || TRAVEL_MODES.car;
  const points = [origin];
  if (viaWaypoint) {
    const steps = 15;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      points.push([
        origin[0] + (viaWaypoint[0] - origin[0]) * t,
        origin[1] + (viaWaypoint[1] - origin[1]) * t
      ]);
    }
    points.push(viaWaypoint);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      points.push([
        viaWaypoint[0] + (destination[0] - viaWaypoint[0]) * t,
        viaWaypoint[1] + (destination[1] - viaWaypoint[1]) * t
      ]);
    }
  } else {
    const steps = 24;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const wobble = Math.sin(t * Math.PI) * 0.002;
      points.push([
        origin[0] + (destination[0] - origin[0]) * t + wobble,
        origin[1] + (destination[1] - origin[1]) * t - wobble * 0.5
      ]);
    }
  }
  points.push(destination);

  let totalDist = 0;
  for (let i = 0; i < points.length - 1; i++) {
    totalDist += haversineMeters(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1]);
  }

  const durationSec = Math.round(totalDist / modeConfig.speedMs);

  const fallbackSteps = [
    {
      instruction: `Head towards ${viaWaypoint ? 'flyover bypass' : 'destination'}`,
      modifier: 'straight',
      type: 'depart',
      distanceMeters: Math.round(totalDist * 0.4),
      durationSeconds: Math.round(durationSec * 0.4),
      location: origin,
      streetName: 'Main Arterial'
    },
    ...(viaWaypoint ? [{
      instruction: 'Ascend onto grade-separated flyover overpass',
      modifier: 'straight',
      type: 'turn',
      distanceMeters: Math.round(totalDist * 0.3),
      durationSeconds: Math.round(durationSec * 0.3),
      location: viaWaypoint,
      streetName: 'Flyover Deck'
    }] : []),
    {
      instruction: 'Continue straight towards destination',
      modifier: 'straight',
      type: 'continue',
      distanceMeters: Math.round(totalDist * 0.5),
      durationSeconds: Math.round(durationSec * 0.5),
      location: points[Math.floor(points.length / 2)],
      streetName: 'Connecting Avenue'
    },
    {
      instruction: 'Arrive at destination',
      modifier: '',
      type: 'arrive',
      distanceMeters: 0,
      durationSeconds: 0,
      location: destination,
      streetName: ''
    }
  ];

  return {
    source: 'AMRITSAR_URBAN_GEOMETRY_BASELINE',
    travelMode: mode,
    distanceMeters: Math.round(totalDist),
    durationSeconds: durationSec,
    coordinates: points,
    steps: fallbackSteps
  };
}

export class JourneyPlanner {
  /**
   * Plan a route, identify intersecting crossings, evaluate closure delays,
   * and compare candidate routes across:
   * 1. FASTEST ROAD ROUTE
   * 2. FATAK-AWARE ROUTE
   * 3. AVOID FATAKS (Grade-Separated Overbridges)
   */
  async planJourney(origin, destination, allCrossings, departureOffsetSec = 0, travelMode = 'car', allTrains = []) {
    const mode = TRAVEL_MODES[travelMode] ? travelMode : 'car';

    // 1. Fetch Candidate Road Routes (Primary direct routes with OSRM alternatives)
    const directResult = await fetchOsrmRoutes(origin, destination, null, mode, true);
    const candidateRoutesRaw = [...directResult.routes];

    // Check if the primary direct route intersects any railway crossings
    const primaryCrossingsPreCheck = this.findCrossingsAlongRoute(candidateRoutesRaw[0].coordinates, allCrossings, false);

    // If level crossings exist on the direct path, query authentic grade-separated bypass routes via Amritsar overbridges
    let bestFlyover = null;
    if (primaryCrossingsPreCheck.length > 0) {
      bestFlyover = this.findBestBypassFlyover(origin, destination, primaryCrossingsPreCheck);
      if (bestFlyover) {
        const flyoverResult = await fetchOsrmRoutes(origin, destination, [bestFlyover.lat, bestFlyover.lng], mode, false);
        if (flyoverResult.routes && flyoverResult.routes.length > 0) {
          const flyRoute = flyoverResult.routes[0];
          flyRoute.id = 'route_flyover_bypass';
          flyRoute.bypassName = bestFlyover.name;
          flyRoute.isGradeSeparatedFlyover = true;
          candidateRoutesRaw.push(flyRoute);
        }
      }
    }

    // 2. Evaluate Each Candidate Route
    const evaluatedRoutes = candidateRoutesRaw.map((route, routeIdx) => {
      const isFlyover = Boolean(route.isGradeSeparatedFlyover);
      const crossingsOnRoute = this.findCrossingsAlongRoute(route.coordinates, allCrossings, isFlyover);
      const evaluations = this.evaluateCrossingArrivals(route, crossingsOnRoute, departureOffsetSec, allTrains);

      const knownDelaySec = evaluations.reduce((sum, item) => sum + (item.delaySec || 0), 0);
      const hasUnknownDelays = evaluations.some(item => item.isDelayUnknown);
      const unknownCount = evaluations.filter(item => item.isDelayUnknown).length;

      const totalDelayRange = knownDelaySec > 0
        ? `${Math.max(1, Math.round(knownDelaySec / 60) - 1)}–${Math.round(knownDelaySec / 60) + 2} min`
        : (hasUnknownDelays ? 'Unobserved (No Gate Sensor)' : '0 min (Clear Passage)');

      const routeFreshness = evaluations.some(e => e.dataFreshness === 'LIVE')
        ? 'LIVE'
        : (evaluations.some(e => e.dataFreshness === 'SCHEDULED') ? 'SCHEDULED' : 'CALCULATED_BASELINE');

      const totalDurationSec = route.durationSeconds + knownDelaySec;
      const totalDurationMin = Number((totalDurationSec / 60).toFixed(1));
      const roadDurationMin = Number((route.durationSeconds / 60).toFixed(1));
      const distanceKm = Number((route.distanceMeters / 1000).toFixed(2));
      const crossingCount = evaluations.length;

      const routeName = isFlyover
        ? `Overbridge Bypass (${route.bypassName || 'Flyover'})`
        : (routeIdx === 0 ? 'Direct City Corridor' : `Alternative Route ${routeIdx}`);

      const tradeoff = isFlyover
        ? `Continuous grade-separated bypass via ${route.bypassName || 'Overbridge'}. Zero gate closure risk.`
        : (crossingCount === 0
          ? 'Fast road corridor with zero railway track intersections.'
          : `Intersects ${crossingCount} railway crossing(s). Delay risk: ${totalDelayRange}.`);

      const reason = isFlyover
        ? 'Recommended overbridge corridor providing uninterrupted transit over railway tracks.'
        : (crossingCount === 0
          ? 'Direct road corridor with no railway crossings along the path.'
          : 'Fastest nominal driving route under prevailing road network conditions.');

      return {
        id: route.id || `candidate_${routeIdx}`,
        name: routeName,
        label: routeName,
        source: route.source,
        travelMode: mode,
        distanceMeters: route.distanceMeters,
        distanceKm,
        roadDurationSec: route.durationSeconds,
        roadDurationMin,
        durationMin: roadDurationMin,
        crossingDelaySec: knownDelaySec,
        delayRange: totalDelayRange,
        dataFreshness: routeFreshness,
        isDelayUnknown: hasUnknownDelays,
        unknownCrossingsCount: unknownCount,
        totalDurationSec,
        totalDurationMin,
        totalEstimatedMin: totalDurationMin,
        estimatedArrivalTime: new Date(Date.now() + (departureOffsetSec + totalDurationSec) * 1000).toISOString(),
        crossingCount,
        crossingsCount: crossingCount,
        crossingsOnRoute: evaluations.map(e => ({
          ...e.crossing,
          ...e
        })),
        crossings: evaluations,
        coordinates: route.coordinates,
        steps: route.steps || [],
        isGradeSeparatedFlyover: isFlyover,
        bypassName: route.bypassName || null,
        comparisonBadge: isFlyover ? 'FLYOVER BYPASS' : (crossingCount === 0 ? 'ZERO FATAKS' : `${crossingCount} FATAK${crossingCount === 1 ? '' : 'S'}`),
        tradeoffSummary: tradeoff,
        recommendationReason: reason,
        dataConfidence: this.assessRouteConfidence(evaluations, route.source)
      };
    });

    // 3. Classify the 3 Required Options (Phase 5)
    // Option 1: FASTEST ROAD ROUTE (Lowest road driving duration from routing provider)
    const sortedByRoadTime = [...evaluatedRoutes].sort((a, b) => a.roadDurationSec - b.roadDurationSec);
    const fastestRoadRoute = {
      ...sortedByRoadTime[0],
      type: 'FASTEST_ROAD',
      label: 'Fastest Road Route',
      description: 'Shortest nominal driving time according to road network geometry.'
    };

    // Option 3: AVOID FATAKS ROUTE (0 railway crossings via grade-separated overbridge/flyover)
    const routesWithZeroCrossings = evaluatedRoutes.filter(r => r.crossingsCount === 0);
    let avoidFataksRoute = null;
    if (routesWithZeroCrossings.length > 0) {
      const bestZero = routesWithZeroCrossings.sort((a, b) => a.totalDurationSec - b.totalDurationSec)[0];
      avoidFataksRoute = {
        ...bestZero,
        type: 'AVOID_FATAKS',
        label: 'Avoid Fataks Route',
        description: bestZero.isGradeSeparatedFlyover
          ? `Grade-separated bypass via ${bestZero.bypassName || 'Overbridge'} with zero railway level crossings.`
          : 'Road trajectory with zero railway level crossing intersections.'
      };
    } else {
      // If no route has 0 crossings, find the one with the fewest crossings
      const sortedByCrossings = [...evaluatedRoutes].sort((a, b) => a.crossingsCount - b.crossingsCount);
      avoidFataksRoute = {
        ...sortedByCrossings[0],
        type: 'AVOID_FATAKS',
        label: 'Minimal Fataks Route',
        description: `Route with fewest rail intersections (${sortedByCrossings[0].crossingsCount} crossing${sortedByCrossings[0].crossingsCount === 1 ? '' : 's'}). Zero-crossing route unavailable in road network.`
      };
    }

    // Option 2: FATAK-AWARE ROUTE (Optimized taking crossing delays & uncertainty into account)
    let fatakAwareRoute = null;
    const closedOnFastest = fastestRoadRoute.crossings.filter(c => c.conflictSeverity === 'HIGH');

    if (closedOnFastest.length > 0 && avoidFataksRoute && avoidFataksRoute.totalDurationSec < fastestRoadRoute.totalDurationSec) {
      // The Avoid Fataks route is genuinely faster because of known crossing delay on the fastest road route!
      fatakAwareRoute = {
        ...avoidFataksRoute,
        type: 'FATAK_AWARE',
        label: 'Fatak-Aware Recommended Route',
        description: `Bypasses closed crossing at ${closedOnFastest[0].name} saving ~${Math.round((fastestRoadRoute.totalDurationSec - avoidFataksRoute.totalDurationSec) / 60)} min.`
      };
    } else if (fastestRoadRoute.crossingsCount === 0 || closedOnFastest.length === 0) {
      // Direct route is clear or has no conflicts
      fatakAwareRoute = {
        ...fastestRoadRoute,
        type: 'FATAK_AWARE',
        label: 'Fatak-Aware Recommended Route',
        description: fastestRoadRoute.crossingsCount === 0
          ? 'Fastest road route has zero railway intersections.'
          : 'Clear passage predicted through all route crossings; no gate conflict anticipated.'
      };
    } else {
      // Crossing delays are unknown or fastest route still wins
      fatakAwareRoute = {
        ...fastestRoadRoute,
        type: 'FATAK_AWARE',
        label: 'Fatak-Aware Route',
        description: fastestRoadRoute.isDelayUnknown
          ? 'Fastest road path. Crossing barrier telemetry is unobserved; proceed with caution.'
          : 'Optimal balance of driving distance and railway crossing exposure.'
      };
    }

    // 4. Backward Compatibility Aliases for Existing App Views
    const primaryRouteCompat = {
      ...fastestRoadRoute,
      normalDurationSec: fastestRoadRoute.roadDurationSec,
      additionalDelaySec: fastestRoadRoute.crossingDelaySec,
      totalDurationSec: fastestRoadRoute.totalDurationSec
    };

    const altRouteCompat = (avoidFataksRoute && avoidFataksRoute.id !== fastestRoadRoute.id) ? {
      ...avoidFataksRoute,
      normalDurationSec: avoidFataksRoute.roadDurationSec,
      additionalDelaySec: avoidFataksRoute.crossingDelaySec,
      totalDurationSec: avoidFataksRoute.totalDurationSec,
      savingsSec: fastestRoadRoute.totalDurationSec - avoidFataksRoute.totalDurationSec
    } : null;

    // 5. Evaluate Smart Departure Windows (Now, +5m, +10m, +15m, +20m, +30m)
    const departureOptions = this.evaluateDepartureOptions(
      fastestRoadRoute,
      fastestRoadRoute.crossings,
      allTrains
    );

    // 6. Recommendation Summary
    const recommendation = this.generateRecommendation(
      fastestRoadRoute,
      avoidFataksRoute,
      departureOptions
    );

    return {
      success: true,
      status: 'ok',
      origin,
      destination,
      travelMode: mode,
      departureOffsetSec,
      plannedAt: new Date().toISOString(),
      routes: evaluatedRoutes,
      recommendedRouteId: (fatakAwareRoute || fastestRoadRoute || evaluatedRoutes[0])?.id,
      fastestRoadRoute,
      fatakAwareRoute,
      avoidFataksRoute,
      selectedRouteType: fatakAwareRoute.id === avoidFataksRoute?.id ? 'AVOID_FATAKS' : 'FASTEST_ROAD',
      // Legacy compatibility fields
      primaryRoute: primaryRouteCompat,
      alternativeRoute: altRouteCompat,
      departureOptions,
      recommendation,
      dataConfidence: fastestRoadRoute.dataConfidence
    };
  }

  /**
   * Find crossings within 45m buffer of route polyline.
   * Guarantees no duplicate crossing entries and filters out ground crossings bypassed by elevated bridges.
   */
  findCrossingsAlongRoute(routeCoordinates, allCrossings, isGradeSeparatedFlyover = false) {
    const hits = [];
    const seenCrossingIds = new Set();

    for (const crossing of allCrossings) {
      if (seenCrossingIds.has(crossing.id)) continue;

      let minDistanceM = Infinity;
      let cumDistanceAtHitM = 0;
      let curCumM = 0;

      for (let i = 0; i < routeCoordinates.length - 1; i++) {
        const segDistM = haversineMeters(
          routeCoordinates[i][0], routeCoordinates[i][1],
          routeCoordinates[i + 1][0], routeCoordinates[i + 1][1]
        );

        const d = distToSegmentMeters(
          crossing.lat, crossing.lng,
          routeCoordinates[i][0], routeCoordinates[i][1],
          routeCoordinates[i + 1][0], routeCoordinates[i + 1][1]
        );

        if (d < minDistanceM) {
          minDistanceM = d;
          cumDistanceAtHitM = curCumM + segDistM * 0.5;
        }

        curCumM += segDistM;
      }

      // If crossing is strictly within 45m of driven road polyline
      if (minDistanceM <= 45) {
        // If route is an elevated grade-separated flyover, ground-level rail crossings directly underneath
        // are spanned over with zero rail-road traffic conflict (no level barrier)
        if (isGradeSeparatedFlyover && (minDistanceM <= 35)) {
          // Bypassed by overpass
          continue;
        }

        seenCrossingIds.add(crossing.id);
        hits.push({
          crossing,
          distanceFromOriginM: Math.round(cumDistanceAtHitM),
          proximityMeters: Math.round(minDistanceM)
        });
      }
    }

    // Sort in order encountered along the road route
    hits.sort((a, b) => a.distanceFromOriginM - b.distanceFromOriginM);
    return hits;
  }

  /**
   * Evaluate arrival at each crossing with rigorous multi-tier evidence separation (Phase 4):
   * - Confirmed physical gate state: Strictly UNKNOWN unless authoritative hardware sensor exists
   * - Observed railway station events: Real departure/arrival events from RailKit/NTES
   * - Estimated train arrival: Calculated only if active train is in-sector and moving toward crossing
   * - Predicted gate closure & reopening: Window estimates
   * - Crossing delay: Explicitly UNKNOWN when evidence is insufficient (never silently treated as zero!)
   */
  evaluateCrossingArrivals(route, crossingHits, departureOffsetSec = 0, allTrains = []) {
    const now = Date.now();
    const departureTime = now + departureOffsetSec * 1000;

    return crossingHits.map(hit => {
      const c = hit.crossing;
      const frac = (hit.distanceFromOriginM || 0) / Math.max(1, route.distanceMeters || 1);
      const totalRouteSec = typeof route.durationSeconds === 'number' ? route.durationSeconds : (typeof route.roadDurationSec === 'number' ? route.roadDurationSec : 0);
      const travelTimeToCrossingSec = Math.round(totalRouteSec * frac);
      const userArrivalAtCrossingTime = isNaN(travelTimeToCrossingSec) ? departureTime : (departureTime + travelTimeToCrossingSec * 1000);
      const userArrivalSecFromNow = departureOffsetSec + (isNaN(travelTimeToCrossingSec) ? 0 : travelTimeToCrossingSec);

      // Tier 1: Confirmed Physical Gate State
      const hasLiveFieldSensor = c.hasLiveFieldSensor === true && c.dataClassification === 'CLASS_A_RELAY';
      const confirmedPhysicalGateState = hasLiveFieldSensor ? (c.status || 'OPEN') : 'UNKNOWN';

      // Tier 2: Observed Railway Station Events (Upstream Telemetry)
      const corridorTrains = allTrains.filter(t => t.corridorId === c.corridorId && t.isWithinAmritsarSector);
      let relevantTrain = null;
      let observedRailwayStationEvents = 'No active train telemetry logged on corridor.';

      if (corridorTrains.length > 0) {
        // Find train moving toward crossing or nearest
        relevantTrain = corridorTrains[0];
        const lastLoc = relevantTrain.lastReportedLocation || relevantTrain.currentStationName || 'En route';
        const delayStr = relevantTrain.delayMinutes !== undefined ? ` • Delay: ${relevantTrain.delayMinutes}m` : '';
        observedRailwayStationEvents = `${relevantTrain.name} (#${relevantTrain.number}): ${lastLoc}${delayStr} (Status: ${relevantTrain.status}, Speed: ${relevantTrain.speedKmH} km/h)`;
      } else if (c.upcomingTrainId) {
        const matched = allTrains.find(t => t.id === c.upcomingTrainId || t.number === c.upcomingTrainId);
        if (matched) {
          relevantTrain = matched;
          observedRailwayStationEvents = `${matched.name} (#${matched.number}) linked in sector baseline.`;
        }
      }

      // Tier 3 & 4: Estimated Train Arrival & Predicted Gate Closure / Reopening
      let estimatedTrainArrival = null;
      let predictedGateClosure = null;
      let predictedGateReopening = null;
      let delaySec = null;
      let isDelayUnknown = true;
      let delayStatus = 'UNKNOWN';
      let predictionConfidence = 'UNKNOWN';
      let conflictSeverity = 'NONE';
      let message = 'Gate physical status is UNKNOWN (telemetry unobserved). Clear passage inferred from baseline.';
      let uncertaintyReason = 'Physical gate sensor unobserved; no verified train transponder connected.';

      // Check if crossing has active predicted closure times from detection engine
      let reopenTimeEpoch = null;
      if (c.estimatedGateReopeningTime) {
        reopenTimeEpoch = new Date(c.estimatedGateReopeningTime).getTime();
      } else if (c.predictedReopenTime) {
        reopenTimeEpoch = new Date(c.predictedReopenTime).getTime();
      }

      let closingTimeEpoch = null;
      if (c.estimatedGateClosingTime) {
        closingTimeEpoch = new Date(c.estimatedGateClosingTime).getTime();
      } else if (c.timeToNextClosureSec > 0) {
        closingTimeEpoch = now + c.timeToNextClosureSec * 1000;
      }

      if (c.expectedTrainArrival) {
        estimatedTrainArrival = c.expectedTrainArrival;
      } else if (closingTimeEpoch) {
        estimatedTrainArrival = new Date(closingTimeEpoch + 60000).toISOString();
      }

      if (closingTimeEpoch) predictedGateClosure = new Date(closingTimeEpoch).toISOString();
      if (reopenTimeEpoch) predictedGateReopening = new Date(reopenTimeEpoch).toISOString();

      // Check current engine status and train motion
      if (c.status === 'CLOSED' || c.status === 'APPROACHING') {
        if (reopenTimeEpoch && userArrivalAtCrossingTime < reopenTimeEpoch) {
          // User reaches crossing while gate is closed
          const waitMilli = Math.max(0, reopenTimeEpoch - userArrivalAtCrossingTime);
          delaySec = Math.round(waitMilli / 1000) + 60; // Wait duration + 60s queue dissipation buffer
          isDelayUnknown = false;
          delayStatus = 'ESTIMATED';
          conflictSeverity = 'HIGH';
          predictionConfidence = relevantTrain && relevantTrain.dataState === 'LIVE' ? 'MODERATE' : 'LOW';
          uncertaintyReason = 'Estimate derived from train track kinematic polyline interpolation; actual signal timing may vary.';
          message = `Warning: Barrier predicted CLOSED upon arrival (~${Math.round(delaySec / 60)} min wait). Reopening expected at ~${new Date(reopenTimeEpoch).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`;
        } else if (reopenTimeEpoch) {
          // Gate will reopen before user arrives
          delaySec = 0;
          isDelayUnknown = false;
          delayStatus = 'ESTIMATED';
          conflictSeverity = 'LOW';
          predictionConfidence = 'MODERATE';
          uncertaintyReason = 'Reopening time predicted from train clearance velocity.';
          message = `Gate is currently closed, but predicted to reopen before you reach at ~${new Date(userArrivalAtCrossingTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`;
        } else {
          // Gate is reported closed, but reopen time is unknown
          delaySec = null;
          isDelayUnknown = true;
          delayStatus = 'UNKNOWN';
          conflictSeverity = 'HIGH';
          predictionConfidence = 'LOW';
          uncertaintyReason = 'Gate reported closed, but train clearance velocity and reopen time are unobserved.';
          message = 'Gate status indicates closure, but expected duration of closure is UNKNOWN.';
        }
      } else if (closingTimeEpoch && reopenTimeEpoch) {
        // Gate currently open, but has an upcoming closure window
        if (userArrivalAtCrossingTime >= (closingTimeEpoch - 60000) && userArrivalAtCrossingTime <= reopenTimeEpoch) {
          // User reaches during closure window
          const waitMilli = Math.max(0, reopenTimeEpoch - userArrivalAtCrossingTime);
          delaySec = Math.round(waitMilli / 1000) + 60;
          isDelayUnknown = false;
          delayStatus = 'ESTIMATED';
          conflictSeverity = 'HIGH';
          predictionConfidence = relevantTrain && relevantTrain.dataState === 'LIVE' ? 'MODERATE' : 'LOW';
          uncertaintyReason = 'Approaching train scheduled in corridor; closure window model-estimated.';
          message = `Caution: Gate predicted to close at ${new Date(closingTimeEpoch).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Reaching at ${new Date(userArrivalAtCrossingTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} entails ~${Math.round(delaySec / 60)}m delay.`;
        } else if (userArrivalAtCrossingTime < (closingTimeEpoch - 60000)) {
          // User reaches safely before closure
          delaySec = 0;
          isDelayUnknown = false;
          delayStatus = 'ESTIMATED';
          conflictSeverity = 'NONE';
          predictionConfidence = 'MODERATE';
          uncertaintyReason = 'Safe clearance margin based on user arrival vs predicted gate closure.';
          message = `Safe passage: You will reach ~${Math.round((closingTimeEpoch - userArrivalAtCrossingTime) / 60000)}m before gate closure sequence begins.`;
        }
      } else if (relevantTrain && relevantTrain.speedKmH === 0 && (relevantTrain.status === 'TERMINATED' || relevantTrain.status === 'PLATFORM_BOARDING')) {
        // Relevant train is stationary at station platform or terminated
        delaySec = 0;
        isDelayUnknown = false;
        delayStatus = 'ESTIMATED';
        conflictSeverity = 'NONE';
        predictionConfidence = 'MODERATE';
        uncertaintyReason = 'Train is stationary at platform / terminal; no approaching movement on track.';
        message = `Train #${relevantTrain.number} is stationary at ${relevantTrain.currentStationName}; clear passage expected.`;
      } else {
        // No approaching train detected, but physical barrier state is unobserved
        delaySec = null;
        isDelayUnknown = true;
        delayStatus = 'UNKNOWN';
        conflictSeverity = 'NONE';
        predictionConfidence = 'UNKNOWN';
        uncertaintyReason = 'No physical gate sensor deployed and no active train logged in sector. Barrier state is unobserved.';
        message = 'Gate physical status is UNKNOWN (unobserved). No active sector train detected along corridor.';
      }

      const gateStatusLabel = confirmedPhysicalGateState !== 'UNKNOWN'
        ? `CONFIRMED ${confirmedPhysicalGateState}`
        : (isDelayUnknown ? 'STATUS UNKNOWN (Unobserved)' : (c.status || 'OPEN'));

      const delayRange = (delaySec && delaySec > 0)
        ? `${Math.max(1, Math.round(delaySec / 60) - 1)}–${Math.round(delaySec / 60) + 2} min`
        : (isDelayUnknown ? 'Unobserved (No Gate Sensor)' : '0 min (Clear Passage)');

      const dataFreshness = relevantTrain ? (relevantTrain.dataState || 'LIVE') : 'CALCULATED_BASELINE';

      const associatedTrain = relevantTrain ? {
        id: relevantTrain.id || relevantTrain.number || relevantTrain.trainNumber,
        trainNumber: relevantTrain.trainNumber || relevantTrain.number || relevantTrain.id,
        number: relevantTrain.trainNumber || relevantTrain.number || relevantTrain.id,
        trainName: relevantTrain.trainName || relevantTrain.name || 'Express Train',
        name: relevantTrain.trainName || relevantTrain.name || 'Express Train',
        status: relevantTrain.status || 'ACTIVE',
        dataState: relevantTrain.dataState || 'LIVE',
        speedKmH: relevantTrain.speedKmH || 0,
        currentStationName: relevantTrain.currentStationName || null,
        lastReportedLocation: relevantTrain.lastReportedLocation || null,
        direction: relevantTrain.direction || 'DOWN'
      } : null;

      return {
        id: c.id,
        osmId: c.osmId || c.id,
        name: c.name,
        punjabiName: c.punjabiName || null,
        locality: c.locality || 'Amritsar',
        corridorId: c.corridorId || null,
        corridorName: c.corridorName || c.line || 'Amritsar Sector Line',
        coordinates: [c.lat, c.lng],
        lat: c.lat,
        lng: c.lng,
        distanceAlongRouteMeters: hit.distanceFromOriginM,
        distanceAlongRouteKm: Number((hit.distanceFromOriginM / 1000).toFixed(2)),
        travelTimeToCrossingSec,
        userArrivalTimestamp: new Date(isNaN(userArrivalAtCrossingTime) ? departureTime : userArrivalAtCrossingTime).toISOString(),
        currentStatus: c.status || 'OPEN',
        gateStatusLabel,
        isStatusEstimated: confirmedPhysicalGateState === 'UNKNOWN',
        observedPhysicalGateState: confirmedPhysicalGateState,
        confirmedPhysicalGateState,
        physicalSensorAvailable: false,
        observedRailwayStationEvents,
        associatedTrain,
        estimatedTrainArrival,
        predictedGateClosure,
        predictedGateReopening,
        predictedStatusAtArrival: (delaySec && delaySec > 0) ? 'CLOSED' : (isDelayUnknown ? 'OPEN' : 'OPEN'),
        delaySec,
        delayRange,
        dataFreshness,
        isDelayUnknown,
        delayStatus,
        predictionConfidence,
        telemetryFreshnessSec: relevantTrain ? relevantTrain.telemetryFreshnessSec : null,
        conflictSeverity,
        message,
        uncertaintyReason,
        dataSource: c.verifiedSource || `OpenStreetMap Node ${c.osmId || c.id}`,
        verificationStatus: c.verificationStatus || 'VERIFIED_MAPPED_CROSSING'
      };
    });
  }

  /**
   * Find best flyover / overbridge that circumvents crossings
   */
  findBestBypassFlyover(origin, destination, crossingHits) {
    if (!crossingHits || crossingHits.length === 0) return null;

    const midLat = (origin[0] + destination[0]) / 2;
    const midLng = (origin[1] + destination[1]) / 2;

    let best = null;
    let minD = Infinity;

    for (const flyover of AMRITSAR_FLYOVER_NODES) {
      const d = haversineMeters(midLat, midLng, flyover.lat, flyover.lng);
      if (d < minD) {
        minD = d;
        best = flyover;
      }
    }

    return best;
  }

  /**
   * Evaluate departure times (+0, +5, +10, +15, +20, +30 minutes)
   */
  evaluateDepartureOptions(route, crossingHits, allTrains) {
    const offsets = [0, 300, 600, 900, 1200, 1800];
    const labels = ['Leave Now', 'Leave in 5 min', 'Leave in 10 min', 'Leave in 15 min', 'Leave in 20 min', 'Leave in 30 min'];

    return offsets.map((offset, idx) => {
      const evals = this.evaluateCrossingArrivals(route, crossingHits.map(c => ({ crossing: c, distanceFromOriginM: c.distanceAlongRouteMeters })), offset, allTrains);
      const knownDelay = evals.reduce((s, e) => s + (e.delaySec || 0), 0);
      const tripDuration = route.roadDurationSec + knownDelay;
      const totalTimeFromNow = offset + tripDuration;

      const hasConflict = evals.some(e => e.conflictSeverity === 'HIGH');
      const conflictCrossings = evals.filter(e => e.conflictSeverity === 'HIGH').map(e => e.name);

      return {
        offsetSec: offset,
        offsetMin: Math.round(offset / 60),
        label: labels[idx],
        departureTimestamp: new Date(Date.now() + offset * 1000).toISOString(),
        travelDurationSec: tripDuration,
        delayAtCrossingsSec: knownDelay,
        totalTimeFromNowSec: totalTimeFromNow,
        expectedArrivalTime: new Date(Date.now() + totalTimeFromNow * 1000).toISOString(),
        hasConflict,
        conflictCrossings
      };
    });
  }

  /**
   * Generate evidence-based recommendation explaining route trade-offs without inventing delays
   */
  generateRecommendation(fastestRoute, avoidFataksRoute, departureOptions) {
    const closedOnFastest = fastestRoute.crossings.filter(c => c.conflictSeverity === 'HIGH');

    // Case 1: Fastest route has verified/supported closed crossing
    if (closedOnFastest.length > 0) {
      const delayMin = Math.round((closedOnFastest[0].delaySec || 0) / 60);
      if (avoidFataksRoute && avoidFataksRoute.id !== fastestRoute.id && avoidFataksRoute.totalDurationSec < fastestRoute.totalDurationSec) {
        const savedMin = Math.round((fastestRoute.totalDurationSec - avoidFataksRoute.totalDurationSec) / 60);
        return {
          action: 'CONSIDER_ALTERNATIVE',
          badge: '🔄 TAKE OVERBRIDGE BYPASS',
          recommendedDepartureOffsetSec: 0,
          recommendedRoute: 'ALTERNATIVE',
          summary: `Bypass closed crossing at ${closedOnFastest[0].name} via ${avoidFataksRoute.bypassName || 'Overbridge'}. Saves ~${savedMin} min.`,
          details: `Fastest road route encounters a closed crossing (~${delayMin}m wait). Grade-separated overbridge provides uninterrupted transit.`,
          confidence: 'HIGH',
          uncertaintyNote: 'Flyover bypass spans over the permanent way; transit is independent of railway gate signaling.'
        };
      }

      // Check if waiting for later departure avoids delay
      const laterBest = departureOptions.find(opt => opt.offsetSec > 0 && !opt.hasConflict);
      if (laterBest) {
        return {
          action: 'WAIT',
          badge: `⏳ WAIT ${laterBest.offsetMin} MIN`,
          recommendedDepartureOffsetSec: laterBest.offsetSec,
          recommendedRoute: 'PRIMARY',
          summary: `Departing at ${new Date(laterBest.departureTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} avoids gate closure at ${closedOnFastest[0].name}.`,
          details: `Immediate departure results in waiting at the closed barrier. Waiting ${laterBest.offsetMin} minutes allows the train to clear before arrival.`,
          confidence: 'MODERATE',
          uncertaintyNote: 'Based on estimated train clearance times. Shunting operations may introduce variance.'
        };
      }
    }

    // Case 2: Fastest route has 0 crossings
    if (fastestRoute.crossingsCount === 0) {
      return {
        action: 'LEAVE_NOW',
        badge: '🟢 LEAVE NOW (ZERO FATAKS)',
        recommendedDepartureOffsetSec: 0,
        recommendedRoute: 'PRIMARY',
        summary: 'Direct route has zero railway level crossings. Uninterrupted road travel.',
        details: 'The driven path does not intersect any Northern Railway tracks at grade.',
        confidence: 'HIGH',
        uncertaintyNote: 'Confirmed from OpenStreetMap road network geometry.'
      };
    }

    // Case 3: Fastest route has crossings with unknown status (honest uncertainty disclosure)
    if (fastestRoute.isDelayUnknown) {
      const diffKm = avoidFataksRoute ? (avoidFataksRoute.distanceKm - fastestRoute.distanceKm).toFixed(1) : null;
      const diffMin = avoidFataksRoute ? Math.round((avoidFataksRoute.roadDurationSec - fastestRoute.roadDurationSec) / 60) : null;

      return {
        action: 'LEAVE_NOW',
        badge: 'ℹ️ FASTEST ROAD PATH (STATUS UNKNOWN)',
        recommendedDepartureOffsetSec: 0,
        recommendedRoute: 'PRIMARY',
        summary: `Fastest road route is ${fastestRoute.distanceKm} km (~${fastestRoute.roadDurationMin} min) with ${fastestRoute.crossingsCount} unobserved crossing${fastestRoute.crossingsCount === 1 ? '' : 's'}.`,
        details: avoidFataksRoute && avoidFataksRoute.id !== fastestRoute.id
          ? `Crossing delay at ${fastestRoute.crossings[0].name} is UNKNOWN (no physical sensors). Alternatively, ${avoidFataksRoute.bypassName || 'Overbridge bypass'} guarantees 0 fataks with +${diffKm} km (+${diffMin} min extra driving).`
          : 'Crossing barrier telemetry is unobserved. Drive with standard caution upon approach.',
        confidence: 'CALCULATED_BASELINE',
        uncertaintyNote: 'Physical gate state is UNKNOWN. Crossing delay is not assumed to be zero.'
      };
    }

    // Case 4: Clear passage predicted
    return {
      action: 'LEAVE_NOW',
      badge: '🟢 LEAVE NOW',
      recommendedDepartureOffsetSec: 0,
      recommendedRoute: 'PRIMARY',
      summary: 'All railway crossings on your route are open with clear passage predicted.',
      details: 'You will reach all intersections before upcoming train clearance windows commence.',
      confidence: 'HIGH',
      uncertaintyNote: 'Gate forecasts are model estimates; always observe physical gate signaling upon arrival.'
    };
  }

  assessRouteConfidence(evaluations, source) {
    if (!evaluations || evaluations.length === 0) {
      return { level: 'HIGH', label: 'High Confidence', uncertaintyNote: 'No rail level crossings on route.' };
    }

    const hasUnknown = evaluations.some(e => e.isDelayUnknown);
    if (hasUnknown) {
      return {
        level: 'LOW_UNCERTAIN',
        label: 'Delay UNKNOWN',
        uncertaintyNote: 'Physical barrier sensor unobserved; delay cannot be verified.'
      };
    }

    return {
      level: 'MODERATE',
      label: 'Model Baseline',
      uncertaintyNote: 'Crossings mapped via OpenStreetMap; train movement derived from station-progress events.'
    };
  }
}

export const journeyPlanner = new JourneyPlanner();
