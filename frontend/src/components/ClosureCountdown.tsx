import React, { useState, useEffect } from 'react';
import { Clock, AlertTriangle, CheckCircle, ShieldAlert } from 'lucide-react';
import { RailwayCrossing } from '../types';

interface ClosureCountdownProps {
  crossing: RailwayCrossing;
}

export const ClosureCountdown: React.FC<ClosureCountdownProps> = ({ crossing }) => {
  const [secondsRemaining, setSecondsRemaining] = useState(crossing.timeToNextClosureSec);

  useEffect(() => {
    setSecondsRemaining(crossing.timeToNextClosureSec);
  }, [crossing.timeToNextClosureSec]);

  useEffect(() => {
    if (crossing.status === 'CLOSED') return;
    const interval = setInterval(() => {
      setSecondsRemaining(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [crossing.status]);

  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const isImminent = secondsRemaining > 0 && secondsRemaining <= 180;
  const isClosed = crossing.status === 'CLOSED';
  const isApproaching = crossing.status === 'APPROACHING';

  return (
    <div style={{
      background: isClosed 
        ? 'rgba(239, 68, 68, 0.08)' 
        : isApproaching || isImminent
        ? 'rgba(245, 158, 11, 0.08)' 
        : 'rgba(16, 185, 129, 0.08)',
      border: `1px solid ${
        isClosed 
          ? 'var(--status-closed-border)' 
          : isApproaching || isImminent
          ? 'var(--status-approaching-border)' 
          : 'var(--status-open-border)'
      }`,
      borderRadius: '8px',
      padding: '12px 14px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '12px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{
          width: '36px',
          height: '36px',
          borderRadius: '50%',
          background: isClosed 
            ? 'rgba(239, 68, 68, 0.2)' 
            : isApproaching || isImminent
            ? 'rgba(245, 158, 11, 0.2)' 
            : 'rgba(16, 185, 129, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          {isClosed ? (
            <ShieldAlert size={18} color="var(--status-closed)" />
          ) : isApproaching || isImminent ? (
            <AlertTriangle size={18} color="var(--status-approaching)" />
          ) : (
            <CheckCircle size={18} color="var(--status-open)" />
          )}
        </div>

        <div>
          <div style={{
            fontSize: '11px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: isClosed 
              ? 'var(--status-closed)' 
              : isApproaching || isImminent
              ? 'var(--status-approaching)' 
              : 'var(--status-open)',
            fontFamily: 'var(--font-mono)'
          }}>
            {isClosed ? 'BOOM GATES LOCKED' : isImminent ? 'CLOSURE IMMINENT' : 'PREDICTED NEXT CLOSURE'}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {isClosed 
              ? 'Expected reopening in ~3-4 mins' 
              : `Next train approaching sector`}
          </div>
        </div>
      </div>

      <div style={{ textAlign: 'right' }}>
        {isClosed ? (
          <div style={{
            fontSize: '14px',
            fontWeight: 800,
            color: 'var(--status-closed)',
            fontFamily: 'var(--font-mono)',
            padding: '4px 8px',
            borderRadius: '4px',
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.3)'
          }}>
            CLOSED NOW
          </div>
        ) : (
          <div style={{
            fontSize: '20px',
            fontWeight: 800,
            color: isImminent ? 'var(--status-approaching)' : 'var(--text-white)',
            fontFamily: 'var(--font-mono)',
            display: 'flex',
            alignItems: 'center',
            gap: '2px',
            justifyContent: 'flex-end'
          }}>
            <span>{String(minutes).padStart(2, '0')}</span>
            <span style={{ color: 'var(--text-muted)' }}>:</span>
            <span>{String(seconds).padStart(2, '0')}</span>
          </div>
        )}
        <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
          Confidence: 96% (Block Relay)
        </div>
      </div>
    </div>
  );
};
