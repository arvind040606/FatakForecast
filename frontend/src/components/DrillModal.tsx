import React, { useState } from 'react';
import { X, Play, RefreshCw, AlertTriangle, ShieldAlert, CheckCircle2 } from 'lucide-react';
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

    const res = await railwayApi.triggerDrill(selectedId, action);
    setExecuting(false);

    if (action === 'CLOSE_NOW') {
      railwayApi.playAudioChime('CLOSED');
      setFeedbackMessage(`Boom gates locked on ${selectedId}. High-priority alert broadcasted.`);
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
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(6px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--accent-cyan-glow)',
        borderRadius: '10px',
        width: '480px',
        maxWidth: '100%',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8)',
        overflow: 'hidden'
      }}>
        {/* HEADER */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--bg-panel-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(12, 18, 34, 0.95)'
        }}>
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-white)' }}>
              Operational Drill Simulator
            </h3>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Test live crossing signals, countdowns & audio chimes
            </div>
          </div>

          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* BODY */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Select Amritsar Crossing
            </label>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              style={{
                width: '100%',
                marginTop: '6px',
                padding: '9px 12px',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--bg-panel-border)',
                borderRadius: '6px',
                color: 'var(--text-white)',
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
              backgroundColor: 'rgba(56, 189, 248, 0.1)',
              border: '1px solid var(--accent-cyan)',
              borderRadius: '6px',
              color: 'var(--accent-cyan-light)',
              fontSize: '12px'
            }}>
              {feedbackMessage}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Trigger Action
            </span>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
              <button
                disabled={executing}
                onClick={() => handleExecute('APPROACH_NOW')}
                className="btn-secondary"
                style={{
                  justifyContent: 'flex-start',
                  borderColor: 'var(--status-approaching-border)',
                  background: 'var(--status-approaching-bg)',
                  color: 'var(--status-approaching)'
                }}
              >
                <AlertTriangle size={16} />
                <span>Trigger Approach Warning (Train at 4.5km)</span>
              </button>

              <button
                disabled={executing}
                onClick={() => handleExecute('CLOSE_NOW')}
                className="btn-danger"
                style={{ justifyContent: 'flex-start' }}
              >
                <ShieldAlert size={16} />
                <span>Simulate Emergency Gate Closure (Lock Barriers)</span>
              </button>

              <button
                disabled={executing}
                onClick={() => handleExecute('OPEN_NOW')}
                className="btn-secondary"
                style={{
                  justifyContent: 'flex-start',
                  borderColor: 'var(--status-open-border)',
                  background: 'var(--status-open-bg)',
                  color: 'var(--status-open)'
                }}
              >
                <CheckCircle2 size={16} />
                <span>Clear Track & Reopen Gate (All Clear)</span>
              </button>
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div style={{
          padding: '12px 20px',
          borderTop: '1px solid var(--bg-panel-border)',
          display: 'flex',
          justifyContent: 'flex-end',
          background: 'rgba(12, 18, 34, 0.5)'
        }}>
          <button onClick={onClose} className="btn-secondary">
            Close Console
          </button>
        </div>
      </div>
    </div>
  );
};
