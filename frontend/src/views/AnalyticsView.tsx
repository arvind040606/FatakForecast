import React, { useEffect, useState } from 'react';
import { 
  BarChart3, 
  Clock, 
  Info, 
  Database, 
  AlertTriangle,
  ShieldAlert,
  Layers,
  MapPin,
  HelpCircle,
  FileText
} from 'lucide-react';
import { AnalyticsData } from '../types';
import { railwayApi } from '../services/apiService';

export const AnalyticsView: React.FC = () => {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAnalytics() {
      const res = await railwayApi.getAnalytics();
      if (res) {
        setData(res);
      }
      setLoading(false);
    }
    fetchAnalytics();
  }, []);

  return (
    <div className="page-container">
      {/* PAGE HEADER */}
      <div className="page-header">
        <h1 className="page-title">Forecast Analytics &amp; Integrity Audit</h1>
        <p className="page-subtitle">
          Evaluation standards, dataset classifications, and OpenStreetMap infrastructure audit
        </p>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Disclosure Banner Skeleton */}
          <div className="card" style={{ padding: '16px 20px', display: 'flex', gap: '14px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-soft)' }}>
            <div className="skeleton-box" style={{ width: '24px', height: '24px', borderRadius: '50%', flexShrink: 0 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
              <div className="skeleton-box" style={{ width: '280px', height: '14px', borderRadius: '4px' }} />
              <div className="skeleton-box" style={{ width: '100%', height: '12px', borderRadius: '3px' }} />
              <div className="skeleton-box" style={{ width: '85%', height: '12px', borderRadius: '3px' }} />
            </div>
          </div>

          {/* Metric Cards Skeleton Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div className="skeleton-box" style={{ width: '130px', height: '12px', borderRadius: '3px' }} />
                <div className="skeleton-box" style={{ width: '90px', height: '26px', borderRadius: '4px', margin: '4px 0' }} />
                <div className="skeleton-box" style={{ width: '160px', height: '11px', borderRadius: '3px' }} />
              </div>
            ))}
          </div>

          {/* Infrastructure Card Skeleton */}
          <div className="card" style={{ padding: '20px' }}>
            <div className="skeleton-box" style={{ width: '320px', height: '16px', borderRadius: '4px', marginBottom: '14px' }} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
              {[1, 2, 3, 4].map(i => (
                <div key={i} style={{ padding: '14px', borderRadius: '8px', backgroundColor: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div className="skeleton-box" style={{ width: '140px', height: '12px', borderRadius: '3px' }} />
                  <div className="skeleton-box" style={{ width: '110px', height: '22px', borderRadius: '4px' }} />
                  <div className="skeleton-box" style={{ width: '160px', height: '10px', borderRadius: '3px' }} />
                </div>
              ))}
            </div>
          </div>

          {/* Protocol Table Skeleton */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-soft)' }}>
              <div className="skeleton-box" style={{ width: '260px', height: '16px', borderRadius: '4px' }} />
            </div>
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[1, 2, 3, 4].map(i => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
                  <div className="skeleton-box" style={{ width: '180px', height: '14px', borderRadius: '4px' }} />
                  <div className="skeleton-box" style={{ width: '120px', height: '14px', borderRadius: '4px' }} />
                  <div className="skeleton-box" style={{ width: '90px', height: '14px', borderRadius: '4px' }} />
                  <div className="skeleton-box" style={{ width: '70px', height: '20px', borderRadius: 'var(--radius-full)' }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <>
      {/* SCIENTIFIC DISCLOSURE: ACCURACY IS UNMEASURED */}
      <div className="card" style={{
        padding: '16px 20px',
        marginBottom: '24px',
        backgroundColor: 'var(--surface-orange)',
        border: '1px solid var(--border-soft)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '14px'
      }}>
        <ShieldAlert size={22} style={{ color: 'var(--color-accent-tangerine)', flexShrink: 0, marginTop: '2px' }} />
        <div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-accent-tangerine)', marginBottom: '4px' }}>
            MEASUREMENT STATUS: EMPIRICAL PREDICTIVE ACCURACY UNMEASURED
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            To adhere to scientific integrity, predictive accuracy metrics (Mean Absolute Error, Median Error, and % within 30s/60s) must only be calculated from predictions paired with verified, physical field observations.
            Because neither <strong>Indian Railways CRIS production feeds</strong> nor <strong>physical gate sensor relays</strong> are connected to this environment, no field closure events have been recorded.
            Fabricated claims of &quot;94.2% AI accuracy&quot; and &quot;1,420 events&quot; have been removed from this platform.
          </div>
        </div>
      </div>

      {/* METRIC AUDIT CLASSIFICATION STATS */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <div className="card" style={{ padding: '16px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
            Class A: Field Observations
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', margin: '4px 0' }}>
            0 Logged
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
            Requires authorized railway gate equipment
          </div>
        </div>

        <div className="card" style={{ padding: '16px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
            Class B: Track Calculations
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-primary-forest)', fontFamily: 'var(--font-mono)', margin: '4px 0' }}>
            Active Simulation
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
            Distance calculation along OSM track geometry
          </div>
        </div>

        <div className="card" style={{ padding: '16px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
            Class C: Illustrative Data
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-accent-tangerine)', fontFamily: 'var(--font-mono)', margin: '4px 0' }}>
            Purged
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
            Removed from production accuracy summaries
          </div>
        </div>

        <div className="card" style={{ padding: '16px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
            Class D: Direct Gate Relays
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--status-critical)', fontFamily: 'var(--font-mono)', margin: '4px 0' }}>
            Gate Sensors
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
            Pending formal railway API access authorization
          </div>
        </div>
      </div>

      {/* DISCOVERED OPENSTREETMAP INFRASTRUCTURE AUDIT */}
      <div className="card" style={{ padding: '20px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
          <Layers size={18} style={{ color: 'var(--color-primary-forest)' }} />
          <h2 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-primary-dark)', margin: 0 }}>
            OpenStreetMap Geographic Infrastructure Audit (Amritsar Sector)
          </h2>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '14px',
          backgroundColor: 'var(--surface-warm)',
          padding: '16px',
          borderRadius: '8px'
        }}>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Distinct Physical Level Crossings</div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-primary-forest)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
              37 Verified Crossings
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Discovered within Bounding Box 31.55, 74.75 - 31.72, 75.02
            </div>
          </div>

          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Total OSM Level Crossing Nodes</div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
              51 Mapped Nodes
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Includes dual-track paired nodes at twin-line junctions
            </div>
          </div>

          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Railway Track Geometry Ways</div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
              80 OSM Ways (723 Points)
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Exact railway alignment (no straight-line shortcuts)
            </div>
          </div>

          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Amritsar Railway Corridors</div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
              4 Active Corridors
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Jalandhar Trunk, Pathankot, Attari, Tarn Taran
            </div>
          </div>
        </div>
      </div>

      {/* FORMAL EVALUATION PROTOCOL */}
      <div className="card" style={{ overflow: 'hidden', marginBottom: '24px', padding: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '16px 20px', borderBottom: '1px solid var(--border-soft)' }}>
          <FileText size={16} style={{ color: 'var(--color-primary-forest)' }} />
          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-primary-dark)' }}>
            Mandatory Scientific Accuracy Evaluation Protocol
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Performance Metric</th>
                <th>Mathematical Formulation</th>
                <th>Target Threshold</th>
                <th>Current Amritsar Value</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Mean Absolute Error (MAE)</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                  MAE = (1/n) * Σ |t_predicted - t_observed|
                </td>
                <td>&lt; 45 Seconds</td>
                <td style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>Unmeasured (n = 0)</td>
                <td>
                  <span className="badge badge-red">
                    Awaiting Field Data
                  </span>
                </td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Median Absolute Error</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                  MedAE = Median(|t_predicted - t_observed|)
                </td>
                <td>&lt; 30 Seconds</td>
                <td style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>Unmeasured (n = 0)</td>
                <td>
                  <span className="badge badge-red">
                    Awaiting Field Data
                  </span>
                </td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Window Accuracy (±30s)</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                  % (|Δt| ≤ 30s)
                </td>
                <td>&gt; 80%</td>
                <td style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>Unmeasured</td>
                <td>
                  <span className="badge badge-red">
                    Awaiting Field Data
                  </span>
                </td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Window Accuracy (±60s)</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                  % (|Δt| ≤ 60s)
                </td>
                <td>&gt; 90%</td>
                <td style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>Unmeasured</td>
                <td>
                  <span className="badge badge-red">
                    Awaiting Field Data
                  </span>
                </td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Closure Event Tolerance</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                  Tolerance = |t_closure_pred - t_closure_obs| ≤ 45s
                </td>
                <td>±45 Seconds</td>
                <td style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>Unmeasured</td>
                <td>
                  <span className="badge badge-red">
                    Awaiting Field Data
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* COMPREHENSIVE DATA SOURCE AUDIT TABLE */}
      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-soft)' }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-primary-dark)' }}>
            System-Wide Data Integrity &amp; Classification Audit
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Data Element</th>
                <th>Classification Tier</th>
                <th>Source Origin</th>
                <th>Integrity Status</th>
                <th>Audit Notes</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  Railway Crossings &amp; Coordinates
                </td>
                <td>
                  <span className="badge badge-green">Class A (Observed)</span>
                </td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                  OpenStreetMap Overpass API
                </td>
                <td><span style={{ color: 'var(--status-clear)', fontWeight: 600 }}>VERIFIED</span></td>
                <td style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  37 real locations from 51 OSM nodes. Source IDs preserved (e.g. node/1006212111).
                </td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  Railway Track Geometry
                </td>
                <td>
                  <span className="badge badge-green">Class A (Observed)</span>
                </td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                  OpenStreetMap railway=rail
                </td>
                <td><span style={{ color: 'var(--status-clear)', fontWeight: 600 }}>VERIFIED</span></td>
                <td style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  80 real track ways (723 coordinates). Curved alignment used for distance calculations.
                </td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  Train Movement Tracking
                </td>
                <td>
                  <span className="badge badge-amber">
                    Class B (Synthetic Test)
                  </span>
                </td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                  Kinematic Simulation Test Bench
                </td>
                <td><span style={{ color: 'var(--color-accent-tangerine)', fontWeight: 600 }}>CALIBRATED BENCH</span></td>
                <td style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  Simulated movements along authentic OSM track geometry for math demonstration.
                </td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  CRIS NavIC Satellite GPS
                </td>
                <td>
                  <span className="badge badge-red">
                    Class D (Unavailable)
                  </span>
                </td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                  Centre for Railway Information Systems
                </td>
                <td><span style={{ color: 'var(--status-critical)', fontWeight: 600 }}>UNAVAILABLE</span></td>
                <td style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  Requires institutional agreement with Indian Railways; currently unauthenticated.
                </td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  Level Crossing Gate Status
                </td>
                <td>
                  <span className="badge badge-red">
                    Class D (Unavailable)
                  </span>
                </td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                  Physical Axle Counter / Gate Sensor
                </td>
                <td><span style={{ color: 'var(--status-critical)', fontWeight: 600 }}>UNCONNECTED</span></td>
                <td style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  No physical hardware sensors installed on booms. Status is demonstrated via test bench.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
        </>
      )}
    </div>
  );
};
