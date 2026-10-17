import React, { useState, useCallback } from 'react';
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
import { CrossingCard } from '../components/CrossingCard';

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

  const handleToggleFavorite = useCallback(async (crossingId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await nativeService.toggleFavoriteCrossing(crossingId);
    setFavIds(nativeService.getFavoriteCrossingIds());
  }, []);

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

    // 3. Upcoming countdowns next (sorted by anchored closure time quantized into 60s windows to prevent card shuffling)
    const aHasCountdown = a.countdownAvailable && a.timeToNextClosureSec > 0;
    const bHasCountdown = b.countdownAvailable && b.timeToNextClosureSec > 0;
    if (aHasCountdown && !bHasCountdown) return -1;
    if (!aHasCountdown && bHasCountdown) return 1;
    if (aHasCountdown && bHasCountdown) {
      const timeA = getAuthoritativeTargetEpoch(a, 'closure', now) || (a.estimatedGateClosingTime ? new Date(a.estimatedGateClosingTime).getTime() : (now + a.timeToNextClosureSec * 1000));
      const timeB = getAuthoritativeTargetEpoch(b, 'closure', now) || (b.estimatedGateClosingTime ? new Date(b.estimatedGateClosingTime).getTime() : (now + b.timeToNextClosureSec * 1000));
      const windowA = Math.floor(timeA / 60000);
      const windowB = Math.floor(timeB / 60000);
      if (windowA !== windowB) {
        return windowA - windowB;
      }
      const nameDiff = a.name.localeCompare(b.name);
      if (nameDiff !== 0) return nameDiff;
      return a.id.localeCompare(b.id);
    }

    // 4. Genuine open crossings
    const aOpen = a.status === 'OPEN';
    const bOpen = b.status === 'OPEN';
    if (aOpen && !bOpen) return -1;
    if (!aOpen && bOpen) return 1;

    // 5. Fully deterministic stable tie-breaker by crossing name and permanent id
    const nameDiff = a.name.localeCompare(b.name);
    if (nameDiff !== 0) return nameDiff;
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
          {sorted.map(crossing => (
            <CrossingCard
              key={crossing.id}
              crossing={crossing}
              trains={trains}
              now={now}
              isFavorite={favIds.includes(crossing.id)}
              onToggleFavorite={handleToggleFavorite}
              onSelect={onSelectCrossing}
            />
          ))}
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
