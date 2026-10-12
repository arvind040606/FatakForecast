import React, { useState } from 'react';
import { 
  BellRing, 
  Clock, 
  MapPin, 
  Compass, 
  X, 
  Check, 
  Volume2, 
  Calendar, 
  Sparkles,
  ShieldCheck,
  AlertTriangle
} from 'lucide-react';
import { SmartCommuteAlarm, AlarmRecurrence, TravelMode } from '../types';
import { nativeService } from '../services/nativeService';

interface SmartAlarmModalProps {
  isOpen: boolean;
  onClose: () => void;
  destinationName: string;
  destinationCoords: [number, number];
  originName: string;
  travelMode: TravelMode;
  onAlarmSaved: (alarm: SmartCommuteAlarm) => void;
  existingAlarm?: SmartCommuteAlarm | null;
}

export const SmartAlarmModal: React.FC<SmartAlarmModalProps> = ({
  isOpen,
  onClose,
  destinationName,
  destinationCoords,
  originName,
  travelMode,
  onAlarmSaved,
  existingAlarm
}) => {
  // Current time rounded to next 30 min as default
  const defaultTime = (() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 15);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  })();

  const [alarmName, setAlarmName] = useState<string>(existingAlarm ? existingAlarm.name : `Commute to ${destinationName.split(' (')[0]}`);
  const [targetTime, setTargetTime] = useState<string>(existingAlarm ? existingAlarm.targetTime : defaultTime);
  const [recurrence, setRecurrence] = useState<AlarmRecurrence>(existingAlarm ? existingAlarm.recurrence : 'WEEKDAYS');
  const [autoDetectLocation, setAutoDetectLocation] = useState<boolean>(existingAlarm ? existingAlarm.autoDetectLocation : true);
  const [soundAlarm, setSoundAlarm] = useState<boolean>(existingAlarm ? existingAlarm.soundAlarm : true);
  const [advanceNoticeMin, setAdvanceNoticeMin] = useState<number>(existingAlarm ? existingAlarm.advanceNoticeMin : 10);
  const [isTestingAudio, setIsTestingAudio] = useState<boolean>(false);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  // Sync if existingAlarm changes
  React.useEffect(() => {
    if (existingAlarm) {
      setAlarmName(existingAlarm.name);
      setTargetTime(existingAlarm.targetTime);
      setRecurrence(existingAlarm.recurrence);
      setAutoDetectLocation(existingAlarm.autoDetectLocation);
      setSoundAlarm(existingAlarm.soundAlarm);
      setAdvanceNoticeMin(existingAlarm.advanceNoticeMin);
    } else {
      setAlarmName(`Commute to ${destinationName.split(' (')[0]}`);
      setTargetTime(defaultTime);
    }
  }, [existingAlarm, destinationName]);

  if (!isOpen) return null;

  const handleTestAudio = () => {
    setIsTestingAudio(true);
    nativeService.playAlarmAudio('urgent');
    nativeService.triggerHaptic('warning');
    setTimeout(() => setIsTestingAudio(false), 1500);
  };

  const handleSave = async () => {
    const newAlarm: SmartCommuteAlarm = {
      id: existingAlarm ? existingAlarm.id : `alarm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: alarmName.trim() || `Commute to ${destinationName}`,
      enabled: existingAlarm ? existingAlarm.enabled : true,
      targetTime,
      recurrence,
      originId: autoDetectLocation ? 'CURRENT_GPS' : 'SELECTED_ORIGIN',
      originName: autoDetectLocation ? 'Current GPS Location (Auto-detected)' : originName,
      destinationId: 'TARGET_DEST',
      destinationName: existingAlarm ? existingAlarm.destinationName : destinationName,
      destinationCoords: existingAlarm ? existingAlarm.destinationCoords : destinationCoords,
      travelMode: existingAlarm ? existingAlarm.travelMode : travelMode,
      autoDetectLocation,
      soundAlarm,
      advanceNoticeMin,
      createdAt: existingAlarm ? existingAlarm.createdAt : new Date().toISOString()
    };

    await nativeService.saveSmartAlarm(newAlarm);
    await nativeService.scheduleNotification({
      title: `⏰ Smart Commute Alarm ${existingAlarm ? 'Updated' : 'Activated'}`,
      body: `Set for ${targetTime} (${recurrence === 'WEEKDAYS' ? 'Mon-Fri' : recurrence === 'WEEKENDS' ? 'Sat-Sun' : recurrence === 'DAILY' ? 'Daily' : 'Today'}). Auto-routing to ${destinationName} without fatak closure.`,
      category: 'departureReminders'
    });

    nativeService.triggerHaptic('success');
    setSavedSuccess(true);
    onAlarmSaved(newAlarm);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 1200);
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 2000,
      backgroundColor: 'rgba(10, 16, 26, 0.65)',
      backdropFilter: 'blur(5px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px'
    }}>
      <div 
        className="modal-content"
        style={{
          width: 'min(94vw, 480px)',
          backgroundColor: '#FFFFFF',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-xl)',
          border: '1px solid var(--border-soft)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh'
        }}
      >
        {/* MODAL HEADER */}
        <div style={{
          padding: '18px 22px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: 'var(--surface-green)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              backgroundColor: 'var(--accent-primary)',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <BellRing size={20} />
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-brand)', fontSize: '16px', fontWeight: 800, color: 'var(--accent-emphasis)' }}>
                Smart Commute Alarm
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                Fatak-aware departure guidance for your journey
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              padding: '6px',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              borderRadius: '50%'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* MODAL BODY */}
        <div style={{ padding: '20px 22px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* SUCCESS BANNER */}
          {savedSuccess && (
            <div style={{
              backgroundColor: 'var(--surface-green)',
              border: '1px solid var(--surface-green-border)',
              borderRadius: 'var(--radius-md)',
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              color: 'var(--status-open)'
            }}>
              <Check size={18} />
              <div style={{ fontSize: '12.5px', fontWeight: 700 }}>
                Alarm successfully set! FatakForecast will advise your optimal departure.
              </div>
            </div>
          )}

          {/* ROUTE PREVIEW PILL */}
          <div style={{
            backgroundColor: '#FAF9F5',
            border: '1px solid var(--border-soft)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 14px',
            fontSize: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase' }}>
              <Sparkles size={12} color="var(--accent-primary)" />
              <span>Smart Commute Destination</span>
            </div>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '14px', marginTop: '3px' }}>
              {destinationName}
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '11px', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Compass size={12} color="var(--accent-primary)" />
              <span>{autoDetectLocation ? 'Origin auto-detected via device GPS at alarm time' : `From ${originName}`}</span>
            </div>
          </div>

          {/* ALARM NAME */}
          <div>
            <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
              Alarm Name
            </label>
            <input 
              type="text"
              value={alarmName}
              onChange={(e) => setAlarmName(e.target.value)}
              placeholder="e.g. Daily Office Commute"
              style={{
                width: '100%',
                backgroundColor: '#FAF9F5',
                border: '1px solid var(--border-soft)',
                borderRadius: 'var(--radius-md)',
                padding: '9px 12px',
                fontSize: '13px',
                color: 'var(--text-primary)',
                outline: 'none',
                fontWeight: 600
              }}
            />
          </div>

          {/* TIME INPUT */}
          <div>
            <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
              Departure Time
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <input 
                type="time"
                value={targetTime}
                onChange={(e) => setTargetTime(e.target.value)}
                style={{
                  flex: 1,
                  backgroundColor: '#FAF9F5',
                  border: '1.5px solid var(--accent-primary)',
                  borderRadius: 'var(--radius-md)',
                  padding: '9px 12px',
                  fontSize: '18px',
                  fontWeight: 800,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--accent-emphasis)',
                  outline: 'none'
                }}
              />
              <button
                type="button"
                onClick={handleTestAudio}
                title="Test alarm sound"
                style={{
                  backgroundColor: isTestingAudio ? 'var(--accent-primary)' : '#FAF9F5',
                  color: isTestingAudio ? '#FFFFFF' : 'var(--accent-primary)',
                  border: '1px solid var(--border-soft)',
                  borderRadius: 'var(--radius-md)',
                  padding: '9px 14px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.15s ease'
                }}
              >
                <Volume2 size={16} />
                <span>{isTestingAudio ? 'Playing...' : 'Test Sound'}</span>
              </button>
            </div>
          </div>

          {/* SCHEDULE / RECURRENCE SELECTOR */}
          <div>
            <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
              Alarm Schedule
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setRecurrence('WEEKDAYS')}
                style={{
                  backgroundColor: recurrence === 'WEEKDAYS' ? 'var(--surface-green)' : '#FAF9F5',
                  border: `1.5px solid ${recurrence === 'WEEKDAYS' ? 'var(--accent-primary)' : 'var(--border-soft)'}`,
                  color: recurrence === 'WEEKDAYS' ? 'var(--accent-emphasis)' : 'var(--text-primary)',
                  borderRadius: 'var(--radius-md)',
                  padding: '9px 12px',
                  cursor: 'pointer',
                  textAlign: 'left'
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: 700 }}>Weekdays</div>
                <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>Monday to Friday</div>
              </button>

              <button
                type="button"
                onClick={() => setRecurrence('WEEKENDS')}
                style={{
                  backgroundColor: recurrence === 'WEEKENDS' ? 'var(--surface-green)' : '#FAF9F5',
                  border: `1.5px solid ${recurrence === 'WEEKENDS' ? 'var(--accent-primary)' : 'var(--border-soft)'}`,
                  color: recurrence === 'WEEKENDS' ? 'var(--accent-emphasis)' : 'var(--text-primary)',
                  borderRadius: 'var(--radius-md)',
                  padding: '9px 12px',
                  cursor: 'pointer',
                  textAlign: 'left'
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: 700 }}>Weekends</div>
                <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>Saturday &amp; Sunday</div>
              </button>

              <button
                type="button"
                onClick={() => setRecurrence('DAILY')}
                style={{
                  backgroundColor: recurrence === 'DAILY' ? 'var(--surface-green)' : '#FAF9F5',
                  border: `1.5px solid ${recurrence === 'DAILY' ? 'var(--accent-primary)' : 'var(--border-soft)'}`,
                  color: recurrence === 'DAILY' ? 'var(--accent-emphasis)' : 'var(--text-primary)',
                  borderRadius: 'var(--radius-md)',
                  padding: '9px 12px',
                  cursor: 'pointer',
                  textAlign: 'left'
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: 700 }}>Every Day</div>
                <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>All 7 days</div>
              </button>

              <button
                type="button"
                onClick={() => setRecurrence('ONCE')}
                style={{
                  backgroundColor: recurrence === 'ONCE' ? 'var(--surface-green)' : '#FAF9F5',
                  border: `1.5px solid ${recurrence === 'ONCE' ? 'var(--accent-primary)' : 'var(--border-soft)'}`,
                  color: recurrence === 'ONCE' ? 'var(--accent-emphasis)' : 'var(--text-primary)',
                  borderRadius: 'var(--radius-md)',
                  padding: '9px 12px',
                  cursor: 'pointer',
                  textAlign: 'left'
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: 700 }}>One-Time</div>
                <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>Today only</div>
              </button>
            </div>
          </div>

          {/* SMART TOGGLES */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingTop: '6px', borderTop: '1px solid var(--border-subtle)' }}>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', fontSize: '12.5px' }}>
              <div>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Auto-Detect Current Location</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Acquires real-time GPS location when alarm rings to route dynamically</div>
              </div>
              <input 
                type="checkbox"
                checked={autoDetectLocation}
                onChange={(e) => setAutoDetectLocation(e.target.checked)}
                style={{ width: '18px', height: '18px', accentColor: 'var(--accent-primary)' }}
              />
            </label>

            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', fontSize: '12.5px' }}>
              <div>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Sound Audible Alarm &amp; Vibrate</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Plays rising alert tones and device vibration</div>
              </div>
              <input 
                type="checkbox"
                checked={soundAlarm}
                onChange={(e) => setSoundAlarm(e.target.checked)}
                style={{ width: '18px', height: '18px', accentColor: 'var(--accent-primary)' }}
              />
            </label>
          </div>
        </div>

        {/* MODAL FOOTER */}
        <div style={{
          padding: '14px 22px',
          borderTop: '1px solid var(--border-subtle)',
          backgroundColor: '#FAF9F5',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '10px'
        }}>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary"
            style={{ padding: '8px 16px', fontSize: '12.5px' }}
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={savedSuccess}
            className="btn btn-primary"
            style={{ padding: '8px 20px', fontSize: '13px', fontWeight: 700 }}
          >
            {savedSuccess ? 'Alarm Activated!' : 'Save & Activate Alarm'}
          </button>
        </div>
      </div>
    </div>
  );
};
