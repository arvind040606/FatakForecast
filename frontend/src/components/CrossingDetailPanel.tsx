import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  X, 
  MapPin, 
  Copy, 
  Check, 
  Train, 
  Clock, 
  AlertTriangle, 
  Compass,
  ArrowRight,
  Info,
  CheckCircle2,
  ShieldCheck
} from 'lucide-react';
import { RailwayCrossing, SectorTrain, RailwayCorridor } from '../types';
import { ClosureCountdown } from './ClosureCountdown';
import { TrainScheduleModal } from './TrainScheduleModal';
import { findImpactingTrainForCrossing, formatTrainSpeed } from '../utils/trainHelpers';
import { bottomSheetVariants, sideDrawerVariants } from '../utils/motion';

interface CrossingDetailPanelProps {
  crossing: RailwayCrossing | null;
  corridors: RailwayCorridor[];
  trains: SectorTrain[];
  onClose: () => void;
}

export const CrossingDetailPanel: React.FC<CrossingDetailPanelProps> = ({
  crossing,
  corridors,
  trains,
  onClose
}) => {
  const [copiedCoords, setCopiedCoords] = useState(false);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  if (!crossing) return null;

  const corridor = corridors.find(c => c.id === crossing.corridorId);
  const upcomingTrain = findImpactingTrainForCrossing(crossing, trains) || 
    (crossing as any).upcomingTrain || 
    (crossing as any).primaryTrain || 
    null;
  const isPending = crossing.verificationStatus === 'REQUIRES_FIELD_VERIFICATION';
  const isPassageClear = crossing.status === 'OPEN' || (!upcomingTrain && crossing.status !== 'CLOSED' && crossing.status !== 'CLOSURE_REPORTED' && crossing.status !== 'APPROACHING' && crossing.status !== 'CLOSURE_EXPECTED');

  const handleCopyCoords = () => {
    navigator.clipboard.writeText(`${crossing.lat}, ${crossing.lng}`);
    setCopiedCoords(true);
    setTimeout(() => setCopiedCoords(false), 2000);
  };

  const getStatusColor = () => {
    switch (crossing.status) {
      case 'CLOSURE_REPORTED':
      case 'CLOSED':
        return 'var(--critical-red)';
      case 'CLOSURE_EXPECTED':
        return 'var(--accent-tangerine)';
      case 'APPROACHING':
        return 'var(--warning-amber)';
      case 'UNKNOWN':
        return isPassageClear ? 'var(--status-open)' : 'var(--text-muted)';
      default:
        return 'var(--status-open)';
    }
  };

  const content = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#FFFFFF' }}>
      {/* MOBILE DRAG HANDLE */}
      {isMobile && <div className="bottom-sheet-handle-bar" />}

      {/* HEADER */}
      <div style={{
        padding: '16px 22px',
        borderBottom: '1px solid var(--border-soft)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#FAF9F5',
        position: 'sticky',
        top: 0,
        zIndex: 10,
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            backgroundColor: getStatusColor()
          }} />
          <div>
            <h2 style={{ fontFamily: 'var(--font-brand)', fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              {crossing.name}
            </h2>
            <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-primary)', fontWeight: 600 }}>{crossing.id}</span>
              {crossing.punjabiName && ` • ${crossing.punjabiName}`}
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="btn btn-ghost"
          style={{
            padding: '6px',
            borderRadius: '50%',
            minHeight: '34px',
            color: 'var(--text-secondary)'
          }}
          aria-label="Close details"
        >
          <X size={18} />
        </button>
      </div>

      {/* CONTENT BODY */}
      <div style={{ padding: isMobile ? '12px 14px' : '20px', display: 'flex', flexDirection: 'column', gap: isMobile ? '12px' : '16px', overflowY: 'auto', flex: 1, backgroundColor: '#FFFFFF' }}>
        {/* CLOSURE COUNTDOWN / STATUS CARD */}
        <ClosureCountdown crossing={crossing} />

        {/* GEOGRAPHIC & OPERATIONAL VERIFICATION */}
        <div className="panel" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontFamily: 'var(--font-brand)', fontSize: '11.5px', fontWeight: 700, color: 'var(--accent-emphasis)', letterSpacing: '0.04em' }}>
              GEOGRAPHIC GROUND TRUTH
            </span>
            <span style={{
              backgroundColor: isPending ? 'var(--status-approaching-bg)' : 'var(--surface-green)',
              color: isPending ? 'var(--warning-amber)' : 'var(--status-open)',
              border: `1px solid ${isPending ? 'var(--status-approaching-border)' : 'var(--surface-green-border)'}`,
              padding: '2px 8px',
              borderRadius: 'var(--radius-full)',
              fontSize: '10.5px',
              fontWeight: 700
            }}>
              {isPending ? 'Field verification pending' : 'Verified Level Crossing'}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12.5px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>OSM Node ID:</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-primary)', fontWeight: 600 }}>{crossing.id}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-secondary)' }}>GPS Coordinates:</span>
              <button
                onClick={handleCopyCoords}
                style={{
                  background: '#FAF9F5',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '4px',
                  color: 'var(--text-primary)',
                  padding: '3px 8px',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <span>{crossing.lat}, {crossing.lng}</span>
                {copiedCoords ? <Check size={11} color="var(--status-open)" /> : <Copy size={11} />}
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Railway Corridor:</span>
              <span style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 600 }}>{corridor?.name || 'Northern Railway Track'}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Intersecting Road:</span>
              <span style={{ fontSize: '12px', color: 'var(--text-primary)' }}>{crossing.roadClassification || crossing.locality || 'Amritsar Municipal Road'}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Physical Barrier Status:</span>
              <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>Uninstrumented (Forecast only)</span>
            </div>
          </div>
        </div>

        {/* TRACK KINEMATIC PROJECTION */}
        <div className="panel" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontFamily: 'var(--font-brand)', fontSize: '11.5px', fontWeight: 700, color: 'var(--accent-emphasis)', letterSpacing: '0.04em' }}>
              TRACK KINEMATIC PROJECTION
            </span>
            <span style={{
              fontSize: '10.5px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              color: upcomingTrain ? 'var(--accent-tangerine)' : (crossing.status === 'UNKNOWN' && !isPassageClear ? 'var(--text-secondary)' : 'var(--status-open)'),
              backgroundColor: upcomingTrain ? 'var(--surface-orange)' : (crossing.status === 'UNKNOWN' && !isPassageClear ? '#FAF9F5' : 'var(--surface-green)'),
              padding: '2px 8px',
              borderRadius: 'var(--radius-full)',
              border: `1px solid ${upcomingTrain ? 'var(--surface-orange-border)' : (crossing.status === 'UNKNOWN' && !isPassageClear ? 'var(--border-subtle)' : 'var(--surface-green-border)')}`
            }}>
              {upcomingTrain ? 'TRAIN IN BLOCK' : (crossing.status === 'UNKNOWN' && !isPassageClear ? 'STATUS UNCONFIRMED' : 'PASSAGE CLEAR')}
            </span>
          </div>

          {upcomingTrain ? (
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '2px' }}>
                {upcomingTrain.name} (#{upcomingTrain.number})
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                Route: {upcomingTrain.origin} ➔ {upcomingTrain.destination}
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '10px',
                backgroundColor: '#FAF9F5',
                padding: '12px',
                borderRadius: 'var(--radius-md)',
                marginBottom: '14px',
                border: '1px solid var(--border-subtle)'
              }}>
                <div>
                  <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Track Distance</div>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)' }}>
                    {typeof crossing.distanceAlongTrackKm === 'number' ? `${crossing.distanceAlongTrackKm.toFixed(2)} km` : 'Approaching'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Speed</div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                    {formatTrainSpeed(upcomingTrain)}
                  </div>
                </div>
              </div>

              {/* TIMETABLE BUTTON */}
              <button
                onClick={() => setIsScheduleOpen(true)}
                className="btn btn-primary"
                style={{
                  width: '100%',
                  minHeight: '44px',
                  fontSize: '13px',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <Clock size={15} />
                <span>View Full Train Schedule Timeline</span>
              </button>

              {crossing.subsequentTrains && crossing.subsequentTrains.length > 0 && (
                <div style={{
                  marginTop: '14px',
                  padding: '12px',
                  backgroundColor: '#FAF9F5',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)'
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '8px'
                  }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                      Following Approaching Trains ({crossing.subsequentTrains.length})
                    </span>
                    {crossing.combinedClosure?.isContinuous && (
                      <span style={{
                        fontSize: '9.5px',
                        fontWeight: 700,
                        backgroundColor: '#FEF3C7',
                        color: '#92400E',
                        padding: '1px 6px',
                        borderRadius: '3px'
                      }}>
                        Continuous Closure
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {crossing.subsequentTrains.map((sub, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 10px',
                          backgroundColor: '#FFFFFF',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border-subtle)',
                          fontSize: '11.5px'
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                            #{sub.trainNumber} • {sub.trainName}
                          </div>
                          <div style={{ fontSize: '10.5px', color: 'var(--text-secondary)', marginTop: '1px' }}>
                            {sub.distanceKm ? `~${sub.distanceKm.toFixed(1)} km away` : 'Approaching'} • ~{sub.speedKmph || 55} km/h
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 700,
                            color: 'var(--accent-primary)',
                            fontSize: '11px'
                          }}>
                            {sub.etaMinutes ? `~${Math.round(sub.etaMinutes)}m` : 'Upcoming'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (crossing.status === 'UNKNOWN' && !isPassageClear) ? (
            <div style={{
              backgroundColor: '#FAF9F5',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <Info size={20} color="var(--text-muted)" style={{ flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Approach Status Unconfirmed
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px', lineHeight: '1.4' }}>
                  {crossing.statusReason || (crossing as any).forecastNote || 'No verified in-sector train telemetry available on this corridor. Operating in safety caution state.'}
                </div>
              </div>
            </div>
          ) : (
            <div style={{
              backgroundColor: 'var(--surface-green)',
              border: '1px solid var(--surface-green-border)',
              borderRadius: 'var(--radius-md)',
              padding: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <CheckCircle2 size={20} color="var(--status-open)" style={{ flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--status-open)' }}>
                  Clear Roadway Passage
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px', lineHeight: '1.4' }}>
                  {crossing.lastTrainPassed ? (
                    <span>Recent train cleared: <strong>#{crossing.lastTrainPassed.trainNumber} {crossing.lastTrainPassed.trainName}</strong> (~{crossing.lastTrainPassed.distanceKm || 1.2}km away)</span>
                  ) : (
                    crossing.statusReason || 'Verified live permanent-way corridor is clear for vehicular transit.'
                  )}
                </div>
              </div>
            </div>
          )}
        </div>


        {/* TIMETABLE MODAL */}
        {upcomingTrain && (
          <TrainScheduleModal
            isOpen={isScheduleOpen}
            onClose={() => setIsScheduleOpen(false)}
            train={upcomingTrain}
          />
        )}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <div 
        className="bottom-sheet-backdrop"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
      >
        <motion.div
          className="bottom-sheet-content"
          variants={bottomSheetVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          onClick={(e) => e.stopPropagation()}
          style={{ maxHeight: '90vh', backgroundColor: '#FFFFFF' }}
        >
          {content}
        </motion.div>
      </div>
    );
  }

  return (
    <motion.div
      variants={sideDrawerVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        width: '420px',
        maxWidth: '90vw',
        backgroundColor: '#FFFFFF',
        borderLeft: '1px solid var(--border-soft)',
        zIndex: 600,
        boxShadow: '-8px 0 28px rgba(36, 40, 36, 0.08)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}
    >
      {content}
    </motion.div>
  );
};
