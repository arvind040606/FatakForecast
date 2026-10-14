import React, { useState, useEffect } from 'react';
import { 
  Search, 
  MapPin, 
  Copy, 
  Check, 
  Clock, 
  Train, 
  Info, 
  LayoutGrid, 
  List,
  ShieldAlert,
  ArrowRight,
  Star
} from 'lucide-react';
import { RailwayCrossing, SectorTrain, RailwayCorridor, ActiveRoute, UserLocationProfile, OperationalMetrics, ConnectionStateDetails } from '../types';
import { findImpactingTrainForCrossing, getCrossingTrainDisplay, getCrossingTimingDetails } from '../utils/trainHelpers';
import { useSharedTimer, getAuthoritativeTargetEpoch, calculateRemainingSeconds, formatCountdown } from '../utils/timerManager';
import { haversineDistanceMeters, formatDistance, getCrossingDataFreshness } from '../utils/geoUtils';
import { nativeService } from '../services/nativeService';
import { railwayApi } from '../services/apiService';

interface CrossingsViewProps {
  crossings: RailwayCrossing[];
  trains: SectorTrain[];
  corridors: RailwayCorridor[];
  metrics?: OperationalMetrics;
  lastUpdateTimestamp?: string;
  onSelectCrossing: (crossing: RailwayCrossing) => void;
  onNavigate: (route: ActiveRoute) => void;
  initialFilter?: string;
  userProfile?: UserLocationProfile | null;
  onChangeLocation?: () => void;
}

