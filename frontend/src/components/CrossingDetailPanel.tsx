import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  X, 
  MapPin, 
  Copy, 
  Check, 
  ShieldCheck, 
  Train, 
  Clock, 
  AlertTriangle, 
  Activity, 
  SlidersHorizontal,
  Compass,
  ArrowRight,
  Gauge
} from 'lucide-react';
import { RailwayCrossing, SectorTrain, RailwayCorridor } from '../types';
import { ClosureCountdown } from './ClosureCountdown';

interface CrossingDetailPanelProps {
  crossing: RailwayCrossing | null;
  corridors: RailwayCorridor[];
  trains: SectorTrain[];
  onClose: () => void;
  onOpenDrill: (crossing: RailwayCrossing) => void;
}

export const CrossingDetailPanel: React.FC<CrossingDetailPanelProps> = ({
  crossing,
  corridors,
  trains,
  onClose,
  onOpenDrill
}) => {
  const [copiedCoords, setCopiedCoords] = useState(false);

  if (!crossing) return null;

  const corridor = corridors.find(c => c.id === crossing.corridorId);
  const upcomingTrain = trains.find(t => t.number === crossing.upcomingTrainId);

  const handleCopyCoords = () => {
    navigator.clipboard.writeText(`${crossing.lat}, ${crossing.lng}`);
    setCopiedCoords(true);
    setTimeout(() => setCopiedCoords(false), 2000);
  };

  const getStatusColor = () => {
    switch (crossing.status) {
      case 'CLOSED': return 'var(--status-closed)';
      case 'APPROACHING': return 'var(--status-approaching)';
      default: return 'var(--status-open)';
    }
  };

  return (
    <motion.div
      initial={{ x: 380, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 380, opacity: 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 220 }}
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        width: '400px',
        maxWidth: '90vw',
        backgroundColor: 'var(--bg-secondary)',
        borderLeft: '1px solid var(--bg-panel-border)',
        zIndex: 600,
        boxShadow: '-8px 0 30px rgba(0, 0, 0, 0.6)',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto'
      }}
    >
      {/* HEADER */}
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid var(--bg-panel-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'rgba(12, 18, 34, 0.95)',
        position: 'sticky',
        top: 0,
        zIndex: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            backgroundColor: getStatusColor(),
            boxShadow: `0 0 10px ${getStatusColor()}`
          }} />
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-white)' }}>
              {crossing.name}
            </h2>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {crossing.punjabiName} • {crossing.officialCode}
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '4px'
          }}
          onMouseEnter={(e) => e.currentTarget.style.color = '#fff'}
          onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
        >
          <X size={20} />
        </button>
      </div>

      {/* CONTENT BODY */}
      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
        {/* CLOSURE COUNTDOWN / STATUS CARD */}
        <ClosureCountdown crossing={crossing} />

        {/* VERIFIED STATUS & DATA SOURCE */}
        <div className="card-surface" style={{ padding: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
              GATE INTERLOCKING STATUS
            </span>
            <span className={`status-badge ${crossing.status.toLowerCase()}`}>
              {crossing.status}
            </span>
          </div>

          <div className="telemetry-row">
            <span className="telemetry-label">Verified Sensor Source:</span>
            <span className="telemetry-value" style={{ color: 'var(--accent-cyan)' }}>
              {crossing.verifiedSource}
            </span>
          </div>

          <div className="telemetry-row">
            <span className="telemetry-label">Telemetry Latency:</span>
            <span className="telemetry-value">
              {crossing.telemetryFreshnessSec}s (CRIS Live Stream)
            </span>
          </div>

          <div className="telemetry-row">
            <span className="telemetry-label">Barrier Mechanism:</span>
            <span className="telemetry-value" style={{ fontSize: '11px', textAlign: 'right' }}>
              {crossing.gateType}
            </span>
          </div>

          <div className="telemetry-row">
            <span className="telemetry-label">Road Congestion Impact:</span>
            <span className="telemetry-value" style={{
              color: crossing.trafficCongestionLevel === 'HEAVY' ? 'var(--status-closed)' : 'var(--status-approaching)'
            }}>
              ~{crossing.queueEstimateVehicles} vehicles in queue ({crossing.trafficCongestionLevel})
            </span>
          </div>
        </div>

        {/* UPCOMING TRAIN INTELLIGENCE */}
        <div className="card-surface" style={{ padding: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Train size={15} color="var(--accent-cyan)" />
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
                ASSOCIATED SECTOR TRAIN
              </span>
            </div>
            <span style={{
              fontSize: '10px',
              fontFamily: 'var(--font-mono)',
              color: 'var(--accent-cyan)',
              background: 'rgba(56, 189, 248, 0.1)',
              padding: '2px 6px',
              borderRadius: '4px'
            }}>
              TRACK ASSOCIATED
            </span>
          </div>

          {upcomingTrain ? (
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-white)', marginBottom: '2px' }}>
                {upcomingTrain.name}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '10px' }}>
                Train #{upcomingTrain.number} • {upcomingTrain.type}
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px',
                background: 'rgba(7, 11, 20, 0.5)',
                padding: '10px',
                borderRadius: '6px',
                marginBottom: '10px'
              }}>
                <div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Train Speed</div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>
                    {upcomingTrain.speedKmH} km/h
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Distance to Fatak</div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-white)', fontFamily: 'var(--font-mono)' }}>
                    {upcomingTrain.distanceToNextCrossingKm.toFixed(2)} km
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Corridor Direction</div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Line {upcomingTrain.direction} ({upcomingTrain.bearing}°)
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>GPS Timestamp</div>
                  <div style={{ fontSize: '11px', color: 'var(--status-open)', fontFamily: 'var(--font-mono)' }}>
                    Live GPS Active
                  </div>
                </div>
              </div>

              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                <strong>Route:</strong> {upcomingTrain.origin} ➔ {upcomingTrain.destination}
              </div>
            </div>
          ) : (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '10px 0' }}>
              No immediate trains detected in 5km approach circuit.
            </div>
          )}
        </div>

        {/* GEOGRAPHIC & TRACK CORRIDOR SPECIFICATION */}
        <div className="card-surface" style={{ padding: '14px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
            GEOGRAPHIC & TRACK SPECIFICATION
          </span>

          <div style={{ marginTop: '10px' }}>
            <div className="telemetry-row">
              <span className="telemetry-label">Coordinates:</span>
              <button
                onClick={handleCopyCoords}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--accent-cyan)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)'
                }}
              >
                <span>{crossing.lat}, {crossing.lng}</span>
                {copiedCoords ? <Check size={12} color="var(--status-open)" /> : <Copy size={12} />}
              </button>
            </div>

            <div className="telemetry-row">
              <span className="telemetry-label">Railway Corridor:</span>
              <span className="telemetry-value" style={{ fontSize: '11px' }}>
                {corridor?.name || crossing.line}
              </span>
            </div>

            <div className="telemetry-row">
              <span className="telemetry-label">Track Structure:</span>
              <span className="telemetry-value" style={{ fontSize: '11px' }}>
                {corridor?.type || 'Double BG Electrified'}
              </span>
            </div>

            <div className="telemetry-row">
              <span className="telemetry-label">Maximum Line Speed:</span>
              <span className="telemetry-value">
                {corridor?.speedLimitKmH || 110} km/h
              </span>
            </div>

            <div className="telemetry-row">
              <span className="telemetry-label">Location Landmark:</span>
              <span className="telemetry-value" style={{ fontSize: '11px', textAlign: 'right' }}>
                {crossing.locationDescription}
              </span>
            </div>
          </div>
        </div>

        {/* HISTORICAL STATS FOR TODAY */}
        <div className="card-surface" style={{ padding: '14px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
            TODAY'S OPERATIONAL DWELL METRICS
          </span>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '10px' }}>
            <div style={{ background: 'rgba(7, 11, 20, 0.5)', padding: '10px', borderRadius: '6px' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Closures Today</div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-white)', fontFamily: 'var(--font-mono)' }}>
                {crossing.closureHistoryCountToday}
              </div>
            </div>
            <div style={{ background: 'rgba(7, 11, 20, 0.5)', padding: '10px', borderRadius: '6px' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Avg Gate Dwell</div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>
                {crossing.avgClosureDurationMin} min
              </div>
            </div>
          </div>
        </div>

        {/* DRILL SIMULATOR TRIGGER */}
        <button
          onClick={() => onOpenDrill(crossing)}
          className="btn-secondary"
          style={{ width: '100%', justifyContent: 'center', padding: '10px' }}
        >
          <SlidersHorizontal size={15} />
          <span>Launch Operational Drill on {crossing.name}</span>
        </button>
      </div>
    </motion.div>
  );
};
