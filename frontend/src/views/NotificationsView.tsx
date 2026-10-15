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
  ShieldAlert,
  Volume2,
  VolumeX,
  Play,
  Calendar,
  Compass,
  Zap,
  Timer,
  Train,
  Navigation,
  RotateCcw
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
  const [testSent, setTestSent] = useState<string | null>(null);
  const [testAudioPlaying, setTestAudioPlaying] = useState<boolean>(false);
  const [cooldownMsg, setCooldownMsg] = useState<string | null>(null);

  useEffect(() => {
    checkPermission();
    loadHistory();
    loadAlarms();

    const handleReceived = () => {
      loadHistory();
    };
    window.addEventListener('fatak:notification-received', handleReceived);
    return () => {
      window.removeEventListener('fatak:notification-received', handleReceived);
    };
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

  const handleUpdateThreshold = async <K extends keyof NotificationPreferences>(key: K, value: NotificationPreferences[K]) => {
    const updated = { ...preferences, [key]: value };
    setPreferences(updated);
    await nativeService.updateNotificationPreferences(updated);
    nativeService.triggerHaptic('light');
  };

  const handleResetCooldowns = () => {
    nativeService.clearNotificationCooldowns();
    setCooldownMsg('All notification cooldowns reset! Duplicate test alerts can now be sent immediately.');
    nativeService.triggerHaptic('success');
    setTimeout(() => setCooldownMsg(null), 3500);
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

  // Test 1: Immediate foreground notification delivery
  const handleTestForeground = async () => {
    setTestSent('foreground');
    const ok = await nativeService.scheduleNotification({
      title: '⚡ Foreground Alert: Jaura Phatak (C-28)',
      body: 'Verified: Foreground notification channel and audio/vibration pipeline are operational.',
      category: 'crossingStatusChanges',
      crossingId: 'c-28',
      crossingName: 'Jaura Phatak (C-28)',
      eventSignature: `test_fg_${Date.now()}`,
      actionUrl: '/crossings'
    });

    if (ok) {
      nativeService.triggerHaptic('warning');
      loadHistory();
    }
    setTimeout(() => setTestSent(null), 3000);
  };

  // Test 2: Scheduled local notification (5s future delivery)
  const handleTestScheduledBackground = async () => {
    setTestSent('scheduled');
    const scheduledDate = new Date(Date.now() + 5000);
    const ok = await nativeService.scheduleNotification({
      title: '⏰ Scheduled Alarm (5s): Commute Window',
      body: 'Background verification passed! Delivered via Android AlarmManager / Web scheduler.',
      category: 'departureReminders',
      scheduledDate,
      eventSignature: `test_sched_${Date.now()}`,
      actionUrl: '/planner'
    });

    if (ok) {
      nativeService.triggerHaptic('success');
      loadHistory();
    }
    setTimeout(() => setTestSent(null), 5500);
  };

  // Test 3: Simulated approaching crossing alert with crossing name & timing
  const handleTestApproachingAlert = async () => {
    setTestSent('approaching');
    nativeService.clearNotificationCooldowns();
    const ok = await nativeService.checkAndAlertApproachingCrossing({
      crossing: {
        id: 'c-28',
        name: 'Jaura Phatak (C-28)',
        status: 'APPROACHING',
        corridorName: 'Amritsar - Delhi Main Line',
        timeToNextClosureSec: 120,
        lat: 31.6322,
        lng: 74.8856
      } as any,
      train: {
        id: 'tr_12014',
        number: 12014,
        name: 'Amritsar Shatabdi Express'
      } as any
    });

    if (ok) {
      loadHistory();
      nativeService.triggerHaptic('warning');
    }
    setTimeout(() => setTestSent(null), 3000);
  };

  // Test 4: Simulated route delay change alert (+4m at crossing)
  const handleTestRouteAlert = async () => {
    setTestSent('route');
    nativeService.clearNotificationCooldowns();
    const ok = await nativeService.checkAndAlertRouteChange({
      routeLabel: 'Fastest Road Route via GT Road',
      crossingName: 'Shivala Crossing (C-25)',
      previousDelaySec: 60,
      newDelaySec: 300,
      currentTravelTimeSec: 1200
    });

    if (ok) {
      loadHistory();
      nativeService.triggerHaptic('warning');
    }
    setTimeout(() => setTestSent(null), 3000);
  };

  const handleClearHistory = async () => {
    await nativeService.clearNotificationHistory();
    setHistory([]);
    nativeService.triggerHaptic('medium');
  };

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 className="page-title">Notifications &amp; Alerts</h1>
          <p className="page-subtitle">
            Reliable local alerts for approaching crossings, closure windows &amp; route changes
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={handleResetCooldowns}
            className="btn btn-secondary"
            style={{ fontSize: '11px', padding: '6px 12px' }}
            title="Reset active duplicate cooldowns for rapid testing"
          >
            <RotateCcw size={12} />
            <span>Reset Cooldowns</span>
          </button>
        </div>
      </div>

      {/* COOLDOWN CLEARED BANNER */}
      {cooldownMsg && (
        <div style={{
          backgroundColor: '#E8F5E9',
          border: '1px solid #A5D6A7',
          color: '#1B5E20',
          borderRadius: 'var(--radius-md)',
          padding: '10px 14px',
          marginBottom: '16px',
          fontSize: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <CheckCircle size={15} />
          <span>{cooldownMsg}</span>
        </div>
      )}

      {/* PERMISSION STATUS CARD */}
      <div className="card" style={{ 
        padding: '16px', 
        marginBottom: '16px',
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
                {permissionStatus === 'granted' 
                  ? 'System Notifications Active' 
                  : permissionStatus === 'denied' 
                    ? 'Notification Permission Denied' 
                    : 'Notification Permission Needed'}
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                {permissionStatus === 'granted' 
                  ? 'FatakForecast delivers departure reminders and approaching fatak warnings locally without third-party cloud services.'
                  : permissionStatus === 'denied'
                    ? 'Notifications are blocked. To re-enable on Android: Device Settings > Apps > FatakForecast > Notifications > Allow.'
                    : 'Grant permission on-demand to enable local crossing warnings and scheduled departure reminders.'}
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
              <span>{permissionStatus === 'denied' ? 'Re-Check Permission' : 'Grant Permission'}</span>
            </button>
          )}
        </div>
      </div>


      {/* INTERACTIVE NOTIFICATION TESTING SUITE */}
      <div className="card" style={{ padding: '16px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Zap size={16} style={{ color: 'var(--accent-primary)' }} />
            <h3 style={{ fontSize: '14px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              Interactive Alert Verification Suite
            </h3>
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
            Test channels, scheduled timers &amp; tap routing
          </span>
        </div>

        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 12px 0' }}>
          Test each category and delivery mode directly on this device. Each test includes real crossing names, timings, and tap destinations.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '10px' }}>
          {/* Test 1: Immediate Foreground */}
          <button
            onClick={handleTestForeground}
            className="btn btn-secondary"
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'flex-start', 
              gap: '10px', 
              padding: '10px 12px',
              textAlign: 'left',
              fontSize: '12px',
              border: testSent === 'foreground' ? '1.5px solid var(--accent-primary)' : '1px solid var(--border-soft)'
            }}
          >
            <Send size={15} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Immediate Foreground</div>
              <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                {testSent === 'foreground' ? '✅ Dispatched to device' : 'Fires instant alert + haptic'}
              </div>
            </div>
          </button>

          {/* Test 2: Scheduled 5s Background */}
          <button
            onClick={handleTestScheduledBackground}
            className="btn btn-secondary"
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'flex-start', 
              gap: '10px', 
              padding: '10px 12px',
              textAlign: 'left',
              fontSize: '12px',
              border: testSent === 'scheduled' ? '1.5px solid var(--color-primary-forest)' : '1px solid var(--border-soft)'
            }}
          >
            <Timer size={15} style={{ color: 'var(--color-primary-forest)', flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Scheduled Alarm (5s)</div>
              <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                {testSent === 'scheduled' ? '⏳ Scheduled! Lock screen to test' : 'Lock screen / switch apps'}
              </div>
            </div>
          </button>

          {/* Test 3: Approaching Fatak Alert */}
          <button
            onClick={handleTestApproachingAlert}
            className="btn btn-secondary"
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'flex-start', 
              gap: '10px', 
              padding: '10px 12px',
              textAlign: 'left',
              fontSize: '12px',
              border: testSent === 'approaching' ? '1.5px solid var(--critical-red)' : '1px solid var(--border-soft)'
            }}
          >
            <Train size={15} style={{ color: 'var(--critical-red)', flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Approaching Fatak</div>
              <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                {testSent === 'approaching' ? '✅ Dispatched with ETA' : 'Jaura Phatak (C-28) ~2m ETA'}
              </div>
            </div>
          </button>

          {/* Test 4: Route Delay Change */}
          <button
            onClick={handleTestRouteAlert}
            className="btn btn-secondary"
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'flex-start', 
              gap: '10px', 
              padding: '10px 12px',
              textAlign: 'left',
              fontSize: '12px',
              border: testSent === 'route' ? '1.5px solid var(--warning-amber)' : '1px solid var(--border-soft)'
            }}
          >
            <Navigation size={15} style={{ color: 'var(--warning-amber)', flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Route Delay Update</div>
              <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                {testSent === 'route' ? '✅ Dispatched (+4m delay)' : '+4m delay at Shivala Crossing'}
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* CONFIGURABLE THRESHOLDS & COOLDOWNS */}
      <div className="card" style={{ padding: '16px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
          <Sliders size={16} style={{ color: 'var(--accent-primary)' }} />
          <h3 style={{ fontSize: '14px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
            Configurable Thresholds &amp; Cooldowns
          </h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
          {/* Threshold 1: Vicinity Proximity Radius */}
          <div style={{ padding: '10px 12px', background: 'var(--surface-warm)', borderRadius: '8px', border: '1px solid var(--border-soft)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Approaching Vicinity Radius
              </span>
              <span className="badge badge-blue" style={{ fontSize: '11px' }}>
                {(preferences.alertRadiusMeters / 1000).toFixed(1)} km
              </span>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '0 0 8px 0' }}>
              Only alert for approaching trains at crossings within this distance from your location.
            </p>
            <select
              value={preferences.alertRadiusMeters}
              onChange={(e) => handleUpdateThreshold('alertRadiusMeters', Number(e.target.value))}
              style={{
                width: '100%',
                padding: '6px 10px',
                fontSize: '12px',
                borderRadius: '6px',
                border: '1px solid var(--border-soft)',
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)'
              }}
            >
              <option value={1000}>1.0 km (Immediate Neighborhood)</option>
              <option value={2500}>2.5 km (Standard Commute Radius)</option>
              <option value={5000}>5.0 km (Broad Amritsar Sector)</option>
              <option value={10000}>10.0 km (District-wide)</option>
            </select>
          </div>

          {/* Threshold 2: Route Delay Delta */}
          <div style={{ padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-soft)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Route Delay Delta Alert Threshold
              </span>
              <span className="badge badge-amber" style={{ fontSize: '11px' }}>
                +{preferences.routeDelayThresholdMin} min
              </span>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '0 0 8px 0' }}>
              Notify only if live railway delay on your active route increases by at least this amount.
            </p>
            <select
              value={preferences.routeDelayThresholdMin}
              onChange={(e) => handleUpdateThreshold('routeDelayThresholdMin', Number(e.target.value))}
              style={{
                width: '100%',
                padding: '6px 10px',
                fontSize: '12px',
                borderRadius: '6px',
                border: '1px solid var(--border-soft)',
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)'
              }}
            >
              <option value={2}>+2 minutes (Sensitive)</option>
              <option value={3}>+3 minutes (Recommended)</option>
              <option value={5}>+5 minutes (Major Delays Only)</option>
            </select>
          </div>

          {/* Threshold 3: Predicted Closure Advance Notice */}
          <div style={{ padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-soft)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Predicted Closure Advance Notice
              </span>
              <span className="badge badge-green" style={{ fontSize: '11px' }}>
                {preferences.closureAdvanceNoticeMin} min
              </span>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '0 0 8px 0' }}>
              Advance warning window before a credible predicted crossing closure occurs.
            </p>
            <select
              value={preferences.closureAdvanceNoticeMin}
              onChange={(e) => handleUpdateThreshold('closureAdvanceNoticeMin', Number(e.target.value))}
              style={{
                width: '100%',
                padding: '6px 10px',
                fontSize: '12px',
                borderRadius: '6px',
                border: '1px solid var(--border-soft)',
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)'
              }}
            >
              <option value={3}>3 minutes before closure</option>
              <option value={5}>5 minutes before closure (Recommended)</option>
              <option value={10}>10 minutes before closure</option>
            </select>
          </div>

          {/* Threshold 4: Duplicate Alert Cooldown */}
          <div style={{ padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-soft)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Duplicate Cooldown Window
              </span>
              <span className="badge badge-gray" style={{ fontSize: '11px' }}>
                {preferences.cooldownMinutes} min
              </span>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '0 0 8px 0' }}>
              Prevents duplicate spam for the same crossing event until the cooldown window elapses.
            </p>
            <select
              value={preferences.cooldownMinutes}
              onChange={(e) => handleUpdateThreshold('cooldownMinutes', Number(e.target.value))}
              style={{
                width: '100%',
                padding: '6px 10px',
                fontSize: '12px',
                borderRadius: '6px',
                border: '1px solid var(--border-soft)',
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)'
              }}
            >
              <option value={5}>5 minutes cooldown</option>
              <option value={10}>10 minutes cooldown (Recommended)</option>
              <option value={15}>15 minutes cooldown</option>
              <option value={30}>30 minutes cooldown</option>
            </select>
          </div>
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
            backgroundColor: 'var(--bg-secondary)',
            borderRadius: 'var(--radius-md)',
            border: '1px dashed var(--border-soft)',
            color: 'var(--text-secondary)',
            fontSize: '12px'
          }}>
            No commute alarms configured. You can set smart departure alarms for any destination in the <strong>Journey Planner</strong>!
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {activeAlarms.map(alarm => (
              <div
                key={alarm.id}
                style={{
                  backgroundColor: alarm.enabled ? 'var(--bg-surface)' : 'var(--bg-secondary)',
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
            Alert Categories &amp; Delivery Channels
          </h3>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* 1. Upcoming Recommended Departure */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-soft)' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Upcoming Recommended Departures
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                Push departure alarms before barrier closure windows to ensure clear tracks
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
                Approaching Fataks &amp; Closure Windows
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                Alert when approaching trains arrive or credible predicted closure windows trigger
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
                Material Changes to Active Route &amp; ETA
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                Notify when delay on active journey increases by &ge; {preferences.routeDelayThresholdMin} minutes
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
                Connection &amp; Service Advisories
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                Warn when live railway feeds are interrupted and updates become estimated
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
            No recent notifications. Use the <strong>Interactive Alert Verification Suite</strong> above to test device alerts!
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

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span className="badge badge-green" style={{ fontSize: '9px', textTransform: 'uppercase' }}>
                    {item.category}
                  </span>

                  {item.crossingName && (
                    <span className="badge badge-blue" style={{ fontSize: '9px' }}>
                      {item.crossingName}
                    </span>
                  )}

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
