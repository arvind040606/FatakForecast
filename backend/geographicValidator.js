// =========================================================================
// FATAKFORECAST — GEOGRAPHIC VALIDATOR FOR TRAIN MOVEMENTS & CROSSINGS
// Strict Multi-Tier Spatial, Directional & Track Connectivity Validation
// =========================================================================

import { STATION_COORDINATES } from './stationCoordinates.js';

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function projectPointOnSegment(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 0) {
    return { point: a, fraction: 0, distKm: haversineKm(p[0], p[1], a[0], a[1]) };
  }
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  const proj = [a[0] + t * dx, a[1] + t * dy];
  return { point: proj, fraction: t, distKm: haversineKm(p[0], p[1], proj[0], proj[1]) };
}

export function projectPointOnPolyline(p, polyline) {
  let best = { segIndex: 0, point: polyline[0], fraction: 0, distKm: Infinity };
  for (let i = 0; i < polyline.length - 1; i++) {
    const proj = projectPointOnSegment(p, polyline[i], polyline[i + 1]);
    if (proj.distKm < best.distKm) {
      best = { segIndex: i, point: proj.point, fraction: proj.fraction, distKm: proj.distKm };
    }
  }
  return best;
}

export class GeographicValidator {
  static ASR_JUNCTION = { lat: 31.6338, lng: 74.8655 };
  static AMRITSAR_SECTOR_RADIUS_KM = 140.0; // 140 km operational radius (covers Jalandhar City, Beas, Jandiala, Batala, Pathankot approach, Tarn Taran, Attari, and Ludhiana approach corridor)
  static MAX_CORRIDOR_OFFSET_KM = 3.5;    // 3.5 km track deviation buffer (accommodates station yards, sidings, municipal nodes & cellular telemetry)

