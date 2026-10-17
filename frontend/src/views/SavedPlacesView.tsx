import React, { useState, useEffect, useCallback } from 'react';
import { 
  Star, 
  MapPin, 
  Search, 
  Train, 
  Clock, 
  ExternalLink, 
  Compass, 
  ArrowRight,
  Sparkles,
  GitFork,
  CheckCircle2
} from 'lucide-react';
import { RailwayCrossing, SectorTrain, ActiveRoute } from '../types';
import { nativeService } from '../services/nativeService';
import { INITIAL_CROSSINGS } from '../services/amritsarData';
import { getCrossingTimingDetails } from '../utils/trainHelpers';
import { useSharedTimer } from '../utils/timerManager';
import { haversineDistanceMeters, formatDistance } from '../utils/geoUtils';
import { CrossingCard } from '../components/CrossingCard';
import { CrossingCardSkeleton } from '../components/CrossingCardSkeleton';

interface SavedPlacesViewProps {
  onNavigate: (route: ActiveRoute) => void;
  crossings?: RailwayCrossing[];
  trains?: SectorTrain[];
  onSelectCrossing?: (crossing: RailwayCrossing) => void;
  onSelectDestination?: (place: any) => void;
  isInitialLoading?: boolean;
}

export const SavedPlacesView: React.FC<SavedPlacesViewProps> = ({
  onNavigate,
  crossings = INITIAL_CROSSINGS,
  trains = [],
  onSelectCrossing,
  isInitialLoading = false
}) => {
  const [favCrossingIds, setFavCrossingIds] = useState<string[]>(() => nativeService.getFavoriteCrossingIds());
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(() => {
    const prof = nativeService.getUserLocationProfile();
    return prof ? { lat: prof.lat, lng: prof.lng } : null;
  });
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'distance' | 'status' | 'name'>('distance');

  // Synchronized 1-second timer tick for live second-by-second countdown updates
  const now = useSharedTimer();

  const handleToggleFavorite = useCallback(async (crossingId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await nativeService.toggleFavoriteCrossing(crossingId);
    setFavCrossingIds(nativeService.getFavoriteCrossingIds());
  }, []);

  useEffect(() => {
    const handleFavUpdated = (e: any) => {
      setFavCrossingIds(e.detail || nativeService.getFavoriteCrossingIds());
    };
    window.addEventListener('fatak:favorite-crossings-updated', handleFavUpdated);

    // Refresh user GPS location
    nativeService.getCurrentPosition().then(pos => {
      if (pos) setUserCoords({ lat: pos.lat, lng: pos.lng });
    });

    return () => {
      window.removeEventListener('fatak:favorite-crossings-updated', handleFavUpdated);
    };
  }, []);

  const getCrossingDistanceMeters = (crossing: RailwayCrossing): number | null => {
    if (!userCoords) return null;
    return haversineDistanceMeters(userCoords.lat, userCoords.lng, crossing.lat, crossing.lng);
  };

  // Filter only starred / favorite crossings
  const favoriteCrossings = crossings.filter(c => favCrossingIds.includes(c.id));

  // Filter by search query
  const filteredCrossings = favoriteCrossings.filter(c => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const idFormatted = c.id.replace('osm/node/', 'asr-').toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.punjabiName && c.punjabiName.toLowerCase().includes(q)) ||
      (c.locality && c.locality.toLowerCase().includes(q)) ||
      idFormatted.includes(q)
    );
  });

  // Sort
  const sortedCrossings = [...filteredCrossings].sort((a, b) => {
    if (sortBy === 'distance') {
      const distA = getCrossingDistanceMeters(a) ?? Infinity;
      const distB = getCrossingDistanceMeters(b) ?? Infinity;
      return distA - distB;
    }
    if (sortBy === 'status') {
      const order: Record<string, number> = {
        'CLOSED': 1,
        'CLOSURE_REPORTED': 1,
        'CLOSURE_EXPECTED': 2,
        'APPROACHING': 3,
        'UNKNOWN': 4,
        'OPEN': 5
      };
      return (order[a.status] || 99) - (order[b.status] || 99);
    }
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="view-container" style={{ padding: '20px 16px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* PAGE HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              backgroundColor: 'rgba(245, 158, 11, 0.14)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Star size={20} fill="#f59e0b" color="#f59e0b" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h1 style={{ fontFamily: 'var(--font-brand)', fontSize: '20px', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                  Saved Crossings
                </h1>
                <span style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  backgroundColor: 'rgba(245, 158, 11, 0.15)',
                  color: '#f59e0b',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-full)'
                }}>
                  {favoriteCrossings.length} Starred
                </span>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                ਸੰਭਾਲੇ ਹੋਏ ਫਾਟਕ • Live closure countdowns, train status, and approach alerts
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={() => onNavigate('/crossings')}
          className="btn btn-secondary"
          style={{ fontSize: '12.5px', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <GitFork size={14} />
          <span>Browse All Fataks</span>
        </button>
      </div>

      {/* FILTER & SEARCH BAR (Visible when user has saved crossings) */}
      {favoriteCrossings.length > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          marginBottom: '20px',
          flexWrap: 'wrap'
        }}>
          {/* Search */}
          <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
            <Search size={15} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search your saved crossings..."
              style={{
                width: '100%',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-panel)',
                borderRadius: 'var(--radius-md)',
                padding: '9px 12px 9px 34px',
                color: 'var(--text-primary)',
                fontSize: '13px'
              }}
            />
          </div>

          {/* Sort By */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-panel)',
                borderRadius: 'var(--radius-md)',
                padding: '8px 12px',
                color: 'var(--text-primary)',
                fontSize: '12.5px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <option value="distance">Nearest to You (GPS)</option>
              <option value="status">Closure Status</option>
              <option value="name">Alphabetical</option>
            </select>
          </div>
        </div>
      )}

      {/* EMPTY STATE */}
      {isInitialLoading && crossings.length === 0 ? (
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
            <span>Loading your saved crossings...</span>
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '16px'
          }}>
            {[1, 2, 3].map(i => (
              <CrossingCardSkeleton key={i} />
            ))}
          </div>
        </div>
      ) : favoriteCrossings.length === 0 ? (
        <div className="panel" style={{
          padding: '48px 24px',
          textAlign: 'center',
          maxWidth: '540px',
          margin: '32px auto',
          borderRadius: 'var(--radius-lg)',
          border: '1px dashed var(--border-panel)'
        }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            backgroundColor: 'rgba(245, 158, 11, 0.12)',
            border: '1px solid rgba(245, 158, 11, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px auto',
            color: '#f59e0b'
          }}>
            <Star size={30} fill="#f59e0b" />
          </div>

          <h2 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 8px 0', color: 'var(--text-primary)', fontFamily: 'var(--font-brand)' }}>
            No Saved Crossings Yet
          </h2>

          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5', margin: '0 0 24px 0' }}>
            Tap the star icon (★) on any railway crossing in the <strong>Crossings</strong> tab or <strong>Home</strong> screen to save it here for instant monitoring, live closure countdowns, and approach notifications.
          </p>

          <button
            onClick={() => onNavigate('/crossings')}
            className="btn btn-primary"
            style={{ padding: '10px 24px', fontSize: '13.5px', fontWeight: 700, margin: '0 auto', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <span>Explore Amritsar Crossings</span>
            <ArrowRight size={15} />
          </button>
        </div>
      ) : sortedCrossings.length === 0 ? (
        <div className="panel" style={{ padding: '36px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
          No saved crossings match "{searchQuery}"
        </div>
      ) : (
        /* SAVED CROSSINGS GRID */
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: '16px'
        }}>
          {sortedCrossings.map(crossing => {
            const distMeters = getCrossingDistanceMeters(crossing);
            const distFormatted = distMeters !== null ? `${formatDistance(distMeters)} away` : null;

            return (
              <CrossingCard
                key={crossing.id}
                crossing={crossing}
                trains={trains || []}
                now={now}
                userDistance={distFormatted}
                isFavorite={true}
                onToggleFavorite={handleToggleFavorite}
                onSelect={(c) => {
                  if (onSelectCrossing) {
                    onSelectCrossing(c);
                  } else {
                    onNavigate('/crossings');
                  }
                }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};
