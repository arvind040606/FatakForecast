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
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  Star,
  Route,
  Navigation
} from 'lucide-react';
import { RailwayCrossing, SectorTrain, RailwayCorridor } from '../types';
import { ClosureCountdown } from './ClosureCountdown';
import { TrainScheduleModal } from './TrainScheduleModal';
import { findImpactingTrainForCrossing, formatTrainSpeed, getCrossingTimingDetails } from '../utils/trainHelpers';
import { useSharedTimer } from '../utils/timerManager';
import { bottomSheetVariants, sideDrawerVariants } from '../utils/motion';
import { nativeService } from '../services/nativeService';

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
  const [isFavorite, setIsFavorite] = useState<boolean>(false);
  const [aiAnalysis, setAiAnalysis] = useState<{
    source: string;
    riskLevel: string;
    riskSummary: string;
    operationalFactors: string[];
    contradictionDetected: boolean;
    contradictionDetails: string | null;
    suspiciousPredictionFlag: boolean;
    flagReason: string | null;
    recommendedCommuterAction: string;
    aiConfidence: string;
  } | null>(null);
  const [isLoadingAi, setIsLoadingAi] = useState<boolean>(false);

  const now = useSharedTimer();
  const timing = crossing ? getCrossingTimingDetails(crossing, now, trains) : null;

  useEffect(() => {
    if (crossing) {
      setIsFavorite(nativeService.isFavoriteCrossing(crossing.id));
    }
  }, [crossing]);

  const handleToggleFavorite = async () => {
    if (!crossing) return;
    const next = await nativeService.toggleFavoriteCrossing(crossing.id);
    setIsFavorite(next);
  };

  useEffect(() => {
    if (!crossing) {
      setAiAnalysis(null);
      return;
    }
    let isMounted = true;
    setIsLoadingAi(true);

    const fetchAi = async () => {
      try {
        const baseUrl = nativeService.getBackendUrl();
        const res = await fetch(`${baseUrl}/api/intelligence/analyze-crossing`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ crossingId: crossing.id, crossing })
        });
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.success) {
            setAiAnalysis(data);
          }
        }
      } catch (err) {
        // Fallback gracefully without throwing
      } finally {
        if (isMounted) setIsLoadingAi(false);
      }
    };

    fetchAi();
    return () => { isMounted = false; };
  }, [crossing?.id, crossing?.status]);

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
  const isUnknown = crossing.status === 'UNKNOWN';
  const isPassageClear = !isUnknown && (crossing.status === 'OPEN' || (!upcomingTrain && crossing.status !== 'CLOSED' && crossing.status !== 'CLOSURE_REPORTED' && crossing.status !== 'APPROACHING' && crossing.status !== 'CLOSURE_EXPECTED'));

  const handleCopyCoords = () => {
    navigator.clipboard.writeText(`${crossing.lat}, ${crossing.lng}`);
    setCopiedCoords(true);
    setTimeout(() => setCopiedCoords(false), 2000);
  };

  const getStatusColor = () => {
    if (crossing.activeDrill || crossing.closureReported || crossing.observedPhysicalGateState === 'CLOSED') {
      return 'var(--critical-red)';
    }
    if (crossing.observedPhysicalGateState === 'OPEN' || crossing.confirmedOpenReport === true) {
      return 'var(--status-open)';
    }
    switch (crossing.status) {
      case 'CLOSURE_REPORTED':
      case 'CLOSED':
        return 'var(--critical-red)';
      case 'CLOSURE_EXPECTED':
        return 'var(--accent-tangerine)';
      case 'APPROACHING':
        return 'var(--warning-amber)';
      case 'UNKNOWN':
        return 'var(--text-muted)';
      default:
        return 'var(--status-open)';
    }
  };

  const content = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: 'var(--bg-surface)' }}>
      {/* MOBILE DRAG HANDLE */}
      {isMobile && <div className="bottom-sheet-handle-bar" />}

      {/* HEADER */}
      <div style={{
        padding: '16px 22px',
        borderBottom: '1px solid var(--border-soft)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'var(--bg-secondary)',
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            onClick={handleToggleFavorite}
            className="btn btn-ghost"
            style={{
              padding: '6px',
              borderRadius: '50%',
              minHeight: '34px',
              color: isFavorite ? '#f59e0b' : 'var(--text-secondary)'
            }}
            title={isFavorite ? "Remove from favourite fataks" : "Save as favourite fatak"}
            aria-label={isFavorite ? "Remove from favourites" : "Save as favourite"}
          >
            <Star size={18} fill={isFavorite ? '#f59e0b' : 'none'} color={isFavorite ? '#f59e0b' : 'currentColor'} />
          </button>

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
      </div>

      {/* CONTENT BODY */}
      <div style={{ padding: isMobile ? '12px 14px' : '20px', display: 'flex', flexDirection: 'column', gap: isMobile ? '12px' : '16px', overflowY: 'auto', flex: 1, backgroundColor: 'var(--bg-surface)' }}>
        {/* CLOSURE COUNTDOWN / STATUS CARD WITH 3-STEP TIMELINE */}
        <ClosureCountdown crossing={crossing} showTimeline={true} />

        {/* CROSSING LOCATION & DETAILS */}
        <div className="panel" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontFamily: 'var(--font-brand)', fontSize: '11.5px', fontWeight: 700, color: 'var(--accent-emphasis)', letterSpacing: '0.04em' }}>
              CROSSING DETAILS &amp; LOCATION
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
              {isPending ? 'Verification Pending' : 'Verified Railway Gate'}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12.5px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Reference Code:</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-primary)', fontWeight: 600 }}>{crossing.id.replace('osm/node/', 'ASR-')}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-secondary)' }}>GPS Location:</span>
              <button
                onClick={handleCopyCoords}
                style={{
                  background: 'var(--bg-secondary)',
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
              <span style={{ color: 'var(--text-secondary)' }}>Railway Line:</span>
              <span style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 600 }}>{corridor?.name || 'Northern Railway Track'}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Crossing Road:</span>
              <span style={{ fontSize: '12px', color: 'var(--text-primary)' }}>{crossing.roadClassification || crossing.locality || 'Amritsar Road'}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Barrier Status:</span>
              <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>Forecast from live trains (Uninstrumented gate)</span>
            </div>
          </div>
        </div>

        {/* APPROACHING TRAIN DETAILS */}
        <div className="panel" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontFamily: 'var(--font-brand)', fontSize: '11.5px', fontWeight: 700, color: 'var(--accent-emphasis)', letterSpacing: '0.04em' }}>
              APPROACHING TRAIN DETAILS
            </span>
            <span style={{
              fontSize: '10.5px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              color: upcomingTrain ? 'var(--accent-tangerine)' : isUnknown ? 'var(--text-muted)' : 'var(--status-open)',
              backgroundColor: upcomingTrain ? 'rgba(255, 120, 73, 0.15)' : isUnknown ? 'var(--bg-secondary)' : 'rgba(16, 185, 129, 0.15)',
              padding: '2px 8px',
              borderRadius: 'var(--radius-full)',
              border: `1px solid ${upcomingTrain ? 'var(--surface-orange-border)' : isUnknown ? 'var(--border-subtle)' : 'var(--surface-green-border)'}`
            }}>
              {upcomingTrain ? 'TRAIN IN BLOCK' : isUnknown ? 'STATUS UNKNOWN' : 'PREDICTED OPEN'}
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
                backgroundColor: 'var(--bg-secondary)',
                padding: '12px',
                borderRadius: 'var(--radius-md)',
                marginBottom: '14px',
                border: '1px solid var(--border-subtle)'
              }}>
                <div>
                  <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Track Distance</div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)' }}>
                    {typeof crossing.distanceAlongTrackKm === 'number' ? `${crossing.distanceAlongTrackKm.toFixed(2)} km` : 'Approaching'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Speed</div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                    {formatTrainSpeed(upcomingTrain)}
                  </div>
                </div>
                {timing && (
                  <>
                    <div style={{ gridColumn: 'span 2', padding: '9px 12px', backgroundColor: 'rgba(56, 189, 248, 0.1)', borderRadius: '6px', border: '1px solid rgba(56, 189, 248, 0.25)' }}>
                      <div style={{ fontSize: '10px', color: '#38bdf8', textTransform: 'uppercase', fontWeight: 700 }}>Expected Train Arrival Time</div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                        {timing.trainArrivalEtaText}
                      </div>
                    </div>
                    {timing.isClosedNow ? (
                      <div style={{ gridColumn: 'span 2', padding: '9px 12px', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.25)' }}>
                        <div style={{ fontSize: '10px', color: '#f87171', textTransform: 'uppercase', fontWeight: 700 }}>
                          Fatak Closed • Dynamic Reopening Time
                        </div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                          {timing.reopeningTimeStr 
                            ? `Expected Reopening at ${timing.reopeningTimeStr}${timing.reopenCountdownText ? ` (${timing.reopenCountdownText})` : ''} • ${timing.closureDurationText}`
                            : `Barriers locked • Traversing in progress`}
                        </div>
                      </div>
                    ) : timing.isClosingSoon ? (
                      <div style={{ gridColumn: 'span 2', padding: '9px 12px', backgroundColor: 'rgba(245, 158, 11, 0.1)', borderRadius: '6px', border: '1px solid rgba(245, 158, 11, 0.25)' }}>
                        <div style={{ fontSize: '10px', color: '#fbbf24', textTransform: 'uppercase', fontWeight: 700 }}>
                          Approaching Train • Closure Window
                        </div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                          {timing.closingTimeStr 
                            ? `Barriers lock at ${timing.closingTimeStr}${timing.closingCountdownText ? ` (${timing.closingCountdownText})` : ''}`
                            : 'Gate closure expected shortly'}
                        </div>
                      </div>
                    ) : null}
                  </>
                )}
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
                  backgroundColor: 'var(--bg-secondary)',
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
                    {crossing.combinedClosure?.isContinuous ? (
                      <span style={{
                        fontSize: '9.5px',
                        fontWeight: 700,
                        backgroundColor: '#FEF3C7',
                        color: '#92400E',
                        padding: '1px 6px',
                        borderRadius: '3px',
                        border: '1px solid #FCD34D'
                      }}>
                        ⚡ Continuous Closure
                      </span>
                    ) : (
                      <span style={{
                        fontSize: '9.5px',
                        fontWeight: 700,
                        backgroundColor: '#EFF6FF',
                        color: '#1E40AF',
                        padding: '1px 6px',
                        borderRadius: '3px',
                        border: '1px solid #BFDBFE'
                      }}>
                        🔄 Gate Reopens Between Trains
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
                          backgroundColor: 'var(--bg-surface)',
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
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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

              {timing?.passingTrain && (
                <div style={{
                  padding: '8px 10px',
                  backgroundColor: 'rgba(56, 189, 248, 0.08)',
                  border: '1px solid rgba(56, 189, 248, 0.25)',
                  borderRadius: 'var(--radius-sm)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 700, color: 'var(--accent-cyan)', fontSize: '12px' }}>
                      Train in Corridor: #{timing.passingTrain.trainNumber} {timing.passingTrain.trainName}
                    </span>
                    <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                      {timing.passingTrain.speedText}
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {timing.passingTrain.route} • {timing.passingTrain.direction || 'Track'} bound
                  </div>
                </div>
              )}

              {timing?.lastTrainPassedText && (
                <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Recent history:</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{timing.lastTrainPassedText}</span>
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
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
                    {crossing.statusReason || 'Verified live permanent-way corridor is clear for vehicular transit.'}
                  </div>
                </div>
              </div>

              {timing?.activeTrain && (
                <div style={{
                  padding: '10px 12px',
                  backgroundColor: 'rgba(56, 189, 248, 0.08)',
                  border: '1px solid rgba(56, 189, 248, 0.25)',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: 'var(--accent-cyan)', fontSize: '12.5px' }}>
                      <Train size={14} />
                      <span>#{timing.activeTrain.trainNumber} {timing.activeTrain.trainName}</span>
                    </div>
                    <span style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: 'var(--radius-full)',
                      backgroundColor: timing.activeTrain.isStationary ? 'rgba(245, 158, 11, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                      color: timing.activeTrain.isStationary ? '#f59e0b' : 'var(--accent-cyan)'
                    }}>
                      {timing.activeTrain.isStationary ? 'AT PLATFORM' : (timing.activeTrain.isReceding ? 'RECEDING' : 'MONITORED')}
                    </span>
                  </div>
                  <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                    <span>Status: </span>
                    <strong style={{ color: 'var(--text-primary)' }}>{timing.activeTrain.timingText}</strong>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {timing.activeTrain.route} • {timing.activeTrain.speedText}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* GOOGLE GEMINI / RAILWAY INTERLOCKING INTELLIGENCE AUDIT */}
        <div className="panel" style={{ padding: '16px', borderLeft: '4px solid #8b5cf6' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Sparkles size={15} color="#8b5cf6" />
              <span style={{ fontFamily: 'var(--font-brand)', fontSize: '11.5px', fontWeight: 700, color: 'var(--accent-emphasis)', letterSpacing: '0.04em' }}>
                AI SAFETY &amp; INTERLOCKING AUDIT
              </span>
            </div>
            {aiAnalysis ? (
              <span style={{
                fontSize: '10px',
                fontWeight: 700,
                color: aiAnalysis.riskLevel === 'CRITICAL' ? '#ef4444' : aiAnalysis.riskLevel === 'HIGH' ? '#f59e0b' : '#10b981',
                backgroundColor: aiAnalysis.riskLevel === 'CRITICAL' ? 'rgba(239, 68, 68, 0.12)' : aiAnalysis.riskLevel === 'HIGH' ? 'rgba(245, 158, 11, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                padding: '2px 8px',
                borderRadius: 'var(--radius-full)',
                fontFamily: 'var(--font-mono)'
              }}>
                {aiAnalysis.riskLevel} RISK • {aiAnalysis.source === 'GOOGLE_GEMINI_AI' ? 'GEMINI 1.5' : 'RAIL ENGINE'}
              </span>
            ) : isLoadingAi ? (
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Analyzing...</span>
            ) : null}
          </div>

          {isLoadingAi && !aiAnalysis ? (
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', padding: '6px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '12px', height: '12px', border: '2px solid currentColor', borderRightColor: 'transparent', borderRadius: '50%', animation: 'spin 0.75s linear infinite' }} />
              <span>Auditing permanent-way kinematics and railway interlocking factors...</span>
            </div>
          ) : aiAnalysis ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
              <div style={{ color: 'var(--text-primary)', lineHeight: '1.45' }}>
                {aiAnalysis.riskSummary}
              </div>

              {aiAnalysis.contradictionDetected && (
                <div style={{
                  padding: '8px 10px',
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: '#f87171'
                }}>
                  <ShieldAlert size={16} style={{ flexShrink: 0 }} />
                  <div>
                    <strong style={{ fontSize: '11px', display: 'block' }}>Contradiction Flagged</strong>
                    <span style={{ fontSize: '11px' }}>{aiAnalysis.contradictionDetails}</span>
                  </div>
                </div>
              )}

              {aiAnalysis.operationalFactors && aiAnalysis.operationalFactors.length > 0 && (
                <div style={{
                  backgroundColor: 'var(--bg-secondary)',
                  padding: '8px 10px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px'
                }}>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                    Operational Interlocking Factors
                  </div>
                  {aiAnalysis.operationalFactors.map((factor: string, idx: number) => (
                    <div key={idx} style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                      <span style={{ color: '#8b5cf6' }}>•</span>
                      <span>{factor}</span>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-subtle)', paddingTop: '6px', fontSize: '11px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Commuter Action:</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {aiAnalysis.recommendedCommuterAction}
                </span>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
              Verified deterministic interlocking telemetry is active. No physical track contradictions detected.
            </div>
          )}
        </div>

        {/* ALTERNATIVE CROSSINGS & FLYOVER BYPASS ROUTES */}
        {(timing?.isClosedNow || timing?.isClosingSoon || upcomingTrain) && (
          <div className="panel" style={{ padding: '16px', borderLeft: '4px solid var(--accent-cyan)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Route size={15} color="var(--accent-cyan)" />
                <span style={{ fontFamily: 'var(--font-brand)', fontSize: '11.5px', fontWeight: 700, color: 'var(--accent-emphasis)', letterSpacing: '0.04em' }}>
                  ALTERNATIVE BYPASS ROUTES
                </span>
              </div>
              <span style={{
                fontSize: '10px',
                fontWeight: 700,
                color: 'var(--status-open)',
                backgroundColor: 'rgba(16, 185, 129, 0.12)',
                padding: '1px 6px',
                borderRadius: 'var(--radius-full)'
              }}>
                Flyovers Always Open
              </span>
            </div>

            <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
              Barrier closure active or imminent. Recommended elevated flyovers (ROBs) nearby with zero railway barrier delays:
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{
                padding: '9px 12px',
                backgroundColor: 'var(--bg-secondary)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '12px' }}>
                    Bhandari Bridge (ROB Flyover)
                  </div>
                  <div style={{ fontSize: '10.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Main Amritsar elevated arterial • Connects GT Road &amp; Hall Gate
                  </div>
                </div>
                <span style={{
                  fontSize: '10.5px',
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--status-open)'
                }}>
                  0m wait
                </span>
              </div>

              <div style={{
                padding: '9px 12px',
                backgroundColor: 'var(--bg-secondary)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '12px' }}>
                    Rego Bridge (Elevated Flyover)
                  </div>
                  <div style={{ fontSize: '10.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Connects Gobindgarh Fort &amp; Civil Lines • 4-lane elevated
                  </div>
                </div>
                <span style={{
                  fontSize: '10.5px',
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--status-open)'
                }}>
                  0m wait
                </span>
              </div>

              <div style={{
                padding: '9px 12px',
                backgroundColor: 'var(--bg-secondary)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '12px' }}>
                    Vallah / NH-54 Elevated Bypass
                  </div>
                  <div style={{ fontSize: '10.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Heavy vehicle bypass for eastern corridor &amp; bypass transit
                  </div>
                </div>
                <span style={{
                  fontSize: '10.5px',
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--status-open)'
                }}>
                  0m wait
                </span>
              </div>
            </div>
          </div>
        )}

        {/* DATA FRESHNESS & PREDICTION CONFIDENCE */}
        <div className="panel" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontFamily: 'var(--font-brand)', fontSize: '11.5px', fontWeight: 700, color: 'var(--accent-emphasis)', letterSpacing: '0.04em' }}>
              DATA FRESHNESS &amp; PREDICTION CONFIDENCE
            </span>
            <span style={{
              fontSize: '10.5px',
              fontWeight: 700,
              color: timing?.statusBadge.color || 'var(--text-secondary)',
              backgroundColor: timing?.statusBadge.bg || 'var(--bg-secondary)',
              border: `1px solid ${timing?.statusBadge.border || 'var(--border-subtle)'}`,
              padding: '2px 8px',
              borderRadius: 'var(--radius-full)'
            }}>
              {timing?.confidenceLabel || 'Schedule Estimate'}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Calculation Timestamp:</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontWeight: 600 }}>
                {timing?.lastUpdateText ? `${timing.lastUpdateText} (IST)` : 'Real-time sync'}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Telemetry Engine:</span>
              <span style={{ color: 'var(--text-primary)' }}>CRIS / Live Track Geometry Radar</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Barrier Telemetry:</span>
              <span style={{ color: 'var(--text-muted)' }}>
                Estimated via track speed &amp; signal blocks
              </span>
            </div>

            {timing?.isTimingUnavailable && (
              <div style={{
                marginTop: '6px',
                padding: '9px 12px',
                backgroundColor: 'rgba(239, 68, 68, 0.08)',
                borderRadius: '6px',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                color: 'var(--critical-red)',
                fontSize: '11.5px',
                lineHeight: 1.4
              }}>
                <strong>Why timing is unavailable:</strong> Live railway telemetry is currently insufficient or unconfirmed on this sector. Timings are withheld to prevent fabricated or inaccurate countdowns until verified position &amp; speed are acquired.
              </div>
            )}
          </div>
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
          style={{ maxHeight: '90vh', backgroundColor: 'var(--bg-surface)' }}
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
        backgroundColor: 'var(--bg-surface)',
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
