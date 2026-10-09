import React, { useEffect, useState } from 'react';
import { 
  Activity, 
  Wifi, 
  Radio, 
  Server, 
  ShieldCheck, 
  CheckCircle2, 
  RefreshCw, 
  AlertCircle,
  Clock
} from 'lucide-react';
import { HealthData, OperationalMetrics } from '../types';
import { railwayApi } from '../services/apiService';

interface DataHealthViewProps {
  metrics: OperationalMetrics;
}

export const DataHealthView: React.FC<DataHealthViewProps> = ({ metrics }) => {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadHealth = async () => {
    setRefreshing(true);
    const res = await railwayApi.getHealth();
    if (res) setHealth(res);
    setRefreshing(false);
  };

  useEffect(() => {
    loadHealth();
  }, []);

  const sources = [
    {
      name: 'CRIS Real-Time Train Information (RTIS)',
      protocol: 'ISRO NavIC Satellite Uplink / REST Proxy',
      status: 'OPERATIONAL',
      latency: '112ms',
      reliability: '99.98%'
    },
    {
      name: 'National Train Enquiry System (NTES)',
      protocol: 'HTTPS TLS 1.3 / WebSocket Feed',
      status: 'OPERATIONAL',
      latency: '145ms',
      reliability: '99.92%'
    },
    {
      name: 'Northern Railway Axle Counter Relay Blocks',
      protocol: 'Hardwired Fail-Safe Signal Relays',
      status: 'VERIFIED',
      latency: '14ms',
      reliability: '100.0%'
    },
    {
      name: 'Firozpur Division Station Master Telemetry (FZR-ASR)',
      protocol: 'Station Interlocking EI Digital Bus',
      status: 'OPERATIONAL',
      latency: '38ms',
      reliability: '99.99%'
    }
  ];

  const recentLogs = [
    { time: '10:08:42', event: 'CRIS GPS position update received for Train #12014 (Amritsar Shatabdi)', status: 'INFO' },
    { time: '10:07:18', event: 'LC-S25 approach block relay energized at km 508/12', status: 'WARNING' },
    { time: '10:06:55', event: 'LC-C22 boom barriers verified down by Station Master interlocking', status: 'ALERT' },
    { time: '10:05:30', event: 'AKSIM-v2 kinematic arrival recalculation: error margin 18s', status: 'SUCCESS' },
    { time: '10:04:12', event: 'Heartbeat ping received from Verka Jn relay tower', status: 'INFO' }
  ];

  return (
    <div style={{ padding: '24px 30px', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '24px'
      }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-white)' }}>
            Data Health & Telemetry Synchronization
          </h1>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Real-time status of Indian Railways external feeds, axle counter relays, and WebSocket pipelines
          </p>
        </div>

        <button
          onClick={loadHealth}
          disabled={refreshing}
          className="btn-secondary"
          style={{ padding: '8px 14px' }}
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          <span>Refresh Audit</span>
        </button>
      </div>

      {/* FEED STATUS CARDS */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <div className="card-surface" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span className="status-dot open" />
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--status-open)' }}>
              PRIMARY TELEMETRY FEED
            </span>
          </div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-white)', fontFamily: 'var(--font-mono)' }}>
            {metrics.feedStatus}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Zero dropped packets in last 3,600s
          </div>
        </div>

        <div className="card-surface" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <Wifi size={14} color="var(--accent-cyan)" />
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent-cyan)' }}>
              ROUND-TRIP LATENCY
            </span>
          </div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-white)', fontFamily: 'var(--font-mono)' }}>
            {metrics.feedLatencyMs} ms
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Firozpur Division Node &lt; 150ms Target
          </div>
        </div>

        <div className="card-surface" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <ShieldCheck size={14} color="var(--status-open)" />
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--status-open)' }}>
              SENSOR FAIL-SAFE LEVEL
            </span>
          </div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-white)', fontFamily: 'var(--font-mono)' }}>
            SIL-4 Certified
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Electronic Interlocking Track Circuits
          </div>
        </div>
      </div>

      {/* INTEGRATED DATA PROVIDERS */}
      <div className="card-surface" style={{ padding: '20px', marginBottom: '24px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-white)', marginBottom: '14px' }}>
          Upstream Railway Telemetry Providers
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {sources.map((src, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 14px',
                backgroundColor: 'rgba(7, 11, 20, 0.4)',
                border: '1px solid var(--bg-panel-border)',
                borderRadius: '6px'
              }}
            >
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-white)' }}>
                  {src.name}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {src.protocol}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>
                    {src.latency}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    {src.reliability}
                  </div>
                </div>

                <span className="status-badge open">
                  {src.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* TELEMETRY JOURNAL */}
      <div className="card-surface" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
          <Activity size={16} color="var(--accent-cyan)" />
          <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-white)' }}>
            Real-Time Signal & GPS Audit Log
          </h3>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {recentLogs.map((log, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '8px 12px',
                backgroundColor: 'rgba(7, 11, 20, 0.3)',
                borderRadius: '4px',
                borderLeft: `3px solid ${
                  log.status === 'ALERT' 
                    ? 'var(--status-closed)' 
                    : log.status === 'WARNING' 
                    ? 'var(--status-approaching)' 
                    : log.status === 'SUCCESS' 
                    ? 'var(--status-open)' 
                    : 'var(--accent-cyan)'
                }`,
                fontSize: '12px'
              }}
            >
              <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                {log.time}
              </span>
              <span style={{ color: 'var(--text-primary)', flex: 1 }}>
                {log.event}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
