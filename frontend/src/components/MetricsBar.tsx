import React from 'react';
import { 
  GitCommit, 
  CheckCircle, 
  AlertCircle, 
  Clock, 
  Train, 
  Wifi 
} from 'lucide-react';
import { OperationalMetrics } from '../types';

interface MetricsBarProps {
  metrics: OperationalMetrics;
}

export const MetricsBar: React.FC<MetricsBarProps> = ({ metrics }) => {
  const cards = [
    {
      label: 'AMRITSAR CROSSINGS',
      value: metrics.totalCrossings,
      subtext: '4 Mapped Corridors',
      icon: GitCommit,
      color: 'var(--accent-cyan)',
      bg: 'rgba(56, 189, 248, 0.08)'
    },
    {
      label: 'PREDICTED OPEN',
      value: metrics.openCount,
      subtext: 'Safe Passage Active',
      icon: CheckCircle,
      color: 'var(--status-open)',
      bg: 'var(--status-open-bg)'
    },
    {
      label: 'PREDICTED CLOSED',
      value: metrics.closedCount,
      subtext: metrics.closedCount > 0 ? 'Interlocking Locked' : 'All Clear',
      icon: AlertCircle,
      color: metrics.closedCount > 0 ? 'var(--status-closed)' : 'var(--text-muted)',
      bg: metrics.closedCount > 0 ? 'var(--status-closed-bg)' : 'rgba(255, 255, 255, 0.02)'
    },
    {
      label: 'APPROACHING / WARN',
      value: metrics.approachingCount,
      subtext: metrics.approachingCount > 0 ? 'Closure Imminent' : 'None in block',
      icon: Clock,
      color: metrics.approachingCount > 0 ? 'var(--status-approaching)' : 'var(--text-muted)',
      bg: metrics.approachingCount > 0 ? 'var(--status-approaching-bg)' : 'rgba(255, 255, 255, 0.02)'
    },
    {
      label: 'ACTIVE SECTOR TRAINS',
      value: metrics.activeSectorTrains,
      subtext: 'Live Telemetry Linked',
      icon: Train,
      color: 'var(--accent-cyan-light)',
      bg: 'rgba(125, 211, 252, 0.08)'
    },
    {
      label: 'FEED FRESHNESS',
      value: metrics.feedLatencyMs != null ? `${metrics.feedLatencyMs}ms` : 'Not Measured',
      subtext: metrics.feedStatus === 'CONNECTED' ? 'Live Provider Stream' : metrics.feedStatus === 'ONLINE_SYNCHRONIZED' ? 'WebSocket Stream' : 'Provider Disconnected',
      icon: Wifi,
      color: metrics.feedStatus === 'CONNECTED' ? 'var(--status-open)' : 'var(--text-muted)',
      bg: metrics.feedStatus === 'CONNECTED' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)'
    }
  ];

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
      gap: '12px',
      padding: '12px 18px',
      backgroundColor: 'var(--bg-secondary)',
      borderBottom: '1px solid var(--bg-panel-border)'
    }}>
      {cards.map((card, idx) => {
        const Icon = card.icon;
        return (
          <div
            key={idx}
            className="card-surface"
            style={{
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: card.bg
            }}
          >
            <div>
              <div style={{
                fontSize: '10px',
                fontWeight: 700,
                letterSpacing: '0.06em',
                color: 'var(--text-muted)',
                marginBottom: '2px',
                fontFamily: 'var(--font-mono)'
              }}>
                {card.label}
              </div>
              <div style={{
                fontSize: '20px',
                fontWeight: 800,
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
                lineHeight: 1.1
              }}>
                {card.value}
              </div>
              <div style={{
                fontSize: '10px',
                color: card.color,
                fontWeight: 500,
                marginTop: '2px'
              }}>
                {card.subtext}
              </div>
            </div>

            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '6px',
              backgroundColor: 'rgba(0, 0, 0, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: `1px solid ${card.color}33`
            }}>
              <Icon size={16} color={card.color} />
            </div>
          </div>
        );
      })}
    </div>
  );
};
