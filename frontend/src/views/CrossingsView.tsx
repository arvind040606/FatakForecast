import React, { useState, useEffect } from 'react';
import { 
  Search, 
  MapPin, 
  Copy, 
  Check, 
  Clock, 
  Train, 
  Info, 
  LayoutGrid, 
  List,
  ShieldAlert,
  ArrowRight
} from 'lucide-react';
import { RailwayCrossing, SectorTrain, RailwayCorridor, ActiveRoute } from '../types';
import { findImpactingTrainForCrossing, getCrossingTrainDisplay } from '../utils/trainHelpers';
import { useSharedTimer, getAuthoritativeTargetEpoch, calculateRemainingSeconds, formatCountdown } from '../utils/timerManager';

interface CrossingsViewProps {
  crossings: RailwayCrossing[];
  trains: SectorTrain[];
  corridors: RailwayCorridor[];
  onSelectCrossing: (crossing: RailwayCrossing) => void;
  onNavigate: (route: ActiveRoute) => void;
  initialFilter?: string;
}

export const CrossingsView: React.FC<CrossingsViewProps> = ({
  crossings,
  trains,
  corridors,
  onSelectCrossing,
  onNavigate,
  initialFilter
}) => {
  const [filterStatus, setFilterStatus] = useState<string>(initialFilter || 'ALL');
  const [filterVerification, setFilterVerification] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'closure' | 'name' | 'id'>('closure');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  // Local 1-second continuous ticker for ultra-smooth real-time countdown updates
  const now = useSharedTimer();

  const getDynamicWaitSec = (c: RailwayCrossing): number => {
    const target = getAuthoritativeTargetEpoch(c, 'reopen', now);
    if (target !== null) {
      return calculateRemainingSeconds(target, now);
    }
    return c.remainingWaitSec || 0;
  };

  const getDynamicClosureSec = (c: RailwayCrossing): number => {
    const target = getAuthoritativeTargetEpoch(c, 'closure', now);
    if (target !== null) {
      return calculateRemainingSeconds(target, now);
    }
    return c.timeToNextClosureSec || 0;
  };


  const closedCount = crossings.filter(c => c.status === 'CLOSURE_EXPECTED' || c.status === 'CLOSED' || c.status === 'CLOSURE_REPORTED').length;
  const approachCount = crossings.filter(c => c.status === 'APPROACHING').length;
  const openCount = crossings.filter(c => c.status === 'OPEN').length;
  const unknownCount = crossings.filter(c => c.status === 'UNKNOWN').length;

  const filtered = crossings.filter(c => {
    const isClosed = c.status === 'CLOSURE_EXPECTED' || c.status === 'CLOSED' || c.status === 'CLOSURE_REPORTED';
    const matchStatus = filterStatus === 'ALL' || 
      (filterStatus === 'CLOSURE_EXPECTED' ? isClosed : c.status === filterStatus);
    const matchVerification = filterVerification === 'ALL' || 
      (filterVerification === 'VERIFIED' && c.verificationStatus === 'VERIFIED_MAPPED_CROSSING') ||
      (filterVerification === 'PENDING' && c.verificationStatus === 'REQUIRES_FIELD_VERIFICATION');

    const matchSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        c.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        (c.punjabiName && c.punjabiName.includes(searchQuery)) ||
                        (c.roadClassification && c.roadClassification.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchStatus && matchVerification && matchSearch;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'name') return a.name.localeCompare(b.name);
    if (sortBy === 'id') return a.id.localeCompare(b.id);
    
    // Sort by closure urgency
    const aClosed = a.status === 'CLOSURE_EXPECTED' || a.status === 'CLOSED' || a.status === 'CLOSURE_REPORTED';
    const bClosed = b.status === 'CLOSURE_EXPECTED' || b.status === 'CLOSED' || b.status === 'CLOSURE_REPORTED';
    if (aClosed && !bClosed) return -1;
    if (!aClosed && bClosed) return 1;

    const aApp = a.status === 'APPROACHING';
    const bApp = b.status === 'APPROACHING';
    if (aApp && !bApp) return -1;
    if (!aApp && bApp) return 1;

    const aHasCountdown = a.countdownAvailable && a.timeToNextClosureSec > 0;
    const bHasCountdown = b.countdownAvailable && b.timeToNextClosureSec > 0;
    if (aHasCountdown && !bHasCountdown) return -1;
    if (!aHasCountdown && bHasCountdown) return 1;
    if (aHasCountdown && bHasCountdown) {
      return a.timeToNextClosureSec - b.timeToNextClosureSec;
    }

    const aOpen = a.status === 'OPEN';
    const bOpen = b.status === 'OPEN';
    if (aOpen && !bOpen) return -1;
    if (!aOpen && bOpen) return 1;

    return 0;
  });

  const handleCopy = (c: RailwayCrossing, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(`${c.lat}, ${c.lng}`);
    setCopiedId(c.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getStatusBadge = (crossing: RailwayCrossing) => {
    if (crossing.status === 'CLOSED' || crossing.status === 'CLOSURE_REPORTED') {
      return { label: 'GATE CLOSED', color: 'var(--critical-red)', bg: 'var(--status-closed-bg)', border: 'var(--status-closed-border)' };
    }
    if (crossing.status === 'CLOSURE_EXPECTED') {
      return { label: 'CLOSURE EXPECTED', color: 'var(--critical-red)', bg: 'var(--status-closed-bg)', border: 'var(--status-closed-border)' };
    }
    if (crossing.status === 'APPROACHING') {
      return { label: 'TRAIN APPROACHING', color: 'var(--warning-amber)', bg: 'var(--status-approaching-bg)', border: 'var(--status-approaching-border)' };
    }
    if (crossing.status === 'UNKNOWN') {
      return { label: 'OPEN PASSAGE', color: 'var(--status-open)', bg: 'var(--surface-green)', border: 'var(--surface-green-border)' };
    }
    return { label: 'OPEN PASSAGE', color: 'var(--status-open)', bg: 'var(--surface-green)', border: 'var(--surface-green-border)' };
  };

  return (
    <div className="page-container" style={{ paddingBottom: '90px' }}>
      {/* PAGE HEADER */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <h1 className="page-title" style={{ margin: 0 }}>Amritsar Railway Crossings Directory</h1>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              color: 'var(--accent-primary)',
              backgroundColor: 'var(--surface-green)',
              border: '1px solid var(--surface-green-border)',
              padding: '2px 8px',
              borderRadius: 'var(--radius-full)'
            }}>
              <span style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: 'var(--status-open)',
                boxShadow: '0 0 6px var(--status-open)'
              }} />
              LIVE TELEMETRY (≤3s SYNC)
            </span>
          </div>
          <p className="page-subtitle" style={{ marginTop: '4px' }}>
            Authoritative inventory of all {crossings.length} level crossings mapped along Amritsar railway corridors
          </p>
        </div>

        {/* SEARCH, STATUS FILTER & CONTROLS */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* SEARCH */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: '#FFFFFF',
            border: '1px solid var(--border-soft)',
            borderRadius: 'var(--radius-md)',
            padding: '7px 12px',
            gap: '8px',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <Search size={15} color="var(--text-muted)" />
            <input
              type="text"
              placeholder="Search crossings..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--text-primary)',
                fontSize: '12.5px',
                width: '150px'
              }}
            />
          </div>

          {/* STATUS FILTER PILLS */}
          <div style={{
            display: 'flex',
            backgroundColor: '#FFFFFF',
            border: '1px solid var(--border-soft)',
            borderRadius: 'var(--radius-md)',
            padding: '3px',
            boxShadow: 'var(--shadow-sm)'
          }}>
            {[
              { id: 'ALL', label: `All (${crossings.length})` },
              { id: 'CLOSURE_EXPECTED', label: `Closed (${closedCount})`, isAlert: closedCount > 0 },
              { id: 'APPROACHING', label: `Approach (${approachCount})` },
              { id: 'OPEN', label: `Open (${openCount})` },
              ...(unknownCount > 0 ? [{ id: 'UNKNOWN', label: `Unconfirmed (${unknownCount})` }] : [])
            ].map(item => (
              <button
                key={item.id}
                onClick={() => setFilterStatus(item.id)}
                style={{
                  backgroundColor: filterStatus === item.id 
                    ? (item.id === 'CLOSURE_EXPECTED' ? 'var(--status-closed-bg)' : 'var(--surface-green)') 
                    : 'transparent',
                  color: filterStatus === item.id 
                    ? (item.id === 'CLOSURE_EXPECTED' ? 'var(--status-closed)' : 'var(--accent-emphasis)') 
                    : (item.isAlert ? 'var(--status-closed)' : 'var(--text-secondary)'),
                  border: filterStatus === item.id 
                    ? (item.id === 'CLOSURE_EXPECTED' ? '1px solid var(--status-closed-border)' : '1px solid var(--surface-green-border)') 
                    : '1px solid transparent',
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* SORT DROPDOWN */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid var(--border-soft)',
              color: 'var(--text-primary)',
              padding: '7px 12px',
              borderRadius: 'var(--radius-md)',
              fontSize: '12px',
              fontWeight: 500,
              outline: 'none',
              boxShadow: 'var(--shadow-sm)'
            }}
          >
            <option value="closure">Sort: Next Closure</option>
            <option value="name">Sort: Name (A-Z)</option>
            <option value="id">Sort: Node ID</option>
          </select>

          {/* VIEW MODE TOGGLE */}
          <div className="hide-on-mobile" style={{
            display: 'flex',
            backgroundColor: '#FFFFFF',
            border: '1px solid var(--border-soft)',
            borderRadius: 'var(--radius-md)',
            padding: '3px',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <button
              onClick={() => setViewMode('cards')}
              title="Cards View"
              style={{
                backgroundColor: viewMode === 'cards' ? 'var(--surface-green)' : 'transparent',
                color: viewMode === 'cards' ? 'var(--accent-emphasis)' : 'var(--text-muted)',
                border: viewMode === 'cards' ? '1px solid var(--surface-green-border)' : '1px solid transparent',
                padding: '6px 10px',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}
            >
              <LayoutGrid size={14} />
              <span style={{ fontSize: '11.5px', fontWeight: 600 }}>Cards</span>
            </button>
            <button
              onClick={() => setViewMode('table')}
              title="Table View"
              style={{
                backgroundColor: viewMode === 'table' ? 'var(--surface-green)' : 'transparent',
                color: viewMode === 'table' ? 'var(--accent-emphasis)' : 'var(--text-muted)',
                border: viewMode === 'table' ? '1px solid var(--surface-green-border)' : '1px solid transparent',
                padding: '6px 10px',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}
            >
              <List size={14} />
              <span style={{ fontSize: '11.5px', fontWeight: 600 }}>Table</span>
            </button>
          </div>
        </div>
      </div>

      {/* GATE TELEMETRY TRANSPARENCY ADVISORY */}
      <div className="panel" style={{
        padding: '12px 18px',
        marginBottom: '20px',
        backgroundColor: '#FFFFFF',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px'
      }}>
        <Info size={17} color="var(--accent-primary)" style={{ flexShrink: 0, marginTop: '2px' }} />
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
          <strong style={{ color: 'var(--accent-emphasis)' }}>Barrier Telemetry Notice:</strong>{' '}
          Level crossing closure projections are calculated from approaching train kinematics along track geometry. Physical gate barrier sensor telemetry is uninstrumented; states reflect predictive kinematic forecasts, not mechanical latch confirmations.
        </div>
      </div>

      {/* CARDS VIEW (DEFAULT ACROSS ALL SCREENS) */}
      {viewMode === 'cards' && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(320px, 100%), 1fr))',
          gap: '16px',
          marginBottom: '24px'
        }}>
          {sorted.map(crossing => {
            const badge = getStatusBadge(crossing);
            const trainInfo = getCrossingTrainDisplay(crossing, trains);

            return (
              <div
                key={crossing.id}
                className="mobile-card"
                onClick={() => onSelectCrossing(crossing)}
                style={{
                  backgroundColor: '#FFFFFF',
                  border: '1px solid var(--border-soft)',
                  borderLeft: `4px solid ${badge.color}`,
                  padding: '18px',
                  borderRadius: 'var(--radius-lg)',
                  boxShadow: 'var(--shadow-sm)',
                  cursor: 'pointer'
                }}
              >
                {/* CARD HEADER */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                  <div>
                    <div style={{ fontFamily: 'var(--font-brand)', fontWeight: 700, fontSize: '16px', color: 'var(--text-primary)' }}>
                      {crossing.name}
                    </div>
                    <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-primary)', fontWeight: 600 }}>{crossing.id}</span>
                      {crossing.punjabiName && ` • ${crossing.punjabiName}`}
                    </div>
                  </div>

                  <span style={{
                    fontSize: '10.5px',
                    fontWeight: 700,
                    backgroundColor: badge.bg,
                    color: badge.color,
                    border: `1px solid ${badge.border}`,
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-full)'
                  }}>
                    {badge.label}
                  </span>
                </div>

                {/* DETAILS ROW */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', fontSize: '11.5px', margin: '6px 0' }}>
                  <div style={{ backgroundColor: '#FAF9F5', padding: '9px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', fontWeight: 600 }}>
                      {trainInfo.label}
                    </div>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {trainInfo.name}
                    </div>
                    <div style={{ fontSize: '10.5px', color: trainInfo.isApproaching ? 'var(--accent-primary)' : 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontWeight: 600, marginTop: '1px' }}>
                      {trainInfo.trainNumber ? `#${trainInfo.trainNumber} • ` : ''}{trainInfo.speedText}
                    </div>
                    {trainInfo.secondaryTrains && trainInfo.secondaryTrains.length > 0 && (
                      <div style={{
                        marginTop: '5px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2px',
                        fontSize: '9.5px',
                        fontWeight: 700,
                        backgroundColor: crossing.combinedClosure?.isContinuous ? '#FEF3C7' : '#EFF6FF',
                        color: crossing.combinedClosure?.isContinuous ? '#92400E' : '#1E40AF',
                        padding: '3px 6px',
                        borderRadius: '4px',
                        border: `1px solid ${crossing.combinedClosure?.isContinuous ? '#FCD34D' : '#BFDBFE'}`
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                          <span>{crossing.combinedClosure?.isContinuous ? '⚡ Continuous Closure:' : '🔄 Reopens between trains:'}</span>
                          <span style={{ fontFamily: 'var(--font-mono)' }}>+{trainInfo.secondaryTrains.length} following</span>
                        </div>
                        <div style={{ fontWeight: 600, fontSize: '9px', opacity: 0.9 }}>
                          Next: #{trainInfo.secondaryTrains[0].trainNumber} {trainInfo.secondaryTrains[0].etaMinutes ? `(~${Math.round(trainInfo.secondaryTrains[0].etaMinutes)}m)` : ''}
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={{ backgroundColor: '#FAF9F5', padding: '9px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', fontWeight: 600 }}>Predicted Gate Status</div>
                    <div style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: badge.color, marginTop: '2px' }}>
                      {(() => {
                        const isClosed = crossing.status === 'CLOSED' || crossing.status === 'CLOSURE_REPORTED';
                        const isClosureExpected = crossing.status === 'CLOSURE_EXPECTED';
                        const isApproaching = crossing.status === 'APPROACHING';
                        const rawWait = getDynamicWaitSec(crossing);
                        const waitSec = Math.min(rawWait, 900); // Realistic railway wait ceiling (max 15m)
                        const closeSec = getDynamicClosureSec(crossing);

                        const { minutes: closeMin, seconds: closeRem } = formatCountdown(closeSec);
                        const { minutes: waitMin, seconds: waitRem } = formatCountdown(waitSec);

                        if (isClosed) {
                          return waitSec > 0
                            ? `CLOSED (~${waitMin}m ${waitRem}s wait)`
                            : 'CLOSED (Traversing)';
                        }
                        if (isClosureExpected) {
                          if (closeSec > 0) {
                            return `CLOSES IN ~${closeMin}m ${closeRem}s`;
                          }
                          return 'CLOSURE EXPECTED';
                        }
                        if (isApproaching) {
                          if (closeSec > 0) {
                            return `CLOSES IN ~${closeMin}m ${closeRem}s`;
                          }
                          return 'TRAIN APPROACHING';
                        }
                        if (crossing.countdownAvailable && closeSec > 0 && closeSec < 3600) {
                          return `CLOSES IN ~${closeMin}m ${closeRem}s`;
                        }
                        return 'Open Passage';
                      })()}
                    </div>
                    <div style={{ fontSize: '10.5px', color: 'var(--text-secondary)', marginTop: '1px' }}>
                      {crossing.locality || 'Amritsar Roadway'}
                    </div>
                  </div>
                </div>

                {/* CARD ACTIONS */}
                <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }} onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => onSelectCrossing(crossing)}
                    className="btn btn-primary"
                    style={{ width: '100%', minHeight: '42px', fontSize: '12.5px', fontWeight: 700, justifyContent: 'center' }}
                  >
                    <span>Inspect Gate Details</span>
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TABLE VIEW (OPTION FOR DESKTOP) */}
      {viewMode === 'table' && (
        <div className="panel" style={{ overflow: 'hidden', marginBottom: '24px' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Crossing Identifier &amp; Name</th>
                <th>Predicted Status</th>
                <th>Approaching Train</th>
                <th>Corridor Location</th>
                <th>Estimated Closure</th>
                <th>Coordinates</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(crossing => {
                const badge = getStatusBadge(crossing);
                const trainInfo = getCrossingTrainDisplay(crossing, trains);

                return (
                  <tr key={crossing.id} onClick={() => onSelectCrossing(crossing)} style={{ cursor: 'pointer' }}>
                    <td>
                      <div>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '13.5px' }}>
                          {crossing.name}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-primary)', fontWeight: 600 }}>{crossing.id}</span>
                          {crossing.punjabiName && ` • ${crossing.punjabiName}`}
                        </div>
                      </div>
                    </td>

                    <td>
                      <span style={{
                        fontSize: '10.5px',
                        fontWeight: 700,
                        backgroundColor: badge.bg,
                        color: badge.color,
                        border: `1px solid ${badge.border}`,
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-full)'
                      }}>
                        {badge.label}
                      </span>
                    </td>

                    <td>
                      <div>
                        <div style={{ color: 'var(--text-primary)', fontSize: '12.5px', fontWeight: 600 }}>
                          {trainInfo.name}
                        </div>
                        <div style={{ fontSize: '10.5px', fontFamily: 'var(--font-mono)', color: trainInfo.isApproaching ? 'var(--accent-primary)' : 'var(--text-secondary)', fontWeight: 600 }}>
                          {trainInfo.trainNumber ? `#${trainInfo.trainNumber} • ` : ''}{trainInfo.speedText}
                        </div>
                        {trainInfo.secondaryTrains && trainInfo.secondaryTrains.length > 0 && (
                          <div style={{
                            marginTop: '2px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '9px',
                            fontWeight: 700,
                            backgroundColor: '#FEF3C7',
                            color: '#92400E',
                            padding: '1px 4px',
                            borderRadius: '3px'
                          }}>
                            +{trainInfo.secondaryTrains.length} following (#{trainInfo.secondaryTrains.map(t => t.trainNumber).join(', #')})
                          </div>
                        )}
                      </div>
                    </td>

                    <td>
                      <div style={{ fontSize: '12.5px', color: 'var(--text-primary)' }}>
                        {crossing.locality || 'Amritsar Roadway'}
                      </div>
                    </td>

                    <td>
                      <div style={{
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 700,
                        fontSize: '12.5px',
                        color: badge.color
                      }}>
                        {(() => {
                          const isClosed = crossing.status === 'CLOSED' || crossing.status === 'CLOSURE_REPORTED';
                          const isClosureExpected = crossing.status === 'CLOSURE_EXPECTED';
                          const isApproaching = crossing.status === 'APPROACHING';
                          const rawWait = getDynamicWaitSec(crossing);
                          const waitSec = Math.min(rawWait, 900);
                          const closeSec = getDynamicClosureSec(crossing);

                          const { minutes: closeMin, seconds: closeRem } = formatCountdown(closeSec);
                          const { minutes: waitMin, seconds: waitRem } = formatCountdown(waitSec);

                          if (crossing.status === 'UNKNOWN') return 'Status Unconfirmed';
                          if (isClosed) {
                            return waitSec > 0
                              ? `CLOSED (~${waitMin}m ${waitRem}s wait)`
                              : 'CLOSED (Traversing)';
                          }
                          if (isClosureExpected) {
                            if (closeSec > 0) {
                              return `CLOSES IN ~${closeMin}m ${closeRem}s`;
                            }
                            return 'CLOSURE EXPECTED';
                          }
                          if (isApproaching) {
                            if (closeSec > 0) {
                              return `CLOSES IN ~${closeMin}m ${closeRem}s`;
                            }
                            return 'TRAIN APPROACHING';
                          }
                          if (crossing.countdownAvailable && closeSec > 0 && closeSec < 3600) {
                            return `CLOSES IN ~${closeMin}m ${closeRem}s`;
                          }
                          return 'Clear Passage';
                        })()}
                      </div>
                    </td>

                    <td>
                      <button
                        onClick={(e) => handleCopy(crossing, e)}
                        style={{
                          background: '#FAF9F5',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: '4px',
                          color: 'var(--text-secondary)',
                          padding: '3px 7px',
                          fontSize: '10.5px',
                          fontFamily: 'var(--font-mono)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                        title="Copy coordinates"
                      >
                        {copiedId === crossing.id ? <Check size={11} color="var(--status-open)" /> : <Copy size={11} />}
                        <span>{crossing.lat.toFixed(4)}, {crossing.lng.toFixed(4)}</span>
                      </button>
                    </td>

                    <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => onSelectCrossing(crossing)}
                        className="btn btn-primary"
                        style={{ padding: '6px 12px', fontSize: '12px', minHeight: '34px' }}
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
