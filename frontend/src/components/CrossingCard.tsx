import React, { memo } from 'react';
import { Train, Clock, ArrowRight, Star } from 'lucide-react';
import { RailwayCrossing, SectorTrain } from '../types';
import { getCrossingTimingDetails } from '../utils/trainHelpers';

export interface CrossingCardProps {
  crossing: RailwayCrossing;
  trains: SectorTrain[];
  now: number;
  userDistance?: string | null;
  isFavorite: boolean;
  onToggleFavorite: (crossingId: string, e: React.MouseEvent) => void;
  onSelect: (crossing: RailwayCrossing) => void;
}

/**
 * CrossingCard — Calm, stable, trustworthy crossing status card.
 * 
 * Features:
 * 1. Fixed vertical rhythm and minimum dimensions (prevents height jumping when train approaches/clears)
 * 2. Subtle, eased CSS color transitions (no harsh snapping borders)
 * 3. Tabular numeric styling on countdowns and times (no character jitter)
 * 4. React.memo with customized props equality (prevents unnecessary 36-card re-renders on 1-sec ticks)
 * 5. Calm presentation of clear, approaching, closed, and unavailable states
 */
const CrossingCardComponent: React.FC<CrossingCardProps> = ({
  crossing,
  trains,
  now,
  userDistance,
  isFavorite,
  onToggleFavorite,
  onSelect
}) => {
  const timing = getCrossingTimingDetails(crossing, now, trains);

  return (
    <div
      className="mobile-card"
      onClick={() => onSelect(crossing)}
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
        justifyContent: 'space-between',
        gap: '12px',
        minHeight: '248px',
        transition: 'border-left-color 0.25s ease, border-color 0.25s ease, background-color 0.25s ease, box-shadow 0.25s ease, transform 0.15s ease'
      }}
    >
      {/* 1. CARD HEADER */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ 
            fontFamily: 'var(--font-brand)', 
            fontWeight: 800, 
            fontSize: '16px', 
            color: 'var(--text-primary)', 
            lineHeight: 1.25,
            letterSpacing: '-0.01em'
          }}>
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <button
            onClick={(e) => onToggleFavorite(crossing.id, e)}
            title={isFavorite ? "Remove from favourites" : "Save as favourite fatak"}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              color: isFavorite ? '#f59e0b' : 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 'var(--radius-sm)',
              transition: 'color 0.15s ease'
            }}
          >
            <Star size={16} fill={isFavorite ? '#f59e0b' : 'none'} />
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
            gap: '5px',
            lineHeight: 1.3,
            transition: 'background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease'
          }}>
            <span style={{ 
              width: '6px', 
              height: '6px', 
              borderRadius: '50%', 
              backgroundColor: timing.statusBadge.dotColor,
              flexShrink: 0
            }} />
            {timing.statusBadge.label}
          </span>
        </div>
      </div>

      {/* 2. ESSENTIAL TRAIN STATUS & TIMING SUMMARY (Fixed vertical footprint) */}
      <div style={{
        backgroundColor: 'var(--surface-muted)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: '11px 13px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: '7px',
        minHeight: '128px',
        fontSize: '12.5px',
        transition: 'background-color 0.25s ease, border-color 0.25s ease'
      }}>
        {/* A. TRAIN STATUS BANNER */}
        {timing.hasApproachingTrain && !timing.isTimingUnavailable ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            padding: '7px 9px',
            backgroundColor: timing.isClosedNow ? 'rgba(239, 68, 68, 0.12)' : 'rgba(245, 158, 11, 0.12)',
            border: `1px solid ${timing.isClosedNow ? 'rgba(239, 68, 68, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
            borderRadius: 'var(--radius-sm)',
            transition: 'background-color 0.25s ease, border-color 0.25s ease'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '6px', 
                fontWeight: 700, 
                color: timing.isClosedNow ? 'var(--critical-red)' : 'var(--accent-primary)', 
                fontSize: '12px',
                minWidth: 0
              }}>
                <Train size={13} style={{ flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  #{timing.trainNumber || timing.activeTrain?.trainNumber || 'Active'} {timing.trainName || timing.activeTrain?.trainName || 'Train Approaching'}
                </span>
              </div>
              <span className="tabular-nums" style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontWeight: 600, flexShrink: 0 }}>
                {timing.trainSpeedText}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11.5px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>
                {timing.isClosedNow ? 'Reopening Status:' : 'Train Arrival ETA:'}
              </span>
              <span className="tabular-nums" style={{ fontWeight: 700, color: timing.isClosedNow ? 'var(--critical-red)' : 'var(--accent-primary)', fontFamily: 'var(--font-mono)' }}>
                {timing.trainArrivalEtaText}
              </span>
            </div>
            {typeof timing.trainDistanceKm === 'number' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
                <span>Track Distance:</span>
                <span className="tabular-nums" style={{ fontFamily: 'var(--font-mono)' }}>~{timing.trainDistanceKm.toFixed(1)} km away</span>
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
            borderRadius: 'var(--radius-sm)',
            transition: 'background-color 0.25s ease, border-color 0.25s ease'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: 'var(--accent-cyan)', fontSize: '12px', minWidth: 0 }}>
                <Train size={13} style={{ flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  #{timing.activeTrain.trainNumber} {timing.activeTrain.trainName}
                </span>
              </div>
              <span style={{
                fontSize: '10.5px',
                fontWeight: 700,
                padding: '1px 6px',
                borderRadius: 'var(--radius-full)',
                backgroundColor: timing.activeTrain.isStationary ? 'rgba(245, 158, 11, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                color: timing.activeTrain.isStationary ? '#f59e0b' : 'var(--accent-cyan)',
                flexShrink: 0
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
            flexDirection: 'column',
            gap: '4px',
            padding: '7px 9px',
            backgroundColor: 'rgba(16, 185, 129, 0.07)',
            border: '1px solid rgba(16, 185, 129, 0.22)',
            borderRadius: 'var(--radius-sm)',
            transition: 'background-color 0.25s ease, border-color 0.25s ease'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--status-open)', fontWeight: 700, fontSize: '12px' }}>
                <Train size={13} style={{ flexShrink: 0 }} />
                <span>Corridor Approach Clear</span>
              </div>
              <span style={{
                fontSize: '10.5px',
                fontWeight: 600,
                padding: '1px 6px',
                borderRadius: 'var(--radius-full)',
                backgroundColor: 'rgba(16, 185, 129, 0.14)',
                color: 'var(--status-open)'
              }}>
                CLEAR
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)' }}>
              <span>Track Traffic:</span>
              <span className="tabular-nums" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                0 trains within 15 km
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10.5px', color: 'var(--text-muted)' }}>
              <span>Corridor Line:</span>
              <span>{crossing.line || 'Amritsar Main Line'}</span>
            </div>
          </div>
        )}

        {/* B. ROADWAY & BARRIER STATE */}
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
                <span className="tabular-nums" style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--status-open)' }}>
                  {timing.reopeningTimeStr}{timing.reopenCountdownText ? ` (${timing.reopenCountdownText})` : ''}
                </span>
              </div>
            )}
          </>
        ) : timing.isClosingSoon ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '11.5px' }}>Expected closure:</span>
              <span className="tabular-nums" style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--critical-red)' }}>
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

        {/* C. ESTIMATED CLOSURE DURATION (Never shown when open) */}
        {!timing.isTimingUnavailable && !timing.isOpenPassage ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '11.5px' }}>Estimated closure:</span>
            <span className="tabular-nums" style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent-emphasis)' }}>
              {timing.closureDurationText}
              {timing.isMultiTrain && ` (${timing.trainCount} trains)`}
            </span>
          </div>
        ) : timing.isTimingUnavailable && !timing.activeTrain ? (
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.3' }}>
            Live track status is currently updating. Proceed with caution.
          </div>
        ) : !timing.hasApproachingTrain && timing.lastTrainPassedText ? (
          <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', borderTop: '1px dashed var(--border-subtle)', paddingTop: '3px' }}>
            {timing.lastTrainPassedText}
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
            <span>Traffic Flow:</span>
            <span style={{ color: 'var(--text-secondary)' }}>Normal vehicle transit</span>
          </div>
        )}
      </div>

      {/* 3. CARD FOOTER: Locality & View Details Button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {crossing.locality || 'Amritsar Roadway'}
        </div>
        <button
          onClick={() => onSelect(crossing)}
          className="btn btn-secondary"
          style={{
            padding: '6px 14px',
            fontSize: '11.5px',
            fontWeight: 700,
            gap: '5px',
            borderRadius: 'var(--radius-sm)',
            minHeight: '32px'
          }}
        >
          <span>View Details</span>
          <ArrowRight size={13} />
        </button>
      </div>
    </div>
  );
};

/**
 * Custom equality comparator for React.memo to eliminate redundant re-renders.
 * Re-render ONLY when:
 * 1. Crossing reference or critical timing fields change
 * 2. Trains array length or identity changes
 * 3. Favorite status changes
 * 4. User distance changes
 * 5. Minute timestamp rolls over (for minute-level countdowns) OR approaching/imminent train requires sub-minute updates
 */
function areCrossingCardPropsEqual(prev: CrossingCardProps, next: CrossingCardProps): boolean {
  if (prev.crossing !== next.crossing) return false;
  if (prev.isFavorite !== next.isFavorite) return false;
  if (prev.userDistance !== next.userDistance) return false;
  if (prev.trains !== next.trains) return false;

  // Check if crossing has an imminent countdown (closure or train arrival within 120s)
  const isImminent = (typeof prev.crossing.timeToNextClosureSec === 'number' && prev.crossing.timeToNextClosureSec > 0 && prev.crossing.timeToNextClosureSec <= 120) ||
                     (typeof prev.crossing.remainingWaitSec === 'number' && prev.crossing.remainingWaitSec > 0 && prev.crossing.remainingWaitSec <= 120);

  if (isImminent) {
    // If imminent, update on 1-second ticks
    return prev.now === next.now;
  }

  // Otherwise, only re-render if the minute epoch changed
  const prevMin = Math.floor(prev.now / 60000);
  const nextMin = Math.floor(next.now / 60000);
  return prevMin === nextMin;
}

export const CrossingCard = memo(CrossingCardComponent, areCrossingCardPropsEqual);
