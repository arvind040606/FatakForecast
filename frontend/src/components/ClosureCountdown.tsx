import React from 'react';
import { Clock, AlertTriangle, CheckCircle, ShieldAlert } from 'lucide-react';
import { RailwayCrossing } from '../types';
import { useSharedTimer, getAuthoritativeTargetEpoch, calculateRemainingSeconds, formatCountdown } from '../utils/timerManager';

interface ClosureCountdownProps {
  crossing: RailwayCrossing;
}

export const ClosureCountdown: React.FC<ClosureCountdownProps> = ({ crossing }) => {
  // Synchronized tick from global shared timer scheduler
  const now = useSharedTimer();

  const isClosed = crossing.status === 'CLOSED' || crossing.status === 'CLOSURE_REPORTED';
  const isApproaching = crossing.status === 'APPROACHING' || crossing.status === 'CLOSURE_EXPECTED';
  const isPassageClear = crossing.status === 'OPEN' || (!isClosed && !isApproaching);
  const isUnknown = crossing.status === 'UNKNOWN' && !isPassageClear;

  // Compute live remaining durations using: remainingTime = targetTimestamp - currentTime
  let waitSec = 0;
  let closureSec = 0;
  let hasValidReopenTarget = false;
  let hasValidClosureTarget = false;

  if (isClosed) {
    const targetEpoch = getAuthoritativeTargetEpoch(crossing, 'reopen', now);
    if (targetEpoch !== null) {
      hasValidReopenTarget = true;
      waitSec = calculateRemainingSeconds(targetEpoch, now);
    } else if (typeof crossing.remainingWaitSec === 'number' && crossing.remainingWaitSec > 0) {
      waitSec = Math.max(0, crossing.remainingWaitSec);
    }
  } else {
    const targetEpoch = getAuthoritativeTargetEpoch(crossing, 'closure', now);
    if (targetEpoch !== null) {
      hasValidClosureTarget = true;
      closureSec = calculateRemainingSeconds(targetEpoch, now);
    } else if (crossing.countdownAvailable && typeof crossing.timeToNextClosureSec === 'number') {
      closureSec = Math.max(0, crossing.timeToNextClosureSec);
    }
  }

  const { minutes, seconds } = formatCountdown(closureSec);
  const { minutes: waitMinutes, seconds: waitSeconds } = formatCountdown(waitSec);
  const isImminent = closureSec > 0 && closureSec <= 180;
  const showActiveClosureCountdown = isApproaching || hasValidClosureTarget || (crossing.countdownAvailable && closureSec > 0);

  return (
    <div style={{
      backgroundColor: isClosed 
        ? 'var(--status-closed-bg)' 
        : isApproaching || isImminent
        ? 'var(--status-approaching-bg)' 
        : isUnknown
        ? '#FAF9F5'
        : 'var(--surface-green)',
      border: `1.5px solid ${
        isClosed 
          ? 'var(--status-closed-border)' 
          : isApproaching || isImminent
          ? 'var(--status-approaching-border)' 
          : isUnknown
          ? 'var(--border-subtle)'
          : 'var(--surface-green-border)'
      }`,
      borderRadius: 'var(--radius-md)',
      padding: '12px 14px 14px 14px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '12px',
      boxShadow: 'var(--shadow-sm)',
      position: 'relative',
      overflow: 'hidden',
      minHeight: '74px',
      flexShrink: 0,
      width: '100%',
      boxSizing: 'border-box',
      transition: 'background-color 0.4s ease, border-color 0.4s ease, box-shadow 0.4s ease'
    }}>
      {/* FLUID WATER-WAVE MOTION ACCENT BAR */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: '3.5px',
        background: isClosed
          ? 'linear-gradient(90deg, rgba(220, 38, 38, 0.25), rgba(239, 68, 68, 0.85), rgba(245, 158, 11, 0.75), rgba(220, 38, 38, 0.25))'
          : isApproaching || isImminent
          ? 'linear-gradient(90deg, rgba(217, 144, 32, 0.25), rgba(245, 158, 11, 0.85), rgba(251, 191, 36, 0.75), rgba(217, 144, 32, 0.25))'
          : isUnknown
          ? 'linear-gradient(90deg, rgba(150, 150, 150, 0.2), rgba(200, 200, 200, 0.6), rgba(150, 150, 150, 0.2))'
          : 'linear-gradient(90deg, rgba(23, 107, 77, 0.25), rgba(42, 140, 102, 0.85), rgba(74, 222, 128, 0.75), rgba(23, 107, 77, 0.25))',
        backgroundSize: '250% 100%',
        animation: 'waterWaveMotion 3.5s ease-in-out infinite',
        pointerEvents: 'none'
      }} />

      {/* LEFT COLUMN: STATUS ICON + TITLES */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        flex: '1 1 auto',
        minWidth: 0
      }}>
        <div style={{
          width: '36px',
          height: '36px',
          minWidth: '36px',
          borderRadius: '50%',
          backgroundColor: '#FFFFFF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 1px 3px rgba(36, 40, 36, 0.08)',
          flexShrink: 0
        }}>
          {isClosed ? (
            <ShieldAlert size={19} color="var(--critical-red)" />
          ) : isApproaching || isImminent ? (
            <AlertTriangle size={19} color="var(--warning-amber)" />
          ) : isUnknown ? (
            <Clock size={19} color="var(--text-muted)" />
          ) : (
            <CheckCircle size={19} color="var(--status-open)" />
          )}
        </div>

        <div style={{ minWidth: 0, flex: '1 1 auto' }}>
          <div style={{
            fontSize: '11.5px',
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: isClosed 
              ? 'var(--critical-red)' 
              : isApproaching || isImminent
              ? 'var(--warning-amber)' 
              : isUnknown
              ? 'var(--text-secondary)'
              : 'var(--status-open)',
            fontFamily: 'var(--font-brand)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}>
            {isClosed ? 'PREDICTED CLOSED' : isApproaching ? 'APPROACH WARNING' : isUnknown ? 'STATUS UNCONFIRMED' : 'CLEAR PASSAGE'}
          </div>
          <div style={{
            fontSize: '11.5px',
            color: 'var(--text-secondary)',
            marginTop: '1px',
            lineHeight: '1.25',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}>
            {isClosed 
              ? (crossing.statusReason || crossing.message || 'Boom barriers locked — road transit stopped') 
              : isApproaching
              ? 'Train approaching — barrier closing soon'
              : isUnknown
              ? 'No live train approaching detected in sector'
              : 'Clear passage for road transit'}
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN: TIMER / BADGE + DISTANCE */}
      <div style={{
        textAlign: 'right',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        justifyContent: 'center',
        minWidth: '80px'
      }}>
        {isClosed ? (
          <div>
            <div style={{
              fontSize: '12px',
              fontWeight: 800,
              color: 'var(--critical-red)',
              fontFamily: 'var(--font-mono)',
              padding: '2px 8px',
              borderRadius: 'var(--radius-full)',
              backgroundColor: '#FFFFFF',
              border: '1px solid var(--status-closed-border)',
              textAlign: 'center'
            }}>
              CLOSED
            </div>
            {waitSec > 0 ? (
              <div style={{
                fontSize: '11px',
                color: 'var(--warning-amber)',
                marginTop: '3px',
                fontFamily: 'var(--font-mono)',
                fontVariantNumeric: 'tabular-nums',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: '4px'
              }}>
                <span style={{
                  display: 'inline-block',
                  width: '5px',
                  height: '5px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--warning-amber)',
                  animation: 'timerColonPulse 1.4s ease-in-out infinite'
                }} />
                <span>Reopens in ~{waitSec > 60 ? `${waitMinutes}m ${waitSeconds}s` : `${waitSec}s`}</span>
              </div>
            ) : (
              <div style={{
                fontSize: '10.5px',
                color: 'var(--critical-red)',
                marginTop: '3px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 600
              }}>
                Traversing
              </div>
            )}
          </div>
        ) : (!showActiveClosureCountdown) ? (
          <div style={{
            fontSize: '12.5px',
            fontWeight: 800,
            color: 'var(--status-open)',
            fontFamily: 'var(--font-mono)',
            padding: '3px 9px',
            borderRadius: 'var(--radius-full)',
            backgroundColor: '#FFFFFF',
            border: '1px solid var(--surface-green-border)',
            textAlign: 'center'
          }}>
            OPEN
          </div>
        ) : (
          <div style={{
            fontSize: '20px',
            fontWeight: 800,
            color: isImminent ? 'var(--warning-amber)' : 'var(--accent-emphasis)',
            fontFamily: 'var(--font-mono)',
            fontVariantNumeric: 'tabular-nums',
            fontFeatureSettings: '"tnum"',
            display: 'flex',
            alignItems: 'center',
            gap: '2px',
            justifyContent: 'flex-end',
            lineHeight: '1.1'
          }}>
            <span style={{ display: 'inline-block', minWidth: '24px', textAlign: 'center' }}>
              {String(minutes).padStart(2, '0')}
            </span>
            <span style={{
              color: 'var(--text-muted)',
              animation: 'timerColonPulse 1.4s ease-in-out infinite',
              display: 'inline-block',
              padding: '0 1px'
            }}>
              :
            </span>
            <span style={{ display: 'inline-block', minWidth: '24px', textAlign: 'center' }}>
              {String(seconds).padStart(2, '0')}
            </span>
          </div>
        )}

        <div style={{
          fontSize: '10.5px',
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono)',
          marginTop: '3px',
          lineHeight: '1.2'
        }}>
          {crossing.distanceAlongTrackKm !== null && crossing.distanceAlongTrackKm !== undefined 
            ? `${crossing.distanceAlongTrackKm.toFixed(1)} km on track` 
            : 'Track Kinematics'}
        </div>
      </div>
    </div>
  );
};