export const CrossingsView: React.FC<CrossingsViewProps> = ({
  crossings,
  trains,
  corridors,
  metrics,
  lastUpdateTimestamp,
  onSelectCrossing,
  onNavigate,
  initialFilter,
  userProfile,
  onChangeLocation
}) => {
  const [filterStatus, setFilterStatus] = useState<string>(initialFilter || 'ALL');
  const [filterVerification, setFilterVerification] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'closure' | 'distance' | 'name' | 'id'>(userProfile ? 'distance' : 'closure');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [favIds, setFavIds] = useState<string[]>(() => nativeService.getFavoriteCrossingIds());
  const [connDetails, setConnDetails] = useState<ConnectionStateDetails>(() => railwayApi.getConnectionDetails());

  useEffect(() => {
    const unsub = railwayApi.onConnectionStateChange(setConnDetails);
    return unsub;
  }, []);

  useEffect(() => {
    const handleFavUpdated = (e: any) => {
      setFavIds(e.detail || nativeService.getFavoriteCrossingIds());
    };
    window.addEventListener('fatak:favorite-crossings-updated', handleFavUpdated);
    return () => window.removeEventListener('fatak:favorite-crossings-updated', handleFavUpdated);
  }, []);

  // Local 1-second continuous ticker for ultra-smooth real-time countdown updates
  const now = useSharedTimer();

  const getDynamicWaitSec = (c: RailwayCrossing): number => {
    const target = getAuthoritativeTargetEpoch(c, 'reopen', now);
    if (target !== null) {
      return calculateRemainingSeconds(target, now);
    }
    return c.remainingWaitSec || 0;
  };

  const getDynamicClosureSec = (c: RailwayCrossing): number => {
    const target = getAuthoritativeTargetEpoch(c, 'closure', now);
    if (target !== null) {
      return calculateRemainingSeconds(target, now);
    }
    return c.timeToNextClosureSec || 0;
  };


  const closedCount = crossings.filter(c => c.status === 'CLOSURE_EXPECTED' || c.status === 'CLOSED' || c.status === 'CLOSURE_REPORTED').length;
  const approachCount = crossings.filter(c => c.status === 'APPROACHING').length;
  const openCount = crossings.filter(c => c.status === 'OPEN').length;
  const unknownCount = crossings.filter(c => c.status === 'UNKNOWN').length;

  const filtered = crossings.filter(c => {
    const isClosed = c.status === 'CLOSURE_EXPECTED' || c.status === 'CLOSED' || c.status === 'CLOSURE_REPORTED';
    const matchStatus = filterStatus === 'ALL' || 
      (filterStatus === 'CLOSURE_EXPECTED' ? isClosed : c.status === filterStatus);
    const matchVerification = filterVerification === 'ALL' || 
      (filterVerification === 'VERIFIED' && c.verificationStatus === 'VERIFIED_MAPPED_CROSSING') ||
      (filterVerification === 'PENDING' && c.verificationStatus === 'REQUIRES_FIELD_VERIFICATION');

    const matchSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        c.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        (c.punjabiName && c.punjabiName.includes(searchQuery)) ||
                        (c.roadClassification && c.roadClassification.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchStatus && matchVerification && matchSearch;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'name') return a.name.localeCompare(b.name);
    if (sortBy === 'id') return a.id.localeCompare(b.id);
    
    // Sort by closure urgency
    const aClosed = a.status === 'CLOSURE_EXPECTED' || a.status === 'CLOSED' || a.status === 'CLOSURE_REPORTED';
    const bClosed = b.status === 'CLOSURE_EXPECTED' || b.status === 'CLOSED' || b.status === 'CLOSURE_REPORTED';
    if (aClosed && !bClosed) return -1;
    if (!aClosed && bClosed) return 1;

    const aApp = a.status === 'APPROACHING';
    const bApp = b.status === 'APPROACHING';
    if (aApp && !bApp) return -1;
    if (!aApp && bApp) return 1;

    const aHasCountdown = a.countdownAvailable && a.timeToNextClosureSec > 0;
    const bHasCountdown = b.countdownAvailable && b.timeToNextClosureSec > 0;
    if (aHasCountdown && !bHasCountdown) return -1;
    if (!aHasCountdown && bHasCountdown) return 1;
    if (aHasCountdown && bHasCountdown) {
      return a.timeToNextClosureSec - b.timeToNextClosureSec;
    }

    const aOpen = a.status === 'OPEN';
    const bOpen = b.status === 'OPEN';
    if (aOpen && !bOpen) return -1;
    if (!aOpen && bOpen) return 1;

    // Stable secondary tie-breaker by ID to prevent position jitter
    return a.id.localeCompare(b.id);
  });

  const handleCopy = (c: RailwayCrossing, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(`${c.lat}, ${c.lng}`);
    setCopiedId(c.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getStatusBadge = (crossing: RailwayCrossing) => {
    if (crossing.activeDrill || crossing.closureReported || crossing.observedPhysicalGateState === 'CLOSED') {
      return { label: 'CONFIRMED CLOSED', color: 'var(--critical-red)', bg: 'var(--status-closed-bg)', border: 'var(--status-closed-border)' };
    }
    if (crossing.observedPhysicalGateState === 'OPEN' || crossing.confirmedOpenReport === true) {
      return { label: 'CONFIRMED OPEN', color: 'var(--status-open)', bg: 'var(--surface-green)', border: 'var(--surface-green-border)' };
    }
    if (crossing.status === 'CLOSED' || crossing.status === 'CLOSURE_REPORTED') {
      return { label: 'PREDICTED CLOSURE', color: 'var(--critical-red)', bg: 'var(--status-closed-bg)', border: 'var(--status-closed-border)' };
    }
    if (crossing.status === 'CLOSURE_EXPECTED' || crossing.status === 'APPROACHING') {
      return { label: 'PREDICTED CLOSURE', color: 'var(--warning-amber)', bg: 'var(--status-approaching-bg)', border: 'var(--status-approaching-border)' };
    }
    if (crossing.status === 'UNKNOWN') {
      return { label: 'STATUS UNKNOWN', color: 'var(--text-muted)', bg: 'var(--bg-secondary)', border: 'var(--border-subtle)' };
    }
    return { label: 'PREDICTED OPEN', color: 'var(--status-open)', bg: 'var(--surface-green)', border: 'var(--surface-green-border)' };
  };

  return (
    <div className="page-container">
      {/* PAGE HEADER */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <h1 className="page-title" style={{ margin: 0 }}>Amritsar Railway Crossings Directory</h1>
            {connDetails.state === 'LIVE' ? (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                color: 'var(--status-open)',
                backgroundColor: 'var(--status-open-bg)',
                border: '1px solid var(--status-open-border)',
                padding: '2px 8px',
                borderRadius: 'var(--radius-full)'
              }}>
                <span style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--status-open)',
                  boxShadow: '0 0 6px var(--status-open)'
                }} />
                LIVE TELEMETRY (RAILKIT ACTIVE)
              </span>
            ) : connDetails.state === 'STALE' ? (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                color: 'var(--warning-amber)',
                backgroundColor: 'var(--status-approaching-bg)',
                border: '1px solid var(--status-approaching-border)',
                padding: '2px 8px',
                borderRadius: 'var(--radius-full)'
              }}>
                <span style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--warning-amber)'
                }} />
                STALE TELEMETRY (&gt;15M OLD)
              </span>
            ) : connDetails.state === 'CONNECTING' ? (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                color: 'var(--accent-cyan)',
                backgroundColor: 'rgba(56, 189, 248, 0.12)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                padding: '2px 8px',
                borderRadius: 'var(--radius-full)'
              }}>
                <span style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--accent-cyan)'
                }} />
                CONNECTING TO FEED...
              </span>
            ) : (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                color: 'var(--status-closed)',
                backgroundColor: 'var(--status-closed-bg)',
                border: '1px solid var(--status-closed-border)',
                padding: '2px 8px',
                borderRadius: 'var(--radius-full)'
              }}>
                <span style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--status-closed)'
                }} />
                FEED OFFLINE (PREDICTIONS PAUSED)
              </span>
            )}
          </div>
          <p className="page-subtitle" style={{ marginTop: '4px' }}>
            Authoritative inventory of all {crossings.length} level crossings mapped along Amritsar railway corridors
          </p>
        </div>

        {/* SEARCH, STATUS FILTER & CONTROLS */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* SEARCH */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-soft)',
            borderRadius: 'var(--radius-md)',
            padding: '7px 12px',
            gap: '8px',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <Search size={15} color="var(--text-muted)" />
            <input
              type="text"
              placeholder="Search crossings..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--text-primary)',
                fontSize: '12.5px',
                width: '150px'
              }}
            />
          </div>

          {/* STATUS FILTER PILLS */}
          <div style={{
            display: 'flex',
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-soft)',
            borderRadius: 'var(--radius-md)',
            padding: '3px',
            boxShadow: 'var(--shadow-sm)'
          }}>
            {[
              { id: 'ALL', label: `All (${crossings.length})` },
              { id: 'CLOSURE_EXPECTED', label: `Closed (${closedCount})`, isAlert: closedCount > 0 },
              { id: 'APPROACHING', label: `Approach (${approachCount})` },
              { id: 'OPEN', label: `Open (${openCount})` },
              ...(unknownCount > 0 ? [{ id: 'UNKNOWN', label: `Unconfirmed (${unknownCount})` }] : [])
            ].map(item => (
              <button
                key={item.id}
                onClick={() => setFilterStatus(item.id)}
                style={{
                  backgroundColor: filterStatus === item.id 
                    ? (item.id === 'CLOSURE_EXPECTED' ? 'var(--status-closed-bg)' : 'var(--surface-green)') 
                    : 'transparent',
                  color: filterStatus === item.id 
                    ? (item.id === 'CLOSURE_EXPECTED' ? 'var(--status-closed)' : 'var(--accent-emphasis)') 
                    : (item.isAlert ? 'var(--status-closed)' : 'var(--text-secondary)'),
                  border: filterStatus === item.id 
                    ? (item.id === 'CLOSURE_EXPECTED' ? '1px solid var(--status-closed-border)' : '1px solid var(--surface-green-border)') 
                    : '1px solid transparent',
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* SORT DROPDOWN */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-soft)',
              color: 'var(--text-primary)',
              padding: '7px 12px',
              borderRadius: 'var(--radius-md)',
              fontSize: '12px',
              fontWeight: 500,
              outline: 'none',
              boxShadow: 'var(--shadow-sm)'
            }}
          >
            <option value="closure">Sort: Next Closure</option>
            <option value="name">Sort: Name (A-Z)</option>
            <option value="id">Sort: Node ID</option>
          </select>

          {/* VIEW MODE TOGGLE */}
          <div className="hide-on-mobile" style={{
            display: 'flex',
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-soft)',
            borderRadius: 'var(--radius-md)',
            padding: '3px',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <button
              onClick={() => setViewMode('cards')}
              title="Cards View"
              style={{
                backgroundColor: viewMode === 'cards' ? 'var(--surface-green)' : 'transparent',
                color: viewMode === 'cards' ? 'var(--accent-emphasis)' : 'var(--text-muted)',
                border: viewMode === 'cards' ? '1px solid var(--surface-green-border)' : '1px solid transparent',
                padding: '6px 10px',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}
            >
              <LayoutGrid size={14} />
              <span style={{ fontSize: '11.5px', fontWeight: 600 }}>Cards</span>
            </button>
            <button
              onClick={() => setViewMode('table')}
              title="Table View"
              style={{
                backgroundColor: viewMode === 'table' ? 'var(--surface-green)' : 'transparent',
                color: viewMode === 'table' ? 'var(--accent-emphasis)' : 'var(--text-muted)',
                border: viewMode === 'table' ? '1px solid var(--surface-green-border)' : '1px solid transparent',
                padding: '6px 10px',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}
            >
              <List size={14} />
              <span style={{ fontSize: '11.5px', fontWeight: 600 }}>Table</span>
            </button>
          </div>
        </div>
      </div>

      {/* GATE TELEMETRY TRANSPARENCY ADVISORY */}
      <div className="panel" style={{
        padding: '12px 18px',
        marginBottom: '20px',
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-panel)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px'
      }}>
        <Info size={17} color="var(--accent-primary)" style={{ flexShrink: 0, marginTop: '2px' }} />
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
          <strong style={{ color: 'var(--accent-emphasis)' }}>Barrier Telemetry Notice:</strong>{' '}
          Level crossing closure projections are calculated from approaching train kinematics along track geometry. Physical gate barrier sensor telemetry is uninstrumented; states reflect predictive kinematic forecasts, not mechanical latch confirmations.
        </div>
      </div>

      {/* CARDS VIEW (DEFAULT ACROSS ALL SCREENS) */}
      {viewMode === 'cards' && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(320px, 100%), 1fr))',
          gap: '16px',
          marginBottom: '24px'
        }}>
          {sorted.map(crossing => {
            const badge = getStatusBadge(crossing);
            const trainInfo = getCrossingTrainDisplay(crossing, trains);
            const timing = getCrossingTimingDetails(crossing, now, trains);
            const distM = userProfile ? haversineDistanceMeters(userProfile.lat, userProfile.lng, crossing.lat, crossing.lng) : null;
            const userDistance = distM !== null ? `${formatDistance(distM)} away` : null;

            return (
              <div
                key={crossing.id}
                className="mobile-card"
                onClick={() => onSelectCrossing(crossing)}
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-panel)',
                  borderLeft: `4px solid ${timing.statusBadge.color}`,
                  padding: '16px 18px',
                  borderRadius: 'var(--radius-lg)',
                  boxShadow: 'var(--shadow-sm)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px'
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
                      {userDistance && ` • ${userDistance}`}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        await nativeService.toggleFavoriteCrossing(crossing.id);
                        setFavIds(nativeService.getFavoriteCrossingIds());
                      }}
                      title={favIds.includes(crossing.id) ? "Remove from favourites" : "Save as favourite fatak"}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '4px',
                        color: favIds.includes(crossing.id) ? '#f59e0b' : 'var(--text-muted)'
                      }}
                    >
                      <Star size={16} fill={favIds.includes(crossing.id) ? '#f59e0b' : 'none'} />
                    </button>

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

                  {/* 3. Estimated closure duration — strictly NEVER shown when fatak is OPEN */}
                  {!timing.isTimingUnavailable && !timing.isOpenPassage && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: '11.5px' }}>Estimated closure:</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent-emphasis)' }}>
                        {timing.closureDurationText}
                        {timing.isMultiTrain && ` (${timing.trainCount} trains)`}
                      </span>
                    </div>
                  )}

                  {/* 4. When timing is unconfirmed / unavailable */}
                  {timing.isTimingUnavailable && !timing.activeTrain && (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.3' }}>
                      Live permanent-way telemetry currently unconfirmed. Proceed with caution.
                    </div>
                  )}

                  {/* 5. Last train passed if available and no active approaching train */}
                  {!timing.hasApproachingTrain && timing.lastTrainPassedText && (
                    <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', borderTop: '1px dashed var(--border-subtle)', paddingTop: '3px' }}>
                      {timing.lastTrainPassedText}
                    </div>
                  )}
                </div>

                {/* BOTTOM ACTION: View Details */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px' }} onClick={(e) => e.stopPropagation()}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {crossing.locality || 'Amritsar Roadway'}
                  </div>
                  <button
                    onClick={() => onSelectCrossing(crossing)}
                    className="btn btn-secondary"
                    style={{
                      padding: '6px 14px',
                      fontSize: '11.5px',
                      fontWeight: 700,
                      gap: '5px',
                      borderRadius: 'var(--radius-sm)'
                    }}
                  >
                    <span>View Details</span>
                    <ArrowRight size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TABLE VIEW (OPTION FOR DESKTOP) */}
      {viewMode === 'table' && (
        <div className="panel" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', marginBottom: '24px' }}>
          <table className="data-table" style={{ minWidth: '780px', width: '100%' }}>
            <thead>
              <tr>
                <th>Crossing Identifier &amp; Name</th>
                <th>Predicted Status</th>
                <th>Approaching Train</th>
                <th>Corridor Location</th>
                <th>Estimated Closure</th>
                <th>Coordinates</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(crossing => {
                const badge = getStatusBadge(crossing);
                const trainInfo = getCrossingTrainDisplay(crossing, trains);
                const timing = getCrossingTimingDetails(crossing, now, trains);

                return (
                  <tr key={crossing.id} onClick={() => onSelectCrossing(crossing)} style={{ cursor: 'pointer' }}>
                    <td>
                      <div>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '13.5px' }}>
                          {crossing.name}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-primary)', fontWeight: 600 }}>{crossing.id.replace('osm/node/', 'ASR-')}</span>
                          {crossing.punjabiName && ` • ${crossing.punjabiName}`}
                        </div>
                      </div>
                    </td>

                    <td>
                      <span style={{
                        fontSize: '10.5px',
                        fontWeight: 700,
                        backgroundColor: badge.bg,
                        color: badge.color,
                        border: `1px solid ${badge.border}`,
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-full)'
                      }}>
                        {badge.label}
                      </span>
                    </td>

                    <td>
                      <div>
                        <div style={{ color: 'var(--text-primary)', fontSize: '12.5px', fontWeight: 600 }}>
                          {trainInfo.name}
                        </div>
                        <div style={{ fontSize: '10.5px', fontFamily: 'var(--font-mono)', color: trainInfo.isApproaching ? 'var(--accent-primary)' : 'var(--text-secondary)', fontWeight: 600 }}>
                          {trainInfo.trainNumber ? `#${trainInfo.trainNumber} • ` : ''}{trainInfo.speedText}
                        </div>
                        {timing.hasApproachingTrain && !timing.isTimingUnavailable && (
                          <div style={{ fontSize: '10px', color: 'var(--accent-cyan)', fontWeight: 700, fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                            {timing.trainArrivalEtaText}
                          </div>
                        )}
                        {trainInfo.secondaryTrains && trainInfo.secondaryTrains.length > 0 && (
                          <div style={{
                            marginTop: '2px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '9px',
                            fontWeight: 700,
                            backgroundColor: '#FEF3C7',
                            color: '#92400E',
                            padding: '1px 4px',
                            borderRadius: '3px'
                          }}>
                            +{trainInfo.secondaryTrains.length} following
                          </div>
                        )}
                      </div>
                    </td>

                    <td>
                      <div style={{ fontSize: '12.5px', color: 'var(--text-primary)' }}>
                        {crossing.locality || 'Amritsar Roadway'}
                      </div>
                    </td>

                    <td>
                      <div style={{
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 700,
                        fontSize: '12.5px',
                        color: timing.statusBadge.color
                      }}>
                        {timing.isClosedNow 
                          ? `CLOSED (${timing.reopeningTimeStr ? `Reopens ${timing.reopeningTimeStr}` : 'Locked'})`
                          : (timing.isClosingSoon 
                            ? `CLOSES ${timing.closingCountdownText || 'SOON'}` 
                            : (timing.isTimingUnavailable ? 'Timing Unavailable' : 'Clear Passage'))}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        {!timing.isTimingUnavailable && (
                          timing.isOpenPassage 
                            ? 'Open now · Passage clear'
                            : `Closure: ${timing.closureDurationText} • Reopen: ${timing.reopeningTimeStr || 'Shortly'}`
                        )}
                        {timing.isTimingUnavailable && (
                          timing.passingTrain 
                            ? `Train in corridor: #${timing.passingTrain.trainNumber} • ${timing.passingTrain.speedText}`
                            : (timing.lastTrainPassedText || 'Timing unconfirmed')
                        )}
                      </div>
                    </td>

                    <td>
                      <button
                        onClick={(e) => handleCopy(crossing, e)}
                        style={{
                          background: 'var(--bg-secondary)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: '4px',
                          color: 'var(--text-secondary)',
                          padding: '3px 7px',
                          fontSize: '10.5px',
                          fontFamily: 'var(--font-mono)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                        title="Copy coordinates"
                      >
                        {copiedId === crossing.id ? <Check size={11} color="var(--status-open)" /> : <Copy size={11} />}
                        <span>{crossing.lat.toFixed(4)}, {crossing.lng.toFixed(4)}</span>
                      </button>
                    </td>

                    <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => onSelectCrossing(crossing)}
                        className="btn btn-primary"
                        style={{ padding: '6px 12px', fontSize: '12px', minHeight: '34px' }}
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
