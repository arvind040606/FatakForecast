import React, { useState } from 'react';
import { 
  Train, 
  MapPin, 
  Info, 
  Clock, 
  Calendar, 
  Search, 
  Filter, 
  ArrowRight, 
  LayoutGrid, 
  List,
  ChevronRight,
  ShieldAlert
} from 'lucide-react';
import { SectorTrain, RailwayCrossing, ActiveRoute } from '../types';
import { TrainScheduleModal } from '../components/TrainScheduleModal';
import { TrainCardSkeleton } from '../components/TrainCardSkeleton';

interface TrainMovementsViewProps {
  trains: SectorTrain[];
  crossings: RailwayCrossing[];
  onSelectCrossing: (crossing: RailwayCrossing) => void;
  onNavigate: (route: ActiveRoute) => void;
  isInitialLoading?: boolean;
}

export const TrainMovementsView: React.FC<TrainMovementsViewProps> = ({
  trains,
  crossings,
  onSelectCrossing,
  onNavigate,
  isInitialLoading = false
}) => {
  const [scheduleModalTrain, setScheduleModalTrain] = useState<SectorTrain | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSector, setFilterSector] = useState<'ALL' | 'IN_SECTOR' | 'RUNNING' | 'SCHEDULED'>('ALL');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  // Friendly commuter status helpers
  const getDisplayStatus = (train: SectorTrain) => {
    if (train.status === 'CANCELLED') return { label: 'Cancelled', color: 'var(--critical-red)', bg: 'var(--status-closed-bg)', border: 'var(--status-closed-border)' };
    if (train.status === 'NOT_STARTED') return { label: 'Yet to start', color: 'var(--text-secondary)', bg: 'var(--bg-secondary)', border: 'var(--border-subtle)' };
    if (train.status === 'TERMINATED') return { label: 'Completed', color: 'var(--text-muted)', bg: 'var(--bg-secondary)', border: 'var(--border-subtle)' };
    if (train.status === 'CROSSING_GATE') return { label: 'At Level Crossing', color: 'var(--critical-red)', bg: 'var(--status-closed-bg)', border: 'var(--status-closed-border)' };
    if (train.status === 'IN_TRANSIT' || train.status === 'APPROACHING_STATION') return { label: 'In Transit', color: 'var(--status-open)', bg: 'rgba(16, 185, 129, 0.15)', border: 'rgba(16, 185, 129, 0.3)' };
    return { label: train.dataState === 'LIVE' ? 'In Transit' : 'Scheduled', color: 'var(--status-open)', bg: 'rgba(16, 185, 129, 0.15)', border: 'rgba(16, 185, 129, 0.3)' };
  };

  const filteredTrains = trains.filter(t => {
    const matchSearch = t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        t.number.includes(searchQuery) ||
                        t.origin.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        t.destination.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchSearch) return false;
    if (filterSector === 'IN_SECTOR') return t.isWithinAmritsarSector;
    if (filterSector === 'RUNNING') return t.status === 'IN_TRANSIT' || t.status === 'APPROACHING_STATION' || t.status === 'CROSSING_GATE';
    if (filterSector === 'SCHEDULED') return t.status === 'NOT_STARTED' || t.dataState === 'SCHEDULED';
    return true;
  });

  // Strictly deterministic, stable train ordering to prevent cards jumping or shuffling
  const sortedTrains = [...filteredTrains].sort((a, b) => {
    // 1. In-sector trains first
    const inSecA = a.isWithinAmritsarSector ? 1 : 0;
    const inSecB = b.isWithinAmritsarSector ? 1 : 0;
    if (inSecA !== inSecB) return inSecB - inSecA;

    // 2. Active status priority
    const getStatusPriority = (t: SectorTrain) => {
      if (t.status === 'CROSSING_GATE') return 5;
      if (t.status === 'IN_TRANSIT') return 4;
      if (t.status === 'APPROACHING_STATION' || t.status === 'PLATFORM_BOARDING') return 3;
      if (t.status === 'NOT_STARTED') return 2;
      if (t.status === 'OUT_OF_SECTOR') return 1;
      return 0;
    };
    const prioA = getStatusPriority(a);
    const prioB = getStatusPriority(b);
    if (prioA !== prioB) return prioB - prioA;

    // 3. Guaranteed deterministic stable tie-breaker by train number
    const numA = String(a.number || a.id || '');
    const numB = String(b.number || b.id || '');
    return numA.localeCompare(numB);
  });

  return (
    <div className="page-container">
      {/* PAGE HEADER */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <h1 className="page-title">Amritsar Train Movements &amp; Schedules</h1>
          <p className="page-subtitle">
            Active trains, official timetables, and approaching level crossing gates across Amritsar
          </p>
        </div>

        {/* SEARCH, FILTERS & VIEW MODE */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* SEARCH */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-soft)',
            borderRadius: 'var(--radius-md)',
            padding: '7px 12px',
            gap: '8px',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <Search size={15} color="var(--text-muted)" />
            <input
              type="text"
              placeholder="Search train name / #..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--text-primary)',
                fontSize: '12.5px',
                width: '160px'
              }}
            />
          </div>

          {/* FILTER TABS */}
          <div style={{
            display: 'flex',
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-soft)',
            borderRadius: 'var(--radius-md)',
            padding: '3px',
            boxShadow: 'var(--shadow-sm)'
          }}>
            {[
              { id: 'ALL', label: `All (${trains.length})` },
              { id: 'IN_SECTOR', label: `Amritsar Area (${trains.filter(t => t.isWithinAmritsarSector).length})` },
              { id: 'RUNNING', label: 'In Transit' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setFilterSector(tab.id as any)}
                style={{
                  backgroundColor: filterSector === tab.id ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                  color: filterSector === tab.id ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  border: filterSector === tab.id ? '1px solid var(--accent-primary)' : '1px solid transparent',
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* VIEW MODE TOGGLE (CARDS / TABLE) */}
          <div className="hide-on-mobile" style={{
            display: 'flex',
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-soft)',
            borderRadius: 'var(--radius-md)',
            padding: '3px',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <button
              onClick={() => setViewMode('cards')}
              title="Cards View"
              style={{
                backgroundColor: viewMode === 'cards' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                color: viewMode === 'cards' ? 'var(--accent-primary)' : 'var(--text-muted)',
                border: viewMode === 'cards' ? '1px solid var(--accent-primary)' : '1px solid transparent',
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
                backgroundColor: viewMode === 'table' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                color: viewMode === 'table' ? 'var(--accent-primary)' : 'var(--text-muted)',
                border: viewMode === 'table' ? '1px solid var(--accent-primary)' : '1px solid transparent',
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


      {/* CARDS VIEW (DEFAULT & RESPONSIVE GRID) */}
      {viewMode === 'cards' && (
        (isInitialLoading && trains.length === 0) ? (
          <div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '12px 16px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'rgba(56, 189, 248, 0.08)',
              border: '1px solid rgba(56, 189, 248, 0.2)',
              marginBottom: '16px',
              color: 'var(--accent-cyan)',
              fontSize: '12.5px',
              fontWeight: 600
            }}>
              <span className="loading-spinner-ring" />
              <span>Fetching live train movements and corridor tracking...</span>
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(min(340px, 100%), 1fr))',
              gap: '16px',
              marginBottom: '24px'
            }}>
              {[1, 2, 3, 4].map(i => (
                <TrainCardSkeleton key={i} />
              ))}
            </div>
          </div>
        ) : sortedTrains.length === 0 ? (
          <div style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-soft)',
            borderRadius: 'var(--radius-lg)',
            padding: '40px 24px',
            textAlign: 'center',
            marginBottom: '24px'
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              backgroundColor: 'rgba(56, 189, 248, 0.12)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px auto',
              color: 'var(--accent-cyan)'
            }}>
              <Train size={24} />
            </div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
              {searchQuery ? 'No trains match your search' : 'All Amritsar Corridors Clear'}
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 18px 0', maxWidth: '440px', marginInline: 'auto', lineHeight: '1.5' }}>
              {searchQuery 
                ? `No active train matched "${searchQuery}". Try clearing your search query or switching filters.` 
                : 'No active trains are currently detected in the Amritsar sector. Trains approaching Amritsar Junction will appear here in real time as live GPS observations are confirmed.'}
            </p>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="btn btn-secondary"
                style={{ fontSize: '12px', padding: '6px 14px' }}
              >
                Clear Search
              </button>
            )}
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(340px, 100%), 1fr))',
            gap: '16px',
            marginBottom: '24px'
          }}>
            {sortedTrains.map(train => {
            const targetCrossing = crossings.find(c => c.id === train.targetCrossingId);
            const st = getDisplayStatus(train);

            return (
              <div 
                key={train.id || train.number}
                className="mobile-card"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-soft)',
                  borderLeft: `4px solid ${st.color}`,
                  padding: '18px',
                  borderRadius: 'var(--radius-lg)',
                  boxShadow: 'var(--shadow-sm)'
                }}
              >
                {/* CARD HEADER */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <div style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '9px',
                      backgroundColor: 'var(--surface-green)',
                      border: '1px solid var(--surface-green-border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--accent-primary)',
                      flexShrink: 0
                    }}>
                      <Train size={17} />
                    </div>

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'var(--font-brand)', fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)' }}>
                          {train.name}
                        </span>
                        <span style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '11px',
                          fontWeight: 700,
                          color: 'var(--accent-primary)',
                          backgroundColor: 'var(--surface-green)',
                          border: '1px solid var(--surface-green-border)',
                          padding: '1px 6px',
                          borderRadius: 'var(--radius-full)'
                        }}>
                          #{train.number}
                        </span>
                      </div>
                      <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        {train.type} • {train.rakeType}
                      </div>
                    </div>
                  </div>

                  <span style={{
                    fontSize: '10.5px',
                    fontWeight: 700,
                    backgroundColor: st.bg,
                    color: st.color,
                    border: `1px solid ${st.border}`,
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-full)'
                  }}>
                    {st.label}
                  </span>
                </div>

                {/* ROUTE JOURNEY VISUAL STRIP */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '12.5px',
                  color: 'var(--text-primary)',
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-subtle)',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-md)',
                  margin: '6px 0'
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Origin</div>
                    <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {train.origin}
                    </div>
                  </div>

                  <ArrowRight size={15} color="var(--accent-tangerine)" style={{ flexShrink: 0 }} />

                  <div style={{ flex: 1, minWidth: 0, textAlign: 'right' }}>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Destination</div>
                    <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {train.destination}
                    </div>
                  </div>
                </div>

                {/* LOCATION & SPEED DETAILS GRID */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', fontSize: '11.5px' }}>
                  <div style={{ backgroundColor: 'var(--bg-secondary)', padding: '9px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', fontWeight: 600 }}>Current Station</div>
                    <div style={{ fontWeight: 700, color: 'var(--accent-emphasis)', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {train.currentStationName || train.lastReportedLocation || (train.isWithinAmritsarSector ? 'Near Amritsar' : 'En Route')}
                    </div>
                    <div style={{ fontSize: '10.5px', color: train.isWithinAmritsarSector ? 'var(--status-open)' : 'var(--text-secondary)', marginTop: '1px' }}>
                      {train.isWithinAmritsarSector ? '✓ Near Amritsar' : 'En route'}
                    </div>
                  </div>

                  <div style={{ backgroundColor: 'var(--bg-secondary)', padding: '9px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', fontWeight: 600 }}>Speed &amp; Delay</div>
                    <div style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--accent-primary)', marginTop: '2px' }}>
                      {train.status === 'TERMINATED'
                        ? '0 km/h (Terminus)'
                        : (train.status === 'NOT_STARTED')
                        ? '0 km/h (Yet to start)'
                        : (train.status === 'CANCELLED')
                        ? '0 km/h (Cancelled)'
                        : (train.status === 'PLATFORM_BOARDING' || train.status === 'STATIONARY')
                        ? '0 km/h (Platform)'
                        : (train.hasLiveSpeedMeasurement && typeof train.liveSpeedKmH === 'number' && train.liveSpeedKmH > 0)
                        ? `${train.liveSpeedKmH} km/h (Live)`
                        : (typeof train.speedKmH === 'number' && train.speedKmH > 0)
                        ? `~${train.speedKmH} km/h (Estimated)`
                        : (typeof train.sectionalSpeedKmH === 'number' && train.sectionalSpeedKmH > 0)
                        ? `~${train.sectionalSpeedKmH} km/h (Estimated)`
                        : '~55 km/h (Estimated)'}
                    </div>
                    <div style={{ fontSize: '10.5px', fontWeight: 600, color: (train.delayMinutes || 0) > 15 ? 'var(--status-approaching)' : 'var(--status-open)', marginTop: '1px' }}>
                      {(train.delayMinutes || 0) > 0 ? `+${train.delayMinutes}m delay` : 'On Time'}
                    </div>
                  </div>
                </div>

                {/* ASSOCIATED CROSSING (IF ANY) */}
                {targetCrossing && (
                  <div style={{
                    fontSize: '12px',
                    backgroundColor: 'var(--status-closed-bg)',
                    border: '1px solid var(--status-closed-border)',
                    padding: '9px 12px',
                    borderRadius: 'var(--radius-sm)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <span style={{ color: 'var(--status-closed)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <ShieldAlert size={14} />
                      Approaching Fatak: {targetCrossing.name}
                    </span>
                    <button
                      onClick={() => onSelectCrossing(targetCrossing)}
                      style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      Inspect Gate
                    </button>
                  </div>
                )}

                {/* PROMINENT SCHEDULE ACTION BUTTON */}
                <div style={{ marginTop: '8px' }}>
                  <button
                    onClick={() => setScheduleModalTrain(train)}
                    className="btn btn-primary"
                    style={{ width: '100%', minHeight: '44px', fontSize: '13px', fontWeight: 700 }}
                  >
                    <Calendar size={15} />
                    <span>View Journey Schedule Timeline</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )
      )}

      {/* TABLE VIEW (OPTION FOR DESKTOP) */}
      {viewMode === 'table' && (
        <div className="panel" style={{ overflow: 'hidden', marginBottom: '24px' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Train Identifier</th>
                <th>Status</th>
                <th>Type</th>
                <th>Route</th>
                <th>Speed &amp; Tracking</th>
                <th>Current Position</th>
                <th>Impacting Fatak</th>
                <th style={{ textAlign: 'right' }}>Schedule</th>
              </tr>
            </thead>
            <tbody>
              {(isInitialLoading && trains.length === 0) ? (
                [1, 2, 3, 4].map(i => (
                  <tr key={i}>
                    <td><div className="skeleton-box" style={{ width: '130px', height: '16px', borderRadius: '4px' }} /></td>
                    <td><div className="skeleton-box" style={{ width: '70px', height: '20px', borderRadius: 'var(--radius-full)' }} /></td>
                    <td><div className="skeleton-box" style={{ width: '80px', height: '14px', borderRadius: '4px' }} /></td>
                    <td><div className="skeleton-box" style={{ width: '140px', height: '14px', borderRadius: '4px' }} /></td>
                    <td><div className="skeleton-box" style={{ width: '60px', height: '14px', borderRadius: '4px' }} /></td>
                    <td><div className="skeleton-box" style={{ width: '100px', height: '14px', borderRadius: '4px' }} /></td>
                    <td><div className="skeleton-box" style={{ width: '90px', height: '14px', borderRadius: '4px' }} /></td>
                    <td style={{ textAlign: 'right' }}><div className="skeleton-box" style={{ width: '65px', height: '28px', borderRadius: '4px' }} /></td>
                  </tr>
                ))
              ) : sortedTrains.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                    No trains currently active in selected view.
                  </td>
                </tr>
              ) : sortedTrains.map(train => {
                const targetCrossing = crossings.find(c => c.id === train.targetCrossingId);
                const st = getDisplayStatus(train);

                return (
                  <tr key={train.id || train.number}>
                    <td>
                      <div>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '13.5px' }}>
                          {train.name}
                        </div>
                        <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--accent-primary)', fontWeight: 600 }}>
                          #{train.number}
                        </div>
                      </div>
                    </td>

                    <td>
                      <span style={{
                        fontSize: '10.5px',
                        fontWeight: 700,
                        backgroundColor: st.bg,
                        color: st.color,
                        border: `1px solid ${st.border}`,
                        padding: '2px 7px',
                        borderRadius: 'var(--radius-full)'
                      }}>
                        {st.label}
                      </span>
                      {(train.delayMinutes || 0) > 0 && (
                        <div style={{ fontSize: '10.5px', color: 'var(--warning-amber)', marginTop: '2px', fontWeight: 600 }}>
                          +{train.delayMinutes}m delay
                        </div>
                      )}
                    </td>

                    <td>
                      <div style={{ color: 'var(--text-primary)', fontSize: '12.5px' }}>{train.type}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{train.rakeType}</div>
                    </td>

                    <td>
                      <div style={{ color: 'var(--text-primary)', fontSize: '12.5px', fontWeight: 600 }}>
                        {train.origin} ➔ {train.destination}
                      </div>
                      <div style={{ fontSize: '11px', color: train.isWithinAmritsarSector ? 'var(--status-open)' : 'var(--text-secondary)' }}>
                        {train.isWithinAmritsarSector ? '✓ Near Amritsar' : 'Outside Area'}
                      </div>
                    </td>

                    <td>
                      {train.hasLiveSpeedMeasurement && typeof train.liveSpeedKmH === 'number' && train.liveSpeedKmH > 0 ? (
                        <div>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700, color: 'var(--accent-primary)' }}>
                            {train.liveSpeedKmH} km/h
                          </span>
                          <div style={{ fontSize: '10px', color: 'var(--status-open)', fontWeight: 600 }}>Live GPS</div>
                        </div>
                      ) : train.status === 'TERMINATED' ? (
                        <div>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>
                            0 km/h
                          </span>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Terminated</div>
                        </div>
                      ) : train.status === 'NOT_STARTED' ? (
                        <div>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                            0 km/h
                          </span>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Origin (Yet to start)</div>
                        </div>
                      ) : train.status === 'PLATFORM_BOARDING' || train.status === 'STATIONARY' ? (
                        <div>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                            0 km/h
                          </span>
                          <div style={{ fontSize: '10px', color: 'var(--status-open)' }}>At Platform</div>
                        </div>
                      ) : (
                        <div>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 600, color: 'var(--accent-primary)' }}>
                            ~{train.speedKmH || train.sectionalSpeedKmH || 55} km/h
                          </span>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Estimated speed</div>
                        </div>
                      )}
                    </td>

                    <td>
                      <div style={{ fontSize: '12.5px', color: 'var(--text-primary)', fontWeight: 600 }}>
                        {train.currentStationName || train.lastReportedLocation || (train.isWithinAmritsarSector ? 'Amritsar Corridor' : 'En Route')}
                      </div>
                      <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                        Track corridor
                      </div>
                    </td>

                    <td>
                      {targetCrossing ? (
                        <span 
                          onClick={() => onSelectCrossing(targetCrossing)}
                          style={{ color: 'var(--status-closed)', fontWeight: 700, fontSize: '12px', cursor: 'pointer', textDecoration: 'underline' }}
                        >
                          {targetCrossing.name}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-dim)', fontSize: '11px' }}>None</span>
                      )}
                    </td>

                    <td style={{ textAlign: 'right' }}>
                      <button
                        onClick={() => setScheduleModalTrain(train)}
                        className="btn btn-primary"
                        style={{ padding: '6px 12px', fontSize: '12px', minHeight: '34px' }}
                      >
                        <Calendar size={13} />
                        <span>Schedule</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* SIGNATURE ANIMATED JOURNEY TIMELINE MODAL */}
      <TrainScheduleModal
        isOpen={Boolean(scheduleModalTrain)}
        onClose={() => setScheduleModalTrain(null)}
        train={scheduleModalTrain}
      />
    </div>
  );
};
