import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Train, 
  Clock, 
  MapPin, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Search, 
  Flag,
  ArrowRight,
  Radio,
  Building2
} from 'lucide-react';
import { SectorTrain, TrainScheduleStop } from '../types';
import { railwayApi } from '../services/apiService';
import { 
  bottomSheetVariants, 
  dialogVariants, 
  staggerListVariants, 
  staggerItemVariants 
} from '../utils/motion';

interface TrainScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  train: SectorTrain | null;
}

interface FormattedTimeResult {
  display: string;
  isTerminalText: boolean;
  dateTag?: string;
}

const formatTimeDisplay = (
  rawTime: string | null | undefined,
  isTerminal: boolean,
  terminalLabel: string
): FormattedTimeResult => {
  if (!rawTime || rawTime === '--:--' || rawTime === '-') {
    if (isTerminal) return { display: terminalLabel, isTerminalText: true };
    return { display: '--:--', isTerminalText: false };
  }
  const clean = String(rawTime).trim();
  const upper = clean.toUpperCase();
  if (upper === 'SRC') return { display: 'Origin', isTerminalText: true };
  if (upper === 'DEST' || upper === 'DSTN') return { display: 'Terminus', isTerminalText: true };

  // Match e.g. "09:20 12-Oct" or "09:20" or "09:20:00"
  const match = clean.match(/^(\d{1,2}:\d{2})(?::\d{2})?(?:\s+(.+))?$/);
  if (match) {
    return {
      display: match[1],
      isTerminalText: false,
      dateTag: match[2] ? match[2].trim() : undefined
    };
  }

  return { display: clean, isTerminalText: false };
};

