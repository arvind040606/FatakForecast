import React, { useState, useEffect } from 'react';
import { 
  MapPin, 
  TrainTrack,
  Sun,
  Moon
} from 'lucide-react';
import { OperationalMetrics, UserLocationProfile, ConnectionStateDetails } from '../types';
import { railwayApi } from '../services/apiService';
import { nativeService } from '../services/nativeService';

import { useSharedTimer } from '../utils/timerManager';

interface NavbarProps {
  metrics: OperationalMetrics;
  lastUpdateTimestamp: string;
  userProfile?: UserLocationProfile | null;
  onChangeLocation?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  metrics,
  lastUpdateTimestamp,
  userProfile,
  onChangeLocation
}) => {
  const [effectiveTheme, setEffectiveTheme] = useState<'dark' | 'light'>(() => nativeService.getEffectiveTheme());
  const [connDetails, setConnDetails] = useState<ConnectionStateDetails>(() => railwayApi.getConnectionDetails());
  const now = useSharedTimer();
  const secondsAgo = lastUpdateTimestamp 
    ? Math.max(0, Math.floor((now - new Date(lastUpdateTimestamp).getTime()) / 1000)) 
    : 0;

  useEffect(() => {
    const handleThemeChange = (e: any) => {
      setEffectiveTheme(e.detail?.effectiveTheme || nativeService.getEffectiveTheme());
    };
    window.addEventListener('fatak:theme-changed', handleThemeChange);
    return () => window.removeEventListener('fatak:theme-changed', handleThemeChange);
  }, []);

  useEffect(() => {
    const unsub = railwayApi.onConnectionStateChange((details) => {
      setConnDetails(details);
    });
    return unsub;
  }, []);

  const toggleTheme = () => {
    const nextTheme = effectiveTheme === 'dark' ? 'light' : 'dark';
    nativeService.setThemePreference(nextTheme);
    nativeService.triggerHaptic('medium');
  };

  const getBadgeConfig = () => {
    switch (connDetails.state) {
      case 'LIVE':
        return {
          label: 'LIVE',
          bg: 'var(--status-open-bg)',
          border: 'var(--status-open-border)',
          color: 'var(--status-open)',
          dot: 'var(--status-open)',
          pulse: true,
          tooltip: `Live Indian Railways Telemetry (RailKit). Latency: ${connDetails.latencyMs ?? metrics.feedLatencyMs ?? 250}ms. Last synced ${secondsAgo}s ago.`
        };
      case 'STALE':
        return {
          label: 'STALE',
          bg: 'var(--status-approaching-bg)',
          border: 'var(--status-approaching-border)',
          color: 'var(--warning-amber)',
          dot: 'var(--warning-amber)',
          pulse: false,
          tooltip: `Backend connected. Live railway data last synced ${secondsAgo}s ago (>15m threshold). Gate predictions unconfirmed.`
        };
      case 'CONNECTING':
        return {
          label: 'CONNECTING',
          bg: 'rgba(56, 189, 248, 0.12)',
          border: 'rgba(56, 189, 248, 0.3)',
          color: 'var(--accent-cyan)',
          dot: 'var(--accent-cyan)',
          pulse: true,
          tooltip: 'Connecting to FatakForecast telemetry engine...'
        };
      case 'OFFLINE':
      default:
        return {
          label: 'OFFLINE',
          bg: 'var(--status-closed-bg)',
          border: 'var(--status-closed-border)',
          color: 'var(--critical-red)',
          dot: 'var(--critical-red)',
          pulse: false,
          tooltip: 'Offline: Cannot connect to FatakForecast backend. Retrying with exponential backoff...'
        };
    }
  };

  const badge = getBadgeConfig();

  return (
    <header style={{
      minHeight: 'var(--header-height)',
      backgroundColor: 'var(--bg-secondary)',
      borderBottom: '1px solid var(--border-panel)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingLeft: 'max(12px, env(safe-area-inset-left, 12px))',
      paddingRight: 'max(12px, env(safe-area-inset-right, 12px))',
      paddingTop: 'env(safe-area-inset-top, 0px)',
      position: 'relative',
      zIndex: 40,
      flexShrink: 0,
      boxShadow: '0 2px 10px rgba(0, 0, 0, 0.4)',
      boxSizing: 'border-box',
      width: '100%',
      maxWidth: '100vw',
      overflowX: 'hidden'
    }}>
      {/* BRAND & TAGLINE */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flexShrink: 0 }}>
        <div style={{
          width: '32px',
          height: '32px',
          borderRadius: '8px',
          backgroundColor: 'rgba(56, 189, 248, 0.12)',
          border: '1px solid rgba(56, 189, 248, 0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--accent-cyan)',
          flexShrink: 0
        }}>
          <TrainTrack size={18} />
        </div>

        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            <span style={{ 
              fontFamily: 'var(--font-brand)',
              fontWeight: 800, 
              fontSize: '15px', 
              letterSpacing: '0.03em',
              color: 'var(--text-primary)' 
            }}>
              FATAK<span style={{ color: 'var(--accent-primary)' }}>FORECAST</span>
            </span>
            <span className="hide-on-mobile" style={{
              fontSize: '11.5px',
              color: 'var(--text-secondary)',
              fontWeight: 500
            }}>
              — Know Before the Fatak Closes.
            </span>
          </div>
        </div>
      </div>

      {/* USER ACTIVE LOCATION PILL (RESPONSIVE) */}
      <button 
        onClick={onChangeLocation}
        type="button"
        title="Click to change your location or name"
        style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '5px',
          backgroundColor: 'var(--bg-surface)',
          padding: '4px 9px',
          borderRadius: '20px',
          border: '1px solid var(--border-subtle)',
          cursor: onChangeLocation ? 'pointer' : 'default',
          transition: 'background-color 0.15s ease, border-color 0.15s ease',
          outline: 'none',
          maxWidth: '135px',
          minWidth: 0,
          height: '30px',
          flexShrink: 0
        }}
      >
        <MapPin size={12} color="var(--accent-cyan)" style={{ flexShrink: 0 }} />
        <span style={{ 
          fontSize: '11px', 
          fontWeight: 600, 
          color: 'var(--text-primary)', 
          whiteSpace: 'nowrap', 
          overflow: 'hidden', 
          textOverflow: 'ellipsis' 
        }}>
          {userProfile?.userName ? `${userProfile.userName} • ` : ''}
          {userProfile?.locationName ? userProfile.locationName.split(' (')[0] : 'Amritsar'}
        </span>
        {userProfile?.isApproximate ? (
          <span style={{ fontSize: '8.5px', fontWeight: 700, padding: '1px 4px', borderRadius: '3px', backgroundColor: 'var(--surface-orange)', color: 'var(--warning-amber)', flexShrink: 0 }}>
            Approx
          </span>
        ) : (
          <span style={{ fontSize: '8.5px', fontWeight: 700, padding: '1px 4px', borderRadius: '3px', backgroundColor: 'var(--surface-green)', color: 'var(--status-open)', flexShrink: 0 }}>
            {userProfile?.source === 'GPS_HARDWARE' ? 'GPS' : 'Set'}
          </span>
        )}
      </button>

      {/* TELEMETRY STATUS & CONTROLS */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
        {/* 4-STATE TELEMETRY STATUS PILL */}
        <div 
          title={badge.tooltip}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            fontSize: '10.5px',
            backgroundColor: badge.bg,
            border: `1px solid ${badge.border}`,
            padding: '3px 8px',
            borderRadius: 'var(--radius-full)',
            cursor: 'help',
            height: '28px',
            boxSizing: 'border-box',
            flexShrink: 0
          }}
        >
          <span 
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: badge.dot,
              boxShadow: badge.pulse ? `0 0 6px ${badge.dot}` : 'none',
              flexShrink: 0
            }} 
          />
          <span className="hide-on-mobile" style={{ 
            fontWeight: 700, 
            color: badge.color,
            fontSize: '10.5px',
            whiteSpace: 'nowrap'
          }}>
            {badge.label}
          </span>
          <span style={{ 
            color: 'var(--text-muted)', 
            fontFamily: 'var(--font-mono)', 
            fontSize: '9.5px',
            fontVariantNumeric: 'tabular-nums',
            display: 'inline-block',
            minWidth: '38px',
            textAlign: 'right'
          }}>
            {connDetails.latencyMs != null ? `${connDetails.latencyMs}ms` : (connDetails.state === 'CONNECTING' ? '...' : `${secondsAgo}s`)}
          </span>
        </div>


        {/* QUICK THEME TOGGLE (SUN / MOON) */}
        <button
          onClick={toggleTheme}
          className="btn"
          title={effectiveTheme === 'dark' ? "Switch to Light Mode (Warm Ivory)" : "Switch to Dark Mode (Dark Navy)"}
          style={{ 
            padding: '5px 8px',
            minHeight: '30px',
            borderRadius: '6px',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            cursor: 'pointer'
          }}
          aria-label={effectiveTheme === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode"}
        >
          {effectiveTheme === 'dark' ? (
            <Sun size={14} color="#f59e0b" />
          ) : (
            <Moon size={14} color="var(--accent-primary)" />
          )}
          <span className="hide-on-mobile" style={{ fontSize: '11px', fontWeight: 600 }}>
            {effectiveTheme === 'dark' ? 'Light' : 'Dark'}
          </span>
        </button>

      </div>
    </header>
  );
};
