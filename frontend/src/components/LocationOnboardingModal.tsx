import React, { useState, useEffect } from 'react';
import { 
  Compass, 
  MapPin, 
  Search, 
  Check, 
  X, 
  AlertTriangle, 
  Loader2, 
  ArrowRight, 
  Navigation,
  Sparkles,
  Info,
  Clock,
  ShieldCheck
} from 'lucide-react';
import { 
  RailwayCrossing, 
  SectorTrain, 
  UserLocationProfile, 
  NearbyCrossingItem,
  PlaceSearchResult 
} from '../types';
import { nativeService } from '../services/nativeService';
import { AMRITSAR_LANDMARKS } from '../data/landmarks';
import { getCrossingsSortedByDistance, formatDistance } from '../utils/geoUtils';

interface LocationOnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  crossings: RailwayCrossing[];
  trains?: SectorTrain[];
  existingProfile?: UserLocationProfile | null;
  onSaveProfile: (profile: UserLocationProfile) => void;
  isInitialOnboarding?: boolean;
}

export const LocationOnboardingModal: React.FC<LocationOnboardingModalProps> = ({
  isOpen,
  onClose,
  crossings,
  trains,
  existingProfile,
  onSaveProfile,
  isInitialOnboarding = false
}) => {
  const [userName, setUserName] = useState<string>(existingProfile?.userName || '');
  const [activeTab, setActiveTab] = useState<'DETECT' | 'MANUAL'>('DETECT');
  
  // Detection state
  const [isDetecting, setIsDetecting] = useState<boolean>(false);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [ipFallbackOffered, setIpFallbackOffered] = useState<boolean>(false);

  // Manual search state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<PlaceSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);

  // Selected candidate location
  const [selectedLocation, setSelectedLocation] = useState<{
    lat: number;
    lng: number;
    name: string;
    source: 'GPS_HARDWARE' | 'MANUAL_ENTRY' | 'APPROXIMATE_IP';
    isApproximate: boolean;
    accuracyMeters?: number;
  } | null>(existingProfile ? {
    lat: existingProfile.lat,
    lng: existingProfile.lng,
    name: existingProfile.locationName,
    source: existingProfile.source,
    isApproximate: existingProfile.isApproximate,
    accuracyMeters: existingProfile.accuracyMeters
  } : null);

  // Reset or populate on open
  useEffect(() => {
    if (isOpen) {
      if (existingProfile) {
        setUserName(existingProfile.userName || '');
        setSelectedLocation({
          lat: existingProfile.lat,
          lng: existingProfile.lng,
          name: existingProfile.locationName,
          source: existingProfile.source,
          isApproximate: existingProfile.isApproximate,
          accuracyMeters: existingProfile.accuracyMeters
        });
      } else {
        setUserName('');
        setSelectedLocation(null);
      }
      setDetectError(null);
      setIpFallbackOffered(false);
      setSearchQuery('');
    }
  }, [isOpen, existingProfile]);

  if (!isOpen) return null;

  // 1. Detect Device GPS Location
  const handleDetectLocation = async () => {
    setIsDetecting(true);
    setDetectError(null);
    setIpFallbackOffered(false);

    try {
      // Request permission only upon explicit user action
      const hasPermission = await nativeService.requestLocationPermission();
      if (!hasPermission) {
        setDetectError('Location permission was denied. You can search manually or use approximate network location.');
        setIpFallbackOffered(true);
        setIsDetecting(false);
        return;
      }

      const pos = await nativeService.getCurrentPosition();
      if (pos) {
        let revName = `Amritsar (GPS ±${pos.accuracyMeters || 15}m)`;
        try {
          const rev = await nativeService.reverseGeocode(pos.lat, pos.lng);
          if (rev && rev.name) {
            revName = rev.name;
          }
        } catch (e) {}

        setSelectedLocation({
          lat: pos.lat,
          lng: pos.lng,
          name: revName,
          source: 'GPS_HARDWARE',
          isApproximate: false,
          accuracyMeters: pos.accuracyMeters
        });
        nativeService.triggerHaptic('success');
      } else {
        setDetectError('GPS timed out or position unavailable. You can use approximate network location or search manually.');
        setIpFallbackOffered(true);
      }
    } catch (err: any) {
      setDetectError(err.message || 'Error acquiring device position.');
      setIpFallbackOffered(true);
    } finally {
      setIsDetecting(false);
    }
  };

  // 2. Use Approximate IP Fallback
  const handleUseIpFallback = async () => {
    setIsDetecting(true);
    setDetectError(null);
    try {
      const ipLoc = await nativeService.getIpLocation();
      if (ipLoc) {
        setSelectedLocation({
          lat: ipLoc.lat,
          lng: ipLoc.lng,
          name: `${ipLoc.city}, ${ipLoc.region} (Network Area)`,
          source: 'APPROXIMATE_IP',
          isApproximate: true
        });
        nativeService.triggerHaptic('light');
      } else {
        // Default to central Amritsar
        setSelectedLocation({
          lat: 31.6340,
          lng: 74.8723,
          name: 'Amritsar Central Corridor',
          source: 'APPROXIMATE_IP',
          isApproximate: true
        });
      }
    } catch (e) {
      setSelectedLocation({
        lat: 31.6340,
        lng: 74.8723,
        name: 'Amritsar Central Corridor',
        source: 'APPROXIMATE_IP',
        isApproximate: true
      });
    } finally {
      setIsDetecting(false);
      setIpFallbackOffered(false);
    }
  };

  // 3. Manual Search Handler
  const handleSearch = (text: string) => {
    setSearchQuery(text);
    if (text.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    const localMatches = nativeService.searchLocalLandmarks(text.trim(), 8);
    
    // Also match mapped railway crossings directly
    const qLower = text.trim().toLowerCase();
    const matchingCrossings: PlaceSearchResult[] = crossings
      .filter(c => c.name.toLowerCase().includes(qLower) || (c.punjabiName && c.punjabiName.includes(text.trim())))
      .slice(0, 4)
      .map(c => ({
        placeId: `crossing_${c.id}`,
        name: c.name,
        displayName: `${c.name}, ${c.locality || 'Amritsar'}`,
        locality: c.locality || 'Amritsar',
        lat: c.lat,
        lng: c.lng,
        category: 'Crossing Gate',
        provider: 'OpenStreetMap Crossing Dataset'
      }));

    // Deduplicate
    const combined = [...matchingCrossings, ...localMatches];
    const seen = new Set<string>();
    const unique = combined.filter(item => {
      const key = `${item.lat.toFixed(4)},${item.lng.toFixed(4)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    setSearchResults(unique.slice(0, 8));
    setIsSearching(false);
  };

  // Select a manual place
  const handleSelectPlace = (place: { name: string; lat: number; lng: number }) => {
    setSelectedLocation({
      lat: place.lat,
      lng: place.lng,
      name: place.name,
      source: 'MANUAL_ENTRY',
      isApproximate: false
    });
    setSearchQuery('');
    setSearchResults([]);
    nativeService.triggerHaptic('light');
  };

  // Calculate nearest crossings from selected location
  const nearestCrossings: NearbyCrossingItem[] = selectedLocation
    ? getCrossingsSortedByDistance(crossings, selectedLocation.lat, selectedLocation.lng, trains).slice(0, 4)
    : [];

  // Final Save Handler
  const handleSaveAndConfirm = () => {
    if (!selectedLocation) return;

    const profile: UserLocationProfile = {
      userName: userName.trim() || undefined,
      lat: selectedLocation.lat,
      lng: selectedLocation.lng,
      locationName: selectedLocation.name,
      source: selectedLocation.source,
      isApproximate: selectedLocation.isApproximate,
      accuracyMeters: selectedLocation.accuracyMeters,
      updatedAt: new Date().toISOString()
    };

    onSaveProfile(profile);
    nativeService.setUserLocationProfile(profile);
    nativeService.triggerHaptic('success');
    onClose();
  };

  return (
    <div 
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(11, 18, 32, 0.75)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.2s ease-out'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isInitialOnboarding) onClose();
      }}
    >
      <div 
        style={{
          width: '100%',
          maxWidth: '520px',
          maxHeight: '92vh',
          backgroundColor: 'var(--bg-surface)',
          borderRadius: 'var(--radius-lg, 16px)',
          border: '1px solid var(--border-soft)',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.4), 0 10px 10px -5px rgba(0, 0, 0, 0.2)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div style={{
          padding: '18px 22px 14px 22px',
          borderBottom: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-secondary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              backgroundColor: 'var(--surface-green, #E8F5E9)',
              border: '1px solid var(--surface-green-border, #A3D9C3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-primary, #176B4D)'
            }}>
              <Compass size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{
                  fontFamily: 'var(--font-brand, "Outfit", sans-serif)',
                  fontSize: '16px',
                  fontWeight: 800,
                  color: 'var(--text-primary, #111827)'
                }}>
                  {existingProfile ? 'Change Your Location' : 'Location Onboarding'}
                </span>
                <span style={{
                  fontSize: '9.5px',
                  fontWeight: 800,
                  padding: '2px 6px',
                  borderRadius: '4px',
                  backgroundColor: 'var(--surface-green, #E8F5E9)',
                  color: 'var(--accent-primary, #176B4D)',
                  border: '1px solid var(--surface-green-border, #A3D9C3)'
                }}>
                  AMRITSAR
                </span>
              </div>
              <p style={{ margin: '2px 0 0 0', fontSize: '11.5px', color: 'var(--text-secondary, #6B7280)' }}>
                Sort crossings by geographic distance and get local fatak alerts
              </p>
            </div>
          </div>

          {!isInitialOnboarding && (
            <button
              onClick={onClose}
              className="btn btn-ghost"
              style={{ padding: '6px', minHeight: 'auto', borderRadius: '50%', color: 'var(--text-secondary)' }}
              title="Close"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* MODAL BODY (SCROLLABLE) */}
        <div style={{ padding: '20px 22px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* OPTIONAL USER NAME INPUT */}
          <div>
            <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: 'var(--text-secondary, #4B5563)', marginBottom: '5px' }}>
              Your Name (Optional)
            </label>
            <input 
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="e.g. Harpreet Singh, Arvind..."
              style={{
                width: '100%',
                padding: '9px 12px',
                fontSize: '13px',
                borderRadius: '8px',
                border: '1px solid var(--border-soft)',
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                outline: 'none'
              }}
            />
          </div>

          {/* TAB TOGGLE: DETECT VS MANUAL */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '4px',
            backgroundColor: 'var(--bg-secondary)',
            padding: '3px',
            borderRadius: '10px'
          }}>
            <button
              type="button"
              onClick={() => setActiveTab('DETECT')}
              style={{
                padding: '8px 12px',
                fontSize: '12px',
                fontWeight: 700,
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                backgroundColor: activeTab === 'DETECT' ? 'var(--bg-surface)' : 'transparent',
                color: activeTab === 'DETECT' ? 'var(--accent-primary)' : 'var(--text-secondary)',
                boxShadow: activeTab === 'DETECT' ? 'var(--shadow-sm)' : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              <Compass size={14} />
              <span>Detect My Location</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('MANUAL')}
              style={{
                padding: '8px 12px',
                fontSize: '12px',
                fontWeight: 700,
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                backgroundColor: activeTab === 'MANUAL' ? 'var(--bg-surface)' : 'transparent',
                color: activeTab === 'MANUAL' ? 'var(--accent-primary)' : 'var(--text-secondary)',
                boxShadow: activeTab === 'MANUAL' ? 'var(--shadow-sm)' : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              <MapPin size={14} />
              <span>Enter Manually</span>
            </button>
          </div>

          {/* TAB 1: DETECT MY LOCATION */}
          {activeTab === 'DETECT' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-soft)',
                borderRadius: '10px',
                padding: '16px',
                textAlign: 'center'
              }}>
                <div style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--surface-green, #E8F5E9)',
                  color: 'var(--accent-primary, #176B4D)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 10px auto'
                }}>
                  <Navigation size={22} />
                </div>
                
                <h4 style={{ margin: '0 0 4px 0', fontSize: '13.5px', fontWeight: 700, color: 'var(--text-primary, #111827)' }}>
                  Automatic GPS Location
                </h4>
                <p style={{ margin: '0 0 14px 0', fontSize: '12px', color: 'var(--text-secondary, #6B7280)', lineHeight: 1.4 }}>
                  Device GPS will be requested only when you click below. Used to calculate real distances to Amritsar level crossings.
                </p>

                <button
                  type="button"
                  onClick={handleDetectLocation}
                  disabled={isDetecting}
                  className="btn btn-primary"
                  style={{
                    width: '100%',
                    padding: '10px',
                    fontSize: '13px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                >
                  {isDetecting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Requesting GPS & Locating...</span>
                    </>
                  ) : (
                    <>
                      <Compass size={16} />
                      <span>Acquire Device Location</span>
                    </>
                  )}
                </button>
              </div>

              {/* PERMISSION ERROR OR TIMEOUT NOTICE */}
              {detectError && (
                <div style={{
                  backgroundColor: '#FFF8F6',
                  border: '1px solid var(--accent-tangerine, #E65100)',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-tangerine, #E65100)', fontSize: '12px', fontWeight: 700 }}>
                    <AlertTriangle size={15} />
                    <span>Location Notice</span>
                  </div>
                  <div style={{ fontSize: '11.5px', color: 'var(--text-secondary, #4B5563)', lineHeight: 1.35 }}>
                    {detectError}
                  </div>

                  {ipFallbackOffered && (
                    <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                      <button
                        type="button"
                        onClick={handleUseIpFallback}
                        className="btn btn-secondary"
                        style={{ padding: '5px 10px', fontSize: '11.5px', fontWeight: 700 }}
                      >
                        Use Approximate Network Location
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('MANUAL')}
                        className="btn btn-ghost"
                        style={{ padding: '5px 8px', fontSize: '11.5px', textDecoration: 'underline' }}
                      >
                        Search Manually
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: ENTER MANUALLY */}
          {activeTab === 'MANUAL' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: 'var(--text-secondary, #4B5563)', marginBottom: '5px' }}>
                  Search Amritsar Area, Crossing, or Landmark
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    placeholder="e.g. Amritsar Junction, Golden Temple, Jaura Phatak, Verka..."
                    style={{
                      width: '100%',
                      padding: '9px 12px 9px 34px',
                      fontSize: '13px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-soft)',
                      backgroundColor: 'var(--bg-surface)',
                      color: 'var(--text-primary)',
                      outline: 'none'
                    }}
                  />
                  <Search size={15} style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                </div>
              </div>

              {/* SEARCH RESULTS DROPDOWN */}
              {searchResults.length > 0 && (
                <div style={{
                  maxHeight: '180px',
                  overflowY: 'auto',
                  border: '1px solid var(--border-soft)',
                  borderRadius: '8px',
                  backgroundColor: 'var(--bg-surface)'
                }}>
                  {searchResults.map(result => (
                    <div
                      key={result.placeId}
                      onClick={() => handleSelectPlace(result)}
                      style={{
                        padding: '8px 12px',
                        borderBottom: '1px solid var(--border-subtle)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '12px'
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-surface-elevated)')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-surface)')}
                    >
                      <div>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{result.name}</div>
                        <div style={{ fontSize: '10.5px', color: 'var(--text-secondary)' }}>{result.locality}</div>
                      </div>
                      <span style={{
                        fontSize: '9px',
                        fontWeight: 700,
                        padding: '1px 5px',
                        borderRadius: '3px',
                        backgroundColor: '#F3F4F6',
                        color: 'var(--text-secondary)'
                      }}>
                        {result.category || 'Amritsar'}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* POPULAR QUICK PICKS */}
              <div>
                <div style={{ fontSize: '10.5px', fontWeight: 800, color: 'var(--text-muted, #9CA3AF)', letterSpacing: '0.04em', marginBottom: '6px' }}>
                  POPULAR AMRITSAR HUBS
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {AMRITSAR_LANDMARKS.slice(0, 8).map(lm => (
                    <button
                      key={lm.id}
                      type="button"
                      onClick={() => handleSelectPlace({ name: lm.name.split(' (')[0], lat: lm.lat, lng: lm.lng })}
                      style={{
                        backgroundColor: 'var(--bg-secondary)',
                        border: '1px solid var(--border-soft)',
                        borderRadius: 'var(--radius-full, 9999px)',
                        padding: '4px 10px',
                        fontSize: '11px',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        cursor: 'pointer'
                      }}
                    >
                      {lm.name.split(' (')[0]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ACTIVE SELECTED LOCATION CARD & NEAREST CROSSINGS PREVIEW */}
          {selectedLocation && (
            <div style={{
              backgroundColor: 'var(--surface-green, #E8F5E9)',
              border: '1.5px solid var(--surface-green-border, #A3D9C3)',
              borderRadius: '12px',
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                  <MapPin size={16} color="var(--accent-primary, #176B4D)" />
                  <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--accent-emphasis, #0E4833)', textTransform: 'uppercase' }}>
                    Active User Location
                  </span>
                </div>
                <span style={{
                  fontSize: '9.5px',
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: '4px',
                  backgroundColor: 'var(--bg-surface)',
                  color: selectedLocation.isApproximate ? 'var(--accent-tangerine)' : 'var(--accent-primary)',
                  border: '1px solid var(--surface-green-border)'
                }}>
                  {selectedLocation.isApproximate ? 'Approximate (IP)' : (selectedLocation.source === 'GPS_HARDWARE' ? 'Precise GPS' : 'Manual')}
                </span>
              </div>

              <div>
                <div style={{ fontSize: '14.5px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {selectedLocation.name}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Coordinates: {selectedLocation.lat.toFixed(4)}, {selectedLocation.lng.toFixed(4)}
                  {selectedLocation.accuracyMeters && ` (±${selectedLocation.accuracyMeters}m)`}
                </div>
              </div>

              {/* NEAREST CROSSINGS LIST */}
              {nearestCrossings.length > 0 && (
                <div style={{ marginTop: '2px' }}>
                  <div style={{ fontSize: '10.5px', fontWeight: 800, color: 'var(--accent-primary)', textTransform: 'uppercase', marginBottom: '6px' }}>
                    Nearest Railway Crossings ({nearestCrossings.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {nearestCrossings.map(item => (
                      <div
                        key={item.crossing.id}
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: '8px',
                          padding: '8px 10px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          fontSize: '11.5px'
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {item.crossing.name}
                          </div>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                            {item.crossing.punjabiName ? `${item.crossing.punjabiName} • ` : ''}{item.crossing.locality || 'Amritsar'}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                          <span style={{
                            fontSize: '9.5px',
                            fontWeight: 800,
                            padding: '1px 5px',
                            borderRadius: '3px',
                            backgroundColor: item.dataFreshness === 'LIVE' ? 'var(--status-open-bg, #E8F5E9)' : '#F3F4F6',
                            color: item.dataFreshness === 'LIVE' ? 'var(--status-open, #176B4D)' : 'var(--text-secondary, #6B7280)',
                            border: `1px solid ${item.dataFreshness === 'LIVE' ? 'var(--status-open-border, #A3D9C3)' : 'var(--border-subtle, #E5E7EB)'}`
                          }}>
                            {item.dataFreshness}
                          </span>
                          <span style={{ fontWeight: 800, color: 'var(--accent-primary)', fontSize: '12px' }}>
                            {item.distanceLabel}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>

        {/* MODAL FOOTER */}
        <div style={{
          padding: '14px 22px',
          borderTop: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-secondary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px'
        }}>
          {isInitialOnboarding ? (
            <button
              type="button"
              onClick={() => {
                // Default to central Amritsar Junction if skipped
                const fallbackProfile: UserLocationProfile = {
                  lat: 31.6338,
                  lng: 74.8655,
                  locationName: 'Amritsar Junction (Default)',
                  source: 'MANUAL_ENTRY',
                  isApproximate: true,
                  updatedAt: new Date().toISOString()
                };
                onSaveProfile(fallbackProfile);
                nativeService.setUserLocationProfile(fallbackProfile);
                onClose();
              }}
              className="btn btn-ghost"
              style={{ fontSize: '12px', color: 'var(--text-secondary)' }}
            >
              Skip for now
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
              style={{ fontSize: '12px' }}
            >
              Cancel
            </button>
          )}

          <button
            type="button"
            onClick={handleSaveAndConfirm}
            disabled={!selectedLocation}
            className="btn btn-primary"
            style={{
              padding: '9px 18px',
              fontSize: '13px',
              fontWeight: 700,
              opacity: selectedLocation ? 1 : 0.6,
              cursor: selectedLocation ? 'pointer' : 'not-allowed'
            }}
          >
            <span>{existingProfile ? 'Update Location' : 'Save & Explore'}</span>
            <ArrowRight size={14} />
          </button>
        </div>

      </div>
    </div>
  );
};
