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
  RotateCcw
} from 'lucide-react';
import { TravelMode, ActiveRoute } from '../types';
import { nativeService } from '../services/nativeService';
import { railwayApi } from '../services/apiService';

interface SettingsViewProps {
  onNavigate: (route: ActiveRoute) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onNavigate }) => {
  const [travelMode, setTravelMode] = useState<TravelMode>('car');
  const [audioEnabled, setAudioEnabled] = useState<boolean>(false);
  
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
    setTravelMode(nativeService.getTravelMode());
    setAudioEnabled(railwayApi.isAudioEnabled());
    setBackendUrl(nativeService.getBackendUrl());

    // Check permissions
    nativeService.checkLocationPermission().then(setLocationPerm);
    nativeService.checkNotificationPermission().then(setNotifPerm);
  }, []);

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
    if (window.confirm('Delete all saved places, journey history, and local cached data? This action cannot be undone.')) {
      await nativeService.clearAllUserData();
      setDataCleared(true);
      nativeService.triggerHaptic('medium');
      setTimeout(() => setDataCleared(false), 4000);
    }
  };

  return (
    <div className="page-container" style={{ paddingBottom: '90px' }}>
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

      {/* 2. AUDIO ANNUNCIATORS */}
      <div className="card" style={{ padding: '16px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 4px 0', color: 'var(--color-primary-dark)' }}>
              Acoustic Barrier Annunciators
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
              Play synthesized audio chimes on crossing approach and barrier closure
            </p>
          </div>

          <button
            onClick={handleAudioToggle}
            className={`btn ${audioEnabled ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '12px', padding: '8px 14px' }}
          >
            {audioEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
            <span>{audioEnabled ? 'Audio On' : 'Muted'}</span>
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

      {/* 4. BACKEND SERVER URL CONFIGURATION */}
      <div className="card" style={{ padding: '16px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Server size={16} style={{ color: 'var(--color-primary-forest)' }} />
            <h3 style={{ fontSize: '14px', fontWeight: 700, margin: 0, color: 'var(--color-primary-dark)' }}>
              Backend Telemetry Server Gateway
            </h3>
          </div>

          <button
            type="button"
            onClick={handleResetBackendUrl}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              fontSize: '11px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <RotateCcw size={11} />
            <span>Reset Default</span>
          </button>
        </div>

        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 12px 0' }}>
          Configure server address for mobile app testing or production HTTPS host. API secrets remain securely on backend.
        </p>

        {/* Quick presets for multi-device testing */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
          <button
            type="button"
            onClick={() => setBackendUrl('http://10.59.115.230:8787')}
            style={{
              background: 'var(--surface-green)',
              border: '1px solid var(--border-soft)',
              borderRadius: '6px',
              padding: '4px 10px',
              fontSize: '11px',
              color: 'var(--color-primary-forest)',
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            Wi-Fi LAN IP (10.59.115.230:8787)
          </button>
          <button
            type="button"
            onClick={() => setBackendUrl('http://localhost:8787')}
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-soft)',
              borderRadius: '6px',
              padding: '4px 10px',
              fontSize: '11px',
              color: 'var(--text-secondary)',
              cursor: 'pointer'
            }}
          >
            PC Localhost (8787)
          </button>
        </div>

        <form onSubmit={handleSaveBackendUrl}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
            <input 
              type="text" 
              value={backendUrl}
              onChange={(e) => setBackendUrl(e.target.value)}
              placeholder="http://localhost:8787 or https://api.fatakforecast.in"
              required
              style={{
                flex: 1,
                background: 'var(--bg-card)',
                border: '1px solid var(--border-soft)',
                borderRadius: '8px',
                padding: '8px 12px',
                color: 'var(--text-primary)',
                fontSize: '13px',
                fontFamily: 'var(--font-mono)'
              }}
            />

            <button
              type="button"
              onClick={handleTestBackend}
              disabled={testingConnection}
              className="btn btn-secondary"
              style={{ fontSize: '12px', padding: '8px 14px' }}
            >
              <Activity size={13} className={testingConnection ? 'animate-spin' : ''} />
              <span>{testingConnection ? 'Testing...' : 'Test Connection'}</span>
            </button>
          </div>

          <div style={{
            fontSize: '11px',
            color: 'var(--text-secondary)',
            background: 'rgba(0, 0, 0, 0.03)',
            borderRadius: '6px',
            padding: '8px 10px',
            marginBottom: '10px',
            lineHeight: 1.5
          }}>
            <strong style={{ color: 'var(--text-primary)' }}>Multi-Device Tip:</strong> When using the app on a phone, tablet, or another PC, <code>localhost</code> points to that device itself. To connect to your running backend across your Wi-Fi network, use your host PC&apos;s IP (<code>http://10.59.115.230:8787</code>) or your public cloud backend URL.
          </div>

          {testResult && (
            <div style={{
              padding: '8px 12px',
              borderRadius: '6px',
              marginBottom: '10px',
              fontSize: '11px',
              background: testResult.success ? 'var(--surface-green)' : 'var(--surface-red)',
              color: testResult.success ? 'var(--color-primary-forest)' : 'var(--status-critical)',
              border: `1px solid ${testResult.success ? 'var(--border-soft)' : 'var(--status-critical)'}`
            }}>
              {testResult.success 
                ? `Connection successful! Response time: ${testResult.latencyMs}ms` 
                : `Connection failed: ${testResult.error || 'Server unreachable'}`}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            {saveUrlSuccess && (
              <span style={{ fontSize: '12px', color: 'var(--color-primary-forest)', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                <Check size={14} /> Saved &amp; Reconnecting
              </span>
            )}
            <button type="submit" className="btn btn-primary" style={{ fontSize: '12px', padding: '6px 16px' }}>
              Save Gateway URL
            </button>
          </div>
        </form>
      </div>

      {/* 5. DATA RESET */}
      <div className="card" style={{ padding: '16px', border: '1px solid var(--border-soft)' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 4px 0', color: 'var(--color-primary-dark)' }}>
          Data &amp; Privacy Management
        </h3>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 12px 0' }}>
          Clear all locally saved places, cached journey history, and navigation preferences.
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
