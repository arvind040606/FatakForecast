import React from 'react';
import { 
  Clock, 
  AlertTriangle, 
  ShieldAlert, 
  MapPin, 
  Train, 
  ArrowRight,
  TrendingUp,
  Car
} from 'lucide-react';
import { RailwayCrossing, SectorTrain } from '../types';
import { ClosureCountdown } from '../components/ClosureCountdown';

interface UpcomingClosuresViewProps {
  crossings: RailwayCrossing[];
  trains: SectorTrain[];
  onSelectCrossing: (crossing: RailwayCrossing) => void;
  onNavigateToMap: () => void;
}

export const UpcomingClosuresView: React.FC<UpcomingClosuresViewProps> = ({
  crossings,
  trains,
  onSelectCrossing,
  onNavigateToMap
}) => {
  // Sort crossings by time to next closure
  const sortedCrossings = [...crossings].sort((a, b) => {
    if (a.status === 'CLOSED') return -1;
    if (b.status === 'CLOSED') return 1;
    return a.timeToNextClosureSec - b.timeToNextClosureSec;
  });

  const getAlternateRouteAdvice = (crossingId: string) => {
    switch (crossingId) {
      case 'LC-S25':
        return 'Recommended Alternate: 40-Khuh Flyover / GT Road bypass to avoid GT Road - Chamrang congestion.';
      case 'LC-S27':
        return 'Recommended Alternate: Circular Road overbridge or Tilak Nagar link road toward Batala Road.';
      case 'LC-C22':
        return 'Recommended Alternate: Putligarh underpass or Chheharta bypass road.';
      case 'LC-C18':
        return 'Recommended Alternate: Guru Ki Wadali bypass or Bhagtanwala outer ring road.';
      default:
        return 'Use nearest available grade-separated railway overbridge.';
    }
  };

  return (
    <div style={{ padding: '24px 30px', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-white)' }}>
          Amritsar Sector Closure Forecasts & Timeline
        </h1>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          Kinematic predictions computed from live train approach velocities, track circuit occupancy, and signal interlocks
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {sortedCrossings.map((c, index) => {
          const isClosed = c.status === 'CLOSED';
          const isApproaching = c.status === 'APPROACHING';
          const train = trains.find(t => t.number === c.upcomingTrainId);

          return (
            <div
              key={c.id}
              className="card-surface"
              style={{
                padding: '20px',
                borderLeft: `4px solid ${
                  isClosed 
                    ? 'var(--status-closed)' 
                    : isApproaching 
                    ? 'var(--status-approaching)' 
                    : 'var(--status-open)'
                }`
              }}
            >
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '14px',
                marginBottom: '16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '14px',
                    fontWeight: 700,
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--accent-cyan)'
                  }}>
                    #{index + 1}
                  </div>
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-white)' }}>
                      {c.name} ({c.punjabiName})
                    </h3>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {c.officialCode} • {c.line}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span className={`status-badge ${c.status.toLowerCase()}`}>
                    {c.status}
                  </span>

                  <button
                    onClick={() => {
                      onSelectCrossing(c);
                      onNavigateToMap();
                    }}
                    className="btn-secondary"
                    style={{ padding: '6px 12px', fontSize: '12px' }}
                  >
                    <MapPin size={14} />
                    <span>Focus Map</span>
                  </button>
                </div>
              </div>

              {/* COUNTDOWN COMPONENT */}
              <div style={{ marginBottom: '14px' }}>
                <ClosureCountdown crossing={c} />
              </div>

              {/* TIMELINE & PREDICTION METRICS */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '12px',
                backgroundColor: 'rgba(7, 11, 20, 0.5)',
                padding: '12px 16px',
                borderRadius: '6px',
                marginBottom: '12px'
              }}>
                <div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Estimated Dwell Duration</div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-white)', fontFamily: 'var(--font-mono)' }}>
                    ~{c.avgClosureDurationMin} minutes
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Impacting Sector Train</div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--accent-cyan)' }}>
                    {train ? `${train.name} (#${train.number})` : 'Interlocking Approach'}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Predicted Traffic Queue</div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-white)', fontFamily: 'var(--font-mono)' }}>
                    ~{c.queueEstimateVehicles} vehicles ({c.trafficCongestionLevel})
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Prediction Calibration</div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--status-open)', fontFamily: 'var(--font-mono)' }}>
                    AKSIM-v2 (Calibrated)
                  </div>
                </div>
              </div>

              {/* TRAFFIC ADVISORY */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '11px',
                color: 'var(--text-secondary)',
                backgroundColor: 'rgba(56, 189, 248, 0.04)',
                border: '1px solid rgba(56, 189, 248, 0.12)',
                padding: '8px 12px',
                borderRadius: '6px'
              }}>
                <Car size={14} color="var(--accent-cyan)" />
                <span>{getAlternateRouteAdvice(c.id)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