  /**
   * Check if a location is within the Amritsar railway operational sector
   */
  static isWithinSector(lat, lng) {
    if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) {
      return { inSector: false, distanceFromAsrKm: Infinity, reason: 'Invalid or missing coordinates' };
    }
    const dist = haversineKm(lat, lng, this.ASR_JUNCTION.lat, this.ASR_JUNCTION.lng);
    return {
      inSector: dist <= this.AMRITSAR_SECTOR_RADIUS_KM,
      distanceFromAsrKm: Number(dist.toFixed(2)),
      reason: dist <= this.AMRITSAR_SECTOR_RADIUS_KM 
        ? 'Within Amritsar Sector' 
        : `Outside sector: ${dist.toFixed(1)} km from Amritsar Junction (e.g. New Delhi is ~448 km away)`
    };
  }

  /**
   * Validate whether a coordinate lies physically near an OSM track corridor
   */
  static isPointOnCorridor(coords, corridorCoordinates) {
    if (!coords || typeof coords[0] !== 'number' || typeof coords[1] !== 'number' || isNaN(coords[0]) || isNaN(coords[1]) || (coords[0] === 0 && coords[1] === 0) || !corridorCoordinates || corridorCoordinates.length < 2) {
      return { isOnTrack: false, distKm: Infinity, segIndex: 0, fraction: 0, point: coords || [0, 0] };
    }
    const proj = projectPointOnPolyline(coords, corridorCoordinates);
    return {
      isOnTrack: proj.distKm <= this.MAX_CORRIDOR_OFFSET_KM,
      perpendicularDistanceMeters: Math.round(proj.distKm * 1000),
      segIndex: proj.segIndex,
      fraction: proj.fraction,
      point: proj.point
    };
  }

  /**
   * Calculate exact curved distance along the railway tracks between two polyline projections
   */
  static calculateArcLengthAlongTrack(corridorCoords, projA, projB) {
    if (!corridorCoords || corridorCoords.length < 2) return Infinity;
    
    // If on same segment
    if (projA.segIndex === projB.segIndex) {
      return haversineKm(projA.point[0], projA.point[1], projB.point[0], projB.point[1]);
    }

    const start = Math.min(projA.segIndex, projB.segIndex);
    const end = Math.max(projA.segIndex, projB.segIndex);

    let total = 0;
    // Partial start segment
    const startPoint = start === projA.segIndex ? projA.point : projB.point;
    total += haversineKm(startPoint[0], startPoint[1], corridorCoords[start + 1][0], corridorCoords[start + 1][1]);

    // Intermediate segments
    for (let i = start + 1; i < end; i++) {
      total += haversineKm(corridorCoords[i][0], corridorCoords[i][1], corridorCoords[i + 1][0], corridorCoords[i + 1][1]);
    }

    // Partial end segment
    const endPoint = end === projA.segIndex ? projA.point : projB.point;
    total += haversineKm(corridorCoords[end][0], corridorCoords[end][1], endPoint[0], endPoint[1]);

    return total;
  }

  /**
   * Comprehensive validation: Is train verified to be approaching crossing along permanent-way track?
   */
  static validateApproachingCrossing(train, crossing, corridorCoordinates) {
    if (!train || typeof train.lat !== 'number' || typeof train.lng !== 'number' || isNaN(train.lat) || isNaN(train.lng) || (train.lat === 0 && train.lng === 0) || train.lat < -90 || train.lat > 90 || train.lng < -180 || train.lng > 180) {
      return {
        isValid: false,
        isApproaching: false,
        hasCleared: false,
        rejectionReason: 'Train geographic coordinates are missing or invalid.',
        trackDistanceKm: null
      };
    }

    if (!crossing || typeof crossing.lat !== 'number' || typeof crossing.lng !== 'number' || isNaN(crossing.lat) || isNaN(crossing.lng) || (crossing.lat === 0 && crossing.lng === 0) || crossing.lat < -90 || crossing.lat > 90 || crossing.lng < -180 || crossing.lng > 180) {
      return {
        isValid: false,
        isApproaching: false,
        hasCleared: false,
        rejectionReason: 'Crossing geographic coordinates are missing or invalid.',
        trackDistanceKm: null
      };
    }

    // Check: Stale telemetry rejection
    if (train.isStale === true || train.dataState === 'STALE') {
      return {
        isValid: false,
        isApproaching: false,
        hasCleared: false,
        rejectionReason: 'Train update is older than 15 minutes. Waiting for fresh signal.',
        trackDistanceKm: null
      };
    }

    // Check 1: Sector bounds (within operational radius of Amritsar Junction)
    const sectorCheck = this.isWithinSector(train.lat, train.lng);
    if (!sectorCheck.inSector) {
      return {
        isValid: false,
        isApproaching: false,
        hasCleared: false,
        rejectionReason: `Train is outside Amritsar area (${sectorCheck.distanceFromAsrKm} km away).`,
        trackDistanceKm: null
      };
    }

    // Check 2: Corridor match & Track Connectivity (Avoid false associations based solely on geographic proximity)
    if (!train.corridorId || !crossing.corridorId || train.corridorId !== crossing.corridorId) {
      return {
        isValid: false,
        isApproaching: false,
        hasCleared: false,
        rejectionReason: `Corridor mismatch: Train is on a different railway line than this crossing.`,
        trackDistanceKm: null
      };
    }

    // Check 2b: Direction validation (Direction must be verified UP or DOWN)
    const dirUpper = String(train.direction || '').toUpperCase();
    if (dirUpper !== 'UP' && dirUpper !== 'DOWN') {
      return {
        isValid: false,
        isApproaching: false,
        hasCleared: false,
        rejectionReason: `Train travel direction is being confirmed before predicting crossing time.`,
        trackDistanceKm: null
      };
    }

    // Check 3: Track alignment of train (must be on corridor or approaching mainline corridor terminus)
    const trainProj = this.isPointOnCorridor([train.lat, train.lng], corridorCoordinates);
    let isExtendedApproach = false;
    let distToCorridorTerminusKm = 0;
    let isDirectBranchApproach = false;
    let directBranchTrackDistKm = 0;

    if (!trainProj.isOnTrack) {
      if (train.direction === 'DOWN' && corridorCoordinates && corridorCoordinates.length > 0) {
        const terminus = corridorCoordinates[corridorCoordinates.length - 1];
        const distToTerminus = haversineKm(train.lat, train.lng, terminus[0], terminus[1]);
        const distTrainToAsr = haversineKm(train.lat, train.lng, this.ASR_JUNCTION.lat, this.ASR_JUNCTION.lng);
        const distTerminusToAsr = haversineKm(terminus[0], terminus[1], this.ASR_JUNCTION.lat, this.ASR_JUNCTION.lng);
        const distCrossingToAsr = haversineKm(crossing.lat, crossing.lng, this.ASR_JUNCTION.lat, this.ASR_JUNCTION.lng);

        // Train must be within Amritsar operational sector or within 140km from corridor terminus
        if (distTrainToAsr <= this.AMRITSAR_SECTOR_RADIUS_KM || distToTerminus <= 140.0) {
          let corridorMatch = false;
          if (train.corridorId && crossing.corridorId && train.corridorId === crossing.corridorId) {
            corridorMatch = true;
          } else if (Array.isArray(train.schedule) && train.schedule.length > 0) {
            let termCodes = [];
            if (crossing.corridorId === 'CORR_ASR_JUC') termCodes = ['JUC', 'JRC', 'BEAS', 'JNL', 'MOW', 'ASR'];
            else if (crossing.corridorId === 'CORR_ASR_PTK') termCodes = ['PTK', 'KNG', 'BAT', 'VKA', 'ASR'];
            else if (crossing.corridorId === 'CORR_ASR_TT') termCodes = ['TTO', 'DUQ', 'BGTN', 'ASR'];
            else if (crossing.corridorId === 'CORR_ASR_ATT') termCodes = ['ATT', 'CIA', 'ASR'];
            corridorMatch = train.schedule.some(s => termCodes.includes(s.stationCode || s.stnCode));
          }

          if (corridorMatch) {
            // Check if DOWN train has already passed this crossing (closer to Amritsar Jn than the crossing)
            if (distTrainToAsr < distCrossingToAsr - 0.7) {
              const distFromCrossing = haversineKm(train.lat, train.lng, crossing.lat, crossing.lng);
              return {
                isValid: true,
                isApproaching: false,
                hasCleared: true,
                isTraversing: false,
                isOppositeDirection: true,
                rejectionReason: `Train is travelling inbound (DOWN) and has already cleared this crossing.`,
                trackDistanceKm: Number(distFromCrossing.toFixed(2))
              };
            }

            // Route schedule analysis
            let routedViaTerminus = false;
            if (Array.isArray(train.schedule) && train.schedule.length > 0) {
              const currCode = train.currentStationCode || train.stationCode;
              const currStop = train.schedule.find(s => (s.stationCode === currCode || s.stnCode === currCode));
              let termCodes = [];
              if (train.corridorId === 'CORR_ASR_JUC' || crossing.corridorId === 'CORR_ASR_JUC') termCodes = ['JUC', 'JRC'];
              else if (train.corridorId === 'CORR_ASR_PTK' || crossing.corridorId === 'CORR_ASR_PTK') termCodes = ['PTK', 'KNG', 'BAT', 'VKA'];
              else if (train.corridorId === 'CORR_ASR_TT' || crossing.corridorId === 'CORR_ASR_TT') termCodes = ['TTO', 'DUQ', 'BGTN'];
              else if (train.corridorId === 'CORR_ASR_ATT' || crossing.corridorId === 'CORR_ASR_ATT') termCodes = ['ATT', 'CIA'];

              const termStop = train.schedule.find(s => termCodes.includes(s.stationCode || s.stnCode));
              if (currStop && termStop && termStop.distance > currStop.distance) {
                distToCorridorTerminusKm = termStop.distance - currStop.distance;
                routedViaTerminus = true;
              }
            }

            if (routedViaTerminus || distTrainToAsr >= distTerminusToAsr - 2.0) {
              if (distToCorridorTerminusKm <= 0) {
                distToCorridorTerminusKm = distToTerminus * 1.12; // Standard railway tortuosity factor
              }
              isExtendedApproach = true;
            } else {
              // Direct approach from closer branch or parallel alignment heading towards crossing & Amritsar
              directBranchTrackDistKm = Math.max(0.5, haversineKm(train.lat, train.lng, crossing.lat, crossing.lng) * 1.10);
              isDirectBranchApproach = true;
            }
          }
        }
      } else if (train.direction === 'UP' && corridorCoordinates && corridorCoordinates.length > 0) {
        const terminus = corridorCoordinates[corridorCoordinates.length - 1];
        const distTrainToAsr = haversineKm(train.lat, train.lng, this.ASR_JUNCTION.lat, this.ASR_JUNCTION.lng);
        const distTerminusToAsr = haversineKm(terminus[0], terminus[1], this.ASR_JUNCTION.lat, this.ASR_JUNCTION.lng);
        const distCrossingToAsr = haversineKm(crossing.lat, crossing.lng, this.ASR_JUNCTION.lat, this.ASR_JUNCTION.lng);

        // If UP train has travelled further outbound than the crossing and is at/past corridor terminus
        if (distTrainToAsr > distCrossingToAsr && distTrainToAsr >= distTerminusToAsr - 2.0) {
          const distFromCrossing = haversineKm(train.lat, train.lng, crossing.lat, crossing.lng);
          return {
            isValid: true,
            isApproaching: false,
            hasCleared: true,
            isTraversing: false,
            isOppositeDirection: true,
            rejectionReason: `Train is travelling outbound (UP) and has already cleared this crossing.`,
            trackDistanceKm: Number(distFromCrossing.toFixed(2))
          };
        }
      }

      if (!isExtendedApproach && !isDirectBranchApproach) {
        return {
          isValid: false,
          isApproaching: false,
          rejectionReason: `Train is currently outside the local track section.`,
          trackDistanceKm: null
        };
      }
    }

    // Check 4: Track alignment of crossing (must be within 850m of this corridor)
    const crossingProj = projectPointOnPolyline([crossing.lat, crossing.lng], corridorCoordinates);
    if (crossingProj.distKm > 0.85) {
      return {
        isValid: false,
        isApproaching: false,
        hasCleared: false,
        rejectionReason: `Crossing is not located on this railway line.`,
        trackDistanceKm: null
      };
    }

    // Check 6: Route Origin Boundary Validation (Outbound trains cannot approach crossings behind their origin)
    if (train.origin && corridorCoordinates && corridorCoordinates.length > 0) {
      const origCode = String(train.origin).toUpperCase().replace(/[^A-Z]/g, '');
      const origStation = STATION_COORDINATES[origCode] || Object.values(STATION_COORDINATES).find(s => train.origin.includes(s.name.split(' ')[0]));
      if (origStation) {
        const origProj = projectPointOnPolyline([origStation.lat, origStation.lng], corridorCoordinates);
        if (origProj.distKm <= 1.5) { // Origin station is physically situated on this corridor
          if (train.direction === 'UP' && crossingProj.segIndex < origProj.segIndex - 0.5) {
            return {
              isValid: false,
              isApproaching: false,
              hasCleared: false,
              rejectionReason: `Crossing is behind the train's starting point (${train.origin}).`,
              trackDistanceKm: null
            };
          }
        }
      }
    }

    // Check 6b: Route Schedule Sequence Validation (Train cannot approach crossings near stations it has already passed)
    if (Array.isArray(train.schedule) && train.schedule.length > 0) {
      const currCode = train.currentStationCode || train.stationCode;
      const currIndex = train.schedule.findIndex(s => (s.stationCode === currCode || s.stnCode === currCode));
      if (currIndex !== -1) {
        // Find nearest station to this crossing on the corridor
        let nearestStationOnRoute = null;
        let minCrossingToStnDist = Infinity;
        for (const stop of train.schedule) {
          const sCode = stop.stationCode || stop.stnCode;
          const stnObj = STATION_COORDINATES[sCode];
          if (stnObj) {
            const d = haversineKm(crossing.lat, crossing.lng, stnObj.lat, stnObj.lng);
            if (d < minCrossingToStnDist) {
              minCrossingToStnDist = d;
              nearestStationOnRoute = stop;
            }
          }
        }
        if (nearestStationOnRoute && minCrossingToStnDist < 4.0) {
          const targetStnCode = nearestStationOnRoute.stationCode || nearestStationOnRoute.stnCode;
          const stnIndex = train.schedule.findIndex(s => {
            const code = s.stationCode || s.stnCode;
            return Boolean(code && targetStnCode && code === targetStnCode);
          });
          if (stnIndex !== -1 && stnIndex < currIndex) {
            // Station was already passed in the timetable schedule!
            const distFromCrossing = haversineKm(train.lat, train.lng, crossing.lat, crossing.lng);
            return {
              isValid: true,
              isApproaching: false,
              hasCleared: true,
              isTraversing: false,
              isOppositeDirection: true,
              rejectionReason: `Train has already passed ${nearestStationOnRoute.stationName || nearestStationOnRoute.stationCode} (current progress: ${currCode}).`,
              trackDistanceKm: Number(distFromCrossing.toFixed(2))
            };
          }
        }
      }
    }

    // Check 7: Contradictory Station Progress vs Geographic Coordinates
    const stnCode = train.currentStationCode || train.stationCode;
    if (stnCode && STATION_COORDINATES[stnCode]) {
      const stn = STATION_COORDINATES[stnCode];
      const distFromReportedStation = haversineKm(train.lat, train.lng, stn.lat, stn.lng);
      if (distFromReportedStation > 25.0) {
        return {
          isValid: false,
          isApproaching: false,
          rejectionReason: `Location update is being refreshed with latest station data.`,
          trackDistanceKm: null
        };
      }
    }

    // Check 8: Directional Progress and Distance along Track Polyline
    // If UP: Train travels toward higher indices (away from Amritsar Jn)
    // If DOWN: Train travels toward lower indices (towards Amritsar Jn)
    const isInbound = train.direction === 'DOWN';
    let isApproaching = false;
    let hasCleared = false;
    let isTraversing = false;

    if (isExtendedApproach) {
      // Inbound train approaching corridor terminus at Jalandhar City (last index) and heading DOWN to index 0
      const lastSegIdx = corridorCoordinates.length - 1;
      const distFromTerminusToCrossing = this.calculateArcLengthAlongTrack(
        corridorCoordinates,
        { segIndex: lastSegIdx, point: corridorCoordinates[lastSegIdx] },
        crossingProj
      );
      const totalTrackDistKm = distToCorridorTerminusKm + distFromTerminusToCrossing;

      return {
        isValid: true,
        isApproaching: true,
        isTraversing: false,
        hasCleared: false,
        trackDistanceKm: Number(totalTrackDistKm.toFixed(2)),
        rejectionReason: null
      };
    }

    if (isDirectBranchApproach) {
      return {
        isValid: true,
        isApproaching: true,
        isTraversing: false,
        hasCleared: false,
        trackDistanceKm: Number(directBranchTrackDistKm.toFixed(2)),
        rejectionReason: null
      };
    }

    // True physical arc-length along the track between train and crossing
    const trackDistKm = this.calculateArcLengthAlongTrack(corridorCoordinates, trainProj, crossingProj);

    // Standard passenger rake clearance buffer: 18-24 coaches ≈ 0.55 km + 0.05 km safety buffer
    const rakeLengthKm = ((train.rakeLengthM || 550) + 50) / 1000;

    if (isInbound) {
      // Inbound train (DOWN): Moves towards index 0 (Amritsar Jn)
      if (trainProj.segIndex > crossingProj.segIndex || 
         (trainProj.segIndex === crossingProj.segIndex && trainProj.fraction >= crossingProj.fraction)) {
        isApproaching = true;
      } else {
        // Train head has passed the crossing node towards index 0
        if (trackDistKm <= rakeLengthKm) {
          isTraversing = true;
        } else {
          hasCleared = true;
        }
      }
    } else {
      // Outbound train (UP): Moves towards higher indices (away from Amritsar Jn)
      if (trainProj.segIndex < crossingProj.segIndex ||
         (trainProj.segIndex === crossingProj.segIndex && trainProj.fraction <= crossingProj.fraction)) {
        isApproaching = true;
      } else {
        // Train head has passed the crossing node towards higher index
        if (trackDistKm <= rakeLengthKm) {
          isTraversing = true;
        } else {
          hasCleared = true;
        }
      }
    }

    return {
      isValid: true,
      isApproaching,
      isTraversing,
      hasCleared,
      isOppositeDirection: hasCleared,
      trackDistanceKm: Number(trackDistKm.toFixed(2)),
      rejectionReason: null
    };
  }
}

