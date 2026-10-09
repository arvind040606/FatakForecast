import React, { useState } from 'react';
import { 
  GitFork, 
  MapPin, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  ShieldAlert, 
  Search, 
  Filter, 
  SlidersHorizontal,
  Train,
  Copy,
  Check
} from 'lucide-react';
import { RailwayCrossing, SectorTrain, RailwayCorridor, ActiveView } from '../types';

interface CrossingsViewProps {
  crossings: RailwayCrossing[];
  trains: SectorTrain[];
  corridors: RailwayCorridor[];
  onSelectCrossing: (crossing: RailwayCrossing) => void;
  onNavigateToMap: () => void;
  onOpenDrill: (crossing: RailwayCrossing) => void;
}

export const CrossingsView: React.FC<CrossingsViewProps> = ({
  crossings,
  trains,
  corridors,
  onSelectCrossing,
  onNavigateToMap,
  onOpenDrill
}) => {
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filtered = crossings.filter(c => {
    const matchStatus = filterStatus === 'ALL' || c.status === filterStatus;
    const matchSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        c.officialCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        c.punjabiName.includes(searchQuery);
    return matchStatus && matchSearch;
  });

  const handleCopyCoords = (c: RailwayCrossing, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(`${c.lat}, ${c.lng}`);
    setCopiedId(c.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div style={{ padding: '24px 30px', maxWidth: '1400px', margin: '0 auto', width: '100%' }}>
      {/* HEADER & FILTER BAR */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-white)' }}>
            Amritsar Level Crossings Directory
          </h1>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Exclusively mapped official railway crossings in Amritsar, Punjab • Northern Railway (NR) Firozpur Division
          </p>
        </div>

        {/* SEARCH & FILTERS */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            background: 'var(--bg-surface)',
            border: '1px solid var(--bg-panel-border)',
            borderRadius: '6px',
            padding: '6px 12px',
            gap: '8px'
          }}>
            <Search size={14} color="var(--text-muted)" />
            <input
              type="text"
              placeholder="Search by name or LC code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--text-white)',
                fontSize: '12px',
                width: '180px'
              }}
            />
          </div>

          <div style={{ display: 'flex', background: 'var(--bg-surface)', borderRadius: '6px', padding: '3px', border: '1px solid var(--bg-panel-border)' }}>
            {['ALL', 'OPEN', 'APPROACHING', 'CLOSED'].map(status => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                style={{
                  padding: '5px 12px',
                  borderRadius: '4px',
                  border: 'none',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: filterStatus === status ? 'var(--accent-blue-deep)' : 'transparent',
                  color: filterStatus === status ? '#ffffff' : 'var(--text-muted)',
                  transition: 'all 0.15s ease'
                }}
              >
                {status}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* CROSSINGS CARDS GRID */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: '20px'
      }}>
        {filtered.map(crossing => {
          const corridor = corridors.find(c => c.id === crossing.corridorId);
          const upcomingTrain = trains.find(t => t.number === crossing.upcomingTrainId);
          const isClosed = crossing.status === 'CLOSED';
          const isApproaching = crossing.status === 'APPROACHING';

          return (
            <div
              key={crossing.id}
              className="card-surface"
              style={{
                padding: '18px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '14px',
                borderColor: isClosed ? 'var(--status-closed-border)' : isApproaching ? 'var(--status-approaching-border)' : 'var(--bg-panel-border)'
              }}
            >
              <div>
                {/* TOP HEADER */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-white)' }}>
                      {crossing.name}
                    </h3>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {crossing.punjabiName} • <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)' }}>{crossing.officialCode}</span>
                    </div>
                  </div>
                  <span className={`status-badge ${crossing.status.toLowerCase()}`}>
                    {crossing.status}
                  </span>
                </div>

                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
                  {crossing.line}
                </div>

                {/* TELEMETRY SPECS */}
                <div style={{
                  backgroundColor: 'rgba(7, 11, 20, 0.5)',
                  borderRadius: '6px',
                  padding: '10px 12px',
                  marginBottom: '12px'
                }}>
                  <div className="telemetry-row">
                    <span className="telemetry-label">Coordinates:</span>
                    <button
                      onClick={(e) => handleCopyCoords(crossing, e)}
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
                      {copiedId === crossing.id ? <Check size={11} color="var(--status-open)" /> : <Copy size={11} />}
                    </button>
                  </div>

                  <div className="telemetry-row">
                    <span className="telemetry-label">Telemetry Source:</span>
                    <span className="telemetry-value" style={{ color: 'var(--text-primary)' }}>
                      {crossing.verifiedSource}
                    </span>
                  </div>

                  <div className="telemetry-row">
                    <span className="telemetry-label">Line Speed Limit:</span>
                    <span className="telemetry-value">
                      {corridor?.speedLimitKmH || 110} km/h
                    </span>
                  </div>

                  <div className="telemetry-row">
                    <span className="telemetry-label">Next Train Dwell:</span>
                    <span className="telemetry-value" style={{
                      color: isClosed ? 'var(--status-closed)' : isApproaching ? 'var(--status-approaching)' : 'var(--status-open)'
                    }}>
                      {isClosed ? 'Gates Locked (~3m left)' : `Closure in ~${Math.round(crossing.timeToNextClosureSec / 60)}m`}
                    </span>
                  </div>
                </div>

                {/* TRAIN INFO */}
                {upcomingTrain && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 10px',
                    backgroundColor: 'rgba(56, 189, 248, 0.05)',
                    border: '1px solid rgba(56, 189, 248, 0.15)',
                    borderRadius: '6px'
                  }}>
                    <Train size={16} color="var(--accent-cyan)" />
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-white)' }}>
                        {upcomingTrain.name} (#{upcomingTrain.number})
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                        {upcomingTrain.speedKmH} km/h • {upcomingTrain.distanceToNextCrossingKm.toFixed(1)} km away
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* ACTION BUTTONS */}
              <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                <button
                  onClick={() => {
                    onSelectCrossing(crossing);
                    onNavigateToMap();
                  }}
                  className="btn-primary"
                  style={{ flex: 1, justifyContent: 'center', padding: '8px' }}
                >
                  <MapPin size={14} />
                  <span>View On Map</span>
                </button>

                <button
                  onClick={() => onOpenDrill(crossing)}
                  className="btn-secondary"
                  style={{ padding: '8px 12px' }}
                  title="Simulate Operational Action"
                >
                  <SlidersHorizontal size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
