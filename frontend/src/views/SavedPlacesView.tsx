import React, { useState, useEffect, useRef } from 'react';
import { 
  Bookmark, 
  MapPin, 
  Plus, 
  Trash2, 
  Edit3,
  Home, 
  GraduationCap, 
  Briefcase, 
  Compass, 
  Navigation, 
  Check, 
  Search, 
  Loader2, 
  X, 
  AlertCircle, 
  Sparkles, 
  ArrowUpRight 
} from 'lucide-react';
import { SavedPlace, SavedPlaceCategory, ActiveRoute, PlaceSearchResult } from '../types';
import { nativeService } from '../services/nativeService';

interface SavedPlacesViewProps {
  onNavigate: (route: ActiveRoute) => void;
  onSelectDestination?: (place: SavedPlace) => void;
}

export const SavedPlacesView: React.FC<SavedPlacesViewProps> = ({
  onNavigate,
  onSelectDestination
}) => {
  const [places, setPlaces] = useState<SavedPlace[]>([]);
  const [isAdding, setIsAdding] = useState<boolean>(false);
  const [editingPlaceId, setEditingPlaceId] = useState<string | null>(null);

  // Form Fields
  const [formName, setFormName] = useState<string>('');
  const [formCategory, setFormCategory] = useState<SavedPlaceCategory>('CUSTOM');
  const [formAddress, setFormAddress] = useState<string>('');
  const [formLat, setFormLat] = useState<string>('');
  const [formLng, setFormLng] = useState<string>('');

  // Live Geocoding Search State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<PlaceSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchTimeoutRef = useRef<any>(null);

  // GPS State
  const [gpsLoading, setGpsLoading] = useState<boolean>(false);

  // UI Feedback
  const [notificationMsg, setNotificationMsg] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [demoActive, setDemoActive] = useState<boolean>(false);

  useEffect(() => {
    loadPlaces();
  }, []);

  const showToast = (text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setNotificationMsg({ text, type });
    setTimeout(() => setNotificationMsg(null), 3500);
  };

  const loadPlaces = async () => {
    const list = await nativeService.refreshSavedPlacesFromServer();
    setPlaces(list);
    setDemoActive(nativeService.isDemoMode());
  };

  // Debounced Place Search (OSM Nominatim via Backend Proxy)
  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    setSearchError(null);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (query.trim().length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const results = await nativeService.searchPlaces(query.trim(), 6);
        setSearchResults(results);
        if (results.length === 0) {
          setSearchError(`No locations found matching "${query.trim()}". Try searching for a known road or area.`);
        }
      } catch (err: any) {
        setSearchError('Live geocoding search failed. Check network connection.');
      } finally {
        setIsSearching(false);
      }
    }, 450);
  };

  // Populate Form from Live Search Result
  const handleSelectSearchResult = (result: PlaceSearchResult) => {
    setFormName(result.name);
    setFormAddress(result.locality || result.displayName);
    setFormLat(result.lat.toFixed(6));
    setFormLng(result.lng.toFixed(6));
    setSearchResults([]);
    setSearchQuery('');
    nativeService.triggerHaptic('light');
    showToast(`Loaded "${result.name}" from OpenStreetMap geocoding`, 'info');
  };

  // Acquire Live GPS and Reverse Geocode
  const handleUseGps = async () => {
    setGpsLoading(true);
    try {
      const pos = await nativeService.getCurrentPosition();
      if (pos) {
        setFormLat(pos.lat.toFixed(6));
        setFormLng(pos.lng.toFixed(6));

        // Attempt reverse geocoding to retrieve actual street name
        const rev = await nativeService.reverseGeocode(pos.lat, pos.lng);
        if (rev) {
          if (!formName) setFormName(rev.name || 'My Current Location');
          setFormAddress(rev.locality || rev.displayName);
        } else {
          if (!formName) setFormName('Current Location');
        }

        nativeService.triggerHaptic('success');
        showToast('Acquired live GPS coordinates and street address', 'success');
      } else {
        showToast('Could not acquire GPS position. Check location permissions.', 'error');
      }
    } catch (err) {
      showToast('GPS acquisition failed', 'error');
    } finally {
      setGpsLoading(false);
    }
  };

  // Start Adding a New Place
  const handleStartAdd = () => {
    setEditingPlaceId(null);
    setFormName('');
    setFormCategory('CUSTOM');
    setFormAddress('');
    setFormLat('');
    setFormLng('');
    setSearchQuery('');
    setSearchResults([]);
    setIsAdding(true);
  };

  // Start Editing an Existing Place
  const handleStartEdit = (place: SavedPlace) => {
    setEditingPlaceId(place.id);
    setFormName(place.name);
    setFormCategory(place.category);
    setFormAddress(place.address || '');
    setFormLat(place.lat.toString());
    setFormLng(place.lng.toString());
    setSearchQuery('');
    setSearchResults([]);
    setIsAdding(true);
  };

  // Save / Update Form Submission
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();

    const latNum = parseFloat(formLat);
    const lngNum = parseFloat(formLng);

    if (isNaN(latNum) || isNaN(lngNum) || latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
      showToast('Please enter valid GPS coordinates (Latitude: -90 to 90, Longitude: -180 to 180)', 'error');
      return;
    }

    if (!formName.trim()) {
      showToast('Location name is required', 'error');
      return;
    }

    if (editingPlaceId) {
      const updated = await nativeService.updateSavedPlace(editingPlaceId, {
        name: formName.trim(),
        category: formCategory,
        address: formAddress.trim() || undefined,
        lat: latNum,
        lng: lngNum
      });
      if (updated) {
        showToast(`Updated "${formName}"`, 'success');
      }
    } else {
      const created = await nativeService.addSavedPlace({
        name: formName.trim(),
        category: formCategory,
        address: formAddress.trim() || undefined,
        lat: latNum,
        lng: lngNum
      });
      if (created) {
        showToast(`Added "${formName}" to your saved destinations`, 'success');
      }
    }

    setIsAdding(false);
    setEditingPlaceId(null);
    nativeService.triggerHaptic('success');
    await loadPlaces();
  };

  // Delete Place
  const handleDeletePlace = async (id: string, name: string) => {
    if (window.confirm(`Delete "${name}" from saved places?`)) {
      await nativeService.deleteSavedPlace(id);
      showToast(`Removed "${name}"`, 'info');
      nativeService.triggerHaptic('light');
      await loadPlaces();
    }
  };

  // Quick Action: Route As Origin
  const handleUseAsOrigin = (place: SavedPlace) => {
    nativeService.setActivePlannerOrigin(place);
    nativeService.triggerHaptic('light');
    showToast(`Set "${place.name}" as journey origin`, 'info');
    onNavigate('/planner');
  };

  // Quick Action: Route As Destination
  const handleUseAsDestination = (place: SavedPlace) => {
    nativeService.setActivePlannerDestination(place);
    if (onSelectDestination) {
      onSelectDestination(place);
    }
    nativeService.triggerHaptic('light');
    showToast(`Set "${place.name}" as arrival destination`, 'info');
    onNavigate('/planner');
  };

  // Demo Places Toggle
  const handleLoadDemoPlaces = async () => {
    await nativeService.loadDemoPlaces();
    nativeService.triggerHaptic('medium');
    showToast('Loaded 3 Amritsar demo simulation places', 'info');
    await loadPlaces();
  };

  const handleClearDemoPlaces = async () => {
    await nativeService.removeAllDemoPlaces();
    nativeService.triggerHaptic('medium');
    showToast('Removed demo simulation places', 'info');
    await loadPlaces();
  };

  const getCategoryIcon = (category: SavedPlaceCategory) => {
    switch (category) {
      case 'HOME': return <Home size={16} style={{ color: 'var(--color-primary-forest)' }} />;
      case 'COLLEGE': return <GraduationCap size={16} style={{ color: 'var(--color-accent-tangerine)' }} />;
      case 'WORK': return <Briefcase size={16} style={{ color: 'var(--color-primary-dark)' }} />;
      default: return <MapPin size={16} style={{ color: 'var(--color-primary-forest)' }} />;
    }
  };

  const getCategoryBadgeClass = (category: SavedPlaceCategory) => {
    switch (category) {
      case 'HOME': return 'badge-green';
      case 'COLLEGE': return 'badge-amber';
      case 'WORK': return 'badge-green';
      default: return 'badge-neutral';
    }
  };

  return (
    <div className="page-container" style={{ paddingBottom: '90px' }}>
      {/* HEADER */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 className="page-title">Saved Places</h1>
          <p className="page-subtitle">
            Manage your personal transit destinations with live geocoding & route shortcuts
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          {demoActive && (
            <button
              onClick={handleClearDemoPlaces}
              className="btn btn-secondary"
              style={{ fontSize: '12px', padding: '8px 12px', color: 'var(--color-accent-tangerine)' }}
              title="Remove sample demo places"
            >
              <span>Clear Demo</span>
            </button>
          )}

          <button 
            onClick={isAdding ? () => setIsAdding(false) : handleStartAdd}
            className="btn btn-primary"
            style={{ fontSize: '13px' }}
          >
            {isAdding ? <X size={15} /> : <Plus size={15} />}
            <span>{isAdding ? 'Cancel' : 'Add Place'}</span>
          </button>
        </div>
      </div>

      {/* TOAST / NOTIFICATION */}
      {notificationMsg && (
        <div style={{
          background: notificationMsg.type === 'error' ? 'var(--surface-red)' : notificationMsg.type === 'info' ? 'var(--surface-green)' : 'var(--surface-green)',
          border: `1px solid ${notificationMsg.type === 'error' ? 'var(--status-critical)' : 'var(--border-soft)'}`,
          color: notificationMsg.type === 'error' ? 'var(--status-critical)' : 'var(--color-primary-forest)',
          padding: '10px 16px',
          borderRadius: '8px',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '12px',
          fontWeight: 600
        }}>
          {notificationMsg.type === 'error' ? <AlertCircle size={15} /> : <Check size={15} />}
          <span>{notificationMsg.text}</span>
        </div>
      )}

      {/* DEMO MODE NOTICE BANNER */}
      {demoActive && (
        <div style={{
          background: 'var(--surface-orange)',
          border: '1px solid var(--border-soft)',
          borderRadius: '8px',
          padding: '10px 14px',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '12px',
          color: 'var(--color-accent-tangerine)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={14} />
            <span><strong>Demo Mode Active:</strong> Sample Amritsar locations populated for testing.</span>
          </div>
          <button 
            onClick={handleClearDemoPlaces}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-primary-forest)',
              cursor: 'pointer',
              textDecoration: 'underline',
              fontSize: '11px',
              fontWeight: 600
            }}
          >
            Clear Records
          </button>
        </div>
      )}

      {/* ADD / EDIT PLACE FORM */}
      {isAdding && (
        <div className="card" style={{ padding: '20px', marginBottom: '24px', border: '1px solid var(--color-primary-forest)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: 'var(--color-primary-dark)' }}>
              {editingPlaceId ? 'Edit Saved Place' : 'Add New Saved Place'}
            </h3>
            <span style={{ fontSize: '11px', color: 'var(--color-primary-forest)', fontWeight: 600 }}>
              Live OpenStreetMap Geocoding
            </span>
          </div>

          {/* LIVE PLACE SEARCH BAR */}
          <div style={{ marginBottom: '18px', position: 'relative' }}>
            <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 700, display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>
              Search Place / Address (OpenStreetMap Nominatim)
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Type road, landmark, or area (e.g. Lawrence Road, Mall Road, Chheharta)..."
                style={{
                  width: '100%',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-soft)',
                  borderRadius: '8px',
                  padding: '10px 38px 10px 36px',
                  color: 'var(--text-primary)',
                  fontSize: '13px'
                }}
              />
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              {isSearching && (
                <Loader2 size={16} className="animate-spin" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-primary-forest)' }} />
              )}
            </div>

            {/* LIVE SEARCH RESULTS DROPDOWN */}
            {searchResults.length > 0 && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                zIndex: 50,
                background: 'var(--bg-card)',
                border: '1px solid var(--border-soft)',
                borderRadius: '8px',
                marginTop: '4px',
                maxHeight: '260px',
                overflowY: 'auto',
                boxShadow: '0 8px 24px rgba(0,0,0,0.08)'
              }}>
                <div style={{ padding: '8px 12px', fontSize: '10px', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-soft)', fontWeight: 600 }}>
                  REAL SEARCH RESULTS (CLICK TO FILL COORDINATES):
                </div>
                {searchResults.map((res) => (
                  <div
                    key={res.placeId}
                    onClick={() => handleSelectSearchResult(res)}
                    style={{
                      padding: '10px 12px',
                      borderBottom: '1px solid var(--border-soft)',
                      cursor: 'pointer',
                      transition: 'background 0.15s ease'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-green)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{res.name}</span>
                      <span style={{ fontSize: '10px', color: 'var(--color-primary-forest)', fontFamily: 'var(--font-mono)' }}>
                        {res.lat.toFixed(4)}, {res.lng.toFixed(4)}
                      </span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      {res.locality || res.displayName}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {searchError && (
              <div style={{ fontSize: '11px', color: 'var(--status-warning)', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <AlertCircle size={12} />
                <span>{searchError}</span>
              </div>
            )}
          </div>

          {/* FORM FIELDS */}
          <form onSubmit={handleSubmitForm}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 700, display: 'block', marginBottom: '6px' }}>
                  LOCATION NAME *
                </label>
                <input 
                  type="text" 
                  value={formName} 
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. My Apartment, Office, University Campus"
                  required
                  style={{
                    width: '100%',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-soft)',
                    borderRadius: '8px',
                    padding: '9px 12px',
                    color: 'var(--text-primary)',
                    fontSize: '13px'
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 700, display: 'block', marginBottom: '6px' }}>
                  CATEGORY
                </label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value as SavedPlaceCategory)}
                  style={{
                    width: '100%',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-soft)',
                    borderRadius: '8px',
                    padding: '9px 12px',
                    color: 'var(--text-primary)',
                    fontSize: '13px'
                  }}
                >
                  <option value="HOME">Home</option>
                  <option value="COLLEGE">College / University</option>
                  <option value="WORK">Work / Office</option>
                  <option value="CUSTOM">Custom Destination</option>
                </select>
              </div>

              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 700, display: 'block', marginBottom: '6px' }}>
                  STREET ADDRESS / NOTES
                </label>
                <input 
                  type="text" 
                  value={formAddress} 
                  onChange={(e) => setFormAddress(e.target.value)}
                  placeholder="e.g. GT Road, Near Putlighar Market"
                  style={{
                    width: '100%',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-soft)',
                    borderRadius: '8px',
                    padding: '9px 12px',
                    color: 'var(--text-primary)',
                    fontSize: '13px'
                  }}
                />
              </div>

              <div style={{ gridColumn: 'span 2' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 700 }}>
                    COORDINATES (LATITUDE, LONGITUDE) *
                  </label>
                  <button
                    type="button"
                    onClick={handleUseGps}
                    disabled={gpsLoading}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-primary-forest)',
                      fontSize: '11px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontWeight: 600
                    }}
                  >
                    <Compass size={13} className={gpsLoading ? 'animate-spin' : ''} />
                    <span>{gpsLoading ? 'Acquiring GPS...' : 'Use Current Device GPS'}</span>
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <input 
                      type="text" 
                      value={formLat} 
                      onChange={(e) => setFormLat(e.target.value)}
                      placeholder="Latitude (e.g. 31.6338)"
                      required
                      style={{
                        width: '100%',
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-soft)',
                        borderRadius: '8px',
                        padding: '9px 12px',
                        color: 'var(--text-primary)',
                        fontSize: '12px',
                        fontFamily: 'var(--font-mono)'
                      }}
                    />
                  </div>
                  <div>
                    <input 
                      type="text" 
                      value={formLng} 
                      onChange={(e) => setFormLng(e.target.value)}
                      placeholder="Longitude (e.g. 74.8655)"
                      required
                      style={{
                        width: '100%',
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-soft)',
                        borderRadius: '8px',
                        padding: '9px 12px',
                        color: 'var(--text-primary)',
                        fontSize: '12px',
                        fontFamily: 'var(--font-mono)'
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
              <button type="submit" className="btn btn-primary" style={{ padding: '8px 18px', fontSize: '13px' }}>
                <Check size={14} />
                <span>{editingPlaceId ? 'Update Place' : 'Save Place'}</span>
              </button>
              <button 
                type="button" 
                onClick={() => { setIsAdding(false); setEditingPlaceId(null); }} 
                className="btn btn-secondary"
                style={{ padding: '8px 16px', fontSize: '13px' }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* SAVED PLACES LIST OR EMPTY STATE */}
      {places.length === 0 && !isAdding ? (
        <div className="card" style={{ padding: '36px 24px', textAlign: 'center', maxWidth: '520px', margin: '30px auto' }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: 'var(--surface-green)',
            border: '1px solid var(--border-soft)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px auto',
            color: 'var(--color-primary-forest)'
          }}>
            <Bookmark size={26} />
          </div>

          <h3 style={{ fontSize: '17px', fontWeight: 700, margin: '0 0 8px 0', color: 'var(--color-primary-dark)' }}>
            No Saved Places Yet
          </h3>

          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5', margin: '0 0 20px 0' }}>
            Save your frequent destinations (Home, College, Work) 
            to get 1-tap route calculation, flyover bypass recommendations, and crossing gate alerts.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
            <button
              onClick={handleStartAdd}
              className="btn btn-primary"
              style={{ padding: '10px 24px', fontSize: '13px' }}
            >
              <Plus size={15} />
              <span>Add Your First Saved Place</span>
            </button>

            <button
              onClick={handleLoadDemoPlaces}
              className="btn btn-secondary"
              style={{ fontSize: '12px', padding: '8px 16px' }}
            >
              <Sparkles size={13} style={{ color: 'var(--color-accent-tangerine)' }} />
              <span>Load Sample Places (Demo)</span>
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
          {places.map((place) => (
            <div 
              key={place.id}
              className="card"
              style={{
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'border-color 0.2s ease, transform 0.2s ease'
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '8px',
                      background: 'var(--surface-green)',
                      border: '1px solid var(--border-soft)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      {getCategoryIcon(place.category)}
                    </div>

                    <div>
                      <h3 style={{ fontSize: '14px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                        {place.name}
                      </h3>
                      <span className={`badge ${getCategoryBadgeClass(place.category)}`} style={{ fontSize: '10px', marginTop: '2px', display: 'inline-block' }}>
                        {place.category}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      onClick={() => handleStartEdit(place)}
                      title="Edit Place"
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                        padding: '6px'
                      }}
                    >
                      <Edit3 size={14} />
                    </button>
                    <button
                      onClick={() => handleDeletePlace(place.id, place.name)}
                      title="Delete Place"
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                        padding: '6px'
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {place.address && (
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '6px 0 8px 0', lineHeight: 1.4 }}>
                    {place.address}
                  </p>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                  <MapPin size={11} />
                  <span>{place.lat.toFixed(4)}° N, {place.lng.toFixed(4)}° E</span>
                </div>
              </div>

              {/* ACTION SHORTCUTS */}
              <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--border-soft)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <button
                  onClick={() => handleUseAsOrigin(place)}
                  className="btn btn-secondary"
                  style={{ fontSize: '11px', padding: '7px 10px', justifyContent: 'center' }}
                  title="Set as Origin for Journey Planner"
                >
                  <Navigation size={12} style={{ transform: 'rotate(180deg)' }} />
                  <span>Use as Origin</span>
                </button>

                <button
                  onClick={() => handleUseAsDestination(place)}
                  className="btn btn-primary"
                  style={{ fontSize: '11px', padding: '7px 10px', justifyContent: 'center' }}
                  title="Plan route arriving at this destination"
                >
                  <ArrowUpRight size={13} />
                  <span>Route Here</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
