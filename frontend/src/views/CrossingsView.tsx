import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
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
import { CrossingCard } from '../components/CrossingCard';
import { CrossingCardSkeleton } from '../components/CrossingCardSkeleton';

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

const CrossingsViewComponent: React.FC<CrossingsViewProps> = ({
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
  const [sortBy, setSortBy] = useState<'closure' | 'distance' | 'name' | 'id'>('closure');
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


  // Quantize timer to minute epoch for sorting so cards remain perfectly stable without churning every second
  const minuteEpoch = Math.floor(now / 60000);

  const { filtered, sorted, counts } = useMemo(() => {
    let closedCount = 0;
    let approachCount = 0;
    let openCount = 0;
    let unknownCount = 0;

    const filteredList: RailwayCrossing[] = [];
    const q = searchQuery.toLowerCase().trim();

    for (const c of crossings) {
      const isClosed = c.status === 'CLOSURE_EXPECTED' || c.status === 'CLOSED' || c.status === 'CLOSURE_REPORTED';
      if (isClosed) closedCount++;
      else if (c.status === 'APPROACHING') approachCount++;
      else if (c.status === 'OPEN') openCount++;
      else unknownCount++;

      const matchStatus = filterStatus === 'ALL' || 
        (filterStatus === 'CLOSURE_EXPECTED' ? isClosed : c.status === filterStatus);
      const matchVerification = filterVerification === 'ALL' || 
        (filterVerification === 'VERIFIED' && c.verificationStatus === 'VERIFIED_MAPPED_CROSSING') ||
        (filterVerification === 'PENDING' && c.verificationStatus === 'REQUIRES_FIELD_VERIFICATION');

      const matchSearch = !q ||
        c.name.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q) ||
        (c.punjabiName && c.punjabiName.toLowerCase().includes(q)) ||
        (c.roadClassification && c.roadClassification.toLowerCase().includes(q));

      if (matchStatus && matchVerification && matchSearch) {
        filteredList.push(c);
      }
    }

    const sortedList = [...filteredList].sort((a, b) => {
      if (sortBy === 'name') {
        const nameDiff = a.name.localeCompare(b.name);
        if (nameDiff !== 0) return nameDiff;
        return a.id.localeCompare(b.id);
      }
      if (sortBy === 'id') return a.id.localeCompare(b.id);
      if (sortBy === 'distance' && userProfile) {
        const distA = haversineDistanceMeters(userProfile.lat, userProfile.lng, a.lat, a.lng);
        const distB = haversineDistanceMeters(userProfile.lat, userProfile.lng, b.lat, b.lng);
        // Suppress sub-25m GPS jitter from constantly flipping nearby cards
        if (Math.abs(distA - distB) > 25) return distA - distB;
        return a.name.localeCompare(b.name);
      }
      
      // Sort by closure urgency with strictly deterministic, stable tie-breakers
      const getUrgencyScore = (c: RailwayCrossing): number => {
        if (c.activeDrill || c.observedPhysicalGateState === 'CLOSED' || c.status === 'CLOSED' || c.status === 'CLOSURE_REPORTED') return 5;
        if (c.status === 'CLOSURE_EXPECTED') return 4;
        if (c.status === 'APPROACHING') return 3;
        if (c.countdownAvailable && c.timeToNextClosureSec > 0) return 2;
        if ((c as any).upcomingTrain || (c as any).corridorTrain) return 1;
        return 0;
      };

      const scoreA = getUrgencyScore(a);
      const scoreB = getUrgencyScore(b);
      if (scoreA !== scoreB) {
        return scoreB - scoreA; // Higher urgency on top
      }

      // Within same closure urgency tier, sort by anchored closure timestamp
      // Quantized into 60-second windows with deterministic tie-breaking to prevent cards from swapping on minor telemetry refreshes
      if (scoreA >= 1) {
        const timeA = getAuthoritativeTargetEpoch(a, 'closure', now) || (a.estimatedGateClosingTime ? new Date(a.estimatedGateClosingTime).getTime() : 0);
        const timeB = getAuthoritativeTargetEpoch(b, 'closure', now) || (b.estimatedGateClosingTime ? new Date(b.estimatedGateClosingTime).getTime() : 0);
        
        if (timeA > 0 && timeB > 0) {
          const windowA = Math.floor(timeA / 60000);
          const windowB = Math.floor(timeB / 60000);
          if (windowA !== windowB) {
            return windowA - windowB;
          }
        } else if (timeA > 0 && timeB === 0) {
          return -1;
        } else if (timeA === 0 && timeB > 0) {
          return 1;
        }
      }

      // Fully deterministic stable tie-breaker by name and permanent node ID
      const nameDiff = a.name.localeCompare(b.name);
      if (nameDiff !== 0) return nameDiff;
      return a.id.localeCompare(b.id);
    });

    return {
      filtered: filteredList,
      sorted: sortedList,
      counts: { closedCount, approachCount, openCount, unknownCount }
    };
  }, [crossings, filterStatus, filterVerification, searchQuery, sortBy, userProfile?.lat, userProfile?.lng, minuteEpoch]);

  const { closedCount, approachCount, openCount, unknownCount } = counts;

  const handleCopy = (c: RailwayCrossing, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(`${c.lat}, ${c.lng}`);
    setCopiedId(c.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleToggleFavorite = useCallback(async (crossingId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await nativeService.toggleFavoriteCrossing(crossingId);
    setFavIds(nativeService.getFavoriteCrossingIds());
  }, []);

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
                <span className="pulse-calm" style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--status-open)',
                  boxShadow: '0 0 6px var(--status-open)'
                }} />
                LIVE TRAIN TRACKING
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
                DELAYED UPDATE (&gt;15M OLD)
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
            <option value="name">Sort: Name (A-Z)</option>
            <option value="closure">Sort: Next Closure</option>
            {userProfile && <option value="distance">Sort: Nearest Distance</option>}
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

      {/* CARDS VIEW (DEFAULT ACROSS ALL SCREENS) */}
      {viewMode === 'cards' && (
        crossings.length === 0 ? (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(320px, 100%), 1fr))',
            gap: '16px',
            marginBottom: '24px'
          }}>
            {[1, 2, 3, 4, 5, 6].map(i => (
              <CrossingCardSkeleton key={i} />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-soft)',
            borderRadius: 'var(--radius-lg)',
            padding: '36px 20px',
            textAlign: 'center',
            marginBottom: '24px'
          }}>
            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
              No level crossings match your filter
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 16px 0', maxWidth: '420px', marginInline: 'auto' }}>
              {searchQuery ? `No crossing matched "${searchQuery}".` : 'No crossing found under current status or verification filter.'}
            </p>
            <button
              onClick={() => {
                setSearchQuery('');
                setFilterStatus('ALL');
                setFilterVerification('ALL');
              }}
              className="btn btn-secondary"
              style={{ fontSize: '12px', padding: '6px 14px' }}
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(320px, 100%), 1fr))',
            gap: '16px',
            marginBottom: '24px'
          }}>
            {sorted.map(crossing => {
              const distM = userProfile ? haversineDistanceMeters(userProfile.lat, userProfile.lng, crossing.lat, crossing.lng) : null;
              const userDistance = distM !== null ? `${formatDistance(distM)} away` : null;

              return (
                <CrossingCard
                  key={crossing.id}
                  crossing={crossing}
                  trains={trains}
                  now={now}
                  userDistance={userDistance}
                  isFavorite={favIds.includes(crossing.id)}
                  onToggleFavorite={handleToggleFavorite}
                  onSelect={onSelectCrossing}
                />
              );
            })}
          </div>
        )
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

export const CrossingsView = memo(CrossingsViewComponent);
export default CrossingsView;
