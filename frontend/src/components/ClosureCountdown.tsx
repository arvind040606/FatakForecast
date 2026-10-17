import React from 'react';
import { 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  ShieldAlert, 
  Train, 
  ArrowRight,
  ShieldCheck,
  Info
} from 'lucide-react';
import { RailwayCrossing } from '../types';
import { useSharedTimer, getAuthoritativeTargetEpoch, calculateRemainingSeconds, formatCountdown } from '../utils/timerManager';

interface ClosureCountdownProps {
  crossing: RailwayCrossing;
  showTimeline?: boolean;
}

function format12h(timeInput?: string | number | null): string | null {
  if (!timeInput) return null;
  try {
    const d = new Date(timeInput);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  } catch (e) {
    return null;
  }
}

export const ClosureCountdown: React.FC<ClosureCountdownProps> = ({ crossing, showTimeline = true }) => {
  // Synchronized tick from global shared timer scheduler
  const now = useSharedTimer();

  // Compute live remaining durations using: remainingTime = targetTimestamp - currentTime
  let waitSec = 0;
  let closureSec = 0;
  let hasValidReopenTarget = false;
  let hasValidClosureTarget = false;

  const closureTargetEpoch = getAuthoritativeTargetEpoch(crossing, 'closure', now);
  if (closureTargetEpoch !== null) {
    hasValidClosureTarget = true;
    closureSec = calculateRemainingSeconds(closureTargetEpoch, now);
  } else if (crossing.countdownAvailable && typeof crossing.timeToNextClosureSec === 'number') {
    closureSec = Math.max(0, crossing.timeToNextClosureSec);
  }

  const isExplicitlyClosed = crossing.status === 'CLOSED' || crossing.status === 'CLOSURE_REPORTED' || Boolean(crossing.activeDrill) || crossing.observedPhysicalGateState === 'CLOSED';
  const isClosureExpected = crossing.status === 'CLOSURE_EXPECTED';
  const isClosed = isExplicitlyClosed || (isClosureExpected && closureSec <= 0);
  const isApproaching = (!isClosed && (crossing.status === 'APPROACHING' || isClosureExpected));
  const isUnknown = crossing.status === 'UNKNOWN';
  const isPassageClear = !isUnknown && (crossing.status === 'OPEN' || (!isClosed && !isApproaching));

  if (isClosed) {
    const targetEpoch = getAuthoritativeTargetEpoch(crossing, 'reopen', now);
    if (targetEpoch !== null) {
      hasValidReopenTarget = true;
      waitSec = calculateRemainingSeconds(targetEpoch, now);
    } else if (typeof crossing.remainingWaitSec === 'number' && crossing.remainingWaitSec > 0) {
      waitSec = Math.max(0, crossing.remainingWaitSec);
    } else if (crossing.combinedClosure?.closureEnd || crossing.predictedReopenTime || crossing.estimatedGateReopeningTime) {
      const p = new Date(crossing.combinedClosure?.closureEnd || crossing.predictedReopenTime || crossing.estimatedGateReopeningTime!).getTime();
      if (!isNaN(p) && p > now) {
        waitSec = Math.max(0, Math.round((p - now) / 1000));
      }
    }
  }

  const { minutes, seconds } = formatCountdown(closureSec);
  const { minutes: waitMinutes, seconds: waitSeconds } = formatCountdown(waitSec);
  const isImminent = closureSec > 0 && closureSec <= 180;
  const showActiveClosureCountdown = isApproaching || hasValidClosureTarget || (crossing.countdownAvailable && closureSec > 0);

  // Confidence & Verification derivation
  const isVerifiedLive = crossing.gateStatusClassification === 'VERIFIED_LIVE' || 
                         crossing.hasLiveSpeedMeasurement === true || 
                         crossing.predictionConfidence === 'HIGH';
  const isEstimate = crossing.gateStatusClassification === 'ESTIMATED' || 
                     crossing.gateStatusClassification === 'SCHEDULED' || 
                     crossing.predictionConfidence === 'MODERATE';
  const isUnavailable = isUnknown || crossing.predictionConfidence === 'UNAVAILABLE' || crossing.gateStatusClassification === 'UNAVAILABLE';

  // Last data update time
  const lastUpdateIso = crossing.calculationTimestamp || 
                        crossing.providerObservationTimestamp || 
                        crossing.lastProviderSyncTimestamp || 
                        crossing.apiRetrievalTimestamp;
  const updateEpoch = lastUpdateIso ? new Date(lastUpdateIso).getTime() : 0;
  const secondsSinceUpdate = updateEpoch > 0 ? Math.max(0, Math.floor((now - updateEpoch) / 1000)) : null;
  const updateFormatted = format12h(lastUpdateIso);

  // Train information
  const upcomingTrain = (crossing as any).upcomingTrain || 
                        (crossing as any).primaryTrain || 
                        crossing.upcomingTrains?.[0] || 
                        null;

  // Timeline Step 1: Expected to Close
  let step1Title = 'Expected to Close';
  let step1Time: string = 'Timing unavailable';
  let step1Sub = 'Monitoring corridor';
  let step1State: 'passed' | 'active' | 'upcoming' | 'clear' = 'clear';

  if (isClosed) {
    step1Title = 'Closed';
    step1Time = format12h(crossing.currentClosureStartTime) || 'Gate Closed';
    step1Sub = 'Road transit stopped';
    step1State = 'passed';
  } else if (showActiveClosureCountdown && closureSec > 0) {
    step1Time = format12h(crossing.estimatedGateClosingTime) || 
      (closureSec ? format12h(new Date(now + closureSec * 1000).toISOString()) || `~${Math.round(closureSec / 60)}m` : 'Soon');
    step1Sub = closureSec > 60 ? `in ~${Math.round(closureSec / 60)} min` : 'in <1 min';
    step1State = 'active';
  } else if (isPassageClear) {
    step1Time = 'Open';
    step1Sub = 'No closure predicted';
    step1State = 'clear';
  }

  // Timeline Step 2: Expected Train Arrival
  let step2Title = 'Train Arrival';
  let step2Time: string = 'Timing unavailable';
  let step2Sub = 'No train in block';
  let step2State: 'passed' | 'active' | 'upcoming' | 'clear' = 'clear';

  if (upcomingTrain) {
    const trainArrivalEpoch = crossing.expectedTrainArrival ? new Date(crossing.expectedTrainArrival).getTime() : 0;
    const trainArrivalSec = trainArrivalEpoch > now ? Math.max(0, Math.floor((trainArrivalEpoch - now) / 1000)) : 0;
    const trainNum = upcomingTrain.trainNumber || upcomingTrain.number || '';
    const trainName = upcomingTrain.trainName || upcomingTrain.name || 'Train';

    if (isClosed && trainArrivalSec <= 0) {
      step2Time = 'Traversing';
      step2Sub = `#${trainNum} ${trainName} at crossing`;
      step2State = 'active';
    } else {
      step2Time = format12h(crossing.expectedTrainArrival) || (trainArrivalSec ? `in ~${Math.round(trainArrivalSec / 60)}m` : 'Imminent');
      step2Sub = isClosed ? `#${trainNum} ${trainName} (Barriers down)` : `#${trainNum} ${trainName}`.trim();
      step2State = isClosed ? 'active' : 'upcoming';
    }
  } else if (isClosed) {
    step2Time = 'Traversing';
    step2Sub = 'Train passing crossing';
    step2State = 'active';
  } else if (isPassageClear) {
    step2Time = 'Track Clear';
    step2Sub = 'Tracks clear';
    step2State = 'clear';
  }

  // Timeline Step 3: Expected to Reopen (Strictly displayed ONLY for confirmed CLOSED crossings)
  let step3Title = 'Reopening';
  let step3Time: string = 'Timing unavailable';
  let step3Sub = 'Clear for road transit';
  let step3State: 'passed' | 'active' | 'upcoming' | 'clear' = 'clear';

  if (isClosed) {
    step3Title = 'Expected to Reopen';
    const reopenIso = crossing.combinedClosure?.closureEnd || crossing.predictedReopenTime || crossing.estimatedGateReopeningTime;
    step3Time = format12h(reopenIso) || 
      (waitSec > 0 ? format12h(new Date(now + waitSec * 1000).toISOString()) || `in ~${Math.round(waitSec / 60)}m` : 'Reopening');
    step3Sub = waitSec > 60 ? `in ~${Math.round(waitSec / 60)} min` : (waitSec > 0 ? 'in <1 min' : 'Reopening imminent');
    step3State = 'upcoming';
  } else if (showActiveClosureCountdown) {
    step3Title = 'Reopening Estimate';
    step3Time = 'Calculated after closure';
    step3Sub = 'Estimated once train clears';
    step3State = 'upcoming';
  } else if (isPassageClear) {
    step3Title = 'Crossing Status';
    step3Time = 'Open Now';
    step3Sub = 'Clear for road transit';
    step3State = 'clear';
  } else {
    step3Title = 'Crossing Status';
    step3Time = 'Status Unconfirmed';
    step3Sub = 'Waiting for live update';
    step3State = 'clear';
  }

  // Traffic light colors
  const statusColor = isClosed 
    ? 'var(--critical-red)' 
    : isApproaching || isImminent 
    ? 'var(--warning-amber)' 
    : isUnknown 
    ? 'var(--text-muted)' 
    : 'var(--status-open)';

  const statusBg = isClosed 
    ? 'var(--status-closed-bg)' 
    : isApproaching || isImminent 
    ? 'var(--status-approaching-bg)' 
    : isUnknown 
    ? 'var(--bg-secondary)' 
    : 'rgba(16, 185, 129, 0.12)';

  const statusBorder = isClosed 
    ? 'var(--status-closed-border)' 
    : isApproaching || isImminent 
    ? 'var(--status-approaching-border)' 
    : isUnknown 
    ? 'var(--border-subtle)' 
    : 'var(--surface-green-border)';

  return (
    <div style={{
      backgroundColor: 'var(--bg-surface)',
      border: `1.5px solid ${statusBorder}`,
      borderRadius: 'var(--radius-lg)',
      padding: '14px 16px',
      boxShadow: 'var(--shadow-sm)',
      position: 'relative',
      overflow: 'hidden',
      width: '100%',
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      minHeight: 'fit-content',
      flexShrink: 0
    }}>
      {/* FLUID WATER-WAVE MOTION ACCENT BAR */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '3.5px',
        background: isClosed
          ? 'linear-gradient(90deg, rgba(220, 38, 38, 0.25), rgba(239, 68, 68, 0.9), rgba(245, 158, 11, 0.75), rgba(220, 38, 38, 0.25))'
          : isApproaching || isImminent
          ? 'linear-gradient(90deg, rgba(217, 144, 32, 0.25), rgba(245, 158, 11, 0.9), rgba(251, 191, 36, 0.75), rgba(217, 144, 32, 0.25))'
          : isUnknown
          ? 'linear-gradient(90deg, rgba(150, 150, 150, 0.2), rgba(200, 200, 200, 0.6), rgba(150, 150, 150, 0.2))'
          : 'linear-gradient(90deg, rgba(23, 107, 77, 0.25), rgba(42, 140, 102, 0.9), rgba(74, 222, 128, 0.75), rgba(23, 107, 77, 0.25))',
        backgroundSize: '250% 100%',
        animation: 'waterWaveMotion 3.5s ease-in-out infinite',
        pointerEvents: 'none'
      }} />

      {/* TOP BAR: STATUS BADGE + LIVE COUNTDOWN */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '10px'
      }}>
        {/* Left: Status Icon and Label */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '34px',
            height: '34px',
            borderRadius: '50%',
            backgroundColor: statusBg,
            border: `1px solid ${statusBorder}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            {isClosed ? (
              <ShieldAlert size={18} color="var(--critical-red)" />
            ) : isApproaching || isImminent ? (
              <AlertTriangle size={18} color="var(--warning-amber)" />
            ) : isUnknown ? (
              <Clock size={18} color="var(--text-muted)" />
            ) : (
              <CheckCircle2 size={18} color="var(--status-open)" />
            )}
          </div>

          <div>
            <div style={{
              fontSize: '12px',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: statusColor,
              fontFamily: 'var(--font-brand)'
            }}>
              {isClosed ? 'PREDICTED CLOSED' : isApproaching ? 'APPROACH WARNING' : isUnknown ? 'STATUS UNCONFIRMED' : 'CLEAR PASSAGE'}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '1px' }}>
              {isClosed 
                ? (crossing.statusReason || crossing.message || 'Boom barriers closed for train transit') 
                : isApproaching
                ? 'Train approaching crossing block'
                : isUnknown
                ? 'No live train approaching detected'
                : 'Corridor clear for road transit'}
            </div>
          </div>
        </div>

        {/* Right: Countdown or Open Badge */}
        <div style={{ textAlign: 'right' }}>
          {isClosed ? (
            <div>
              <div style={{
                fontSize: '11px',
                fontWeight: 800,
                color: 'var(--critical-red)',
                fontFamily: 'var(--font-mono)',
                padding: '2px 8px',
                borderRadius: 'var(--radius-full)',
                backgroundColor: 'var(--status-closed-bg)',
                border: '1px solid var(--status-closed-border)',
                display: 'inline-block'
              }}>
                CLOSED
              </div>
              {waitSec > 0 && (
                <div style={{
                  fontSize: '11px',
                  color: 'var(--warning-amber)',
                  marginTop: '3px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 600
                }}>
                  Reopens {waitSec > 60 ? `in ~${Math.round(waitSec / 60)} min` : 'in <1 min'}
                </div>
              )}
            </div>
          ) : showActiveClosureCountdown && closureSec > 0 ? (
            <div style={{
              fontSize: '18px',
              fontWeight: 800,
              color: isImminent ? 'var(--warning-amber)' : 'var(--accent-emphasis)',
              fontFamily: 'var(--font-mono)',
              fontVariantNumeric: 'tabular-nums',
              display: 'flex',
              alignItems: 'center',
              gap: '2px',
              justifyContent: 'flex-end',
              lineHeight: 1
            }}>
              <span>{String(minutes).padStart(2, '0')}</span>
              <span style={{ color: 'var(--text-muted)', margin: '0 1px' }}>:</span>
              <span>{String(seconds).padStart(2, '0')}</span>
            </div>
          ) : (
            <div style={{
              fontSize: '11px',
              fontWeight: 800,
              color: 'var(--status-open)',
              fontFamily: 'var(--font-mono)',
              padding: '2px 8px',
              borderRadius: 'var(--radius-full)',
              backgroundColor: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid var(--surface-green-border)',
              display: 'inline-block'
            }}>
              OPEN
            </div>
          )}
        </div>
      </div>

      {/* 3-STEP TIMELINE: Expected to close → Expected train arrival → Expected to reopen */}
      {showTimeline && (
        <div style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: '10px 12px',
          marginTop: '2px'
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(85px, 1fr) auto minmax(85px, 1fr) auto minmax(85px, 1fr)',
            alignItems: 'center',
            gap: '8px',
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
            paddingBottom: '2px'
          }}>
            {/* Step 1: Expected to Close */}
            <div style={{ textAlign: 'left', minWidth: 0 }}>
              <div style={{ fontSize: '9.5px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.02em' }}>
                {step1Title}
              </div>
              <div style={{
                fontSize: '12.5px',
                fontWeight: 700,
                color: step1State === 'active' || step1State === 'passed' ? 'var(--critical-red)' : 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                marginTop: '1px'
              }}>
                {step1Time}
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {step1Sub}
              </div>
            </div>

            {/* Arrow 1 */}
            <div style={{ color: 'var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ArrowRight size={13} color="var(--text-muted)" />
            </div>

            {/* Step 2: Train Arrival */}
            <div style={{ textAlign: 'center', minWidth: 0 }}>
              <div style={{ fontSize: '9.5px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.02em' }}>
                {step2Title}
              </div>
              <div style={{
                fontSize: '12.5px',
                fontWeight: 700,
                color: step2State === 'active' ? 'var(--warning-amber)' : 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                marginTop: '1px'
              }}>
                {step2Time}
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {step2Sub}
              </div>
            </div>

            {/* Arrow 2 */}
            <div style={{ color: 'var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ArrowRight size={13} color="var(--text-muted)" />
            </div>

            {/* Step 3: Expected to Reopen */}
            <div style={{ textAlign: 'right', minWidth: 0 }}>
              <div style={{ fontSize: '9.5px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.02em' }}>
                {step3Title}
              </div>
              <div style={{
                fontSize: '12.5px',
                fontWeight: 700,
                color: step3State === 'clear' ? 'var(--status-open)' : 'var(--accent-primary)',
                fontFamily: 'var(--font-mono)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                marginTop: '1px'
              }}>
                {step3Time}
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {step3Sub}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FOOTER METADATA: CONFIDENCE BADGE + LAST UPDATE TIME + EVIDENCE DISCLOSURE */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '6px',
        paddingTop: '6px',
        borderTop: '1px solid var(--border-subtle)',
        fontSize: '10.5px'
      }}>
        {/* Left: Confidence indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{
            display: 'inline-block',
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            backgroundColor: isVerifiedLive ? 'var(--status-open)' : isEstimate ? 'var(--warning-amber)' : 'var(--text-muted)'
          }} />
          <span style={{
            fontWeight: 700,
            color: isVerifiedLive ? 'var(--status-open)' : isEstimate ? 'var(--warning-amber)' : 'var(--text-muted)'
          }}>
            {isVerifiedLive ? 'Verified Live' : isEstimate ? 'Schedule Estimate' : 'Timing Unavailable'}
          </span>
        </div>

        {/* Right: Last Update */}
        <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '10px' }}>
          {secondsSinceUpdate !== null ? (
            <span>Updated {secondsSinceUpdate}s ago {updateFormatted && `(${updateFormatted})`}</span>
          ) : (
            <span>Live tracking active</span>
          )}
        </div>
      </div>
    </div>
  );
};
