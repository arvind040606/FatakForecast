import React, { useState, useEffect } from 'react';
import { 
  MapPin, 
  Volume2, 
  VolumeX, 
  TrainTrack
} from 'lucide-react';
import { OperationalMetrics } from '../types';
import { railwayApi } from '../services/apiService';
import { nativeService } from '../services/nativeService';

import { useSharedTimer } from '../utils/timerManager';

interface NavbarProps {
  metrics: OperationalMetrics;
  lastUpdateTimestamp: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  metrics,
  lastUpdateTimestamp
}) => {
  const [audioActive, setAudioActive] = useState(railwayApi.isAudioEnabled());
  const now = useSharedTimer();
  const secondsAgo = lastUpdateTimestamp 
    ? Math.max(0, Math.floor((now - new Date(lastUpdateTimestamp).getTime()) / 1000)) 
    : 0;

  const toggleAudio = () => {
    const next = !audioActive;
    railwayApi.setAudioEnabled(next);
    setAudioActive(next);
    if (next) {
      railwayApi.playAudioChime('OPEN');
    }
    nativeService.triggerHaptic('light');
  };

  const isConnected = metrics.feedStatus === 'CONNECTED' || metrics.feedStatus === 'ONLINE_SYNCHRONIZED';

  return (
    <header style={{
      height: 'var(--header-height)',
      backgroundColor: '#FFFFFF',
      borderBottom: '1px solid var(--border-soft)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 20px',
      position: 'relative',
      zIndex: 40,
      flexShrink: 0,
      boxShadow: '0 1px 3px rgba(36, 40, 36, 0.03)'
    }}>
      {/* BRAND & TAGLINE */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{
          width: '34px',
          height: '34px',
          borderRadius: '9px',
          backgroundColor: 'var(--surface-green)',
          border: '1px solid var(--surface-green-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--accent-primary)',
          flexShrink: 0
        }}>
          <TrainTrack size={19} />
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ 
              fontFamily: 'var(--font-brand)',
              fontWeight: 800, 
              fontSize: '16px', 
              letterSpacing: '0.02em',
              color: 'var(--accent-emphasis)' 
            }}>
              FATAK<span style={{ color: 'var(--accent-tangerine)' }}>FORECAST</span>
            </span>
            <span className="hide-on-mobile" style={{
              fontSize: '12px',
              color: 'var(--text-secondary)',
              fontWeight: 500
            }}>
              — Know Before the Fatak Closes.
            </span>
          </div>
        </div>
      </div>

      {/* AMRITSAR SCOPE PILL (DESKTOP / TABLET ONLY) */}
      <div className="hide-on-mobile" style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '6px',
        backgroundColor: '#FAF9F5',
        padding: '5px 12px',
        borderRadius: '20px',
        border: '1px solid var(--border-subtle)'
      }}>
        <MapPin size={13} color="var(--accent-primary)" />
        <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
          Amritsar, Punjab
        </span>
        <span style={{ color: 'var(--text-dim)', fontSize: '10px' }}>•</span>
        <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
          NR Firozpur Div
        </span>
      </div>

      {/* TELEMETRY STATUS & CONTROLS */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* LIVE STATUS PILL */}
        <div 
          title={`Feed status: ${metrics.feedStatus}. Last updated ${secondsAgo}s ago.`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '11px',
            backgroundColor: isConnected 
              ? 'var(--surface-green)' 
              : 'var(--status-closed-bg)',
            border: `1px solid ${isConnected ? 'var(--surface-green-border)' : 'var(--status-closed-border)'}`,
            padding: '4px 10px',
            borderRadius: 'var(--radius-full)'
          }}
        >
          <span 
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              backgroundColor: isConnected ? 'var(--status-open)' : 'var(--status-closed)'
            }} 
          />
          <span className="hide-on-mobile" style={{ 
            fontWeight: 700, 
            color: isConnected ? 'var(--status-open)' : 'var(--status-closed)',
            fontSize: '11px'
          }}>
            {isConnected ? 'LIVE' : 'OFFLINE'}
          </span>
          <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '10px' }}>
            {metrics.feedLatencyMs != null ? `${metrics.feedLatencyMs}ms` : `${secondsAgo}s`}
          </span>
        </div>

        {/* AUDIO MUTE TOGGLE */}
        <button
          onClick={toggleAudio}
          className="btn btn-secondary"
          title={audioActive ? "Audio warning alerts active (tap to mute)" : "Audio warnings muted (tap to activate)"}
          style={{ 
            padding: '6px 10px',
            minHeight: '34px',
            borderRadius: '8px'
          }}
          aria-label={audioActive ? "Mute audio alarms" : "Unmute audio alarms"}
        >
          {audioActive ? <Volume2 size={15} color="var(--accent-primary)" /> : <VolumeX size={15} color="var(--text-muted)" />}
          <span className="hide-on-mobile" style={{ fontSize: '11.5px', fontWeight: 600 }}>
            {audioActive ? 'Audio ON' : 'Muted'}
          </span>
        </button>

      </div>
    </header>
  );
};
