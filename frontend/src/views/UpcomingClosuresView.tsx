import React, { useState } from 'react';
import { 
  Clock, 
  MapPin, 
  Info, 
  ArrowRight,
  ShieldAlert,
  Train, 
  LayoutGrid, 
  List,
  Star,
  AlertTriangle
} from 'lucide-react';
import { RailwayCrossing, SectorTrain, ActiveRoute } from '../types';
import { findImpactingTrainForCrossing, getCrossingTrainDisplay, getCrossingTimingDetails } from '../utils/trainHelpers';
import { useSharedTimer, getAuthoritativeTargetEpoch, calculateRemainingSeconds, formatCountdown } from '../utils/timerManager';
import { nativeService } from '../services/nativeService';

interface UpcomingClosuresViewProps {
  crossings: RailwayCrossing[];
  trains: SectorTrain[];
  onSelectCrossing: (crossing: RailwayCrossing) => void;
  onNavigate: (route: ActiveRoute) => void;
}

export const UpcomingClosuresView: React.FC<UpcomingClosuresViewProps> = ({
  crossings,
  trains,
  onSelectCrossing,
  onNavigate
}) => {
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [favIds, setFavIds] = useState<string[]>(() => nativeService.getFavoriteCrossingIds());
  const now = useSharedTimer();

  // Sort crossings by closure urgency: Active closures & approaching trains first, then unconfirmed/open
  const sorted = [...crossings].sort((a, b) => {
    // 1. Closures expected / closed first
    const aClosed = a.status === 'CLOSURE_EXPECTED' || a.status === 'CLOSED' || a.status === 'CLOSURE_REPORTED';
    const bClosed = b.status === 'CLOSURE_EXPECTED' || b.status === 'CLOSED' || b.status === 'CLOSURE_REPORTED';
    if (aClosed && !bClosed) return -1;
    if (!aClosed && bClosed) return 1;

    // 2. Active approach next
    const aApp = a.status === 'APPROACHING';
    const bApp = b.status === 'APPROACHING';
    if (aApp && !bApp) return -1;
    if (!aApp && bApp) return 1;

    // 3. Upcoming countdowns next (sorted by anchored closure time to prevent second-by-second jitter)
    const aHasCountdown = a.countdownAvailable && a.timeToNextClosureSec > 0;
    const bHasCountdown = b.countdownAvailable && b.timeToNextClosureSec > 0;
    if (aHasCountdown && !bHasCountdown) return -1;
    if (!aHasCountdown && bHasCountdown) return 1;
    if (aHasCountdown && bHasCountdown) {
      const timeA = getAuthoritativeTargetEpoch(a, 'closure', now) || (a.estimatedGateClosingTime ? new Date(a.estimatedGateClosingTime).getTime() : (now + a.timeToNextClosureSec * 1000));
      const timeB = getAuthoritativeTargetEpoch(b, 'closure', now) || (b.estimatedGateClosingTime ? new Date(b.estimatedGateClosingTime).getTime() : (now + b.timeToNextClosureSec * 1000));
      if (timeA !== timeB) {
        return timeA - timeB;
      }
      return a.id.localeCompare(b.id);
    }

    // 4. Genuine open crossings
    const aOpen = a.status === 'OPEN';
    const bOpen = b.status === 'OPEN';
    if (aOpen && !bOpen) return -1;
    if (!aOpen && bOpen) return 1;

    // 5. Deterministic tie-breaker by crossing id
    return a.id.localeCompare(b.id);
  });

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
          <h1 className="page-title">Upcoming Crossing Closures &amp; Forecasts</h1>
          <p className="page-subtitle">
            Estimated train arrival windows along railway geometry and safety buffer projections
          </p>
        </div>

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
              backgroundColor: viewMode === 'cards' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
              color: viewMode === 'cards' ? 'var(--accent-primary)' : 'var(--text-muted)',
              border: viewMode === 'cards' ? '1px solid var(--accent-primary)' : '1px solid transparent',
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
              backgroundColor: viewMode === 'table' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
              color: viewMode === 'table' ? 'var(--accent-primary)' : 'var(--text-muted)',
              border: viewMode === 'table' ? '1px solid var(--accent-primary)' : '1px solid transparent',
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

      {/* METHODOLOGY & ADVISORY */}
      <div className="panel" style={{
        padding: '12px 18px',
        marginBottom: '20px',
        backgroundColor: 'var(--bg-surface)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
      }}>
        <Info size={17} color="var(--accent-primary)" style={{ flexShrink: 0 }} />
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
          <strong style={{ color: 'var(--accent-emphasis)' }}>How it works:</strong>{' '}
          Closure predictions are calculated from live train tracking and expected approach speeds, including standard safety buffers before the train reaches each crossing.
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
            const timing = getCrossingTimingDetails(crossing, now, trains);

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
                      {crossing.locality && ` • ${crossing.locality}`}
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
                      Live track status is currently updating. Proceed with caution.
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
                    {crossing.roadClassification || crossing.locality || 'Amritsar Roadway'}
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
                    View Details →
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
                <th>Crossing Identifier</th>
                <th>Status</th>
                <th>Corridor Location</th>
                <th>Projected Closure Timing</th>
                <th>Approaching Train</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(crossing => {
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
                        backgroundColor: timing.statusBadge.bg,
                        color: timing.statusBadge.color,
                        border: `1px solid ${timing.statusBadge.border}`,
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-full)'
                      }}>
                        {timing.statusBadge.label}
                      </span>
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
                      <div>
                        <div style={{ color: 'var(--text-primary)', fontSize: '12.5px', fontWeight: 600 }}>
                          {trainInfo.name}
                        </div>
                        <div style={{ fontSize: '10.5px', fontFamily: 'var(--font-mono)', color: trainInfo.isApproaching ? 'var(--accent-primary)' : 'var(--text-secondary)', fontWeight: 600 }}>
                          {trainInfo.trainNumber ? `#${trainInfo.trainNumber} • ` : ''}{trainInfo.speedText}
                        </div>
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
                            +{trainInfo.secondaryTrains.length} following (#{trainInfo.secondaryTrains.map(t => t.trainNumber).join(', #')})
                          </div>
                        )}
                      </div>
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
