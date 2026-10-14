import React, { useState, useEffect } from 'react';
import { 
  Navigation, 
  MapPin, 
  Compass, 
  Clock, 
  ArrowRight, 
  ShieldAlert, 
  CheckCircle, 
  CheckCircle2,
  AlertTriangle, 
  Car, 
  Bike, 
  Footprints, 
  Sparkles, 
  Bookmark, 
  RefreshCw, 
  ExternalLink,
  BellRing,
  Info,
  GitFork,
  Train,
  TrainTrack,
  Star
} from 'lucide-react';
import { 
  RailwayCrossing, 
  SectorTrain, 
  RailwayCorridor, 
  OperationalMetrics, 
  ActiveRoute, 
  SavedPlace, 
  TravelMode, 
  PlannedJourney 
} from '../types';
import { nativeService } from '../services/nativeService';
import { railwayApi } from '../services/apiService';
import { AMRITSAR_LANDMARKS } from '../data/landmarks';
import { findImpactingTrainForCrossing, getCrossingTimingDetails } from '../utils/trainHelpers';
import { useSharedTimer, getAuthoritativeTargetEpoch, calculateRemainingSeconds, formatCountdown } from '../utils/timerManager';
import { ClosureCountdown } from '../components/ClosureCountdown';

interface HomeViewProps {
  metrics: OperationalMetrics;
  crossings: RailwayCrossing[];
  trains: SectorTrain[];
  corridors: RailwayCorridor[];
  onNavigate: (route: ActiveRoute) => void;
  onSelectCrossing: (crossing: RailwayCrossing) => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  metrics,
  crossings,
  trains,
  onNavigate,
  onSelectCrossing
}) => {
  // Synchronized global timer tick
  const now = useSharedTimer();

  // Current user GPS state
  const [gpsLoading, setGpsLoading] = useState<boolean>(false);
  const [gpsPos, setGpsPos] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [locationPermission, setLocationPermission] = useState<'prompt' | 'granted' | 'denied'>('prompt');
  const [manualLandmarkId, setManualLandmarkId] = useState<string>('');
  const [favIds, setFavIds] = useState<string[]>(() => nativeService.getFavoriteCrossingIds());
  
  // Destination selection
  const [savedPlaces, setSavedPlaces] = useState<SavedPlace[]>([]);
  const [selectedDestId, setSelectedDestId] = useState<string>('ASR_STATION');
  const [travelMode, setTravelMode] = useState<TravelMode>('car');

  // Quick departure plan state
  const [quickPlan, setQuickPlan] = useState<PlannedJourney | null>(null);
  const [planLoading, setPlanLoading] = useState<boolean>(false);
  const [reminderScheduled, setReminderScheduled] = useState<boolean>(false);

  useEffect(() => {
    // Load saved places & mode preference
    setSavedPlaces(nativeService.getSavedPlaces());
    setTravelMode(nativeService.getTravelMode());

    // Check location permission
    nativeService.checkLocationPermission().then(status => {
      setLocationPermission(status);
      if (status === 'granted') {
        acquireGps();
      }
    });

    const handleFavUpdated = (e: any) => {
      setFavIds(e.detail || nativeService.getFavoriteCrossingIds());
    };
    window.addEventListener('fatak:favorite-crossings-updated', handleFavUpdated);
    return () => window.removeEventListener('fatak:favorite-crossings-updated', handleFavUpdated);
  }, []);

  // Determine current commuter reference location (GPS hardware > selected landmark > user profile > central Amritsar)
  const userLoc: [number, number] = (() => {
    if (gpsPos) return [gpsPos.lat, gpsPos.lng];
    if (manualLandmarkId) {
      const lm = AMRITSAR_LANDMARKS.find(l => l.id === manualLandmarkId);
      if (lm) return [lm.lat, lm.lng];
    }
    const prof = nativeService.getUserLocationProfile();
    if (prof) return [prof.lat, prof.lng];
    return [31.6338, 74.8655]; // Amritsar Jn default
  })();

  const nearestData = (() => {
    if (!crossings || crossings.length === 0) return null;
    let closest = crossings[0];
    let minD = Infinity;
    crossings.forEach(c => {
      const d = Math.hypot((c.lat - userLoc[0]) * 111000, (c.lng - userLoc[1]) * 111000);
      if (d < minD) {
        minD = d;
        closest = c;
      }
    });
    const distKm = (minD / 1000).toFixed(1);
    const driveTimeMin = Math.max(1, Math.round((minD / 1000) / 28 * 60));
    return { crossing: closest, distKm, driveTimeMin, distMeters: Math.round(minD) };
  })();

  // Acquire current GPS position
  const acquireGps = async () => {
    setGpsLoading(true);
    const hasPerm = await nativeService.requestLocationPermission();
    if (hasPerm) {
      setLocationPermission('granted');
      const pos = await nativeService.getCurrentPosition();
      if (pos) {
        setGpsPos({ lat: pos.lat, lng: pos.lng, accuracy: pos.accuracyMeters });
      }
    } else {
      setLocationPermission('denied');
    }
    setGpsLoading(false);
  };

  // Re-calculate quick departure recommendation whenever location, destination or mode changes
  useEffect(() => {
    const originCoords: [number, number] = userLoc;

    // Find destination coords
    let destCoords: [number, number] = [31.6338, 74.8655]; // Amritsar Jn
    const matchedPlace = savedPlaces.find(p => p.id === selectedDestId);
    if (matchedPlace) {
      destCoords = [matchedPlace.lat, matchedPlace.lng];
    } else {
      const matchedLandmark = AMRITSAR_LANDMARKS.find(l => l.id === selectedDestId);
      if (matchedLandmark) {
        destCoords = [matchedLandmark.lat, matchedLandmark.lng];
      }
    }

    setPlanLoading(true);
    railwayApi.planJourney(originCoords, destCoords, 0, travelMode)
      .then(result => {
        setQuickPlan(result);
      })
      .catch(err => {
        console.warn('Quick plan calculation error', err);
      })
      .finally(() => {
        setPlanLoading(false);
      });
  }, [gpsPos, selectedDestId, travelMode, savedPlaces]);

  // Handle travel mode change
  const handleModeChange = (mode: TravelMode) => {
    setTravelMode(mode);
    nativeService.setTravelMode(mode);
    nativeService.triggerHaptic('light');
  };

  // Schedule departure reminder notification
  const handleScheduleDepartureReminder = async () => {
    if (!quickPlan) return;
    const rec = quickPlan.recommendation;
    const offsetMin = Math.round(rec.recommendedDepartureOffsetSec / 60);

    const scheduledDate = rec.recommendedDepartureOffsetSec > 0
      ? new Date(Date.now() + rec.recommendedDepartureOffsetSec * 1000)
      : undefined;

    const targetCrossing = quickPlan.primaryRoute?.crossings?.[0];
    const ok = await nativeService.scheduleNotification({
      title: rec.action === 'WAIT' ? `⏳ FatakForecast: Optimal Departure in ${offsetMin}m` : `🟢 FatakForecast: Clear to Depart`,
      body: rec.summary,
      category: 'departureReminders',
      scheduledDate,
      crossingId: targetCrossing?.id,
      crossingName: targetCrossing?.name,
      eventSignature: `home_dep:${targetCrossing?.id || 'route'}:${offsetMin}`,
      actionUrl: '/planner'
    });

    if (ok) {
      setReminderScheduled(true);
      nativeService.triggerHaptic('success');
      setTimeout(() => setReminderScheduled(false), 4000);
    }
  };

  const rec = quickPlan?.recommendation;
  const primaryRoute = quickPlan?.primaryRoute;
  const crossingsOnRoute = primaryRoute?.crossings || [];

  return (
    <div className="page-container">
      {/* HERO & OVERVIEW BANNER */}
      <div style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-soft)',
        borderRadius: 'var(--radius-lg)',
        padding: '16px 18px',
        marginBottom: '16px',
        boxShadow: 'var(--shadow-md)',
        position: 'relative'
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span style={{ 
                fontSize: '11px', 
                fontWeight: 700, 
                textTransform: 'uppercase', 
                letterSpacing: '0.06em',
                color: 'var(--accent-cyan)',
                backgroundColor: 'rgba(56, 189, 248, 0.12)',
                padding: '2px 8px',
                borderRadius: 'var(--radius-full)',
                border: '1px solid rgba(56, 189, 248, 0.25)'
              }}>
                Amritsar Railway Hub
              </span>
              <span style={{ 
                fontSize: '11px', 
                color: metrics.feedStatus === 'CONNECTED' ? 'var(--status-open)' : 'var(--text-muted)',
                display: 'flex', 
                alignItems: 'center', 
                gap: '5px',
                fontWeight: 600
              }}>
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: 'currentColor' }} />
                {metrics.feedStatus === 'CONNECTED' ? 'Live Telemetry Connected' : 'Telemetry Disconnected'}
              </span>
            </div>

            <h1 style={{ 
              fontFamily: 'var(--font-brand)',
              fontSize: 'clamp(20px, 4.5vw, 24px)', 
              fontWeight: 800, 
              color: 'var(--text-primary)',
              letterSpacing: '-0.02em',
              margin: '0 0 4px 0' 
            }}>
              Know Before the Fatak Closes.
            </h1>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, fontWeight: 500 }}>
              Real-time level crossing prediction and verified corridor intelligence across Amritsar
            </p>
          </div>

          {/* Quick GPS Status Pill */}
          <button
            onClick={acquireGps}
            disabled={gpsLoading}
            className="btn btn-secondary"
            style={{
              padding: '6px 12px',
              borderRadius: 'var(--radius-full)',
              fontSize: '11.5px',
              fontWeight: 600
            }}
          >
            <Compass size={14} className={gpsLoading ? 'animate-spin' : ''} color={gpsPos ? 'var(--accent-primary)' : 'var(--text-secondary)'} />
            <span>
              {gpsPos 
                ? `GPS Active (±${gpsPos.accuracy}m)` 
                : (locationPermission === 'denied' ? 'GPS Denied (Tap to Retry)' : 'Acquire GPS')}
            </span>
          </button>
        </div>

        {/* METRICS STRIP: 4 HIGH LEVEL CARDS */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
          gap: '8px',
          marginTop: '14px',
          paddingTop: '12px',
          borderTop: '1px solid var(--border-subtle)'
        }}>
          <div style={{
            backgroundColor: 'var(--bg-secondary)',
            padding: '10px 12px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)'
          }}>
            <div style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
              All Crossings
            </div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
              {metrics.totalCrossings}
            </div>
            <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>Amritsar Network</div>
          </div>

          <div style={{
            backgroundColor: metrics.closedCount > 0 ? 'var(--status-closed-bg)' : 'var(--bg-secondary)',
            padding: '10px 12px',
            borderRadius: 'var(--radius-md)',
            border: `1px solid ${metrics.closedCount > 0 ? 'var(--status-closed-border)' : 'var(--border-subtle)'}`
          }}>
            <div style={{ fontSize: '10px', color: metrics.closedCount > 0 ? 'var(--status-closed)' : 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
              Closed Now
            </div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: metrics.closedCount > 0 ? 'var(--status-closed)' : 'var(--text-primary)', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
              {metrics.closedCount}
            </div>
            <div style={{ fontSize: '10.5px', color: metrics.closedCount > 0 ? 'var(--status-closed)' : 'var(--text-muted)' }}>
              Gates Blocked
            </div>
          </div>

          <div style={{
            backgroundColor: metrics.approachingCount > 0 ? 'var(--status-approaching-bg)' : 'var(--bg-secondary)',
            padding: '10px 12px',
            borderRadius: 'var(--radius-md)',
            border: `1px solid ${metrics.approachingCount > 0 ? 'var(--status-approaching-border)' : 'var(--border-subtle)'}`
          }}>
            <div style={{ fontSize: '10px', color: metrics.approachingCount > 0 ? 'var(--warning-amber)' : 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
              Approaching
            </div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: metrics.approachingCount > 0 ? 'var(--warning-amber)' : 'var(--text-primary)', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
              {metrics.approachingCount}
            </div>
            <div style={{ fontSize: '10.5px', color: metrics.approachingCount > 0 ? 'var(--warning-amber)' : 'var(--text-muted)' }}>
              Trains In Corridor
            </div>
          </div>

          <div style={{
            backgroundColor: 'var(--bg-secondary)',
            padding: '10px 12px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)'
          }}>
            <div style={{ fontSize: '10px', color: 'var(--accent-primary)', fontWeight: 600, textTransform: 'uppercase' }}>
              Active Trains
            </div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--accent-primary)', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
              {metrics.activeSectorTrains}
            </div>
            <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>Tracked in Sector</div>
          </div>
        </div>
      </div>

      {/* NEAREST RAILWAY FATAK TO YOU — ANSWERS THE 4 CORE COMMUTER QUESTIONS */}
      {nearestData && (
        <div style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1.5px solid var(--border-soft)',
          borderRadius: 'var(--radius-lg)',
          padding: '18px 20px',
          marginBottom: '16px',
          boxShadow: 'var(--shadow-md)',
          position: 'relative'
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: 'rgba(56, 189, 248, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-primary)',
                flexShrink: 0
              }}>
                <MapPin size={17} />
              </div>
              <div>
                <h2 style={{ fontFamily: 'var(--font-brand)', fontSize: '16px', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                  Nearest Railway Fatak to You
                </h2>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  {gpsPos 
                    ? `Live distance from your current GPS location` 
                    : manualLandmarkId 
                    ? `Relative to selected Amritsar landmark` 
                    : `Relative to your profile area (Tap dropdown to change)`}
                </div>
              </div>
            </div>

            {/* Reference Location Fallback Switcher */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <select
                value={manualLandmarkId}
                onChange={(e) => {
                  setManualLandmarkId(e.target.value);
                  nativeService.triggerHaptic('light');
                }}
                style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '5px 10px',
                  fontSize: '11px',
                  color: 'var(--text-primary)',
                  cursor: 'pointer'
                }}
                title="Change reference landmark"
              >
                <option value="">{gpsPos ? "My Current GPS Location" : "Select Reference Point..."}</option>
                {AMRITSAR_LANDMARKS.map(lm => (
                  <option key={lm.id} value={lm.id}>{lm.name.split(' (')[0]}</option>
                ))}
              </select>
            </div>
          </div>

          {/* 4 CORE QUESTIONS GRID */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
            gap: '12px',
            marginBottom: '14px'
          }}>
            {/* 1. Which fatak is nearby? */}
            <div style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '12px 14px'
            }}>
              <div style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
                1. Which Fatak Is Nearby?
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
                <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {nearestData.crossing.name}
                </div>
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    await nativeService.toggleFavoriteCrossing(nearestData.crossing.id);
                    setFavIds(nativeService.getFavoriteCrossingIds());
                  }}
                  title={favIds.includes(nearestData.crossing.id) ? "Remove favourite" : "Save as favourite fatak"}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '2px',
                    color: favIds.includes(nearestData.crossing.id) ? '#f59e0b' : 'var(--text-muted)'
                  }}
                >
                  <Star size={16} fill={favIds.includes(nearestData.crossing.id) ? '#f59e0b' : 'none'} />
                </button>
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--accent-primary)', fontWeight: 600, marginTop: '2px' }}>
                {nearestData.distKm} km away • ~{nearestData.driveTimeMin} min {travelMode} travel
              </div>
              <div style={{ fontSize: '10.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                {nearestData.crossing.punjabiName} • {nearestData.crossing.locality || 'Amritsar'}
              </div>
            </div>

            {/* 2. When might it close? */}
            <div style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '12px 14px'
            }}>
              <div style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
                2. When Might It Close?
              </div>
              <div style={{
                fontSize: '14px',
                fontWeight: 800,
                marginTop: '4px',
                color: (nearestData.crossing.status === 'CLOSED' || nearestData.crossing.status === 'CLOSURE_REPORTED') 
                  ? 'var(--critical-red)' 
                  : (nearestData.crossing.status === 'APPROACHING' || nearestData.crossing.timeToNextClosureSec > 0) 
                  ? 'var(--warning-amber)' 
                  : 'var(--status-open)'
              }}>
                {(() => {
                  const c = nearestData.crossing;
                  if (c.status === 'CLOSED' || c.status === 'CLOSURE_REPORTED') {
                    return 'Gate is closed right now';
                  }
                  if (c.timeToNextClosureSec && c.timeToNextClosureSec > 0) {
                    const min = Math.max(1, Math.round(c.timeToNextClosureSec / 60));
                    return `Expected closure in ~${min} min`;
                  }
                  if (c.status === 'APPROACHING') {
                    return 'Closing shortly (Train in block)';
                  }
                  if (c.status === 'UNKNOWN') {
                    return 'Timing unavailable';
                  }
                  return 'No closure in next 15 mins';
                })()}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                {(() => {
                  const c = nearestData.crossing;
                  if (c.estimatedGateClosingTime) {
                    try {
                      return `Predicted closure at ${new Date(c.estimatedGateClosingTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
                    } catch (e) {}
                  }
                  return c.status === 'CLOSED' ? 'Train traversing crossing' : 'Live railway radar telemetry';
                })()}
              </div>
            </div>

            {/* 3. When can I cross? */}
            <div style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '12px 14px'
            }}>
              <div style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
                3. When Can I Cross?
              </div>
              <div style={{
                fontSize: '14px',
                fontWeight: 800,
                marginTop: '4px',
                color: (nearestData.crossing.status === 'CLOSED' || nearestData.crossing.status === 'CLOSURE_REPORTED') 
                  ? 'var(--critical-red)' 
                  : (nearestData.crossing.status === 'APPROACHING' || nearestData.crossing.status === 'CLOSURE_EXPECTED') 
                  ? 'var(--warning-amber)' 
                  : 'var(--status-open)'
              }}>
                {(() => {
                  const c = nearestData.crossing;
                  if (c.status === 'CLOSED' || c.status === 'CLOSURE_REPORTED') {
                    const waitMin = (typeof c.remainingWaitSec === 'number' && c.remainingWaitSec > 0) ? Math.max(1, Math.round(c.remainingWaitSec / 60)) : null;
                    return waitMin ? `Expected reopen in ~${waitMin} min` : 'Gates closed for train transit';
                  }
                  if (c.status === 'APPROACHING') {
                    return 'Closing soon — halt if signals flash';
                  }
                  if (c.status === 'UNKNOWN') {
                    return 'Status unconfirmed — Check on approach';
                  }
                  return 'Safe to cross now (Clear passage)';
                })()}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                {(() => {
                  const c = nearestData.crossing;
                  if (c.status === 'CLOSED' || c.status === 'CLOSURE_REPORTED') {
                    return c.predictedReopenTime 
                      ? `Expected reopening at ${new Date(c.predictedReopenTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                      : 'Waiting for track clearance confirmation';
                  }
                  if (c.status === 'APPROACHING') {
                    return 'Train approaching corridor — prepare to stop';
                  }
                  if (c.status === 'UNKNOWN') {
                    return 'Telemetry unconfirmed — proceed with caution';
                  }
                  return 'Roadway clear for vehicles';
                })()}
              </div>
            </div>

            {/* 4. What should I do next? */}
            <div style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '12px 14px'
            }}>
              <div style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
                4. What Should I Do Next?
              </div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px', lineHeight: 1.35 }}>
                {(() => {
                  const c = nearestData.crossing;
                  if (c.status === 'CLOSED' || c.status === 'CLOSURE_REPORTED') {
                    const waitMin = (typeof c.remainingWaitSec === 'number' && c.remainingWaitSec > 0) ? Math.max(1, Math.round(c.remainingWaitSec / 60)) : null;
                    return waitMin 
                      ? `Wait ~${waitMin}m before departure, or take Bhandari Bridge flyover bypass.`
                      : 'Wait for gate reopening, or take Bhandari Bridge flyover bypass.';
                  }
                  if (c.status === 'APPROACHING') {
                    return 'Crossing is closing soon. Check alternate route on Journey Planner.';
                  }
                  if (c.status === 'UNKNOWN') {
                    return 'Slow down and visually inspect tracks before crossing. Telemetry feed unverified.';
                  }
                  return 'Safe to proceed directly through crossing. Normal traffic flow.';
                })()}
              </div>
              <div style={{ marginTop: '6px' }}>
                <button
                  onClick={() => onSelectCrossing(nearestData.crossing)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    color: 'var(--accent-primary)',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <span>View Full Timeline &amp; Train Details</span>
                  <ArrowRight size={13} />
                </button>
              </div>
            </div>
          </div>

          {/* Embedded 3-Step Timeline for the Nearest Fatak */}
          <ClosureCountdown crossing={nearestData.crossing} showTimeline={true} />
        </div>
      )}

      {/* QUICK DESTINATION & TRAVEL MODE SELECTOR */}
      <div className="panel" style={{ padding: '14px 16px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <span style={{ fontFamily: 'var(--font-brand)', fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--accent-emphasis)', letterSpacing: '0.04em' }}>
            Frequent Amritsar Destinations
          </span>
          <button 
            onClick={() => onNavigate('/saved-places')} 
            className="btn btn-ghost"
            style={{ fontSize: '12px', padding: '3px 8px' }}
          >
            <Star size={13} />
            <span>Saved Crossings</span>
          </button>
        </div>

        {/* Saved Places Horizontal Chips */}
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '8px', marginBottom: '14px' }}>
          {savedPlaces.map(place => (
            <button
              key={place.id}
              onClick={() => { setSelectedDestId(place.id); nativeService.triggerHaptic('light'); }}
              style={{
                backgroundColor: selectedDestId === place.id ? 'rgba(56, 189, 248, 0.15)' : 'var(--bg-secondary)',
                border: `1.5px solid ${selectedDestId === place.id ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
                borderRadius: 'var(--radius-md)',
                padding: '9px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                color: selectedDestId === place.id ? 'var(--accent-primary)' : 'var(--text-primary)',
                transition: 'all 0.15s ease'
              }}
            >
              <MapPin size={14} color={selectedDestId === place.id ? 'var(--accent-primary)' : 'var(--text-secondary)'} />
              <span style={{ fontSize: '12.5px', fontWeight: 600 }}>{place.name}</span>
            </button>
          ))}

          {/* Quick Landmarks */}
          {AMRITSAR_LANDMARKS.slice(0, 4).map(landmark => (
            <button
              key={landmark.id}
              onClick={() => { setSelectedDestId(landmark.id); nativeService.triggerHaptic('light'); }}
              style={{
                backgroundColor: selectedDestId === landmark.id ? 'rgba(56, 189, 248, 0.15)' : 'var(--bg-secondary)',
                border: `1.5px solid ${selectedDestId === landmark.id ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
                borderRadius: 'var(--radius-md)',
                padding: '9px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                color: selectedDestId === landmark.id ? 'var(--accent-primary)' : 'var(--text-secondary)',
                transition: 'all 0.15s ease'
              }}
            >
              <MapPin size={14} color={selectedDestId === landmark.id ? 'var(--accent-primary)' : 'var(--text-secondary)'} />
              <span style={{ fontSize: '12.5px' }}>{landmark.name.split(' (')[0]}</span>
            </button>
          ))}
        </div>

        {/* Travel Mode Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '12px', borderTop: '1px solid var(--border-subtle)' }}>
          <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>Travel Mode:</span>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={() => handleModeChange('car')}
              style={{
                backgroundColor: travelMode === 'car' ? 'var(--accent-primary)' : 'var(--bg-secondary)',
                color: travelMode === 'car' ? 'var(--text-on-accent)' : 'var(--text-primary)',
                border: `1px solid ${travelMode === 'car' ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
                borderRadius: 'var(--radius-sm)',
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer'
              }}
            >
              <Car size={14} />
              <span>Car</span>
            </button>

            <button
              onClick={() => handleModeChange('motorcycle')}
              style={{
                backgroundColor: travelMode === 'motorcycle' ? 'var(--accent-primary)' : 'var(--bg-secondary)',
                color: travelMode === 'motorcycle' ? 'var(--text-on-accent)' : 'var(--text-primary)',
                border: `1px solid ${travelMode === 'motorcycle' ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
                borderRadius: 'var(--radius-sm)',
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer'
              }}
            >
              <Bike size={14} />
              <span>Motorcycle</span>
            </button>

            <button
              onClick={() => handleModeChange('walking')}
              style={{
                backgroundColor: travelMode === 'walking' ? 'var(--accent-primary)' : 'var(--bg-secondary)',
                color: travelMode === 'walking' ? 'var(--text-on-accent)' : 'var(--text-primary)',
                border: `1px solid ${travelMode === 'walking' ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
                borderRadius: 'var(--radius-sm)',
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer'
              }}
            >
              <Footprints size={14} />
              <span>Walk</span>
            </button>
          </div>
        </div>
      </div>

      {/* SMART DEPARTURE RECOMMENDATION ENGINE */}
      <div style={{
        backgroundColor: rec?.action === 'WAIT' 
          ? 'rgba(239, 68, 68, 0.12)' 
          : (rec?.action === 'CONSIDER_ALTERNATIVE' ? 'rgba(245, 158, 11, 0.12)' : 'rgba(16, 185, 129, 0.12)'),
        border: `1.5px solid ${rec?.action === 'WAIT' ? 'rgba(239, 68, 68, 0.35)' : (rec?.action === 'CONSIDER_ALTERNATIVE' ? 'rgba(245, 158, 11, 0.35)' : 'rgba(16, 185, 129, 0.35)')}`,
        borderRadius: 'var(--radius-lg)',
        padding: '22px',
        marginBottom: '24px',
        boxShadow: 'var(--shadow-md)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={17} color={rec?.action === 'WAIT' ? 'var(--accent-tangerine)' : 'var(--accent-primary)'} />
            <span style={{ 
              fontFamily: 'var(--font-brand)',
              fontSize: '12px', 
              fontWeight: 700, 
              textTransform: 'uppercase', 
              letterSpacing: '0.06em', 
              color: rec?.action === 'WAIT' ? 'var(--accent-tangerine)' : 'var(--accent-primary)' 
            }}>
              Smart Departure Recommendation
            </span>
          </div>

          <span style={{
            fontSize: '11px',
            fontWeight: 700,
            padding: '4px 10px',
            borderRadius: 'var(--radius-full)',
            backgroundColor: 'var(--bg-surface)',
            color: rec?.action === 'LEAVE_NOW' ? 'var(--status-open)' : 'var(--accent-tangerine)',
            border: '1px solid var(--border-soft)'
          }}>
            {rec?.badge || '🟢 CLEAR TO DEPART'}
          </span>
        </div>

        <h2 style={{ 
          fontFamily: 'var(--font-brand)',
          fontSize: '19px', 
          fontWeight: 700, 
          color: 'var(--text-primary)', 
          margin: '0 0 6px 0' 
        }}>
          {rec?.summary || 'Computing optimal departure time...'}
        </h2>
        <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', margin: '0 0 16px 0', lineHeight: 1.5 }}>
          {rec?.details || 'Analyzing train schedules and crossing status along your path.'}
        </p>

        {/* Journey Statistics Strip */}
        {primaryRoute && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '12px',
            backgroundColor: 'var(--bg-surface)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-soft)',
            padding: '14px',
            marginBottom: '16px'
          }}>
            <div>
              <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Estimated Travel</div>
              <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                {Math.round(primaryRoute.totalDurationSec / 60)} min
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                {(primaryRoute.distanceMeters / 1000).toFixed(1)} km
              </div>
            </div>

            <div>
              <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Railway Crossings</div>
              <div style={{ 
                fontSize: '17px', 
                fontWeight: 700, 
                color: crossingsOnRoute.some(c => c.conflictSeverity === 'HIGH') ? 'var(--critical-red)' : 'var(--text-primary)', 
                fontFamily: 'var(--font-mono)' 
              }}>
                {crossingsOnRoute.length} Fataks
              </div>
              <div style={{ fontSize: '11px', color: crossingsOnRoute.some(c => c.conflictSeverity === 'HIGH') ? 'var(--critical-red)' : 'var(--status-open)' }}>
                {crossingsOnRoute.filter(c => c.conflictSeverity === 'HIGH').length} closed
              </div>
            </div>

            <div>
              <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Arrival ETA</div>
              <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)' }}>
                {new Date(primaryRoute.estimatedArrivalTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                {travelMode} mode
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons: Schedule Reminder & Open Full Route */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={handleScheduleDepartureReminder}
            className="btn btn-primary"
            style={{ flex: 1, minWidth: '160px', padding: '10px 18px' }}
          >
            <BellRing size={15} />
            <span>{reminderScheduled ? '✓ Reminder Scheduled!' : 'Set Departure Alarm'}</span>
          </button>

          <button
            onClick={() => onNavigate('/planner')}
            className="btn btn-secondary"
            style={{ flex: 1, minWidth: '160px', padding: '10px 18px' }}
          >
            <Navigation size={15} color="var(--accent-primary)" />
            <span>Open Smart Journey</span>
            <ArrowRight size={15} />
          </button>
        </div>

        {/* Uncertainty Disclosure Note */}
        {rec?.uncertaintyNote && (
          <div style={{ marginTop: '12px', fontSize: '11.5px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Info size={13} />
            <span>{rec.uncertaintyNote}</span>
          </div>
        )}
      </div>

      {/* CROSSINGS ALONG ROUTE (IF ANY) */}
      {crossingsOnRoute.length > 0 && (
        <div className="panel" style={{ padding: '18px 20px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldAlert size={17} color="var(--warning-amber)" />
              <h3 style={{ fontFamily: 'var(--font-brand)', fontSize: '15px', fontWeight: 700, margin: 0, color: 'var(--accent-emphasis)' }}>
                Crossings on Your Commute
              </h3>
            </div>
            <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
              {crossingsOnRoute.length} detected on road path
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {crossingsOnRoute.map(hit => (
              <div 
                key={hit.id}
                onClick={() => {
                  const originalCrossing = crossings.find(c => c.id === hit.id);
                  if (originalCrossing) {
                    onSelectCrossing(originalCrossing);
                  }
                }}
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: `1px solid ${hit.conflictSeverity === 'HIGH' ? 'var(--status-closed-border)' : 'var(--border-soft)'}`,
                  borderRadius: 'var(--radius-md)',
                  padding: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  boxShadow: 'var(--shadow-sm)'
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>
                      {hit.name}
                    </span>
                    <span style={{ 
                      fontSize: '10.5px', 
                      padding: '2px 8px', 
                      borderRadius: 'var(--radius-full)',
                      backgroundColor: hit.currentStatus === 'CLOSED' ? 'var(--status-closed-bg)' : 'rgba(16, 185, 129, 0.15)',
                      color: hit.currentStatus === 'CLOSED' ? 'var(--status-closed)' : 'var(--status-open)',
                      border: `1px solid ${hit.currentStatus === 'CLOSED' ? 'var(--status-closed-border)' : 'rgba(16, 185, 129, 0.3)'}`,
                      fontWeight: 700
                    }}>
                      {hit.gateStatusLabel}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '3px' }}>
                    {hit.locality} • Reaching in ~{Math.round(hit.travelTimeToCrossingSec / 60)} min ({hit.distanceAlongRouteKm} km along route)
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: hit.conflictSeverity === 'HIGH' ? 'var(--status-closed)' : 'var(--text-primary)' }}>
                    {hit.conflictSeverity === 'HIGH' ? `+${Math.round((hit.delaySec || 0) / 60)}m estimated delay` : 'Clear passage'}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    ETA: {new Date(hit.userArrivalTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KEY CROSSING GATES DIRECTORY PREVIEW */}
      <div className="panel" style={{ padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div>
            <h3 style={{ fontFamily: 'var(--font-brand)', fontSize: '15px', fontWeight: 700, margin: 0, color: 'var(--accent-emphasis)' }}>
              Amritsar Key Crossing Gates
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
              Real-time operational barrier status across junctions
            </p>
          </div>

          <button 
            onClick={() => onNavigate('/crossings')}
            className="btn btn-ghost"
            style={{ fontSize: '12px', padding: '3px 8px' }}
          >
            <span>View All {crossings.length} Crossings</span>
            <ExternalLink size={13} />
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: '12px' }}>
          {(() => {
            const keyCrossingIds = [
              'osm/node/1006212111', // Jaura Phatak (Joda Phatak)
              'osm/node/1006139587', // Shivala Phatak (Shivala Gate)
              'osm/node/8179551888', // Vallah Phatak (Mehta Road Crossing)
              'osm/node/1326294756'  // Verka Phatak (Old Batala Road Crossing)
            ];
            const keyCrossings = keyCrossingIds
              .map(id => crossings.find(c => c.id === id))
              .filter(Boolean) as RailwayCrossing[];
            const displayList = keyCrossings.length === 4 ? keyCrossings : crossings.slice(0, 4);

            return displayList.map(crossing => {
              const timing = getCrossingTimingDetails(crossing, now, trains);

            return (
              <div
                key={crossing.id}
                onClick={() => onSelectCrossing(crossing)}
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: `1px solid ${timing.statusBadge.border}`,
                  borderLeft: `4px solid ${timing.statusBadge.color}`,
                  borderRadius: 'var(--radius-md)',
                  padding: '14px',
                  cursor: 'pointer',
                  boxShadow: 'var(--shadow-sm)',
                  transition: 'transform 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {crossing.name}
                  </span>
                  <span style={{
                    fontSize: '10.5px',
                    fontWeight: 700,
                    padding: '2px 7px',
                    borderRadius: 'var(--radius-full)',
                    backgroundColor: timing.statusBadge.bg,
                    color: timing.statusBadge.color,
                    border: `1px solid ${timing.statusBadge.border}`
                  }}>
                    {timing.statusBadge.label}
                  </span>
                </div>

                <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                  {crossing.punjabiName} • {crossing.locality}
                </div>

                {/* Train status & timing */}
                {timing.activeTrain ? (
                  <div style={{ fontSize: '11px', color: 'var(--accent-cyan)', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 600 }}>
                    <Train size={12} color="var(--accent-cyan)" />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      #{timing.activeTrain.trainNumber} {timing.activeTrain.trainName} • {timing.activeTrain.timingText || timing.activeTrain.speedText}
                    </span>
                  </div>
                ) : (
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Clock size={12} color="var(--status-open)" />
                    <span>
                      {timing.isClosedNow ? (
                        `Expected reopen ${timing.reopeningTimeStr ? `at ${timing.reopeningTimeStr}` : 'shortly'}${timing.reopenCountdownText ? ` (${timing.reopenCountdownText})` : ''}`
                      ) : timing.isClosingSoon ? (
                        `Closure expected ${timing.closingCountdownText || 'soon'}`
                      ) : timing.isTimingUnavailable ? (
                        'Timing unconfirmed'
                      ) : (
                        'Roadway Open · Corridor Clear'
                      )}
                    </span>
                  </div>
                )}
              </div>
            );
          });
        })()}
        </div>
      </div>
    </div>
  );
};
