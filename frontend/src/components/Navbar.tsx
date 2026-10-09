import React, { useState, useEffect, useRef } from 'react';
import { 
  Radio, 
  MapPin, 
  Bell, 
  BellOff, 
  Search, 
  SlidersHorizontal, 
  Clock, 
  TrainTrack, 
  CheckCircle2, 
  AlertTriangle 
} from 'lucide-react';
import { RailwayCrossing, OperationalMetrics } from '../types';
import { railwayApi } from '../services/apiService';

interface NavbarProps {
  metrics: OperationalMetrics;
  crossings: RailwayCrossing[];
  onSelectCrossing: (crossing: RailwayCrossing) => void;
  onOpenDrillModal: () => void;
  lastUpdateTimestamp: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  metrics,
  crossings,
  onSelectCrossing,
  onOpenDrillModal,
  lastUpdateTimestamp
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [audioActive, setAudioActive] = useState(railwayApi.isAudioEnabled());
  const [secondsAgo, setSecondsAgo] = useState(0);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Update seconds ago ticker
  useEffect(() => {
    const interval = setInterval(() => {
      const diff = Math.floor((Date.now() - new Date(lastUpdateTimestamp).getTime()) / 1000);
      setSecondsAgo(Math.max(0, diff));
    }, 1000);
    return () => clearInterval(interval);
  }, [lastUpdateTimestamp]);

  // Click outside search
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsSearchOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleAudio = () => {
    const next = !audioActive;
    railwayApi.setAudioEnabled(next);
    setAudioActive(next);
    if (next) {
      railwayApi.playAudioChime('OPEN');
    }
  };

  const filteredCrossings = crossings.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.officialCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.punjabiName.includes(searchQuery)
  );

  return (
    <header style={{
      height: 'var(--nav-height)',
      backgroundColor: 'var(--bg-secondary)',
      borderBottom: '1px solid var(--bg-panel-border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 20px',
      position: 'relative',
      zIndex: 50,
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)'
    }}>
      {/* BRAND & LOGO */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div style={{
          width: '38px',
          height: '38px',
          borderRadius: '8px',
          background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid var(--accent-cyan)',
          boxShadow: '0 0 14px var(--accent-cyan-glow)'
        }}>
          <TrainTrack size={22} color="#ffffff" />
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ 
              fontWeight: 800, 
              fontSize: '16px', 
              letterSpacing: '0.04em',
              color: 'var(--text-white)' 
            }}>
              FATAK<span style={{ color: 'var(--accent-cyan)' }}>FORECAST</span>
            </span>
            <span style={{
              fontSize: '9px',
              fontFamily: 'var(--font-mono)',
              background: 'rgba(56, 189, 248, 0.1)',
              color: 'var(--accent-cyan)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              padding: '1px 5px',
              borderRadius: '3px',
              fontWeight: 700
            }}>
              ASR-v2.4
            </span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span>Amritsar Railway Intelligence Platform</span>
          </div>
        </div>
      </div>

      {/* LOCATION & TELEMETRY INDICATOR */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '20px',
        background: 'rgba(17, 26, 48, 0.6)',
        padding: '6px 14px',
        borderRadius: '6px',
        border: '1px solid var(--bg-panel-border)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <MapPin size={15} color="var(--accent-cyan)" />
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Amritsar, Punjab
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              31.6340°N, 74.8723°E • NR / FZR Div
            </div>
          </div>
        </div>

        <div style={{ width: '1px', height: '24px', background: 'var(--bg-panel-border)' }} />

        {/* FEED STATUS */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ position: 'relative' }}>
            <div className="status-dot open" />
            <div style={{
              position: 'absolute',
              top: '-3px',
              left: '-3px',
              width: '13px',
              height: '13px',
              borderRadius: '50%',
              border: '1px solid var(--status-open)',
              animation: 'pulse-amber 2s infinite ease-out'
            }} />
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--status-open)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span>LIVE TELEMETRY</span>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>({metrics.feedLatencyMs}ms)</span>
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              CRIS GPS + Axle Counters
            </div>
          </div>
        </div>

        <div style={{ width: '1px', height: '24px', background: 'var(--bg-panel-border)' }} />

        {/* TIME SYNC */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-secondary)' }}>
          <Clock size={13} color="var(--text-muted)" />
          <span style={{ fontFamily: 'var(--font-mono)' }}>
            {secondsAgo === 0 ? 'Just synced' : `${secondsAgo}s ago`}
          </span>
        </div>
      </div>

      {/* SEARCH, NOTIFICATIONS & DRILL SIMULATOR */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {/* CROSSING SEARCH */}
        <div ref={searchContainerRef} style={{ position: 'relative', width: '220px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            background: 'var(--bg-surface)',
            border: '1px solid var(--bg-panel-border)',
            borderRadius: '6px',
            padding: '5px 10px',
            gap: '8px'
          }}>
            <Search size={14} color="var(--text-muted)" />
            <input 
              type="text"
              placeholder="Search Amritsar fatak..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsSearchOpen(true);
              }}
              onFocus={() => setIsSearchOpen(true)}
              style={{
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--text-primary)',
                fontSize: '12px',
                width: '100%',
                fontFamily: 'var(--font-main)'
              }}
            />
          </div>

          {/* Autocomplete Dropdown */}
          {isSearchOpen && (
            <div style={{
              position: 'absolute',
              top: '38px',
              left: 0,
              right: 0,
              background: 'var(--bg-surface-elevated)',
              border: '1px solid var(--accent-cyan-glow)',
              borderRadius: '6px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
              overflow: 'hidden',
              zIndex: 100
            }}>
              {filteredCrossings.length === 0 ? (
                <div style={{ padding: '10px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>
                  No matching Amritsar crossing
                </div>
              ) : (
                filteredCrossings.map(c => (
                  <div
                    key={c.id}
                    onClick={() => {
                      onSelectCrossing(c);
                      setIsSearchOpen(false);
                      setSearchQuery('');
                    }}
                    style={{
                      padding: '8px 12px',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'background 0.15s ease'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(56, 189, 248, 0.1)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-white)' }}>
                        {c.name} ({c.punjabiName})
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                        {c.officialCode}
                      </div>
                    </div>
                    <span className={`status-badge ${c.status.toLowerCase()}`}>
                      {c.status}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* AUDIO ALERT TOGGLE */}
        <button
          onClick={toggleAudio}
          title={audioActive ? "Audio warning alerts enabled" : "Audio warnings muted"}
          style={{
            background: audioActive ? 'rgba(56, 189, 248, 0.15)' : 'var(--bg-surface)',
            border: `1px solid ${audioActive ? 'var(--accent-cyan)' : 'var(--bg-panel-border)'}`,
            borderRadius: '6px',
            padding: '7px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            color: audioActive ? 'var(--accent-cyan)' : 'var(--text-muted)',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          {audioActive ? <Bell size={15} /> : <BellOff size={15} />}
          <span style={{ fontSize: '11px', fontWeight: 600 }}>
            {audioActive ? 'ALERTS ON' : 'MUTED'}
          </span>
        </button>

        {/* OPERATIONAL DRILL TEST BUTTON */}
        <button
          onClick={onOpenDrillModal}
          className="btn-primary"
          style={{ padding: '6px 12px', fontSize: '12px' }}
        >
          <SlidersHorizontal size={14} />
          <span>Operational Drill</span>
        </button>
      </div>
    </header>
  );
};
