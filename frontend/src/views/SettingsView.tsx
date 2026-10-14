import React, { useState, useEffect } from 'react';
import { 
  Settings as SettingsIcon, 
  Server, 
  MapPin, 
  Bell, 
  ShieldCheck, 
  Trash2, 
  Car, 
  Bike, 
  Footprints, 
  Volume2, 
  VolumeX, 
  Activity, 
  Wifi, 
  Info, 
  Check, 
  AlertTriangle,
  RotateCcw,
  Play,
  Moon,
  Sun,
  Smartphone,
  Train,
  BarChart3,
  ChevronRight
} from 'lucide-react';
import { TravelMode, ActiveRoute, ThemeMode } from '../types';
import { nativeService } from '../services/nativeService';
import { railwayApi } from '../services/apiService';

interface SettingsViewProps {
  onNavigate: (route: ActiveRoute) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onNavigate }) => {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => nativeService.getThemePreference());
  const [travelMode, setTravelMode] = useState<TravelMode>('car');
  const [audioEnabled, setAudioEnabled] = useState<boolean>(() => railwayApi.isAudioEnabled());
  
  // Permissions
  const [locationPerm, setLocationPerm] = useState<'prompt' | 'granted' | 'denied'>('prompt');
  const [notifPerm, setNotifPerm] = useState<'prompt' | 'granted' | 'denied'>('prompt');

  // Backend URL configuration
  const [backendUrl, setBackendUrl] = useState<string>('');
  const [testResult, setTestResult] = useState<{ success?: boolean; latencyMs?: number; error?: string } | null>(null);
  const [testingConnection, setTestingConnection] = useState<boolean>(false);
  const [saveUrlSuccess, setSaveUrlSuccess] = useState<boolean>(false);

  // Clear data confirmation
  const [dataCleared, setDataCleared] = useState<boolean>(false);

  useEffect(() => {
    setThemeMode(nativeService.getThemePreference());
    setTravelMode(nativeService.getTravelMode());
    setAudioEnabled(railwayApi.isAudioEnabled());
    setBackendUrl(nativeService.getBackendUrl());

    // Check permissions
    nativeService.checkLocationPermission().then(setLocationPerm);
    nativeService.checkNotificationPermission().then(setNotifPerm);

    // Sync theme if updated globally
    const handleThemeChangeEvt = (e: any) => {
      if (e.detail?.theme) {
        setThemeMode(e.detail.theme);
      }
    };
    const handleAudioChangeEvt = (e: any) => {
      if (typeof e.detail?.enabled === 'boolean') {
        setAudioEnabled(e.detail.enabled);
      }
    };
    window.addEventListener('fatak:theme-changed', handleThemeChangeEvt);
    window.addEventListener('fatak:audio-preference-changed', handleAudioChangeEvt);
    return () => {
      window.removeEventListener('fatak:theme-changed', handleThemeChangeEvt);
      window.removeEventListener('fatak:audio-preference-changed', handleAudioChangeEvt);
    };
  }, []);

  const handleThemeChange = async (mode: ThemeMode) => {
    setThemeMode(mode);
    await nativeService.setThemePreference(mode);
    nativeService.triggerHaptic('light');
  };

  const handleModeChange = async (mode: TravelMode) => {
    setTravelMode(mode);
    await nativeService.setTravelMode(mode);
    nativeService.triggerHaptic('light');
  };

  const handleAudioToggle = () => {
    const next = !audioEnabled;
    setAudioEnabled(next);
    railwayApi.setAudioEnabled(next);
    if (next) {
      railwayApi.playAudioChime('OPEN');
    }
    nativeService.triggerHaptic('light');
  };

  const handleTestBackend = async () => {
    setTestingConnection(true);
    setTestResult(null);
    const res = await nativeService.testBackendReachability(backendUrl);
    setTestResult(res);
    setTestingConnection(false);
    nativeService.triggerHaptic(res.success ? 'success' : 'warning');
  };

  const handleSaveBackendUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    await nativeService.setBackendUrl(backendUrl);
    railwayApi.initWebSocket();
    setSaveUrlSuccess(true);
    nativeService.triggerHaptic('success');
    setTimeout(() => setSaveUrlSuccess(false), 3000);
  };

  const handleResetBackendUrl = async () => {
    const defaultUrl = nativeService.getDefaultBackendUrl();
    setBackendUrl(defaultUrl);
    await nativeService.setBackendUrl(defaultUrl);
    railwayApi.initWebSocket();
    nativeService.triggerHaptic('light');
  };

  const handleRequestLocation = async () => {
    const granted = await nativeService.requestLocationPermission();
    setLocationPerm(granted ? 'granted' : 'denied');
    nativeService.triggerHaptic(granted ? 'success' : 'warning');
  };

  const handleRequestNotification = async () => {
    const granted = await nativeService.requestNotificationPermission();
    setNotifPerm(granted ? 'granted' : 'denied');
    nativeService.triggerHaptic(granted ? 'success' : 'warning');
  };

  const handleClearAllData = async () => {
    if (window.confirm('Delete all starred crossings, journey history, and local cached data? This action cannot be undone.')) {
      await nativeService.clearAllUserData();
      setDataCleared(true);
      nativeService.triggerHaptic('medium');
      setTimeout(() => setDataCleared(false), 4000);
    }
  };

  return (
    <div className="page-container" style={{ paddingBottom: 'calc(var(--bottom-nav-height, 56px) + env(safe-area-inset-bottom, 16px) + 40px)' }}>
      <div className="page-header">
        <h1 className="page-title">Application Settings</h1>
        <p className="page-subtitle">
          Configure mobility preferences, server connectivity, permissions, and security
        </p>
      </div>

      {dataCleared && (
        <div style={{
          background: 'var(--surface-green)',
          border: '1px solid var(--border-soft)',
          color: 'var(--color-primary-forest)',
          padding: '10px 16px',
          borderRadius: '8px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '12px',
          fontWeight: 600
        }}>
          <Check size={14} />
          <span>All saved places and journey history successfully cleared.</span>
        </div>
      )}

      {/* 0. THEME & APPEARANCE SELECTOR */}
      <div className="card" style={{ padding: '16px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 700, margin: 0, color: 'var(--color-primary-dark)' }}>
            Appearance &amp; Display Theme
          </h3>
          <span style={{ 
            fontSize: '11px', 
            fontWeight: 700, 
            color: 'var(--accent-primary)',
            backgroundColor: 'var(--surface-green)',
            padding: '2px 8px',
            borderRadius: 'var(--radius-full)',
            border: '1px solid var(--surface-green-border)'
          }}>
            {themeMode === 'system' ? 'System Auto' : (themeMode === 'dark' ? 'Dark Navy' : 'Warm Ivory')}
          </span>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 14px 0' }}>
          Switch between dark navy branding, the restored original warm ivory light theme, or automatic device matching
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
          {/* DARK MODE */}
          <button
            onClick={() => handleThemeChange('dark')}
            type="button"
            style={{
              background: themeMode === 'dark' ? 'var(--surface-green)' : 'var(--bg-secondary)',
              border: `2px solid ${themeMode === 'dark' ? 'var(--accent-primary)' : 'var(--border-soft)'}`,
              borderRadius: '10px',
              padding: '14px',
              textAlign: 'center',
              cursor: 'pointer',
              color: themeMode === 'dark' ? 'var(--accent-primary)' : 'var(--text-primary)',
              transition: 'all 0.15s ease',
              position: 'relative'
            }}
          >
            <Moon size={22} style={{ margin: '0 auto 6px auto', display: 'block' }} />
            <div style={{ fontSize: '13px', fontWeight: 700 }}>Dark Mode</div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>Dark Navy &amp; Cyan</div>
            {themeMode === 'dark' && (
              <div style={{
                position: 'absolute',
                top: '7px',
                right: '7px',
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                backgroundColor: 'var(--accent-primary)'
              }} />
            )}
          </button>

          {/* LIGHT MODE */}
          <button
            onClick={() => handleThemeChange('light')}
            type="button"
            style={{
              background: themeMode === 'light' ? 'var(--surface-green)' : 'var(--bg-secondary)',
              border: `2px solid ${themeMode === 'light' ? 'var(--accent-primary)' : 'var(--border-soft)'}`,
              borderRadius: '10px',
              padding: '14px',
              textAlign: 'center',
              cursor: 'pointer',
              color: themeMode === 'light' ? 'var(--accent-primary)' : 'var(--text-primary)',
              transition: 'all 0.15s ease',
              position: 'relative'
            }}
          >
            <Sun size={22} style={{ margin: '0 auto 6px auto', display: 'block' }} />
            <div style={{ fontSize: '13px', fontWeight: 700 }}>Light Mode</div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>Warm Ivory &amp; Green</div>
            {themeMode === 'light' && (
              <div style={{
                position: 'absolute',
                top: '7px',
                right: '7px',
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                backgroundColor: 'var(--accent-primary)'
              }} />
            )}
          </button>

          {/* SYSTEM MODE */}
          <button
            onClick={() => handleThemeChange('system')}
            type="button"
            style={{
              background: themeMode === 'system' ? 'var(--surface-green)' : 'var(--bg-secondary)',
              border: `2px solid ${themeMode === 'system' ? 'var(--accent-primary)' : 'var(--border-soft)'}`,
              borderRadius: '10px',
              padding: '14px',
              textAlign: 'center',
              cursor: 'pointer',
              color: themeMode === 'system' ? 'var(--accent-primary)' : 'var(--text-primary)',
              transition: 'all 0.15s ease',
              position: 'relative'
            }}
          >
            <Smartphone size={22} style={{ margin: '0 auto 6px auto', display: 'block' }} />
            <div style={{ fontSize: '13px', fontWeight: 700 }}>System Default</div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>Match Device OS</div>
            {themeMode === 'system' && (
              <div style={{
                position: 'absolute',
                top: '7px',
                right: '7px',
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                backgroundColor: 'var(--accent-primary)'
              }} />
            )}
          </button>
        </div>
      </div>

      {/* 1. TRAVEL MODE CONFIGURATION */}
      <div className="card" style={{ padding: '16px', marginBottom: '20px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 4px 0', color: 'var(--color-primary-dark)' }}>
          Default Commute Mode
        </h3>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 14px 0' }}>
          Calibrates baseline speed, route geometry, and crossing approach countdowns
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
          <button
            onClick={() => handleModeChange('car')}
            style={{
              background: travelMode === 'car' ? 'var(--surface-green)' : 'var(--bg-card)',
              border: `2px solid ${travelMode === 'car' ? 'var(--color-primary-forest)' : 'var(--border-soft)'}`,
              borderRadius: '10px',
              padding: '14px',
              textAlign: 'center',
              cursor: 'pointer',
              color: travelMode === 'car' ? 'var(--color-primary-forest)' : 'var(--text-primary)',
              transition: 'all 0.15s ease'
            }}
          >
            <Car size={22} style={{ margin: '0 auto 6px auto', display: 'block' }} />
            <div style={{ fontSize: '13px', fontWeight: 700 }}>Car / Auto</div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>Avg ~28 km/h</div>
          </button>

          <button
            onClick={() => handleModeChange('motorcycle')}
            style={{
              background: travelMode === 'motorcycle' ? 'var(--surface-green)' : 'var(--bg-card)',
              border: `2px solid ${travelMode === 'motorcycle' ? 'var(--color-primary-forest)' : 'var(--border-soft)'}`,
              borderRadius: '10px',
              padding: '14px',
              textAlign: 'center',
              cursor: 'pointer',
              color: travelMode === 'motorcycle' ? 'var(--color-primary-forest)' : 'var(--text-primary)',
              transition: 'all 0.15s ease'
            }}
          >
            <Bike size={22} style={{ margin: '0 auto 6px auto', display: 'block' }} />
            <div style={{ fontSize: '13px', fontWeight: 700 }}>Motorcycle</div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>Avg ~32 km/h</div>
          </button>

          <button
            onClick={() => handleModeChange('walking')}
            style={{
              background: travelMode === 'walking' ? 'var(--surface-green)' : 'var(--bg-card)',
              border: `2px solid ${travelMode === 'walking' ? 'var(--color-primary-forest)' : 'var(--border-soft)'}`,
              borderRadius: '10px',
              padding: '14px',
              textAlign: 'center',
              cursor: 'pointer',
              color: travelMode === 'walking' ? 'var(--color-primary-forest)' : 'var(--text-primary)',
              transition: 'all 0.15s ease'
            }}
          >
            <Footprints size={22} style={{ margin: '0 auto 6px auto', display: 'block' }} />
            <div style={{ fontSize: '13px', fontWeight: 700 }}>Walking</div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>Avg ~4.5 km/h</div>
          </button>
        </div>
      </div>

      {/* 2. SOUND ALERTS */}
      <div className="card" style={{ padding: '16px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h3 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 4px 0', color: 'var(--color-primary-dark)' }}>
              Sound & Barrier Alerts
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
              Audible warning chimes when approaching a fatak and during barrier closure warnings (Enabled by default)
            </p>
          </div>

          <button
            onClick={handleAudioToggle}
            className={`btn ${audioEnabled ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '12px', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            {audioEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
            <span>{audioEnabled ? 'Sound Enabled' : 'Sound Muted'}</span>
          </button>
        </div>
      </div>

      {/* 2.5. CINEMATIC STARTUP ANIMATION */}
      <div className="card" style={{ padding: '16px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h3 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 4px 0', color: 'var(--accent-emphasis)' }}>
              Cinematic Startup Animation
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
              Approaching locomotive, flashing crossing lights, lowering barrier, and brand reveal
            </p>
          </div>

          <button
            onClick={() => {
              nativeService.triggerHaptic('medium');
              window.dispatchEvent(new CustomEvent('fatak:replay-intro'));
            }}
            className="btn btn-primary"
            style={{ fontSize: '12px', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Play size={14} />
            <span>Replay Intro</span>
          </button>
        </div>
      </div>

      {/* 3. PERMISSIONS STATUS */}
      <div className="card" style={{ padding: '16px', marginBottom: '20px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 12px 0', color: 'var(--color-primary-dark)' }}>
          Device Permissions
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Location */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-soft)' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Precise Location (GPS)
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                Required for GPS origin positioning and distance to railway gates
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className={`badge ${locationPerm === 'granted' ? 'badge-green' : 'badge-amber'}`}>
                {locationPerm === 'granted' ? 'Granted' : 'Required'}
              </span>

              {locationPerm !== 'granted' && (
                <button 
                  onClick={handleRequestLocation}
                  className="btn btn-secondary"
                  style={{ fontSize: '11px', padding: '4px 10px' }}
                >
                  Request
                </button>
              )}
            </div>
          </div>

          {/* Notifications */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Push &amp; Local Notifications
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                Required for background departure alarms and urgent gate closure alerts
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className={`badge ${notifPerm === 'granted' ? 'badge-green' : 'badge-amber'}`}>
                {notifPerm === 'granted' ? 'Granted' : 'Required'}
              </span>

              {notifPerm !== 'granted' && (
                <button 
                  onClick={handleRequestNotification}
                  className="btn btn-secondary"
                  style={{ fontSize: '11px', padding: '4px 10px' }}
                >
                  Request
                </button>
              )}
            </div>
          </div>
        </div>
      </div>


      {/* 5. EXPLORE ALL PLATFORM SERVICES (MOBILE PARITY) */}
      <div className="card" style={{ padding: '16px', border: '1px solid var(--border-soft)', marginBottom: '16px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 4px 0', color: 'var(--color-primary-dark)' }}>
          Explore Platform Modules
        </h3>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 14px 0' }}>
          Direct access to all Amritsar railway corridors, delay analytics, and sensor feeds
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: '10px' }}>
          <button
            onClick={() => onNavigate('/trains')}
            className="btn btn-secondary"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 14px',
              textAlign: 'left',
              width: '100%',
              borderRadius: '8px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Train size={17} color="var(--accent-primary)" />
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Train Movements</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Live Sector Timetables & GPS</div>
              </div>
            </div>
            <ChevronRight size={16} color="var(--text-muted)" />
          </button>

          <button
            onClick={() => onNavigate('/notifications')}
            className="btn btn-secondary"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 14px',
              textAlign: 'left',
              width: '100%',
              borderRadius: '8px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Bell size={17} color="var(--accent-primary)" />
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Notifications</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Departure & Gate Alarms</div>
              </div>
            </div>
            <ChevronRight size={16} color="var(--text-muted)" />
          </button>

          <button
            onClick={() => onNavigate('/analytics')}
            className="btn btn-secondary"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 14px',
              textAlign: 'left',
              width: '100%',
              borderRadius: '8px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <BarChart3 size={17} color="var(--accent-primary)" />
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Forecast Analytics</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Historical Delay Trends</div>
              </div>
            </div>
            <ChevronRight size={16} color="var(--text-muted)" />
          </button>

          <button
            onClick={() => onNavigate('/data-health')}
            className="btn btn-secondary"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 14px',
              textAlign: 'left',
              width: '100%',
              borderRadius: '8px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Activity size={17} color="var(--accent-primary)" />
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Data Health</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>OSM Corridors & Diagnostics</div>
              </div>
            </div>
            <ChevronRight size={16} color="var(--text-muted)" />
          </button>
        </div>
      </div>

      {/* 6. DATA RESET */}
      <div className="card" style={{ padding: '16px', border: '1px solid var(--border-soft)' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 4px 0', color: 'var(--color-primary-dark)' }}>
          Data &amp; Privacy Management
        </h3>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 12px 0' }}>
          Clear all locally starred crossings, cached journey history, and navigation preferences.
        </p>

        <button
          onClick={handleClearAllData}
          className="btn btn-secondary"
          style={{
            fontSize: '12px',
            color: 'var(--status-critical)',
            borderColor: 'var(--status-critical)',
            padding: '8px 14px'
          }}
        >
          <Trash2 size={13} />
          <span>Clear All User Data &amp; History</span>
        </button>
      </div>
    </div>
  );
};
