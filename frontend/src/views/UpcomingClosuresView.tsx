import React, { useState } from 'react';
import { 
  Clock, 
  MapPin, 
  Info, 
  ArrowRight,
  ShieldAlert,
  Train, 
  LayoutGrid, 
  List
} from 'lucide-react';
import { RailwayCrossing, SectorTrain, ActiveRoute } from '../types';
import { findImpactingTrainForCrossing, getCrossingTrainDisplay } from '../utils/trainHelpers';
import { useSharedTimer, getAuthoritativeTargetEpoch, calculateRemainingSeconds, formatCountdown } from '../utils/timerManager';

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

    // 3. Upcoming countdowns next (sorted by soonest closure)
    const aHasCountdown = a.countdownAvailable && a.timeToNextClosureSec > 0;
    const bHasCountdown = b.countdownAvailable && b.timeToNextClosureSec > 0;
    if (aHasCountdown && !bHasCountdown) return -1;
    if (!aHasCountdown && bHasCountdown) return 1;
    if (aHasCountdown && bHasCountdown) {
      return a.timeToNextClosureSec - b.timeToNextClosureSec;
    }

    // 4. Genuine open crossings
    const aOpen = a.status === 'OPEN';
    const bOpen = b.status === 'OPEN';
    if (aOpen && !bOpen) return -1;
    if (!aOpen && bOpen) return 1;

    // 5. Unknown / unconfirmed crossings last
    return 0;
  });

  const getStatusBadge = (crossing: RailwayCrossing) => {
    if (crossing.status === 'CLOSURE_EXPECTED' || crossing.status === 'CLOSED' || crossing.status === 'CLOSURE_REPORTED') {
      return { label: 'CLOSURE EXPECTED', color: 'var(--critical-red)', bg: 'var(--status-closed-bg)', border: 'var(--status-closed-border)' };
    }
    if (crossing.status === 'APPROACHING') {
      return { label: 'APPROACHING', color: 'var(--warning-amber)', bg: 'var(--status-approaching-bg)', border: 'var(--status-approaching-border)' };
    }
    if (crossing.status === 'UNKNOWN') {
      return { label: 'CLEAR PASSAGE', color: 'var(--status-open)', bg: 'var(--surface-green)', border: 'var(--surface-green-border)' };
    }
    return { label: 'CLEAR PASSAGE', color: 'var(--status-open)', bg: 'var(--surface-green)', border: 'var(--surface-green-border)' };
  };

  return (
    <div className="page-container" style={{ paddingBottom: '90px' }}>
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
          backgroundColor: '#FFFFFF',
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

      {/* METHODOLOGY & ADVISORY */}
      <div className="panel" style={{
        padding: '12px 18px',
        marginBottom: '20px',
        backgroundColor: '#FFFFFF',
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
      }}>
        <Info size={17} color="var(--accent-primary)" style={{ flexShrink: 0 }} />
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
          <strong style={{ color: 'var(--accent-emphasis)' }}>Forecasting Methodology:</strong>{' '}
          Calculations are derived by integrating train distance along verified railway track polylines. Closure estimates incorporate standard interlocking safety buffers prior to train passage.
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

            return (
              <div
                key={crossing.id}
                className="mobile-card"
                onClick={() => onSelectCrossing(crossing)}
                style={{
                  backgroundColor: '#FFFFFF',
                  border: '1px solid var(--border-soft)',
                  borderLeft: `4px solid ${badge.color}`,
                  padding: '18px',
                  borderRadius: 'var(--radius-lg)',
                  boxShadow: 'var(--shadow-sm)',
                  cursor: 'pointer'
                }}
              >
                {/* HEADER */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                  <div>
                    <div style={{ fontFamily: 'var(--font-brand)', fontWeight: 700, fontSize: '16px', color: 'var(--text-primary)' }}>
                      {crossing.name}
                    </div>
                    <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-primary)', fontWeight: 600 }}>{crossing.id}</span>
                      {crossing.punjabiName && ` • ${crossing.punjabiName}`}
                    </div>
                  </div>

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
                </div>

                {/* TIMING GRID */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', fontSize: '11.5px', backgroundColor: '#FAF9F5', padding: '12px 14px', borderRadius: 'var(--radius-md)', margin: '6px 0', border: '1px solid var(--border-subtle)' }}>
                  <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', fontWeight: 600 }}>Projected Closure</div>
                    <div style={{ fontSize: '15px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: badge.color, marginTop: '2px' }}>
                      {(() => {
                        const waitTarget = getAuthoritativeTargetEpoch(crossing, 'reopen', now);
                        const waitSec = waitTarget !== null ? calculateRemainingSeconds(waitTarget, now) : (crossing.remainingWaitSec || 0);
                        const closeTarget = getAuthoritativeTargetEpoch(crossing, 'closure', now);
                        const closeSec = closeTarget !== null ? calculateRemainingSeconds(closeTarget, now) : (crossing.timeToNextClosureSec || 0);
                        const { minutes: closeMin, seconds: closeRem } = formatCountdown(closeSec);
                        const { minutes: waitMin, seconds: waitRem } = formatCountdown(waitSec);

                        if (crossing.status === 'CLOSED' || crossing.status === 'CLOSURE_EXPECTED') {
                          return `CLOSED (${waitSec > 0 ? (waitSec > 60 ? `~${waitMin}m ${waitRem}s wait` : `~${waitSec}s wait`) : 'Traversing'})`;
                        }
                        if (crossing.countdownAvailable && closeSec > 0 && closeSec < 3600) {
                          return `In ~${closeMin}m ${closeRem}s`;
                        }
                        return 'Clear Passage';
                      })()}
                    </div>
                    <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '1px' }}>
                      {crossing.locality || 'Amritsar Roadway'}
                    </div>
                  </div>

                  <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', fontWeight: 600 }}>
                      {trainInfo.label}
                    </div>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {trainInfo.name}
                    </div>
                    <div style={{ fontSize: '10.5px', fontFamily: 'var(--font-mono)', color: trainInfo.isApproaching ? 'var(--accent-primary)' : 'var(--text-secondary)', fontWeight: 600, marginTop: '1px' }}>
                      {trainInfo.trainNumber ? `#${trainInfo.trainNumber} • ` : ''}{trainInfo.speedText}
                    </div>
                    {trainInfo.secondaryTrains && trainInfo.secondaryTrains.length > 0 && (
                      <div style={{
                        marginTop: '4px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '9.5px',
                        fontWeight: 700,
                        backgroundColor: '#FEF3C7',
                        color: '#92400E',
                        padding: '1px 5px',
                        borderRadius: '3px',
                        border: '1px solid #FCD34D'
                      }}>
                        <span>+{trainInfo.secondaryTrains.length} following:</span>
                        <span>#{trainInfo.secondaryTrains.map(t => t.trainNumber).join(', #')}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* CARD ACTION */}
                <div style={{ marginTop: '6px' }} onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => onSelectCrossing(crossing)}
                    className="btn btn-primary"
                    style={{ width: '100%', minHeight: '42px', fontSize: '13px', fontWeight: 700 }}
                  >
                    <span>Inspect Gate Details</span>
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TABLE VIEW (OPTION FOR DESKTOP) */}
      {viewMode === 'table' && (
        <div className="panel" style={{ overflow: 'hidden', marginBottom: '24px' }}>
          <table className="data-table">
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
                const badge = getStatusBadge(crossing);
                const trainInfo = getCrossingTrainDisplay(crossing, trains);

                return (
                  <tr key={crossing.id} onClick={() => onSelectCrossing(crossing)} style={{ cursor: 'pointer' }}>
                    <td>
                      <div>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '13.5px' }}>
                          {crossing.name}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-primary)', fontWeight: 600 }}>{crossing.id}</span>
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
                      <div style={{ fontSize: '12.5px', color: 'var(--text-primary)' }}>
                        {crossing.locality || 'Amritsar Roadway'}
                      </div>
                    </td>

                    <td>
                      <div style={{
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 700,
                        fontSize: '13px',
                        color: badge.color
                      }}>
                        {(() => {
                          const waitTarget = getAuthoritativeTargetEpoch(crossing, 'reopen', now);
                          const waitSec = waitTarget !== null ? calculateRemainingSeconds(waitTarget, now) : (crossing.remainingWaitSec || 0);
                          const closeTarget = getAuthoritativeTargetEpoch(crossing, 'closure', now);
                          const closeSec = closeTarget !== null ? calculateRemainingSeconds(closeTarget, now) : (crossing.timeToNextClosureSec || 0);
                          const { minutes: closeMin, seconds: closeRem } = formatCountdown(closeSec);
                          const { minutes: waitMin, seconds: waitRem } = formatCountdown(waitSec);

                          if (crossing.status === 'CLOSED' || crossing.status === 'CLOSURE_EXPECTED') {
                            return `CLOSED (${waitSec > 0 ? (waitSec > 60 ? `~${waitMin}m ${waitRem}s wait` : `~${waitSec}s wait`) : 'Traversing'})`;
                          }
                          if (crossing.countdownAvailable && closeSec > 0 && closeSec < 3600) {
                            return `~${closeMin}m ${closeRem}s`;
                          }
                          return 'Clear Passage';
                        })()}
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