export const TrainScheduleModal: React.FC<TrainScheduleModalProps> = ({
  isOpen,
  onClose,
  train
}) => {
  const [schedule, setSchedule] = useState<TrainScheduleStop[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [filterHaltsOnly, setFilterHaltsOnly] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isMobile, setIsMobile] = useState<boolean>(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (!isOpen || !train) {
      setSchedule([]);
      return;
    }

    if (train.schedule && train.schedule.length > 0) {
      setSchedule(train.schedule);
    } else {
      loadSchedule(train.number);
    }
  }, [isOpen, train]);

  const loadSchedule = async (trainNum: string) => {
    setLoading(true);
    try {
      const res = await railwayApi.getTrainSchedule(trainNum);
      if (res && Array.isArray(res.schedule)) {
        setSchedule(res.schedule);
      }
    } catch (e) {
      console.warn('Failed to load train schedule', e);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !train) return null;

  // Filter stops
  const filteredStops = schedule.filter(stop => {
    if (filterHaltsOnly && !stop.isHalt) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const codeMatch = stop.stationCode?.toLowerCase().includes(q);
      const nameMatch = stop.stationName?.toLowerCase().includes(q);
      return Boolean(codeMatch || nameMatch);
    }
    return true;
  });

  const totalHalts = schedule.filter(s => s.isHalt).length;

  return (
    <div 
      className="bottom-sheet-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="train-schedule-title"
    >
      <motion.div
        className="bottom-sheet-content"
        style={{
          width: '100%',
          maxWidth: isMobile ? '100%' : '840px',
          height: isMobile ? '92vh' : '86vh',
          backgroundColor: 'var(--bg-surface)'
        }}
        variants={isMobile ? bottomSheetVariants : dialogVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        onClick={(e) => e.stopPropagation()}
      >
        {/* MOBILE DRAG HANDLE */}
        {isMobile && <div className="bottom-sheet-handle-bar" />}

        {/* MODAL HEADER */}
        <div style={{
          padding: '16px 22px',
          borderBottom: '1px solid var(--border-soft)',
          backgroundColor: 'var(--bg-secondary)',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '12px',
          flexShrink: 0
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
              <div style={{
                width: '30px',
                height: '30px',
                borderRadius: '8px',
                backgroundColor: 'rgba(56, 189, 248, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-primary)',
                border: '1px solid var(--accent-primary)'
              }}>
                <Train size={17} />
              </div>
              <h2 id="train-schedule-title" style={{ 
                fontFamily: 'var(--font-brand)',
                fontSize: '18px', 
                fontWeight: 700, 
                color: 'var(--text-primary)', 
                margin: 0 
              }}>
                {train.name}
              </h2>
              <span style={{
                fontSize: '11px',
                fontWeight: 700,
                fontFamily: 'var(--font-mono)',
                background: 'rgba(56, 189, 248, 0.15)',
                color: 'var(--accent-primary)',
                border: '1px solid var(--accent-primary)',
                padding: '2px 8px',
                borderRadius: 'var(--radius-full)'
              }}>
                #{train.number}
              </span>
              <span className="status-pill" style={{
                fontSize: '10px',
                background: train.dataState === 'LIVE' ? 'var(--status-open-bg)' : 'var(--bg-surface)',
                color: train.dataState === 'LIVE' ? 'var(--status-open)' : 'var(--text-secondary)',
                border: `1px solid ${train.dataState === 'LIVE' ? 'var(--status-open-border)' : 'var(--border-subtle)'}`
              }}>
                {train.dataState === 'LIVE' ? 'VERIFIED TELEMETRY' : (train.dataState || 'TIMETABLE')}
              </span>
            </div>

            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{train.origin}</span>
              <ArrowRight size={13} color="var(--accent-tangerine)" />
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{train.destination}</span>
              <span style={{ color: 'var(--border-subtle)' }}>•</span>
              <span style={{ color: 'var(--text-secondary)' }}>{train.type}</span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="btn btn-ghost"
            style={{
              padding: '6px',
              borderRadius: '50%',
              minHeight: '36px',
              color: 'var(--text-secondary)'
            }}
            aria-label="Close schedule modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* TELEMETRY METRICS STRIP */}
        <div style={{
          padding: '10px 22px',
          backgroundColor: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-soft)',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          fontSize: '12.5px',
          flexShrink: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '18px', flexWrap: 'wrap' }}>
            <div>
              <span style={{ color: 'var(--text-muted)', fontSize: '11.5px' }}>Current Station: </span>
              <strong style={{ color: 'var(--accent-emphasis)', fontSize: '12.5px' }}>
                {train.currentStationName || train.lastReportedLocation || (train.isWithinAmritsarSector ? 'Amritsar Corridor Sector' : 'En Route')}
              </strong>
            </div>

            <div>
              <span style={{ color: 'var(--text-muted)', fontSize: '11.5px' }}>Status: </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent-primary)', fontSize: '12.5px' }}>
                {train.hasLiveSpeedMeasurement && typeof train.liveSpeedKmH === 'number'
                  ? `${train.liveSpeedKmH} km/h (Live GPS)`
                  : (train.speedKmH === 0 ? '0 km/h (Stationary)' : (typeof train.speedKmH === 'number' && train.speedKmH > 0 ? `${train.speedKmH} km/h` : 'Speed unavailable'))}
              </span>
            </div>

            <div>
              <span style={{ color: 'var(--text-muted)', fontSize: '11.5px' }}>Schedule Adherence: </span>
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                fontSize: '12.5px',
                color: (train.delayMinutes || 0) > 15 ? 'var(--status-approaching)' : 'var(--status-open)'
              }}>
                {(train.delayMinutes || 0) > 0 ? `+${train.delayMinutes}m delay` : 'On Time'}
              </span>
            </div>
          </div>

          <button
            onClick={() => loadSchedule(train.number)}
            disabled={loading}
            className="btn btn-ghost"
            style={{ padding: '4px 10px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '5px' }}
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            <span>{loading ? 'Updating...' : 'Update'}</span>
          </button>
        </div>

        {/* TIMETABLE SEARCH & CONTROLS */}
        <div style={{
          padding: '10px 22px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px',
          borderBottom: '1px solid var(--border-soft)',
          backgroundColor: 'var(--bg-secondary)',
          flexShrink: 0
        }}>
          {/* SEARCH INPUT */}
          <div style={{ position: 'relative', flex: 1, minWidth: '180px' }}>
            <Search size={15} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '10px' }} />
            <input
              type="text"
              placeholder="Search station name or station code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-soft)',
                borderRadius: 'var(--radius-md)',
                padding: '8px 12px 8px 34px',
                color: 'var(--text-primary)',
                fontSize: '12.5px',
                outline: 'none'
              }}
            />
          </div>

          {/* TOGGLE ALL / HALTS ONLY */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              onClick={() => setFilterHaltsOnly(false)}
              className={`btn ${!filterHaltsOnly ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '6px 12px', fontSize: '11.5px' }}
            >
              All Stops ({schedule.length})
            </button>
            <button
              onClick={() => setFilterHaltsOnly(true)}
              className={`btn ${filterHaltsOnly ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '6px 12px', fontSize: '11.5px' }}
            >
              Halts Only ({totalHalts})
            </button>
          </div>
        </div>

        {/* TIMELINE BODY */}
        <div className="journey-timeline-wrapper" style={{ flex: 1, backgroundColor: 'var(--bg-surface)' }}>
          {loading && schedule.length === 0 ? (
            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }} aria-busy="true">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 4px', marginBottom: '2px' }}>
                <div className="skeleton-box" style={{ width: '14px', height: '14px', borderRadius: '50%' }} />
                <div className="skeleton-box" style={{ width: '180px', height: '13px', borderRadius: '4px' }} />
              </div>
              {[1, 2, 3, 4].map(i => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    padding: '12px 14px',
                    backgroundColor: 'var(--bg-secondary)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-soft)'
                  }}
                >
                  <div className="skeleton-box" style={{ width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0 }} />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div className="skeleton-box" style={{ width: '140px', height: '16px', borderRadius: '4px' }} />
                      <div className="skeleton-box" style={{ width: '50px', height: '18px', borderRadius: 'var(--radius-full)' }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div className="skeleton-box" style={{ width: '80px', height: '12px', borderRadius: '3px' }} />
                      <div className="skeleton-box" style={{ width: '90px', height: '12px', borderRadius: '3px' }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : filteredStops.length === 0 ? (
            <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Building2 size={30} style={{ margin: '0 auto 10px', opacity: 0.4 }} />
              <div style={{ fontSize: '15px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                {schedule.length === 0 ? 'No Timetable Stops Published' : 'No Stations Match Filter'}
              </div>
              <div style={{ fontSize: '12.5px', marginTop: '4px', maxWidth: '380px', margin: '4px auto 0' }}>
                {schedule.length === 0
                  ? 'Train timetable is temporarily unavailable. Live train position continues to be tracked on the map.'
                  : 'Try clearing the search query to show all station stops along this route.'}
              </div>
            </div>
          ) : (
            <motion.div
              variants={staggerListVariants}
              initial="hidden"
              animate="visible"
            >
              {filteredStops.map((stop, idx) => {
                const isOrigin = idx === 0;
                const isDestination = idx === filteredStops.length - 1;
                const isCurrentStation = Boolean(
                  (train.currentStationName && train.currentStationName.includes(stop.stationCode)) ||
                  (train.lastReportedLocation && train.lastReportedLocation.includes(stop.stationCode)) ||
                  stop.status === 'at-station'
                );
                const isDeparted = stop.status === 'departed';

                const arrTime = formatTimeDisplay(stop.actualArrival || stop.scheduledArrival, isOrigin, 'Origin');
                const schArrTime = (stop.actualArrival && stop.scheduledArrival && stop.actualArrival !== stop.scheduledArrival)
                  ? formatTimeDisplay(stop.scheduledArrival, isOrigin, 'Origin')
                  : null;

                const depTime = formatTimeDisplay(stop.actualDeparture || stop.scheduledDeparture, isDestination, 'Terminus');
                const schDepTime = (stop.actualDeparture && stop.scheduledDeparture && stop.actualDeparture !== stop.scheduledDeparture)
                  ? formatTimeDisplay(stop.scheduledDeparture, isDestination, 'Terminus')
                  : null;

                return (
                  <motion.div
                    key={stop.sequence || `${stop.stationCode}-${idx}`}
                    variants={staggerItemVariants}
                    className={`journey-station-stop ${isDeparted ? 'passed' : ''} ${isCurrentStation ? 'current' : ''}`}
                  >
                    {/* STATION NODE ICON */}
                    <div className={`station-node-marker ${
                      isCurrentStation 
                        ? 'current' 
                        : (isOrigin ? 'origin' : (isDestination ? 'destination' : (isDeparted ? 'passed' : 'upcoming')))
                    }`}>
                      {isCurrentStation ? (
                        <Radio size={15} color="var(--accent-primary)" />
                      ) : isOrigin ? (
                        <MapPin size={15} color="var(--accent-primary)" />
                      ) : isDestination ? (
                        <Flag size={14} color="var(--accent-tangerine)" />
                      ) : isDeparted ? (
                        <CheckCircle2 size={15} color="var(--text-muted)" />
                      ) : (
                        <span style={{ fontSize: '11px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--accent-primary)' }}>
                          {stop.sequence}
                        </span>
                      )}
                    </div>

                    {/* STATION INFORMATION BLOCK */}
                    <div style={{
                      flex: 1,
                      backgroundColor: isCurrentStation ? 'var(--surface-green)' : 'var(--bg-secondary)',
                      border: `1px solid ${isCurrentStation ? 'var(--surface-green-border)' : 'var(--border-soft)'}`,
                      borderRadius: 'var(--radius-md)',
                      padding: '12px 16px',
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                      boxShadow: isCurrentStation ? 'var(--shadow-md)' : 'var(--shadow-sm)'
                    }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '14.5px', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {stop.stationName}
                          </span>
                          <span style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '11px',
                            fontWeight: 700,
                            color: 'var(--accent-primary)',
                            background: 'var(--surface-green)',
                            border: '1px solid var(--surface-green-border)',
                            padding: '1px 6px',
                            borderRadius: '4px'
                          }}>
                            {stop.stationCode}
                          </span>
                          {isCurrentStation && (
                            <span className="status-pill open" style={{ fontSize: '10px' }}>
                              LIVE STATION
                            </span>
                          )}
                          {!stop.isHalt && (
                            <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', background: 'var(--bg-secondary)', padding: '1px 5px', borderRadius: '4px' }}>
                              Pass
                            </span>
                          )}
                        </div>

                        <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '4px', display: 'flex', gap: '10px' }}>
                          {stop.platform && <span>Platform {stop.platform}</span>}
                          {stop.distance !== undefined && stop.distance !== null && (
                            <span>{stop.distance} km from origin</span>
                          )}
                        </div>
                      </div>

                      {/* TIME DISPLAY (SCHEDULED vs ACTUAL) */}
                      <div style={{ textAlign: isMobile ? 'left' : 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '12.5px' }}>
                          {/* ARRIVAL */}
                          <div>
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Arr</div>
                            <div style={{
                              fontFamily: arrTime.isTerminalText ? 'var(--font-sans)' : 'var(--font-mono)',
                              fontWeight: 700,
                              color: arrTime.isTerminalText ? 'var(--accent-primary)' : 'var(--text-primary)',
                              fontSize: arrTime.isTerminalText ? '12px' : '13px'
                            }}>
                              {arrTime.display}
                            </div>
                            {schArrTime && schArrTime.display !== arrTime.display && (
                              <div style={{ fontSize: '10px', color: 'var(--text-dim)', textDecoration: 'line-through', fontFamily: 'var(--font-mono)' }}>
                                {schArrTime.display}
                              </div>
                            )}
                          </div>

                          {/* DEPARTURE */}
                          <div>
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Dep</div>
                            <div style={{
                              fontFamily: depTime.isTerminalText ? 'var(--font-sans)' : 'var(--font-mono)',
                              fontWeight: 700,
                              color: depTime.isTerminalText ? 'var(--accent-primary)' : 'var(--text-primary)',
                              fontSize: depTime.isTerminalText ? '12px' : '13px'
                            }}>
                              {depTime.display}
                            </div>
                            {schDepTime && schDepTime.display !== depTime.display && (
                              <div style={{ fontSize: '10px', color: 'var(--text-dim)', textDecoration: 'line-through', fontFamily: 'var(--font-mono)' }}>
                                {schDepTime.display}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* DELAY PILL */}
                        {typeof stop.delayArrival === 'number' && (
                          <div style={{
                            marginTop: '3px',
                            fontSize: '10.5px',
                            fontWeight: 700,
                            fontFamily: 'var(--font-mono)',
                            color: stop.delayArrival > 0 ? 'var(--status-approaching)' : 'var(--status-open)'
                          }}>
                            {stop.delayArrival > 0 ? `+${stop.delayArrival}m delay` : 'On Time'}
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
};
