import React, { useState, useEffect } from 'react';
import { 
  Star, 
  MapPin, 
  Search, 
  Train, 
  Clock, 
  ExternalLink, 
  Compass, 
  ArrowRight,
  Sparkles,
  GitFork,
  CheckCircle2
} from 'lucide-react';
import { RailwayCrossing, SectorTrain, ActiveRoute } from '../types';
import { nativeService } from '../services/nativeService';
import { INITIAL_CROSSINGS } from '../services/amritsarData';
import { getCrossingTimingDetails } from '../utils/trainHelpers';
import { useSharedTimer } from '../utils/timerManager';
import { haversineDistanceMeters, formatDistance } from '../utils/geoUtils';

interface SavedPlacesViewProps {
  onNavigate: (route: ActiveRoute) => void;
  crossings?: RailwayCrossing[];
  trains?: SectorTrain[];
  onSelectCrossing?: (crossing: RailwayCrossing) => void;
  onSelectDestination?: (place: any) => void;
}

export const SavedPlacesView: React.FC<SavedPlacesViewProps> = ({
  onNavigate,
  crossings = INITIAL_CROSSINGS,
  trains = [],
  onSelectCrossing
}) => {
  const [favCrossingIds, setFavCrossingIds] = useState<string[]>(() => nativeService.getFavoriteCrossingIds());
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(() => {
    const prof = nativeService.getUserLocationProfile();
    return prof ? { lat: prof.lat, lng: prof.lng } : null;
  });
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'distance' | 'status' | 'name'>('distance');

  // Synchronized 1-second timer tick for live second-by-second countdown updates
  const now = useSharedTimer();

  useEffect(() => {
    const handleFavUpdated = (e: any) => {
      setFavCrossingIds(e.detail || nativeService.getFavoriteCrossingIds());
    };
    window.addEventListener('fatak:favorite-crossings-updated', handleFavUpdated);

    // Refresh user GPS location
    nativeService.getCurrentPosition().then(pos => {
      if (pos) setUserCoords({ lat: pos.lat, lng: pos.lng });
    });

    return () => {
      window.removeEventListener('fatak:favorite-crossings-updated', handleFavUpdated);
    };
  }, []);

  const handleToggleFavorite = async (crossingId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await nativeService.toggleFavoriteCrossing(crossingId);
    setFavCrossingIds(nativeService.getFavoriteCrossingIds());
  };

  const getCrossingDistanceMeters = (crossing: RailwayCrossing): number | null => {
    if (!userCoords) return null;
    return haversineDistanceMeters(userCoords.lat, userCoords.lng, crossing.lat, crossing.lng);
  };

  // Filter only starred / favorite crossings
  const favoriteCrossings = crossings.filter(c => favCrossingIds.includes(c.id));

  // Filter by search query
  const filteredCrossings = favoriteCrossings.filter(c => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const idFormatted = c.id.replace('osm/node/', 'asr-').toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.punjabiName && c.punjabiName.toLowerCase().includes(q)) ||
      (c.locality && c.locality.toLowerCase().includes(q)) ||
      idFormatted.includes(q)
    );
  });

  // Sort
  const sortedCrossings = [...filteredCrossings].sort((a, b) => {
    if (sortBy === 'distance') {
      const distA = getCrossingDistanceMeters(a) ?? Infinity;
      const distB = getCrossingDistanceMeters(b) ?? Infinity;
      return distA - distB;
    }
    if (sortBy === 'status') {
      const order: Record<string, number> = {
        'CLOSED': 1,
        'CLOSURE_REPORTED': 1,
        'CLOSURE_EXPECTED': 2,
        'APPROACHING': 3,
        'UNKNOWN': 4,
        'OPEN': 5
      };
      return (order[a.status] || 99) - (order[b.status] || 99);
    }
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="view-container" style={{ padding: '20px 16px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* PAGE HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              backgroundColor: 'rgba(245, 158, 11, 0.14)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Star size={20} fill="#f59e0b" color="#f59e0b" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h1 style={{ fontFamily: 'var(--font-brand)', fontSize: '20px', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                  Saved Crossings
                </h1>
                <span style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  backgroundColor: 'rgba(245, 158, 11, 0.15)',
                  color: '#f59e0b',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-full)'
                }}>
                  {favoriteCrossings.length} Starred
                </span>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                ਸੰਭਾਲੇ ਹੋਏ ਫਾਟਕ • Live closure countdowns, permanent-way train status, and approach alerts
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={() => onNavigate('/crossings')}
          className="btn btn-secondary"
          style={{ fontSize: '12.5px', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <GitFork size={14} />
          <span>Browse All Fataks</span>
        </button>
      </div>

      {/* FILTER & SEARCH BAR (Visible when user has saved crossings) */}
      {favoriteCrossings.length > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          marginBottom: '20px',
          flexWrap: 'wrap'
        }}>
          {/* Search */}
          <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
            <Search size={15} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search your saved crossings..."
              style={{
                width: '100%',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-panel)',
                borderRadius: 'var(--radius-md)',
                padding: '9px 12px 9px 34px',
                color: 'var(--text-primary)',
                fontSize: '13px'
              }}
            />
          </div>

          {/* Sort By */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-panel)',
                borderRadius: 'var(--radius-md)',
                padding: '8px 12px',
                color: 'var(--text-primary)',
                fontSize: '12.5px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <option value="distance">Nearest to You (GPS)</option>
              <option value="status">Closure Status</option>
              <option value="name">Alphabetical</option>
            </select>
          </div>
        </div>
      )}

      {/* EMPTY STATE */}
      {favoriteCrossings.length === 0 ? (
        <div className="panel" style={{
          padding: '48px 24px',
          textAlign: 'center',
          maxWidth: '540px',
          margin: '32px auto',
          borderRadius: 'var(--radius-lg)',
          border: '1px dashed var(--border-panel)'
        }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            backgroundColor: 'rgba(245, 158, 11, 0.12)',
            border: '1px solid rgba(245, 158, 11, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px auto',
            color: '#f59e0b'
          }}>
            <Star size={30} fill="#f59e0b" />
          </div>

          <h2 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 8px 0', color: 'var(--text-primary)', fontFamily: 'var(--font-brand)' }}>
            No Saved Crossings Yet
          </h2>

          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5', margin: '0 0 24px 0' }}>
            Tap the star icon (★) on any railway crossing in the <strong>Crossings</strong> tab or <strong>Home</strong> screen to save it here for instant monitoring, live closure countdowns, and approach notifications.
          </p>

          <button
            onClick={() => onNavigate('/crossings')}
            className="btn btn-primary"
            style={{ padding: '10px 24px', fontSize: '13.5px', fontWeight: 700, margin: '0 auto', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <span>Explore Amritsar Crossings</span>
            <ArrowRight size={15} />
          </button>
        </div>
      ) : sortedCrossings.length === 0 ? (
        <div className="panel" style={{ padding: '36px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
          No saved crossings match "{searchQuery}"
        </div>
      ) : (
        /* SAVED CROSSINGS GRID */
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: '16px'
        }}>
          {sortedCrossings.map(crossing => {
            const timing = getCrossingTimingDetails(crossing, now, trains);
            const distMeters = getCrossingDistanceMeters(crossing);
            const distFormatted = distMeters !== null ? formatDistance(distMeters) : null;

            return (
              <div
                key={crossing.id}
                onClick={() => {
                  if (onSelectCrossing) {
                    onSelectCrossing(crossing);
                  } else {
                    onNavigate('/crossings');
                  }
                }}
                className="mobile-card"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-panel)',
                  borderLeft: `4px solid ${timing.statusBadge.color}`,
                  borderRadius: 'var(--radius-lg)',
                  padding: '16px 18px',
                  cursor: 'pointer',
                  boxShadow: 'var(--shadow-sm)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  transition: 'transform 0.15s ease, border-color 0.15s ease'
                }}
              >
                {/* CARD HEADER */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontFamily: 'var(--font-brand)', fontWeight: 800, fontSize: '16px', color: 'var(--text-primary)', lineHeight: 1.25 }}>
                      {crossing.name}
                    </div>
                    <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginTop: '3px' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-primary)', fontWeight: 600 }}>
                        {crossing.id.replace('osm/node/', 'ASR-')}
                      </span>
                      {crossing.punjabiName && ` • ${crossing.punjabiName}`}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {/* Star / Unstar Button */}
                    <button
                      onClick={(e) => handleToggleFavorite(crossing.id, e)}
                      title="Remove from saved crossings"
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '4px',
                        color: '#f59e0b',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <Star size={18} fill="#f59e0b" />
                    </button>

                    {/* Status Badge */}
                    <span style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      backgroundColor: timing.statusBadge.bg,
                      color: timing.statusBadge.color,
                      border: `1px solid ${timing.statusBadge.border}`,
                      padding: '3px 9px',
                      borderRadius: 'var(--radius-full)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px'
                    }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: timing.statusBadge.dotColor }} />
                      {timing.statusBadge.label}
                    </span>
                  </div>
                </div>

                {/* ESSENTIAL TRAIN STATUS & TIMING SUMMARY */}
                <div style={{
                  backgroundColor: 'var(--surface-muted)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '11px 13px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '7px',
                  fontSize: '12.5px'
                }}>
                  {/* 1. TRAIN STATUS & SPEED BANNER */}
                  {timing.hasApproachingTrain && !timing.isTimingUnavailable ? (
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      padding: '7px 9px',
                      backgroundColor: timing.isClosedNow ? 'rgba(239, 68, 68, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                      border: `1px solid ${timing.isClosedNow ? 'rgba(239, 68, 68, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
                      borderRadius: 'var(--radius-sm)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: timing.isClosedNow ? 'var(--critical-red)' : 'var(--accent-primary)', fontSize: '12px' }}>
                          <Train size={13} style={{ flexShrink: 0 }} />
                          <span>#{timing.trainNumber || timing.activeTrain?.trainNumber || 'Active'} {timing.trainName || timing.activeTrain?.trainName || 'Train Approaching'}</span>
                        </div>
                        <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontWeight: 600 }}>
                          {timing.trainSpeedText}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11.5px' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Train Arrival ETA:</span>
                        <span style={{ fontWeight: 700, color: timing.isClosedNow ? 'var(--critical-red)' : 'var(--accent-primary)', fontFamily: 'var(--font-mono)' }}>
                          {timing.trainArrivalEtaText}
                        </span>
                      </div>
                      {typeof timing.trainDistanceKm === 'number' && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
                          <span>Track Distance:</span>
                          <span style={{ fontFamily: 'var(--font-mono)' }}>~{timing.trainDistanceKm.toFixed(1)} km away</span>
                        </div>
                      )}
                    </div>
                  ) : timing.activeTrain ? (
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      padding: '7px 9px',
                      backgroundColor: 'rgba(56, 189, 248, 0.08)',
                      border: '1px solid rgba(56, 189, 248, 0.22)',
                      borderRadius: 'var(--radius-sm)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: 'var(--accent-cyan)', fontSize: '12px' }}>
                          <Train size={13} style={{ flexShrink: 0 }} />
                          <span>#{timing.activeTrain.trainNumber} {timing.activeTrain.trainName}</span>
                        </div>
                        <span style={{
                          fontSize: '10.5px',
                          fontWeight: 700,
                          padding: '1px 6px',
                          borderRadius: 'var(--radius-full)',
                          backgroundColor: timing.activeTrain.isStationary ? 'rgba(245, 158, 11, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                          color: timing.activeTrain.isStationary ? '#f59e0b' : 'var(--accent-cyan)'
                        }}>
                          {timing.activeTrain.isStationary ? 'AT PLATFORM' : (timing.activeTrain.isReceding ? 'RECEDING' : 'MONITORED')}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)' }}>
                        <span>Train Status:</span>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)', textAlign: 'right' }}>
                          {timing.activeTrain.timingText || 'Corridor Monitored'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10.5px', color: 'var(--text-muted)' }}>
                        <span>Line:</span>
                        <span>{timing.activeTrain.route || crossing.line || 'Amritsar Corridor'}</span>
                      </div>
                    </div>
                  ) : (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 9px',
                      backgroundColor: 'rgba(16, 185, 129, 0.07)',
                      border: '1px solid rgba(16, 185, 129, 0.22)',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '11.5px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--status-open)', fontWeight: 600 }}>
                        <Train size={13} style={{ flexShrink: 0 }} />
                        <span>Corridor Approach Clear</span>
                      </div>
                      <span style={{ color: 'var(--text-muted)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                        0 trains within 15 km
                      </span>
                    </div>
                  )}

                  {/* 2. ROADWAY & BARRIER STATE */}
                  {timing.isClosedNow ? (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-muted)', fontSize: '11.5px' }}>Roadway status:</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--critical-red)' }}>
                          Barriers locked · Do Not Cross
                        </span>
                      </div>
                      {Boolean(timing.reopeningTimeStr) && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-muted)', fontSize: '11.5px' }}>Expected reopening:</span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--status-open)' }}>
                            {timing.reopeningTimeStr}{timing.reopenCountdownText ? ` (${timing.reopenCountdownText})` : ''}
                          </span>
                        </div>
                      )}
                    </>
                  ) : timing.isClosingSoon ? (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-muted)', fontSize: '11.5px' }}>Expected closure:</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--critical-red)' }}>
                          {timing.closingTimeStr ? `${timing.closingTimeStr} (${timing.closingCountdownText || 'soon'})` : 'Closing shortly'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-muted)', fontSize: '11.5px' }}>Roadway status:</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent-primary)' }}>
                          Plan to Stop · Caution
                        </span>
                      </div>
                    </>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: '11.5px' }}>Roadway status:</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--status-open)', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--status-open)' }} />
                        Open · Safe to Cross
                      </span>
                    </div>
                  )}

                  {/* 3. Distance from User GPS */}
                  {distFormatted && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
                      <span>Distance from your GPS:</span>
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-primary)', fontWeight: 600 }}>
                        {distFormatted}
                      </span>
                    </div>
                  )}

                  {/* 4. Estimated closure duration — strictly NEVER shown when fatak is OPEN */}
                  {!timing.isTimingUnavailable && !timing.isOpenPassage && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: '11.5px' }}>Estimated closure:</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent-emphasis)' }}>
                        {timing.closureDurationText}
                        {timing.isMultiTrain && ` (${timing.trainCount} trains)`}
                      </span>
                    </div>
                  )}
                </div>

                {/* CARD FOOTER */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px' }}>
                  <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                    {crossing.locality || 'Amritsar Roadway'}
                  </span>
                  <span style={{ fontSize: '11.5px', color: 'var(--accent-primary)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span>View Details</span>
                    <ArrowRight size={13} />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
