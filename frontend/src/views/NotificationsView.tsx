import React, { useState, useEffect } from 'react';
import { 
  Bell, 
  BellRing, 
  ShieldCheck, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  Trash2, 
  Send, 
  Sliders, 
  Info,
  ShieldAlert,
  Volume2,
  VolumeX,
  Play,
  Calendar,
  Compass
} from 'lucide-react';
import { AppNotification, NotificationPreferences, ActiveRoute, SmartCommuteAlarm } from '../types';
import { nativeService } from '../services/nativeService';

interface NotificationsViewProps {
  onNavigate: (route: ActiveRoute) => void;
}

export const NotificationsView: React.FC<NotificationsViewProps> = ({ onNavigate }) => {
  const [permissionStatus, setPermissionStatus] = useState<'prompt' | 'granted' | 'denied'>('prompt');
  const [preferences, setPreferences] = useState<NotificationPreferences>(nativeService.getNotificationPreferences());
  const [history, setHistory] = useState<AppNotification[]>([]);
  const [activeAlarms, setActiveAlarms] = useState<SmartCommuteAlarm[]>([]);
  const [testSent, setTestSent] = useState<boolean>(false);
  const [testAudioPlaying, setTestAudioPlaying] = useState<boolean>(false);

  useEffect(() => {
    checkPermission();
    loadHistory();
    loadAlarms();
  }, []);

  const checkPermission = async () => {
    const status = await nativeService.checkNotificationPermission();
    setPermissionStatus(status);
  };

  const loadHistory = () => {
    setHistory(nativeService.getNotificationHistory());
  };

  const loadAlarms = () => {
    setActiveAlarms(nativeService.getSmartAlarms());
  };

  const handleRequestPermission = async () => {
    const granted = await nativeService.requestNotificationPermission();
    setPermissionStatus(granted ? 'granted' : 'denied');
    if (granted) {
      nativeService.triggerHaptic('success');
    }
  };

  const handleTogglePreference = async (key: keyof NotificationPreferences) => {
    const updated = { ...preferences, [key]: !preferences[key] };
    setPreferences(updated);
    await nativeService.updateNotificationPreferences(updated);
    nativeService.triggerHaptic('light');
  };

  const handleToggleAlarm = async (id: string, enabled: boolean) => {
    await nativeService.toggleSmartAlarm(id, enabled);
    loadAlarms();
    nativeService.triggerHaptic('light');
  };

  const handleDeleteAlarm = async (id: string) => {
    await nativeService.deleteSmartAlarm(id);
    loadAlarms();
    nativeService.triggerHaptic('medium');
  };

  const handleTestAlarmAudio = () => {
    setTestAudioPlaying(true);
    nativeService.playAlarmAudio('urgent');
    nativeService.triggerHaptic('warning');
    setTimeout(() => setTestAudioPlaying(false), 1800);
  };

  const handleSendTestNotification = async () => {
    const ok = await nativeService.scheduleNotification({
      title: '🔔 FatakForecast Departure Alert Test',
      body: 'Verified: Alert channel and push notification pipeline are active.',
      category: 'crossingStatusChanges'
    });

    if (ok) {
      setTestSent(true);
      nativeService.triggerHaptic('warning');
      loadHistory();
      setTimeout(() => setTestSent(false), 3000);
    }
  };

  const handleClearHistory = async () => {
    await nativeService.clearNotificationHistory();
    setHistory([]);
    nativeService.triggerHaptic('medium');
  };

  return (
    <div className="page-container" style={{ paddingBottom: '90px' }}>
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 className="page-title">Notifications &amp; Reminders</h1>
          <p className="page-subtitle">
            Configure mobile departure reminders and barrier closure warnings
          </p>
        </div>

        <button
          onClick={handleSendTestNotification}
          className="btn btn-secondary"
          style={{ fontSize: '12px' }}
        >
          <Send size={13} />
          <span>{testSent ? 'Sent to Device!' : 'Send Test Notification'}</span>
        </button>
      </div>

      {/* PERMISSION STATUS CARD */}
      <div className="card" style={{ 
        padding: '16px', 
        marginBottom: '20px',
        borderLeft: `4px solid ${permissionStatus === 'granted' ? 'var(--status-clear)' : 'var(--status-warning)'}`
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '8px',
              background: permissionStatus === 'granted' ? 'var(--surface-green)' : 'var(--surface-orange)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: permissionStatus === 'granted' ? 'var(--color-primary-forest)' : 'var(--color-accent-tangerine)'
            }}>
              {permissionStatus === 'granted' ? <ShieldCheck size={20} /> : <AlertTriangle size={20} />}
            </div>

            <div>
              <h3 style={{ fontSize: '14px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                {permissionStatus === 'granted' ? 'Mobile Notifications Enabled' : 'Notification Permission Needed'}
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                {permissionStatus === 'granted' 
                  ? 'FatakForecast can alert you before gates close even when your screen is locked.'
                  : 'Grant notification permissions so scheduled departure reminders can trigger.'}
              </p>
            </div>
          </div>

          {permissionStatus !== 'granted' && (
            <button 
              onClick={handleRequestPermission}
              className="btn btn-primary"
              style={{ fontSize: '12px', padding: '6px 14px' }}
            >
              <BellRing size={13} />
              <span>Grant Permission</span>
            </button>
          )}
        </div>
      </div>

      {/* HONEST BROWSER LIMITATIONS DISCLOSURE BANNER */}
      <div style={{
        backgroundColor: '#FFF8EB',
        border: '1px solid #F7D8A7',
        borderRadius: 'var(--radius-md)',
        padding: '12px 14px',
        marginBottom: '16px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px'
      }}>
        <Info size={17} style={{ color: 'var(--warning-amber)', flexShrink: 0, marginTop: '2px' }} />
        <div style={{ fontSize: '11.5px', color: 'var(--text-primary)', lineHeight: 1.45 }}>
          <strong>Android Background Execution Notice:</strong> Mobile browsers (Chrome, Edge, Samsung Internet) throttle timer execution when tabs are backgrounded or the screen is turned off to save battery. For guaranteed background alarms, add FatakForecast to your Android Home Screen as a Progressive Web App (PWA) via browser menu &gt; <em>&ldquo;Add to Home Screen&rdquo;</em>.
        </div>
      </div>

      {/* ACTIVE COMMUTE DEPARTURE ALARMS */}
      <div className="card" style={{ padding: '16px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Clock size={16} style={{ color: 'var(--accent-primary)' }} />
            <h3 style={{ fontSize: '14px', fontWeight: 700, margin: 0, color: 'var(--accent-emphasis)' }}>
              Active Commute Departure Alarms ({activeAlarms.length})
            </h3>
          </div>

          <button
            onClick={handleTestAlarmAudio}
            className="btn btn-secondary"
            style={{ fontSize: '11px', padding: '4px 9px', minHeight: '32px' }}
          >
            <Volume2 size={13} />
            <span>{testAudioPlaying ? 'Playing Tone...' : 'Test Audio Tone'}</span>
          </button>
        </div>

        {activeAlarms.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '20px 10px',
            backgroundColor: '#FAF9F5',
            borderRadius: 'var(--radius-md)',
            border: '1px dashed var(--border-soft)',
            color: 'var(--text-secondary)',
            fontSize: '12px'
          }}>
            No commute alarms configured. You can set smart departure alarms for any route directly inside the <strong>Journey Planner</strong> view!
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {activeAlarms.map(alarm => (
              <div
                key={alarm.id}
                style={{
                  backgroundColor: alarm.enabled ? '#FFFFFF' : '#F7F5EF',
                  border: `1.5px solid ${alarm.enabled ? 'var(--surface-green-border)' : 'var(--border-soft)'}`,
                  borderRadius: 'var(--radius-md)',
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px',
                  boxShadow: 'var(--shadow-sm)'
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      fontFamily: 'var(--font-brand)',
                      fontSize: '16px',
                      fontWeight: 800,
                      color: alarm.enabled ? 'var(--accent-primary)' : 'var(--text-muted)'
                    }}>
                      {alarm.targetTime}
                    </span>
                    <span style={{
                      fontSize: '9.5px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      padding: '2px 6px',
                      borderRadius: 'var(--radius-full)',
                      backgroundColor: alarm.enabled ? 'var(--surface-green)' : 'var(--surface-muted)',
                      color: alarm.enabled ? 'var(--accent-primary)' : 'var(--text-muted)'
                    }}>
                      {alarm.recurrence}
                    </span>
                  </div>

                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px' }}>
                    Depart for {alarm.destinationName}
                  </div>
                  <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>Mode: {alarm.travelMode}</span>
                    <span>•</span>
                    <span>{alarm.soundAlarm ? '🔊 Sound Alert' : 'Silent'}</span>
                    {alarm.autoDetectLocation && (
                      <>
                        <span>•</span>
                        <span>Auto-GPS</span>
                      </>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                  <input
                    type="checkbox"
                    checked={alarm.enabled}
                    onChange={(e) => handleToggleAlarm(alarm.id, e.target.checked)}
                    title={alarm.enabled ? 'Disable alarm' : 'Enable alarm'}
                    style={{ transform: 'scale(1.25)', accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
                  />
                  <button
                    onClick={() => handleDeleteAlarm(alarm.id)}
                    className="btn btn-ghost"
                    title="Cancel & Delete alarm"
                    style={{ padding: '4px', minHeight: '32px', color: 'var(--critical-red)' }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* NOTIFICATION CATEGORIES CONFIGURATION */}
      <div className="card" style={{ padding: '16px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
          <Sliders size={16} style={{ color: 'var(--color-primary-forest)' }} />
          <h3 style={{ fontSize: '14px', fontWeight: 700, margin: 0, color: 'var(--color-primary-dark)' }}>
            Notification Triggers &amp; Channels
          </h3>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* 1. Upcoming Recommended Departure */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-soft)' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Upcoming Recommended Departure
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                Alert 5 minutes before recommended departure window to avoid gate closure
              </div>
            </div>
            <input 
              type="checkbox"
              checked={preferences.departureReminders}
              onChange={() => handleTogglePreference('departureReminders')}
              style={{ transform: 'scale(1.3)', accentColor: 'var(--color-primary-forest)', cursor: 'pointer' }}
            />
          </div>

          {/* 2. Meaningful Shifts in Predicted Crossing Closure */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-soft)' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Crossing Closure State Changes
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                Push alerts when an upcoming crossing switches to Approaching or Closed
              </div>
            </div>
            <input 
              type="checkbox"
              checked={preferences.crossingStatusChanges}
              onChange={() => handleTogglePreference('crossingStatusChanges')}
              style={{ transform: 'scale(1.3)', accentColor: 'var(--color-primary-forest)', cursor: 'pointer' }}
            />
          </div>

          {/* 3. Significant Changes to Route or ETA */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-soft)' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Route Delay &amp; ETA Re-evaluations
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                Notify if delay on active route increases by more than 3 minutes
              </div>
            </div>
            <input 
              type="checkbox"
              checked={preferences.routeEtaChanges}
              onChange={() => handleTogglePreference('routeEtaChanges')}
              style={{ transform: 'scale(1.3)', accentColor: 'var(--color-primary-forest)', cursor: 'pointer' }}
            />
          </div>

          {/* 4. Crossing Warning During Active Journey */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-soft)' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Active En-Route Proximity Warnings
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                Immediate warning tone when approaching a closed barrier within 1 km
              </div>
            </div>
            <input 
              type="checkbox"
              checked={preferences.activeRouteWarnings}
              onChange={() => handleTogglePreference('activeRouteWarnings')}
              style={{ transform: 'scale(1.3)', accentColor: 'var(--color-primary-forest)', cursor: 'pointer' }}
            />
          </div>

          {/* 5. Provider Outages */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Connection &amp; Telemetry Advisories
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                Warn when live railway feeds are unavailable and recommendations become estimated
              </div>
            </div>
            <input 
              type="checkbox"
              checked={preferences.providerOutages}
              onChange={() => handleTogglePreference('providerOutages')}
              style={{ transform: 'scale(1.3)', accentColor: 'var(--color-primary-forest)', cursor: 'pointer' }}
            />
          </div>
        </div>
      </div>

      {/* NOTIFICATION LOG & RECENT ALERTS */}
      <div className="card" style={{ padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Clock size={16} style={{ color: 'var(--color-primary-forest)' }} />
            <h3 style={{ fontSize: '14px', fontWeight: 700, margin: 0, color: 'var(--color-primary-dark)' }}>
              Recent Notification Activity ({history.length})
            </h3>
          </div>

          {history.length > 0 && (
            <button 
              onClick={handleClearHistory}
              className="btn btn-ghost"
              style={{ fontSize: '11px', padding: '2px 8px' }}
            >
              <Trash2 size={12} />
              <span>Clear History</span>
            </button>
          )}
        </div>

        {history.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--text-secondary)', fontSize: '13px' }}>
            No recent notifications. Tap &quot;Send Test Notification&quot; above to test device alerts.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {history.map(item => (
              <div
                key={item.id}
                style={{
                  background: 'var(--surface-warm)',
                  border: '1px solid var(--border-soft)',
                  borderRadius: '8px',
                  padding: '12px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {item.title}
                  </span>
                  <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                    {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 6px 0' }}>
                  {item.body}
                </p>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="badge badge-green" style={{ fontSize: '9px', textTransform: 'uppercase' }}>
                    {item.category}
                  </span>

                  {item.scheduledFor && (
                    <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                      Scheduled: {new Date(item.scheduledFor).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
