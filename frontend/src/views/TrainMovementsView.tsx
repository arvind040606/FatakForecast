import React from 'react';
import { 
  Train, 
  Compass, 
  MapPin, 
  Gauge, 
  Satellite, 
  Clock, 
  AlertCircle,
  CheckCircle,
  ExternalLink
} from 'lucide-react';
import { SectorTrain, RailwayCrossing } from '../types';

interface TrainMovementsViewProps {
  trains: SectorTrain[];
  crossings: RailwayCrossing[];
  onSelectCrossing: (crossing: RailwayCrossing) => void;
  onNavigateToMap: () => void;
}

export const TrainMovementsView: React.FC<TrainMovementsViewProps> = ({
  trains,
  crossings,
  onSelectCrossing,
  onNavigateToMap
}) => {
  return (
    <div style={{ padding: '24px 30px', maxWidth: '1400px', margin: '0 auto', width: '100%' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-white)' }}>
          Active Sector Train Movements (Amritsar 15km Perimeter)
        </h1>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          Live kinematic positions and speed telemetry linked to Northern Railway block signalling
        </p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
        gap: '20px'
      }}>
        {trains.map(train => {
          const targetCrossing = crossings.find(c => c.id === train.targetCrossingId);
          const isAtGate = train.status === 'CROSSING_GATE';

          return (
            <div
              key={train.id}
              className="card-surface"
              style={{
                padding: '18px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                borderColor: isAtGate ? 'var(--status-closed-border)' : 'var(--bg-panel-border)'
              }}
            >
              <div>
                {/* TOP HEADER */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-white)' }}>
                        {train.name}
                      </span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>
                      Train #{train.number} • {train.type}
                    </div>
                  </div>

                  <span style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    fontFamily: 'var(--font-mono)',
                    padding: '3px 8px',
                    borderRadius: '4px',
                    backgroundColor: isAtGate ? 'var(--status-closed-bg)' : 'rgba(56, 189, 248, 0.1)',
                    color: isAtGate ? 'var(--status-closed)' : 'var(--accent-cyan)',
                    border: `1px solid ${isAtGate ? 'var(--status-closed-border)' : 'rgba(56, 189, 248, 0.3)'}`
                  }}>
                    {train.status.replace('_', ' ')}
                  </span>
                </div>

                {/* FORMATION & ROUTE */}
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                  <div><strong>Rake:</strong> {train.rakeType}</div>
                  <div style={{ marginTop: '2px' }}>
                    <strong>Route:</strong> {train.origin} ➔ {train.destination}
                  </div>
                </div>

                {/* TELEMETRY METRICS GRID */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '8px',
                  backgroundColor: 'rgba(7, 11, 20, 0.5)',
                  padding: '12px',
                  borderRadius: '6px',
                  marginBottom: '12px'
                }}>
                  <div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Speed</div>
                    <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>
                      {train.speedKmH} km/h
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Heading / Bearing</div>
                    <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-white)', fontFamily: 'var(--font-mono)' }}>
                      {train.bearing}° ({train.direction} Line)
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>GPS Coordinates</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                      {train.lat}, {train.lng}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Distance to Next Fatak</div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--status-approaching)', fontFamily: 'var(--font-mono)' }}>
                      {train.distanceToNextCrossingKm.toFixed(2)} km
                    </div>
                  </div>
                </div>

                {/* TELEMETRY FEED SOURCE */}
                <div className="telemetry-row">
                  <span className="telemetry-label">Telemetry Source:</span>
                  <span className="telemetry-value" style={{ fontSize: '11px', color: 'var(--accent-cyan)' }}>
                    {train.telemetrySource}
                  </span>
                </div>

                <div className="telemetry-row">
                  <span className="telemetry-label">GPS Ping Freshness:</span>
                  <span className="telemetry-value" style={{ fontSize: '11px', color: 'var(--status-open)' }}>
                    {train.isStale ? '⚠️ STALE POSITION' : '✓ Verified Live Satellite'}
                  </span>
                </div>
              </div>

              {/* ASSOCIATED CROSSING LINK */}
              {targetCrossing && (
                <div style={{
                  marginTop: '12px',
                  paddingTop: '10px',
                  borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    Approaching: <strong style={{ color: 'var(--text-white)' }}>{targetCrossing.name}</strong> ({targetCrossing.officialCode})
                  </div>
                  <button
                    onClick={() => {
                      onSelectCrossing(targetCrossing);
                      onNavigateToMap();
                    }}
                    className="btn-secondary"
                    style={{ padding: '4px 8px', fontSize: '11px' }}
                  >
                    <span>View Crossing</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
