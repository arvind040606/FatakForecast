import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  AlertTriangle, 
  ShieldAlert, 
  CheckCircle2, 
  Clock, 
  Train, 
  MapPin, 
  ExternalLink,
  ChevronRight,
  TrendingUp,
  Activity
} from 'lucide-react';
import { RailwayCrossing, SectorTrain, RailwayCorridor } from '../types';
import { RailwayMap } from '../components/RailwayMap';
import { CrossingDetailPanel } from '../components/CrossingDetailPanel';

interface OverviewViewProps {
  crossings: RailwayCrossing[];
  trains: SectorTrain[];
  corridors: RailwayCorridor[];
  selectedCrossing: RailwayCrossing | null;
  onSelectCrossing: (crossing: RailwayCrossing) => void;
  onOpenDrill: (crossing?: RailwayCrossing) => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  crossings,
  trains,
  corridors,
  selectedCrossing,
  onSelectCrossing,
  onOpenDrill
}) => {
  const closedCrossings = crossings.filter(c => c.status === 'CLOSED');
  const approachingCrossings = crossings.filter(c => c.status === 'APPROACHING');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      {/* URGENT OPERATIONAL BANNER IF ANY CROSSING IS CLOSED OR APPROACHING */}
      {(closedCrossings.length > 0 || approachingCrossings.length > 0) && (
        <div style={{
          backgroundColor: closedCrossings.length > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
          borderBottom: `1px solid ${closedCrossings.length > 0 ? 'var(--status-closed-border)' : 'var(--status-approaching-border)'}`,
          padding: '8px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 30
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {closedCrossings.length > 0 ? (
              <ShieldAlert size={16} color="var(--status-closed)" />
            ) : (
              <AlertTriangle size={16} color="var(--status-approaching)" />
            )}
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-white)' }}>
              {closedCrossings.length > 0 ? (
                <span>
                  ACTIVE CLOSURE: <strong style={{ color: 'var(--status-closed)' }}>{closedCrossings.map(c => c.name).join(', ')}</strong> gates currently locked for train passage.
                </span>
              ) : (
                <span>
                  APPROACH ALERT: <strong style={{ color: 'var(--status-approaching)' }}>{approachingCrossings.map(c => c.name).join(', ')}</strong> closure expected in &lt; 3 mins.
                </span>
              )}
            </div>
          </div>

          <button
            onClick={() => onSelectCrossing(closedCrossings[0] || approachingCrossings[0])}
            style={{
              background: 'transparent',
              border: 'none',
              color: closedCrossings.length > 0 ? '#fca5a5' : '#fcd34d',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <span>Inspect Fatak Telemetry</span>
            <ChevronRight size={14} />
          </button>
        </div>
      )}

      {/* DOMINANT INTERACTIVE RAILWAY MAP */}
      <div style={{ flex: 1, minHeight: '440px', position: 'relative' }}>
        <RailwayMap
          crossings={crossings}
          trains={trains}
          corridors={corridors}
          selectedCrossing={selectedCrossing}
          onSelectCrossing={onSelectCrossing}
        />

        {/* DETAILS SLIDEOUT PANEL */}
        {selectedCrossing && (
          <CrossingDetailPanel
            crossing={selectedCrossing}
            corridors={corridors}
            trains={trains}
            onClose={() => onSelectCrossing(null as any)}
            onOpenDrill={(c) => onOpenDrill(c)}
          />
        )}
      </div>

      {/* QUICK CROSSINGS STATUS CARDS ROW */}
      <div style={{
        padding: '16px 20px',
        backgroundColor: 'var(--bg-secondary)',
        borderTop: '1px solid var(--bg-panel-border)',
        zIndex: 20
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '10px'
        }}>
          <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
            AMRITSAR SECTOR LEVEL CROSSINGS (4 CONFIGURED NODES)
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Click any crossing to focus map & inspect telemetry
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: '12px'
        }}>
          {crossings.map(c => {
            const isSelected = selectedCrossing?.id === c.id;
            const isClosed = c.status === 'CLOSED';
            const isApproaching = c.status === 'APPROACHING';

            return (
              <div
                key={c.id}
                onClick={() => onSelectCrossing(c)}
                className="card-surface"
                style={{
                  padding: '12px 14px',
                  cursor: 'pointer',
                  borderColor: isSelected 
                    ? 'var(--accent-cyan)' 
                    : isClosed 
                    ? 'var(--status-closed-border)' 
                    : isApproaching 
                    ? 'var(--status-approaching-border)' 
                    : 'var(--bg-panel-border)',
                  backgroundColor: isSelected 
                    ? 'rgba(56, 189, 248, 0.08)' 
                    : 'var(--bg-surface)',
                  transition: 'all 0.2s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <div>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-white)' }}>
                      {c.name}
                    </span>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '6px' }}>
                      ({c.punjabiName})
                    </span>
                  </div>
                  <span className={`status-badge ${c.status.toLowerCase()}`}>
                    {c.status}
                  </span>
                </div>

                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                  {c.line}
                </div>

                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '11px',
                  paddingTop: '6px',
                  borderTop: '1px solid rgba(255, 255, 255, 0.04)'
                }}>
                  <div style={{ color: 'var(--text-secondary)' }}>
                    {isClosed ? (
                      <span style={{ color: 'var(--status-closed)', fontWeight: 600 }}>
                        Locked (Reopens ~3m)
                      </span>
                    ) : isApproaching ? (
                      <span style={{ color: 'var(--status-approaching)', fontWeight: 600 }}>
                        Closing in ~{Math.round(c.timeToNextClosureSec / 60)}m
                      </span>
                    ) : (
                      <span>Next closure ~{Math.round(c.timeToNextClosureSec / 60)}m</span>
                    )}
                  </div>
                  <span style={{ color: 'var(--accent-cyan)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                    {c.officialCode}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
