import React, { useState } from 'react';
import { X, AlertTriangle, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { RailwayCrossing } from '../types';
import { railwayApi } from '../services/apiService';

interface DrillModalProps {
  isOpen: boolean;
  onClose: () => void;
  crossings: RailwayCrossing[];
  initialCrossing?: RailwayCrossing | null;
}

export const DrillModal: React.FC<DrillModalProps> = ({
  isOpen,
  onClose,
  crossings,
  initialCrossing
}) => {
  const [selectedId, setSelectedId] = useState<string>(
    initialCrossing ? initialCrossing.id : (crossings[0]?.id || 'LC-S25')
  );
  const [executing, setExecuting] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleExecute = async (action: 'CLOSE_NOW' | 'APPROACH_NOW' | 'OPEN_NOW') => {
    setExecuting(true);
    setFeedbackMessage(null);

    await railwayApi.triggerDrill(selectedId, action);
    setExecuting(false);

    if (action === 'CLOSE_NOW') {
      railwayApi.playAudioChime('CLOSED');
      setFeedbackMessage(`Barrier closure simulated on ${selectedId}. Red alert state broadcasted.`);
    } else if (action === 'APPROACH_NOW') {
      railwayApi.playAudioChime('APPROACH');
      setFeedbackMessage(`Approach circuit triggered on ${selectedId}. Warning annunciators active.`);
    } else {
      railwayApi.playAudioChime('OPEN');
      setFeedbackMessage(`Gates raised and interlocks cleared on ${selectedId}. Safe passage restored.`);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(18, 75, 56, 0.35)',
      backdropFilter: 'blur(6px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid var(--border-soft)',
        borderRadius: '14px',
        width: '460px',
        maxWidth: '100%',
        boxShadow: '0 20px 48px rgba(18, 75, 56, 0.18)',
        overflow: 'hidden'
      }}>
        {/* HEADER */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border-soft)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: '#FFFFFF'
        }}>
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-primary-dark)', margin: 0 }}>
              Operational Drill Simulator
            </h3>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Test live crossing signals, countdowns &amp; audio chimes
            </div>
          </div>

          <button
            onClick={onClose}
            className="btn btn-ghost"
            style={{ padding: '6px', color: 'var(--text-secondary)' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* BODY */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
              Target Amritsar Crossing
            </label>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px',
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border-soft)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                fontSize: '13px',
                outline: 'none',
                fontFamily: 'var(--font-main)'
              }}
            >
              {crossings.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.officialCode}) — Current: {c.status}
                </option>
              ))}
            </select>
          </div>

          {feedbackMessage && (
            <div style={{
              padding: '10px 14px',
              backgroundColor: 'var(--surface-green)',
              border: '1px solid var(--border-soft)',
              borderRadius: '8px',
              color: 'var(--color-primary-forest)',
              fontSize: '12px',
              fontWeight: 600
            }}>
              {feedbackMessage}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
              Trigger Scenario
            </span>

            <button
              disabled={executing}
              onClick={() => handleExecute('APPROACH_NOW')}
              className="btn"
              style={{
                justifyContent: 'flex-start',
                padding: '12px 14px',
                backgroundColor: 'var(--surface-orange)',
                border: '1px solid var(--border-soft)',
                color: 'var(--color-accent-tangerine)',
                fontWeight: 600,
                fontSize: '13px'
              }}
            >
              <AlertTriangle size={16} />
              <span>Trigger Approach Warning (Train at 4.5km)</span>
            </button>

            <button
              disabled={executing}
              onClick={() => handleExecute('CLOSE_NOW')}
              className="btn"
              style={{
                justifyContent: 'flex-start',
                padding: '12px 14px',
                backgroundColor: 'var(--surface-red)',
                border: '1px solid var(--border-soft)',
                color: 'var(--status-critical)',
                fontWeight: 600,
                fontSize: '13px'
              }}
            >
              <ShieldAlert size={16} />
              <span>Simulate Gate Closure (Lock Barriers)</span>
            </button>

            <button
              disabled={executing}
              onClick={() => handleExecute('OPEN_NOW')}
              className="btn"
              style={{
                justifyContent: 'flex-start',
                padding: '12px 14px',
                backgroundColor: 'var(--surface-green)',
                border: '1px solid var(--border-soft)',
                color: 'var(--color-primary-forest)',
                fontWeight: 600,
                fontSize: '13px'
              }}
            >
              <CheckCircle2 size={16} />
              <span>Clear Track &amp; Reopen Gate (All Clear)</span>
            </button>
          </div>
        </div>

        {/* FOOTER */}
        <div style={{
          padding: '12px 20px',
          borderTop: '1px solid var(--border-soft)',
          display: 'flex',
          justifyContent: 'flex-end',
          backgroundColor: '#FFFFFF'
        }}>
          <button onClick={onClose} className="btn btn-secondary" style={{ fontSize: '12px', padding: '6px 14px' }}>
            Close Console
          </button>
        </div>
      </div>
    </div>
  );
};
