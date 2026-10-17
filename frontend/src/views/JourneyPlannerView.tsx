import React, { useState, useEffect, useRef } from 'react';
import { 
  Navigation, 
  MapPin, 
  Compass, 
  Car, 
  Bike, 
  Footprints, 
  Search, 
  Loader2, 
  X, 
  Play, 
  Square, 
  ArrowUpDown, 
  ChevronRight, 
  Clock, 
  ShieldAlert, 
  ShieldCheck, 
  AlertTriangle, 
  ChevronDown, 
  ChevronUp, 
  CheckCircle2, 
  Info,
  Maximize2,
  BellRing,
  Sparkles,
  RotateCw,
  Edit3
} from 'lucide-react';
import { 
  RailwayCrossing, 
  SectorTrain, 
  RailwayCorridor, 
  ActiveRoute, 
  TravelMode, 
  SavedPlace, 
  PlannedJourney, 
  RouteCrossingHit, 
  CandidateJourneyRoute, 
  PlaceSearchResult 
} from '../types';
import { railwayApi } from '../services/apiService';
import { nativeService } from '../services/nativeService';
import { JourneyRouteMap } from '../components/JourneyRouteMap';
import { SmartAlarmModal } from '../components/SmartAlarmModal';
import { AMRITSAR_LANDMARKS } from '../data/landmarks';
import { SmartCommuteAlarm } from '../types';

interface JourneyPlannerViewProps {
  crossings: RailwayCrossing[];
  trains: SectorTrain[];
  corridors: RailwayCorridor[];
  onSelectCrossing: (crossing: RailwayCrossing) => void;
  onNavigate: (route: ActiveRoute) => void;
  onTrackCrossingOnMap?: (crossing: RailwayCrossing, train: SectorTrain | null) => void;
}

export const JourneyPlannerView: React.FC<JourneyPlannerViewProps> = ({
  crossings,
  trains,
  corridors,
  onSelectCrossing,
  onNavigate,
  onTrackCrossingOnMap
}) => {
  // Origin & Destination - Start empty without hardcoded defaults as requested
  const [originId, setOriginId] = useState<string>('');
  const [destinationId, setDestinationId] = useState<string>('');
  const [customOrigin, setCustomOrigin] = useState<PlaceSearchResult | null>(null);
  const [customDestination, setCustomDestination] = useState<PlaceSearchResult | null>(null);
  const [travelMode, setTravelMode] = useState<TravelMode>('car');
  const [departureOffsetSec, setDepartureOffsetSec] = useState<number>(0);
  const [isPlanning, setIsPlanning] = useState<boolean>(false);
  const [planResult, setPlanResult] = useState<PlannedJourney | null>(null);
  const [savedPlaces, setSavedPlaces] = useState<SavedPlace[]>([]);

  // Selected Route Option
  const [selectedRouteId, setSelectedRouteId] = useState<string>('');
  const [selectedCrossing, setSelectedCrossing] = useState<RouteCrossingHit | null>(null);
  const [panelCollapsed, setPanelCollapsed] = useState<boolean>(false);

  // Search Drawers & Debouncing
  const [originSearchOpen, setOriginSearchOpen] = useState<boolean>(false);
  const [destSearchOpen, setDestSearchOpen] = useState<boolean>(false);
  const [originQuery, setOriginQuery] = useState<string>('');
  const [destQuery, setDestQuery] = useState<string>('');
  const [originResults, setOriginResults] = useState<PlaceSearchResult[]>([]);
  const [destResults, setDestResults] = useState<PlaceSearchResult[]>([]);
  const [isSearchingOrigin, setIsSearchingOrigin] = useState<boolean>(false);
  const [isSearchingDest, setIsSearchingDest] = useState<boolean>(false);
  const [originSearchError, setOriginSearchError] = useState<string | null>(null);
  const [destSearchError, setDestSearchError] = useState<string | null>(null);
  const [activeOriginIndex, setActiveOriginIndex] = useState<number>(-1);
  const [activeDestIndex, setActiveDestIndex] = useState<number>(-1);
  const originTimerRef = useRef<any>(null);
  const destTimerRef = useRef<any>(null);
  const lastCalculatedParamsRef = useRef<string>('');
  const prevRouteDelayRef = useRef<number>(0);

  // Navigation State & Turn-by-Turn Guidance
  const [isNavigating, setIsNavigating] = useState<boolean>(false);
  const [navGpsPos, setNavGpsPos] = useState<[number, number] | null>(null);
  const [gpsAccuracyMeters, setGpsAccuracyMeters] = useState<number | null>(null);
  const [gpsLoading, setGpsLoading] = useState<boolean>(false);
  const [gpsErrorMsg, setGpsErrorMsg] = useState<string | null>(null);
  const [passedCrossingIds, setPassedCrossingIds] = useState<Set<string>>(new Set());
  const [currentStepIdx, setCurrentStepIdx] = useState<number>(0);
  const [distanceToNextStepM, setDistanceToNextStepM] = useState<number>(0);
  const [hasArrived, setHasArrived] = useState<boolean>(false);
  const [isRecalculating, setIsRecalculating] = useState<boolean>(false);
  const offRouteCountRef = useRef<number>(0);
  const [reminderScheduled, setReminderScheduled] = useState<boolean>(false);
  const [alarmModalOpen, setAlarmModalOpen] = useState<boolean>(false);
  const [editingAlarm, setEditingAlarm] = useState<SmartCommuteAlarm | null>(null);
  const [dismissConflict, setDismissConflict] = useState<boolean>(false);
  const [activeAlarms, setActiveAlarms] = useState<SmartCommuteAlarm[]>([]);
  const [quickAlertScheduled, setQuickAlertScheduled] = useState<boolean>(false);
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    const list = nativeService.getSavedPlaces();
    setSavedPlaces(list);
    setTravelMode(nativeService.getTravelMode());
    setActiveAlarms(nativeService.getSmartAlarms());

    // Auto-populate origin from user profile or default landmark, and default destination to Amritsar Jn
    const userProf = nativeService.getUserLocationProfile();
    if (userProf) {
      setNavGpsPos([userProf.lat, userProf.lng]);
      setCustomOrigin({
        placeId: 'user_profile_origin',
        name: userProf.locationName || 'Present Location',
        displayName: userProf.locationName ? `${userProf.locationName}, Amritsar` : 'Present Location, Amritsar',
        locality: 'Amritsar',
        lat: userProf.lat,
        lng: userProf.lng,
        category: 'Profile Location',
        provider: 'User Preference'
      });
      setOriginId('CUSTOM_ORIGIN');
    } else {
      setOriginId('GOLDEN_TEMPLE');
    }

    setDestinationId('ASR_STATION');
  }, []);

  // Map Click Handler: Allows choosing destination or origin directly on the interactive map
  const handleMapClick = async (lat: number, lng: number) => {
    if (isNavigating) return;
    nativeService.triggerHaptic('light');

    try {
      const place = await nativeService.reverseGeocode(lat, lng);
      if (place) {
        setCustomDestination(place);
        setDestinationId('CUSTOM_DEST');
      } else {
        setCustomDestination({
          placeId: `custom_map_${Date.now()}`,
          name: `Map Point (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
          displayName: `Selected Map Point, Amritsar`,
          locality: 'Amritsar',
          lat,
          lng,
          category: 'Map Location',
          provider: 'Map Selection'
        });
        setDestinationId('CUSTOM_DEST');
      }
    } catch {
      setCustomDestination({
        placeId: `custom_map_${Date.now()}`,
        name: `Map Point (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
        displayName: `Selected Map Point, Amritsar`,
        locality: 'Amritsar',
        lat,
        lng,
        category: 'Map Location',
        provider: 'Map Selection'
      });
      setDestinationId('CUSTOM_DEST');
    }
  };

  const resolveCoordinates = (id: string): [number, number] | null => {
    if (!id) return null;
    if (id === 'CUSTOM_ORIGIN' && customOrigin) return [customOrigin.lat, customOrigin.lng];
    if (id === 'CUSTOM_DEST' && customDestination) return [customDestination.lat, customDestination.lng];
    if (id === 'CURRENT_GPS') {
      if (navGpsPos) return navGpsPos;
      const userProf = nativeService.getUserLocationProfile();
      if (userProf) return [userProf.lat, userProf.lng];
      return [31.6200, 74.8765];
    }
    const saved = savedPlaces.find(p => p.id === id);
    if (saved) return [saved.lat, saved.lng];
    const lm = AMRITSAR_LANDMARKS.find(l => l.id === id);
    if (lm) return [lm.lat, lm.lng];
    return null;
  };

  const getOriginLabel = (): string => {
    if (!originId) return '';
    if (originId === 'CUSTOM_ORIGIN' && customOrigin) return customOrigin.name;
    if (originId === 'CURRENT_GPS' && navGpsPos) {
      if (customOrigin && customOrigin.name && customOrigin.name !== 'Present Location') {
        return `${customOrigin.name} (GPS ±${gpsAccuracyMeters || 15}m)`;
      }
      return `Present Location (GPS ±${gpsAccuracyMeters || 15}m)`;
    }
    const saved = savedPlaces.find(p => p.id === originId);
    if (saved) return saved.name;
    const lm = AMRITSAR_LANDMARKS.find(l => l.id === originId);
    if (lm) return lm.name;
    return '';
  };

  const getDestLabel = (): string => {
    if (!destinationId) return '';
    if (destinationId === 'CUSTOM_DEST' && customDestination) return customDestination.name;
    const saved = savedPlaces.find(p => p.id === destinationId);
    if (saved) return saved.name;
    const lm = AMRITSAR_LANDMARKS.find(l => l.id === destinationId);
    if (lm) return lm.name;
    return '';
  };

  // Swap Origin and Destination
  const handleSwapPoints = () => {
    if (!originId && !destinationId) return;
    const prevOrigId = originId;
    const prevOrigCustom = customOrigin;
    const prevDestId = destinationId;
    const prevDestCustom = customDestination;

    setOriginId(prevDestId === 'CUSTOM_DEST' ? 'CUSTOM_ORIGIN' : prevDestId);
    setCustomOrigin(prevDestCustom);
    setDestinationId(prevOrigId === 'CUSTOM_ORIGIN' ? 'CUSTOM_DEST' : prevOrigId);
    setCustomDestination(prevOrigCustom);

    nativeService.triggerHaptic('light');
  };

  // GPS Acquire Handler
  const handleAcquireGps = () => {
    setGpsLoading(true);
    setGpsErrorMsg(null);

    if (!('geolocation' in navigator)) {
      setGpsErrorMsg('Geolocation is not supported by your browser.');
      setGpsLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setNavGpsPos([lat, lng]);
        setGpsAccuracyMeters(Math.round(pos.coords.accuracy));
        setOriginId('CURRENT_GPS');
        setOriginSearchOpen(false);
        setGpsLoading(false);
        nativeService.triggerHaptic('success');

        try {
          const rev = await nativeService.reverseGeocode(lat, lng);
          if (rev && rev.name) {
            setCustomOrigin(rev);
          }
        } catch (e) {}
      },
      (err) => {
        let msg = 'Failed to acquire location.';
        if (err.code === err.PERMISSION_DENIED) {
          msg = 'Location permission denied. Please allow GPS access or search present location manually.';
        } else if (err.code === err.TIMEOUT) {
          msg = 'GPS timed out. Please enter present location manually.';
        }
        setGpsErrorMsg(msg);
        setGpsLoading(false);
        nativeService.triggerHaptic('warning');
      },
      { enableHighAccuracy: true, timeout: 9000, maximumAge: 10000 }
    );
  };

  // Live Geocoding Search Handlers with 300ms Debouncing & Caching
  const handleOriginSearch = (text: string) => {
    setOriginQuery(text);
    setOriginSearchError(null);
    setActiveOriginIndex(-1);
    if (originTimerRef.current) clearTimeout(originTimerRef.current);

    if (text.trim().length < 2) {
      setOriginResults([]);
      setIsSearchingOrigin(false);
      return;
    }

    setIsSearchingOrigin(true);
    originTimerRef.current = setTimeout(async () => {
      try {
        const res = await nativeService.searchPlaces(text.trim(), 8);
        setOriginResults(res);
        if (res.length === 0) {
          setOriginSearchError(`No locations found matching "${text.trim()}". Try landmark name or road.`);
        }
      } catch {
        setOriginSearchError('Search request timed out. Please check your network connection.');
      } finally {
        setIsSearchingOrigin(false);
      }
    }, 300);
  };

  const handleDestSearch = (text: string) => {
    setDestQuery(text);
    setDestSearchError(null);
    setActiveDestIndex(-1);
    if (destTimerRef.current) clearTimeout(destTimerRef.current);

    if (text.trim().length < 2) {
      setDestResults([]);
      setIsSearchingDest(false);
      return;
    }

    setIsSearchingDest(true);
    destTimerRef.current = setTimeout(async () => {
      try {
        const res = await nativeService.searchPlaces(text.trim(), 8);
        setDestResults(res);
        if (res.length === 0) {
          setDestSearchError(`No locations found matching "${text.trim()}". Try landmark name or road.`);
        }
      } catch {
        setDestSearchError('Search request timed out. Please check your network connection.');
      } finally {
        setIsSearchingDest(false);
      }
    }, 300);
  };

  const handleSelectOrigin = (place: PlaceSearchResult) => {
    setCustomOrigin(place);
    setOriginId('CUSTOM_ORIGIN');
    setOriginSearchOpen(false);
    setOriginQuery('');
    setOriginResults([]);
    setOriginSearchError(null);
    nativeService.triggerHaptic('light');
  };

  const handleSelectDest = (place: PlaceSearchResult) => {
    setCustomDestination(place);
    setDestinationId('CUSTOM_DEST');
    setDestSearchOpen(false);
    setDestQuery('');
    setDestResults([]);
    setDestSearchError(null);
    nativeService.triggerHaptic('light');
  };

  const handleOriginKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (originResults.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveOriginIndex(prev => (prev + 1) % originResults.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveOriginIndex(prev => (prev - 1 + originResults.length) % originResults.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeOriginIndex >= 0 && activeOriginIndex < originResults.length) {
        handleSelectOrigin(originResults[activeOriginIndex]);
      } else if (originResults.length > 0) {
        handleSelectOrigin(originResults[0]);
      }
    } else if (e.key === 'Escape') {
      setOriginSearchOpen(false);
    }
  };

  const handleDestKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (destResults.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveDestIndex(prev => (prev + 1) % destResults.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveDestIndex(prev => (prev - 1 + destResults.length) % destResults.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeDestIndex >= 0 && activeDestIndex < destResults.length) {
        handleSelectDest(destResults[activeDestIndex]);
      } else if (destResults.length > 0) {
        handleSelectDest(destResults[0]);
      }
    } else if (e.key === 'Escape') {
      setDestSearchOpen(false);
    }
  };

  // Calculate Routes
  const handleCalculateRoute = async (offsetSec: number = departureOffsetSec, mode: TravelMode = travelMode, force: boolean = false) => {
    const origin = resolveCoordinates(originId);
    const destination = resolveCoordinates(destinationId);

    if (!origin || !destination) {
      setPlanResult(null);
      lastCalculatedParamsRef.current = '';
      return;
    }

    const calcKey = `${originId}_${destinationId}_${offsetSec}_${mode}_${origin[0].toFixed(4)},${origin[1].toFixed(4)}_${destination[0].toFixed(4)},${destination[1].toFixed(4)}`;
    if (!force && lastCalculatedParamsRef.current === calcKey && planResult) {
      return;
    }
    lastCalculatedParamsRef.current = calcKey;

    setIsPlanning(true);
    try {
      const result = await railwayApi.planJourney(origin, destination, offsetSec, mode);
      setPlanResult(result);

      // Check for material route delay changes
      const activeCandidate = result.routes?.find(r => r.id === selectedRouteId) || result.fatakAwareRoute || result.fastestRoadRoute;
      const currentDelay = activeCandidate 
        ? (activeCandidate.crossingDelaySec || 0) 
        : (result.primaryRoute?.additionalDelaySec || 0);
      const routeLabel = activeCandidate?.label || 'Active Route';
      const totalSec = activeCandidate?.totalDurationSec || result.primaryRoute?.totalDurationSec || 1200;
      const firstCrossing = activeCandidate?.crossings?.[0] || result.primaryRoute?.crossings?.[0];

      if (prevRouteDelayRef.current > 0 && currentDelay > prevRouteDelayRef.current) {
        nativeService.checkAndAlertRouteChange({
          routeLabel,
          crossingName: firstCrossing?.name,
          previousDelaySec: prevRouteDelayRef.current,
          newDelaySec: currentDelay,
          currentTravelTimeSec: totalSec
        });
      }
      prevRouteDelayRef.current = currentDelay;

      // Preserve previously selected route if still valid
      if (!selectedRouteId || !result.routes?.some(r => r.id === selectedRouteId)) {
        if (result.fatakAwareRoute) {
          setSelectedRouteId(result.fatakAwareRoute.id);
        } else if (result.fastestRoadRoute) {
          setSelectedRouteId(result.fastestRoadRoute.id);
        } else if (result.primaryRoute) {
          setSelectedRouteId((result.primaryRoute as any).id || 'primary');
        }
      }
    } catch (err) {
      console.warn('Plan route error', err);
    } finally {
      setIsPlanning(false);
    }
  };

  useEffect(() => {
    if (originId && destinationId) {
      handleCalculateRoute(departureOffsetSec, travelMode);
    } else {
      lastCalculatedParamsRef.current = '';
      setPlanResult(null);
      setSelectedRouteId('');
    }
  }, [originId, destinationId, travelMode, departureOffsetSec]);

  // Smart Commute Alarm Handlers
  const handleQuickDepartureAlert = async () => {
    const rec = planResult?.recommendation;
    const destName = getDestLabel();
    const waitMin = rec?.action === 'WAIT' ? Math.round(rec.recommendedDepartureOffsetSec / 60) : 10;
    const triggerTime = new Date(Date.now() + Math.max(1, waitMin) * 60 * 1000);
    const firstCrossing = planResult?.primaryRoute?.crossings?.[0];

    const ok = await nativeService.scheduleNotification({
      title: `⏳ FatakForecast: Optimal Departure for ${destName}`,
      body: `Depart now at ${triggerTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}! Crossing conditions optimal to avoid fatak closures.`,
      category: 'departureReminders',
      scheduledDate: triggerTime,
      crossingId: firstCrossing?.id,
      crossingName: firstCrossing?.name,
      eventSignature: `quick_dep:${destName.toLowerCase()}:${triggerTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      actionUrl: '/planner'
    });

    if (ok) {
      nativeService.playAlarmAudio('chime');
      nativeService.triggerHaptic('success');
      setQuickAlertScheduled(true);
      setTimeout(() => setQuickAlertScheduled(false), 4000);
    }
  };

  const handleToggleAlarm = async (id: string, enabled: boolean) => {
    await nativeService.toggleSmartAlarm(id, enabled);
    setActiveAlarms(nativeService.getSmartAlarms());
    nativeService.triggerHaptic('light');
  };

  const handleDeleteAlarm = async (id: string) => {
    await nativeService.deleteSmartAlarm(id);
    setActiveAlarms(nativeService.getSmartAlarms());
    nativeService.triggerHaptic('medium');
  };

  // Live Navigation Handlers with Step Advancement & Auto-Reroute
  const handleStartNavigation = () => {
    if (!('geolocation' in navigator)) {
      setGpsErrorMsg('Live GPS is not supported on this device.');
      return;
    }

    setIsNavigating(true);
    setHasArrived(false);
    setCurrentStepIdx(0);
    setDistanceToNextStepM(0);
    setPassedCrossingIds(new Set());
    setPanelCollapsed(true);
    offRouteCountRef.current = 0;
    nativeService.triggerHaptic('success');

    const destCoord = resolveCoordinates(destinationId);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const currentCoord: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setNavGpsPos(currentCoord);
        setGpsAccuracyMeters(Math.round(pos.coords.accuracy));

        const activeR = getActiveRoute();
        if (!activeR) return;

        // 1. Check destination arrival (<35 meters)
        if (destCoord) {
          const dToDest = haversineM(currentCoord[0], currentCoord[1], destCoord[0], destCoord[1]);
          if (dToDest <= 35) {
            setHasArrived(true);
            nativeService.playAlarmAudio('chime');
            nativeService.triggerHaptic('success');
          }
        }

        // 2. Turn step guidance & advance when within 35m of maneuver point
        if (activeR.steps && activeR.steps.length > 0) {
          const nextStep = activeR.steps[currentStepIdx + 1];
          if (nextStep && nextStep.location) {
            const dToStep = haversineM(currentCoord[0], currentCoord[1], nextStep.location[0], nextStep.location[1]);
            setDistanceToNextStepM(Math.round(dToStep));
            if (dToStep <= 35) {
              setCurrentStepIdx(prev => Math.min(prev + 1, activeR.steps!.length - 1));
              nativeService.triggerHaptic('light');
            }
          } else {
            const curStep = activeR.steps[currentStepIdx];
            if (curStep && curStep.location) {
              const dToCur = haversineM(currentCoord[0], currentCoord[1], curStep.location[0], curStep.location[1]);
              setDistanceToNextStepM(Math.round(dToCur));
            }
          }
        }

        // 3. Off-route detection: if user is >65m away from polyline for 2 ticks, auto-recalculate
        if (activeR.coordinates && activeR.coordinates.length > 1) {
          const devDist = minDistanceToPolyline(currentCoord, activeR.coordinates);
          if (devDist > 65) {
            offRouteCountRef.current++;
            if (offRouteCountRef.current >= 2) {
              offRouteCountRef.current = 0;
              setIsRecalculating(true);
              nativeService.triggerHaptic('warning');
              handleCalculateRoute(0, travelMode).finally(() => {
                setTimeout(() => setIsRecalculating(false), 2000);
              });
            }
          } else {
            offRouteCountRef.current = 0;
          }
        }

        // 4. Mark passed crossings (<30 meters)
        if (activeR.crossings) {
          activeR.crossings.forEach(c => {
            const d = haversineM(currentCoord[0], currentCoord[1], c.lat, c.lng);
            if (d < 30) {
              setPassedCrossingIds(prev => new Set([...prev, c.id]));
            }
          });
        }
      },
      (err) => {
        let msg = 'Live GPS connection lost.';
        if (err.code === err.PERMISSION_DENIED) {
          msg = 'Location permission denied. Please allow GPS in browser settings.';
        }
        setGpsErrorMsg(msg);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 3000 }
    );
  };

  const handleStopNavigation = () => {
    setIsNavigating(false);
    setHasArrived(false);
    setIsRecalculating(false);
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setPanelCollapsed(false);
    nativeService.triggerHaptic('medium');
  };

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function distToSegmentM(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (dx === 0 && dy === 0) {
      return haversineM(px, py, x1, y1);
    }
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
    const projX = x1 + t * dx;
    const projY = y1 + t * dy;
    return haversineM(px, py, projX, projY);
  }

  function minDistanceToPolyline(pos: [number, number], polyline: [number, number][]): number {
    if (!polyline || polyline.length < 2) return Infinity;
    let minD = Infinity;
    for (let i = 0; i < polyline.length - 1; i++) {
      const d = distToSegmentM(pos[0], pos[1], polyline[i][0], polyline[i][1], polyline[i + 1][0], polyline[i + 1][1]);
      if (d < minD) minD = d;
    }
    return minD;
  }

  function getTurnIcon(modifier?: string, type?: string): string {
    const mod = (modifier || '').toLowerCase();
    const t = (type || '').toLowerCase();
    if (t === 'arrive') return '🏁';
    if (t === 'depart') return '🚗';
    if (mod.includes('left')) return '↰';
    if (mod.includes('right')) return '↱';
    if (mod.includes('slight left')) return '↖';
    if (mod.includes('slight right')) return '↗';
    if (mod.includes('u-turn')) return '↩';
    if (t.includes('roundabout') || t.includes('rotary')) return '🔄';
    return '⬆';
  }

  // Active Route helper
  const getActiveRoute = (): CandidateJourneyRoute | null => {
    if (!planResult) return null;
    if (planResult.routes && planResult.routes.length > 0) {
      const found = planResult.routes.find(r => r.id === selectedRouteId);
      if (found) return found;
      return planResult.fatakAwareRoute || planResult.fastestRoadRoute || planResult.routes[0];
    }
    if (planResult.fatakAwareRoute) return planResult.fatakAwareRoute;
    if (planResult.fastestRoadRoute) return planResult.fastestRoadRoute;
    return null;
  };

  const activeRoute = getActiveRoute();
  const allCandidateRoutes = planResult?.routes || [];
  const fastestRoute = planResult?.fastestRoadRoute;
  const fatakAwareRoute = planResult?.fatakAwareRoute;
  const avoidFataksRoute = planResult?.avoidFataksRoute;
  const crossingsOnRoute = activeRoute?.crossings || [];
  const nextCrossing = crossingsOnRoute.find(c => !passedCrossingIds.has(c.id)) || null;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#0B1220' }}>
      {/* 1. FULL-SCREEN DOMINANT MAP CANVAS */}
      <div style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 1 }}>
        <JourneyRouteMap
          userLocation={resolveCoordinates(originId)}
          destination={resolveCoordinates(destinationId)}
          routes={allCandidateRoutes}
          selectedRoute={activeRoute}
          onSelectRoute={(r) => setSelectedRouteId(r.id)}
          selectedCrossing={selectedCrossing}
          onSelectCrossing={(c) => setSelectedCrossing(c)}
          isNavigating={isNavigating}
          nextCrossing={nextCrossing}
          onMapClick={handleMapClick}
        />
      </div>

      {/* 2. ACTIVE NAVIGATION HUD (TOP TURN-BY-TURN & CROSSING BANNER) */}
      {isNavigating && (
        <div style={{
          position: 'absolute',
          top: '12px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1200,
          width: 'min(94vw, 540px)',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px'
        }}>
          {/* Primary Turn Direction Banner */}
          <div style={{
            backgroundColor: '#124B38',
            color: '#FFFFFF',
            borderRadius: 'var(--radius-md)',
            padding: '11px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: 'var(--shadow-lg)',
            border: '1px solid rgba(255,255,255,0.15)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                backgroundColor: 'rgba(255,255,255,0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '22px',
                flexShrink: 0
              }}>
                {hasArrived ? '🏁' : getTurnIcon(activeRoute?.steps?.[currentStepIdx]?.modifier, activeRoute?.steps?.[currentStepIdx]?.type)}
              </div>

              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#A3D9C3', letterSpacing: '0.02em' }}>
                  {hasArrived ? 'DESTINATION REACHED' : (distanceToNextStepM > 0 ? `In ${distanceToNextStepM < 1000 ? `${distanceToNextStepM} m` : `${(distanceToNextStepM / 1000).toFixed(1)} km`}` : 'Proceed onto route')}
                </div>
                <div style={{ fontSize: '14.5px', fontWeight: 700, color: '#FFFFFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {hasArrived ? 'You have arrived at your destination!' : (activeRoute?.steps?.[currentStepIdx]?.instruction || 'Follow route to destination')}
                </div>
                {activeRoute?.steps && activeRoute.steps[currentStepIdx + 1] && !hasArrived && (
                  <div style={{ fontSize: '10.5px', color: 'rgba(255,255,255,0.7)', marginTop: '1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    Then {activeRoute.steps[currentStepIdx + 1].instruction}
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={handleStopNavigation}
              style={{
                backgroundColor: 'rgba(216, 67, 67, 0.25)',
                border: '1px solid rgba(216, 67, 67, 0.6)',
                color: '#FFB8B8',
                borderRadius: 'var(--radius-sm)',
                padding: '6px 12px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                flexShrink: 0
              }}
            >
              <Square size={11} fill="currentColor" />
              <span>Exit</span>
            </button>
          </div>

          {/* Off-Route Alert Badge */}
          {isRecalculating && (
            <div style={{
              backgroundColor: 'var(--surface-orange)',
              border: '1px solid var(--surface-orange-border)',
              borderRadius: '8px',
              padding: '6px 12px',
              color: 'var(--accent-tangerine)',
              fontSize: '11.5px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <RotateCw size={13} className="animate-spin" />
              <span>Off route (&gt;65m deviation). Recalculating path...</span>
            </div>
          )}

          {/* Upcoming Crossing Proximity Alert */}
          {nextCrossing && (
            <div style={{
              backgroundColor: nextCrossing.conflictSeverity === 'HIGH' ? '#FEECEB' : '#EAF3ED',
              border: `1px solid ${nextCrossing.conflictSeverity === 'HIGH' ? '#F9C3C1' : '#C8E3D2'}`,
              borderRadius: '8px',
              padding: '8px 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              fontSize: '11.5px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                <span>{nextCrossing.conflictSeverity === 'HIGH' ? '⚠️' : '🟢'}</span>
                <span style={{ fontWeight: 700, color: nextCrossing.conflictSeverity === 'HIGH' ? 'var(--critical-red)' : 'var(--accent-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {nextCrossing.name}: {nextCrossing.conflictSeverity === 'HIGH' ? 'Closure Predicted' : 'Clear Passage'}
                </span>
                <span style={{ color: 'var(--text-secondary)', fontSize: '10.5px' }}>
                  ({nextCrossing.distanceAlongRouteKm} km)
                </span>
              </div>

              {avoidFataksRoute && avoidFataksRoute.id !== activeRoute?.id && nextCrossing.conflictSeverity === 'HIGH' && (
                <button
                  onClick={() => setSelectedRouteId(avoidFataksRoute.id)}
                  className="btn btn-tangerine"
                  style={{ padding: '4px 9px', fontSize: '10.5px', fontWeight: 700, flexShrink: 0 }}
                >
                  Bypass via Flyover
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* 2b. ACTIVE NAVIGATION HUD (BOTTOM TRIP PROGRESS BAR) */}
      {isNavigating && (
        <div style={{
          position: 'absolute',
          bottom: '16px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1200,
          width: 'min(94vw, 540px)',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-soft)',
          borderRadius: 'var(--radius-lg)',
          padding: '10px 14px',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
              <span style={{ fontSize: '17px', fontWeight: 800, color: 'var(--accent-emphasis)' }}>
                {activeRoute ? `${activeRoute.distanceKm} km` : '--'}
              </span>
              <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                • ~{activeRoute ? `${activeRoute.totalDurationMin} min` : '--'}
              </span>
            </div>
            <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
              ETA {activeRoute?.estimatedArrivalTime ? new Date(activeRoute.estimatedArrivalTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'} • {crossingsOnRoute.length} railway crossing{crossingsOnRoute.length === 1 ? '' : 's'}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              onClick={() => {
                if (navGpsPos) {
                  nativeService.triggerHaptic('light');
                }
              }}
              title="Re-center Live GPS"
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '50%',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-soft)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-primary)',
                cursor: 'pointer'
              }}
            >
              <Compass size={16} />
            </button>

            <button
              onClick={handleStopNavigation}
              style={{
                backgroundColor: 'var(--status-closed-bg)',
                border: '1px solid var(--status-closed-border)',
                color: 'var(--critical-red)',
                borderRadius: 'var(--radius-sm)',
                padding: '6px 12px',
                fontSize: '11.5px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <Square size={11} fill="currentColor" />
              <span>End Route</span>
            </button>
          </div>
        </div>
      )}

      {/* 3. FLOATING JOURNEY PLANNER PANEL (COMPACT MOBILE FIRST) */}
      {!isNavigating && (
        <div style={{
          position: 'absolute',
          top: '12px',
          left: '12px',
          right: '12px',
          maxWidth: '400px',
          zIndex: 1000,
          maxHeight: 'calc(100% - 24px - var(--bottom-nav-height))',
          overflowY: 'auto',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-soft)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          flexDirection: 'column'
        }}>
        {/* Panel Header */}
        <div style={{
          padding: '14px 16px 12px 16px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: 'var(--bg-secondary)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--accent-primary)' }} />
            <span style={{ fontFamily: 'var(--font-brand)', fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
              Smart Journey
            </span>
            <span style={{ fontSize: '9.5px', fontWeight: 800, padding: '2px 7px', borderRadius: 'var(--radius-full)', backgroundColor: 'rgba(56, 189, 248, 0.15)', color: 'var(--accent-primary)', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
              AMRITSAR
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {/* Travel Mode Selector */}
            <div style={{ display: 'flex', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', padding: '2px', border: '1px solid var(--border-soft)' }}>
              <button
                onClick={() => { setTravelMode('car'); handleCalculateRoute(departureOffsetSec, 'car'); }}
                title="Car (28 km/h)"
                style={{
                  backgroundColor: travelMode === 'car' ? 'var(--accent-primary)' : 'transparent',
                  color: travelMode === 'car' ? 'var(--text-on-accent)' : 'var(--text-secondary)',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '4px 7px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <Car size={13} />
              </button>
              <button
                onClick={() => { setTravelMode('motorcycle'); handleCalculateRoute(departureOffsetSec, 'motorcycle'); }}
                title="Motorcycle (32 km/h)"
                style={{
                  backgroundColor: travelMode === 'motorcycle' ? 'var(--accent-primary)' : 'transparent',
                  color: travelMode === 'motorcycle' ? 'var(--text-on-accent)' : 'var(--text-secondary)',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '4px 7px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <Bike size={13} />
              </button>
              <button
                onClick={() => { setTravelMode('walking'); handleCalculateRoute(departureOffsetSec, 'walking'); }}
                title="Walking (4.5 km/h)"
                style={{
                  backgroundColor: travelMode === 'walking' ? 'var(--accent-primary)' : 'transparent',
                  color: travelMode === 'walking' ? 'var(--text-on-accent)' : 'var(--text-secondary)',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '4px 7px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <Footprints size={13} />
              </button>
            </div>

            <button
              onClick={() => setPanelCollapsed(!panelCollapsed)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary)',
                padding: '4px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center'
              }}
              title={panelCollapsed ? 'Expand panel' : 'Collapse panel'}
            >
              {panelCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
            </button>
          </div>
        </div>

        {/* Collapsible Content */}
        {!panelCollapsed && (
          <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Input Route Block */}
            <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {/* Connecting Vertical Track */}
              <div style={{
                position: 'absolute',
                left: '14px',
                top: '20px',
                bottom: '20px',
                width: '2px',
                backgroundColor: 'var(--border-subtle)'
              }} />

              {/* 1. FROM ORIGIN / PRESENT LOCATION */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }}>
                <div style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  backgroundColor: originId ? 'var(--accent-primary)' : 'var(--text-muted)',
                  boxShadow: originId ? '0 0 6px rgba(56, 189, 248, 0.4)' : 'none',
                  marginLeft: '10px',
                  flexShrink: 0,
                  zIndex: 2
                }} />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    onClick={() => {
                      setOriginSearchOpen(!originSearchOpen);
                      setDestSearchOpen(false);
                    }}
                    style={{
                      backgroundColor: originId ? 'var(--bg-secondary)' : 'var(--bg-surface)',
                      border: `1.5px solid ${originId ? 'var(--border-soft)' : 'var(--accent-primary)'}`,
                      borderRadius: 'var(--radius-md)',
                      padding: '8px 12px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '12.5px',
                      boxShadow: !originId ? '0 0 0 2px rgba(56, 189, 248, 0.15)' : 'none'
                    }}
                  >
                    <span style={{
                      color: originId ? 'var(--text-primary)' : 'var(--accent-primary)',
                      fontWeight: originId ? 600 : 700,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>
                      {originId ? getOriginLabel() : '📍 Select Present Location'}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {originId && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setOriginId('');
                            setCustomOrigin(null);
                            setNavGpsPos(null);
                          }}
                          title="Clear starting point"
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                            padding: '2px',
                            display: 'flex',
                            alignItems: 'center'
                          }}
                        >
                          <X size={13} />
                        </button>
                      )}
                      <Search size={13} style={{ color: originId ? 'var(--text-muted)' : 'var(--accent-primary)', flexShrink: 0 }} />
                    </div>
                  </div>
                </div>

                {/* GPS Locate Quick Button */}
                <button
                  onClick={handleAcquireGps}
                  disabled={gpsLoading}
                  title="Detect Live GPS Location"
                  style={{
                    backgroundColor: originId === 'CURRENT_GPS' ? 'rgba(56, 189, 248, 0.15)' : 'var(--bg-secondary)',
                    border: `1.5px solid ${originId === 'CURRENT_GPS' ? 'var(--accent-primary)' : 'var(--border-soft)'}`,
                    borderRadius: 'var(--radius-md)',
                    padding: '8px 10px',
                    color: originId === 'CURRENT_GPS' ? 'var(--accent-primary)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '11px',
                    fontWeight: 700,
                    flexShrink: 0
                  }}
                >
                  <Compass size={15} className={gpsLoading ? 'animate-spin' : ''} />
                  <span style={{ fontSize: '10.5px' }}>GPS</span>
                </button>
              </div>

              {/* Origin Search & Live GPS Drawer */}
              {originSearchOpen && (
                <div style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1.5px solid var(--accent-primary)',
                  borderRadius: 'var(--radius-md)',
                  padding: '10px',
                  marginTop: '2px',
                  boxShadow: 'var(--shadow-md)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}>
                  {/* 1-Tap Live GPS Button */}
                  <button
                    onClick={handleAcquireGps}
                    disabled={gpsLoading}
                    style={{
                      width: '100%',
                      backgroundColor: 'rgba(56, 189, 248, 0.15)',
                      border: '1px solid var(--accent-primary)',
                      color: 'var(--accent-primary)',
                      borderRadius: '6px',
                      padding: '9px 12px',
                      fontSize: '12px',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      cursor: 'pointer'
                    }}
                  >
                    <Compass size={15} className={gpsLoading ? 'animate-spin' : ''} />
                    <span>{gpsLoading ? 'Acquiring Live GPS Satellite Fix...' : '📍 Use My Live GPS Location (1-Tap)'}</span>
                  </button>

                  {/* Manual Text Search Input */}
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      value={originQuery}
                      onChange={(e) => handleOriginSearch(e.target.value)}
                      onKeyDown={handleOriginKeyDown}
                      placeholder="Or type present location (street, colony, hub)..."
                      autoFocus
                      style={{
                        width: '100%',
                        backgroundColor: 'var(--bg-secondary)',
                        border: '1px solid var(--border-soft)',
                        borderRadius: '6px',
                        padding: '7px 10px 7px 28px',
                        fontSize: '12px',
                        color: 'var(--text-primary)',
                        outline: 'none'
                      }}
                    />
                    <Search size={13} style={{ position: 'absolute', left: '9px', top: '9px', color: 'var(--text-muted)' }} />
                    {isSearchingOrigin && (
                      <Loader2 size={13} className="animate-spin" style={{ position: 'absolute', right: '9px', top: '9px', color: 'var(--accent-primary)' }} />
                    )}
                  </div>

                  {originSearchError && (
                    <div style={{
                      fontSize: '11px',
                      color: 'var(--critical-red)',
                      padding: '5px 8px',
                      backgroundColor: 'var(--status-closed-bg)',
                      borderRadius: '4px',
                      border: '1px solid var(--status-closed-border)'
                    }}>
                      {originSearchError}
                    </div>
                  )}

                  {/* Dynamic Search Results */}
                  {originResults.length > 0 && (
                    <div style={{ maxHeight: '160px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      {originResults.map((res, idx) => {
                        const isHighlighted = idx === activeOriginIndex;
                        return (
                          <div
                            key={res.placeId}
                            onClick={() => handleSelectOrigin(res)}
                            style={{
                              padding: '7px 9px',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              backgroundColor: isHighlighted ? 'rgba(56, 189, 248, 0.15)' : 'var(--bg-secondary)',
                              border: isHighlighted ? '1px solid var(--accent-primary)' : '1px solid transparent',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center'
                            }}
                          >
                            <div>
                              <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '11.5px' }}>{res.name}</div>
                              <div style={{ color: 'var(--text-muted)', fontSize: '10px' }}>{res.locality}</div>
                            </div>
                            {res.category && (
                              <span style={{ fontSize: '9px', fontWeight: 700, padding: '2px 5px', borderRadius: '4px', backgroundColor: 'var(--bg-surface)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}>
                                {res.category}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Quick Hubs (when query is empty) */}
                  {originResults.length === 0 && (
                    <div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 800, letterSpacing: '0.04em', margin: '4px 0 6px 2px' }}>
                        POPULAR DEPARTURE HUBS
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                        {AMRITSAR_LANDMARKS.slice(0, 6).map(lm => (
                          <button
                            key={lm.id}
                            onClick={() => {
                              setOriginId(lm.id);
                              setCustomOrigin(null);
                              setOriginSearchOpen(false);
                            }}
                            style={{
                              backgroundColor: 'var(--bg-secondary)',
                              border: '1px solid var(--border-soft)',
                              borderRadius: 'var(--radius-full)',
                              padding: '3px 8px',
                              fontSize: '10.5px',
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
                  )}
                </div>
              )}

              {/* SWAP BUTTON */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', paddingRight: '44px', margin: '-4px 0' }}>
                <button
                  onClick={handleSwapPoints}
                  title="Swap starting point and destination"
                  style={{
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-soft)',
                    borderRadius: '50%',
                    width: '26px',
                    height: '26px',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: 'var(--shadow-sm)',
                    zIndex: 3
                  }}
                >
                  <ArrowUpDown size={12} />
                </button>
              </div>

              {/* 2. TO DESTINATION */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }}>
                <div style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '2px',
                  backgroundColor: destinationId ? 'var(--accent-tangerine)' : 'var(--text-muted)',
                  boxShadow: destinationId ? '0 0 6px rgba(255, 120, 73, 0.4)' : 'none',
                  marginLeft: '10px',
                  flexShrink: 0,
                  zIndex: 2
                }} />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    onClick={() => {
                      setDestSearchOpen(!destSearchOpen);
                      setOriginSearchOpen(false);
                    }}
                    style={{
                      backgroundColor: destinationId ? 'var(--bg-secondary)' : 'var(--bg-surface)',
                      border: `1.5px solid ${destinationId ? 'var(--border-soft)' : 'var(--accent-tangerine)'}`,
                      borderRadius: 'var(--radius-md)',
                      padding: '8px 12px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '12.5px',
                      boxShadow: !destinationId ? '0 0 0 2px rgba(255, 120, 73, 0.15)' : 'none'
                    }}
                  >
                    <span style={{
                      color: destinationId ? 'var(--text-primary)' : 'var(--accent-tangerine)',
                      fontWeight: destinationId ? 600 : 700,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>
                      {destinationId ? getDestLabel() : '🏁 Choose Destination'}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {destinationId && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDestinationId('');
                            setCustomDestination(null);
                          }}
                          title="Clear destination"
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                            padding: '2px',
                            display: 'flex',
                            alignItems: 'center'
                          }}
                        >
                          <X size={13} />
                        </button>
                      )}
                      <Search size={13} style={{ color: destinationId ? 'var(--text-muted)' : 'var(--accent-tangerine)', flexShrink: 0 }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Destination Search Dropdown Drawer */}
              {destSearchOpen && (
                <div style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1.5px solid var(--accent-tangerine)',
                  borderRadius: 'var(--radius-md)',
                  padding: '10px',
                  marginTop: '2px',
                  boxShadow: 'var(--shadow-md)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      value={destQuery}
                      onChange={(e) => handleDestSearch(e.target.value)}
                      onKeyDown={handleDestKeyDown}
                      placeholder="Search destination in Amritsar (Jaura Phatak, Mall)..."
                      autoFocus
                      style={{
                        width: '100%',
                        backgroundColor: 'var(--bg-secondary)',
                        border: '1px solid var(--border-soft)',
                        borderRadius: '6px',
                        padding: '7px 10px 7px 28px',
                        fontSize: '12px',
                        color: 'var(--text-primary)',
                        outline: 'none'
                      }}
                    />
                    <Search size={13} style={{ position: 'absolute', left: '9px', top: '9px', color: 'var(--text-muted)' }} />
                    {isSearchingDest && (
                      <Loader2 size={13} className="animate-spin" style={{ position: 'absolute', right: '9px', top: '9px', color: 'var(--accent-tangerine)' }} />
                    )}
                  </div>

                  {destSearchError && (
                    <div style={{
                      fontSize: '11px',
                      color: 'var(--critical-red)',
                      padding: '5px 8px',
                      backgroundColor: 'var(--status-closed-bg)',
                      borderRadius: '4px',
                      border: '1px solid var(--status-closed-border)'
                    }}>
                      {destSearchError}
                    </div>
                  )}

                  {/* Search Results */}
                  {destResults.length > 0 && (
                    <div style={{ maxHeight: '160px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      {destResults.map((res, idx) => {
                        const isHighlighted = idx === activeDestIndex;
                        return (
                          <div
                            key={res.placeId}
                            onClick={() => handleSelectDest(res)}
                            style={{
                              padding: '7px 9px',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              backgroundColor: isHighlighted ? 'rgba(255, 120, 73, 0.15)' : 'var(--bg-secondary)',
                              border: isHighlighted ? '1px solid var(--surface-orange-border)' : '1px solid transparent',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center'
                            }}
                          >
                            <div>
                              <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '11.5px' }}>{res.name}</div>
                              <div style={{ color: 'var(--text-muted)', fontSize: '10px' }}>{res.locality}</div>
                            </div>
                            {res.category && (
                              <span style={{ fontSize: '9px', fontWeight: 700, padding: '2px 5px', borderRadius: '4px', backgroundColor: 'var(--bg-surface)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}>
                                {res.category}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Popular Destinations when query empty */}
                  {destResults.length === 0 && (
                    <div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 800, letterSpacing: '0.04em', margin: '4px 0 6px 2px' }}>
                        POPULAR AMRITSAR DESTINATIONS
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                        {AMRITSAR_LANDMARKS.slice(0, 8).map(lm => (
                          <button
                            key={lm.id}
                            onClick={() => {
                              setDestinationId(lm.id);
                              setCustomDestination(null);
                              setDestSearchOpen(false);
                            }}
                            style={{
                              backgroundColor: 'var(--bg-secondary)',
                              border: '1px solid var(--border-soft)',
                              borderRadius: 'var(--radius-full)',
                              padding: '3px 8px',
                              fontSize: '10.5px',
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
                  )}
                </div>
              )}
            </div>

            {/* Error Message if Any */}
            {gpsErrorMsg && (
              <div style={{ fontSize: '11px', color: 'var(--critical-red)', backgroundColor: 'var(--status-closed-bg)', padding: '6px 10px', borderRadius: '6px' }}>
                {gpsErrorMsg}
              </div>
            )}

            {/* Smart Journey Setup Assistant (Shown when locations are missing) */}
            {(!originId || !destinationId) && (
              <div style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1.5px dashed var(--accent-primary)',
                borderRadius: 'var(--radius-md)',
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                  <Sparkles size={15} style={{ color: 'var(--accent-primary)' }} />
                  <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-primary)' }}>
                    SMART ROUTE SETUP
                  </span>
                </div>

                {/* Step 1 Check */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                    <div style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      backgroundColor: originId ? 'rgba(56, 189, 248, 0.15)' : 'var(--bg-surface)',
                      border: `1.5px solid ${originId ? 'var(--accent-primary)' : 'var(--border-soft)'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '10px',
                      fontWeight: 800,
                      color: originId ? 'var(--accent-primary)' : 'var(--text-secondary)',
                      flexShrink: 0
                    }}>
                      {originId ? '✓' : '1'}
                    </div>
                    <div style={{ fontSize: '11.5px', fontWeight: originId ? 600 : 700, color: originId ? 'var(--text-secondary)' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {originId ? getOriginLabel() : 'Set Present Location'}
                    </div>
                  </div>

                  {!originId && (
                    <button
                      onClick={handleAcquireGps}
                      disabled={gpsLoading}
                      className="btn btn-primary"
                      style={{ padding: '4px 8px', fontSize: '10.5px', fontWeight: 700, flexShrink: 0 }}
                    >
                      <Compass size={12} className={gpsLoading ? 'animate-spin' : ''} />
                      <span>{gpsLoading ? 'Locating...' : 'Live GPS'}</span>
                    </button>
                  )}
                </div>

                {/* Step 2 Check */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                    <div style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      backgroundColor: destinationId ? 'rgba(255, 120, 73, 0.15)' : 'var(--bg-surface)',
                      border: `1.5px solid ${destinationId ? 'var(--accent-tangerine)' : 'var(--border-soft)'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '10px',
                      fontWeight: 800,
                      color: destinationId ? 'var(--accent-tangerine)' : 'var(--text-secondary)',
                      flexShrink: 0
                    }}>
                      {destinationId ? '✓' : '2'}
                    </div>
                    <div style={{ fontSize: '11.5px', fontWeight: destinationId ? 600 : 700, color: destinationId ? 'var(--text-secondary)' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {destinationId ? getDestLabel() : 'Choose Destination'}
                    </div>
                  </div>

                  {!destinationId && (
                    <button
                      onClick={() => setDestSearchOpen(true)}
                      className="btn btn-tangerine"
                      style={{ padding: '4px 8px', fontSize: '10.5px', fontWeight: 700, flexShrink: 0 }}
                    >
                      <Search size={12} />
                      <span>Search</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Find Route Button */}
            <button
              onClick={() => handleCalculateRoute(departureOffsetSec, travelMode)}
              disabled={!originId || !destinationId || isPlanning}
              className="btn btn-primary"
              style={{
                width: '100%',
                padding: '11px',
                fontSize: '13.5px',
                fontWeight: 700,
                opacity: (!originId || !destinationId) ? 0.6 : 1,
                cursor: (!originId || !destinationId) ? 'not-allowed' : 'pointer'
              }}
            >
              {isPlanning ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Calculating Smart Route...</span>
                </>
              ) : (
                <>
                  <Navigation size={16} />
                  <span>{(!originId || !destinationId) ? 'Select Locations to Plan Route' : 'Calculate Optimal Route'}</span>
                </>
              )}
            </button>

            {/* ROUTE CALCULATION SHIMMER SKELETON (Prevents layout shift) */}
            {isPlanning && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }} aria-busy="true">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px' }}>
                  <div className="skeleton-box" style={{ width: '130px', height: '14px', borderRadius: '4px' }} />
                  <div className="skeleton-box" style={{ width: '80px', height: '14px', borderRadius: '4px' }} />
                </div>
                {[1, 2, 3].map(i => (
                  <div
                    key={i}
                    style={{
                      padding: '12px 14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      backgroundColor: 'var(--bg-secondary)',
                      border: '1px solid var(--border-soft)',
                      borderRadius: 'var(--radius-md)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div className="skeleton-box" style={{ width: '120px', height: '16px', borderRadius: '4px' }} />
                      <div className="skeleton-box" style={{ width: '65px', height: '18px', borderRadius: 'var(--radius-full)' }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div className="skeleton-box" style={{ width: '75px', height: '12px', borderRadius: '3px' }} />
                      <div className="skeleton-box" style={{ width: '110px', height: '12px', borderRadius: '3px' }} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 4. THE THREE ROUTE OPTIONS COMPARISON (COMPACT STRIP) */}
            {allCandidateRoutes.length > 0 && (() => {
              const conflictCrossing = (fastestRoute?.crossings || []).find(c => c.conflictSeverity === 'HIGH' || (c.delaySec && c.delaySec > 0) || c.currentStatus === 'CLOSED' || c.currentStatus === 'APPROACHING');
              const altRouteOption = avoidFataksRoute || (fatakAwareRoute && fatakAwareRoute.id !== fastestRoute?.id ? fatakAwareRoute : null);
              const hasAvoidanceOpportunity = Boolean(conflictCrossing && altRouteOption && !dismissConflict);

              return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                {/* INTELLIGENT RAILWAY-CROSSING AVOIDANCE CARD (Requirement 4) */}
                {hasAvoidanceOpportunity && altRouteOption && (
                  <div style={{
                    backgroundColor: 'var(--surface-orange)',
                    border: '1.5px solid var(--accent-tangerine)',
                    borderRadius: 'var(--radius-md)',
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-tangerine)', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase' }}>
                      <AlertTriangle size={14} />
                      <span>RAILWAY CROSSING DELAY AHEAD</span>
                    </div>

                    <div style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 600 }}>
                      Your current route may be delayed at {conflictCrossing?.name || 'railway level crossing'}.
                    </div>

                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '8px',
                      fontSize: '11px',
                      backgroundColor: 'var(--bg-surface)',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      border: '1px solid var(--border-subtle)'
                    }}>
                      <div>
                        <div style={{ fontWeight: 800, color: 'var(--accent-primary)', fontSize: '10.5px', marginBottom: '2px' }}>
                          Alternative route:
                        </div>
                        <div>Distance: {altRouteOption.distanceKm} km</div>
                        <div style={{ fontWeight: 600 }}>Duration: {altRouteOption.totalDurationMin} min</div>
                      </div>

                      <div>
                        <div style={{ fontWeight: 800, color: 'var(--text-secondary)', fontSize: '10.5px', marginBottom: '2px' }}>
                          Original route:
                        </div>
                        <div>Duration: {fastestRoute?.totalDurationMin || fastestRoute?.roadDurationMin} min</div>
                        <div style={{ color: 'var(--status-open)', fontWeight: 700 }}>
                          {altRouteOption.totalDurationMin < (fastestRoute?.totalDurationMin || 0)
                            ? `Estimated saved: ~${Math.max(1, Math.round((fastestRoute?.totalDurationMin || 0) - altRouteOption.totalDurationMin))} min`
                            : 'Zero crossing risk'}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
                      <button
                        onClick={() => {
                          setSelectedRouteId(altRouteOption.id);
                          nativeService.triggerHaptic('success');
                        }}
                        className="btn btn-primary"
                        style={{ flex: 1, padding: '7px 10px', fontSize: '11.5px', fontWeight: 700 }}
                      >
                        SWITCH ROUTE
                      </button>
                      <button
                        onClick={() => {
                          setDismissConflict(true);
                          nativeService.triggerHaptic('light');
                        }}
                        className="btn btn-secondary"
                        style={{ padding: '7px 10px', fontSize: '11.5px', fontWeight: 600 }}
                      >
                        KEEP CURRENT ROUTE
                      </button>
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
                    AVAILABLE ROUTE OPTIONS
                  </div>
                  {activeRoute?.dataFreshness && (
                    <span style={{
                      fontSize: '9px',
                      fontWeight: 800,
                      padding: '2px 6px',
                      borderRadius: '3px',
                      backgroundColor: activeRoute.dataFreshness === 'LIVE' ? 'var(--status-open-bg)' : '#F3F4F6',
                      color: activeRoute.dataFreshness === 'LIVE' ? 'var(--status-open)' : 'var(--text-secondary)',
                      border: `1px solid ${activeRoute.dataFreshness === 'LIVE' ? 'var(--status-open-border)' : 'var(--border-subtle)'}`
                    }}>
                      DATA: {activeRoute.dataFreshness}
                    </span>
                  )}
                </div>

                {/* Option 1: FASTEST ROAD */}
                {fastestRoute && (
                  <div
                    onClick={() => setSelectedRouteId(fastestRoute.id)}
                    style={{
                      backgroundColor: selectedRouteId === fastestRoute.id ? 'var(--bg-surface-elevated)' : 'var(--bg-secondary)',
                      border: `1.5px solid ${selectedRouteId === fastestRoute.id ? 'var(--accent-primary)' : 'var(--border-soft)'}`,
                      borderRadius: 'var(--radius-md)',
                      padding: '10px 12px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>
                          DIRECT ROAD
                        </span>
                        {fastestRoute.dataFreshness && (
                          <span style={{ fontSize: '8.5px', fontWeight: 700, color: 'var(--text-muted)' }}>
                            • {fastestRoute.dataFreshness}
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                        {fastestRoute.totalDurationMin || fastestRoute.roadDurationMin} min
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '3px', fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                      <span>{fastestRoute.distanceKm} km • {fastestRoute.crossingsCount} fatak{fastestRoute.crossingsCount === 1 ? '' : 's'}</span>
                      <span style={{
                        color: fastestRoute.isDelayUnknown ? 'var(--warning-amber)' : (fastestRoute.crossingDelaySec ? 'var(--critical-red)' : 'var(--status-open)'),
                        fontWeight: 700,
                        fontSize: '10.5px'
                      }}>
                        {fastestRoute.delayRange ? `Delay: ${fastestRoute.delayRange}` : (fastestRoute.isDelayUnknown ? 'Delay UNCONFIRMED' : 'Clear passage')}
                      </span>
                    </div>

                    {fastestRoute.tradeoffSummary && (
                      <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.3 }}>
                        {fastestRoute.tradeoffSummary}
                      </div>
                    )}
                  </div>
                )}

                {/* Option 2: FATAK-AWARE */}
                {fatakAwareRoute && (
                  <div
                    onClick={() => setSelectedRouteId(fatakAwareRoute.id)}
                    style={{
                      backgroundColor: selectedRouteId === fatakAwareRoute.id ? 'rgba(56, 189, 248, 0.15)' : 'var(--bg-secondary)',
                      border: `1.5px solid ${selectedRouteId === fatakAwareRoute.id ? 'var(--accent-primary)' : 'var(--border-soft)'}`,
                      borderRadius: 'var(--radius-md)',
                      padding: '10px 12px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      boxShadow: selectedRouteId === fatakAwareRoute.id ? 'var(--shadow-sm)' : 'none'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--accent-primary)', letterSpacing: '0.05em' }}>
                          FATAK-AWARE
                        </span>
                        <span style={{ fontSize: '9px', fontWeight: 700, padding: '1px 5px', borderRadius: '3px', backgroundColor: 'var(--bg-surface)', color: 'var(--accent-primary)', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
                          RECOMMENDED
                        </span>
                      </div>
                      <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                        {fatakAwareRoute.totalDurationMin} min
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '3px', fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                      <span>{fatakAwareRoute.distanceKm} km • {fatakAwareRoute.crossingsCount} fatak{fatakAwareRoute.crossingsCount === 1 ? '' : 's'}</span>
                      <span style={{
                        color: fatakAwareRoute.isDelayUnknown ? 'var(--warning-amber)' : (fatakAwareRoute.crossingDelaySec ? 'var(--critical-red)' : 'var(--status-open)'),
                        fontWeight: 700,
                        fontSize: '10.5px'
                      }}>
                        {fatakAwareRoute.delayRange ? `Delay: ${fatakAwareRoute.delayRange}` : 'Clear passage'}
                      </span>
                    </div>

                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '3px', lineHeight: 1.3 }}>
                      {fatakAwareRoute.tradeoffSummary || fatakAwareRoute.description}
                    </div>
                  </div>
                )}

                {/* Option 3: AVOID FATAKS */}
                {avoidFataksRoute && (
                  <div
                    onClick={() => setSelectedRouteId(avoidFataksRoute.id)}
                    style={{
                      backgroundColor: selectedRouteId === avoidFataksRoute.id ? 'rgba(255, 120, 73, 0.15)' : 'var(--bg-secondary)',
                      border: `1.5px solid ${selectedRouteId === avoidFataksRoute.id ? 'var(--accent-tangerine)' : 'var(--border-soft)'}`,
                      borderRadius: 'var(--radius-md)',
                      padding: '10px 12px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--accent-tangerine)', letterSpacing: '0.05em' }}>
                        FLYOVER / BYPASS
                      </span>
                      <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                        {avoidFataksRoute.totalDurationMin || avoidFataksRoute.roadDurationMin} min
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '3px', fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                      <span>{avoidFataksRoute.distanceKm} km • {avoidFataksRoute.crossingsCount} fatak{avoidFataksRoute.crossingsCount === 1 ? '' : 's'}</span>
                      <span style={{ color: 'var(--status-open)', fontWeight: 700, fontSize: '10.5px' }}>
                        0 barrier delay
                      </span>
                    </div>

                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '3px', lineHeight: 1.3 }}>
                      {avoidFataksRoute.isGradeSeparatedFlyover
                        ? `Via ${avoidFataksRoute.bypassName || 'Overbridge'} (continuous grade-separated flow)`
                        : (avoidFataksRoute.tradeoffSummary || 'Minimal rail intersections across road network')}
                    </div>
                  </div>
                )}
              </div>
              );
            })()}

            {/* SMART DEPARTURE RECOMMENDATION & COMMUTE ALARM */}
            {planResult && (
              <div style={{
                backgroundColor: planResult.recommendation?.action === 'WAIT' ? 'var(--status-approaching-bg)' : 'var(--surface-green)',
                border: `1.5px solid ${planResult.recommendation?.action === 'WAIT' ? 'var(--status-approaching-border)' : 'var(--surface-green-border)'}`,
                borderRadius: 'var(--radius-md)',
                padding: '12px 14px',
                marginTop: '4px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Clock size={14} color={planResult.recommendation?.action === 'WAIT' ? 'var(--warning-amber)' : 'var(--accent-primary)'} />
                    <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: planResult.recommendation?.action === 'WAIT' ? 'var(--warning-amber)' : 'var(--accent-emphasis)' }}>
                      {planResult.recommendation?.action === 'WAIT' ? 'Suggested Departure Delay' : 'Optimal Departure Guidance'}
                    </span>
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent-primary)' }}>
                    {planResult.recommendation?.action === 'WAIT' ? `+${Math.round(planResult.recommendation.recommendedDepartureOffsetSec / 60)}m` : 'Clear Passage'}
                  </span>
                </div>

                <div style={{ fontSize: '12px', color: 'var(--text-primary)', lineHeight: '1.4', fontWeight: 500 }}>
                  {planResult.recommendation?.summary || 'Route clear through level crossings. Safe to depart now.'}
                </div>

                {/* ALARM ACTIONS ROW */}
                <div style={{ display: 'flex', gap: '8px', marginTop: '2px' }}>
                  <button
                    type="button"
                    onClick={() => setAlarmModalOpen(true)}
                    className="btn btn-primary"
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      fontSize: '12px',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}
                  >
                    <BellRing size={14} />
                    <span>Set Commute Alarm</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleQuickDepartureAlert}
                    className="btn btn-secondary"
                    style={{
                      padding: '8px 12px',
                      fontSize: '12px',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                    title="Set a one-time reminder before gate closure"
                  >
                    <Clock size={13} />
                    <span>{quickAlertScheduled ? '✓ Scheduled' : 'Quick Alert'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* ACTIVE COMMUTE ALARMS LIST */}
            {activeAlarms.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '2px' }}>
                <div style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  Active Commute Alarms ({activeAlarms.length})
                </div>
                {activeAlarms.map(alarm => (
                  <React.Fragment key={alarm.id}>
                    <div
                      style={{
                        backgroundColor: alarm.enabled ? 'var(--bg-secondary)' : 'var(--bg-surface)',
                        border: `1px solid ${alarm.enabled ? 'var(--surface-green-border)' : 'var(--border-subtle)'}`,
                        borderRadius: 'var(--radius-sm)',
                        padding: '8px 10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '11.5px'
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1, paddingRight: '8px' }}>
                        <div style={{ fontWeight: 700, color: alarm.enabled ? 'var(--text-primary)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{alarm.name}</span>
                          <span style={{
                            fontSize: '9.5px',
                            padding: '1px 5px',
                            borderRadius: '3px',
                            backgroundColor: alarm.recurrence === 'WEEKDAYS' ? 'var(--surface-green)' : alarm.recurrence === 'WEEKENDS' ? 'var(--surface-orange)' : 'var(--bg-surface)',
                            color: alarm.recurrence === 'WEEKDAYS' ? 'var(--accent-primary)' : alarm.recurrence === 'WEEKENDS' ? 'var(--accent-tangerine)' : 'var(--text-secondary)',
                            fontWeight: 700
                          }}>
                            {alarm.recurrence === 'WEEKDAYS' ? 'Weekdays' : alarm.recurrence === 'WEEKENDS' ? 'Weekends' : alarm.recurrence === 'DAILY' ? 'Daily' : 'Once'}
                          </span>
                        </div>
                        <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          ⏰ {alarm.targetTime} • {alarm.autoDetectLocation ? 'Auto-detects GPS' : alarm.originName}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <input
                          type="checkbox"
                          checked={alarm.enabled}
                          onChange={(e) => handleToggleAlarm(alarm.id, e.target.checked)}
                          style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
                          title={alarm.enabled ? 'Alarm enabled' : 'Alarm disabled'}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setEditingAlarm(alarm);
                            setAlarmModalOpen(true);
                          }}
                          style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '2px' }}
                          title="Edit alarm"
                        >
                          <Edit3 size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteAlarm(alarm.id)}
                          style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px' }}
                          title="Delete alarm"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    </div>

                    {/* SMART COMMUTE DEPARTURE BREAKDOWN (Requirement 6) */}
                    {alarm.enabled && (() => {
                      const est = nativeService.calculateAlarmDeparture(
                        alarm,
                        activeRoute?.roadDurationSec,
                        activeRoute?.distanceMeters,
                        activeRoute?.crossingDelaySec || 0
                      );
                      return (
                        <div style={{
                          backgroundColor: 'var(--bg-surface)',
                          border: '1px solid var(--surface-green-border)',
                          borderRadius: 'var(--radius-sm)',
                          padding: '8px 10px',
                          marginBottom: '6px',
                          fontSize: '11px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '4px'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 800, color: 'var(--accent-emphasis)', textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '9.5px' }}>
                              YOUR SMART COMMUTE
                            </span>
                            <span style={{
                              fontSize: '9px',
                              fontWeight: 700,
                              padding: '1px 5px',
                              borderRadius: '3px',
                              backgroundColor: est.urgency === 'LEAVE_IMMEDIATELY' ? 'var(--status-closed-bg)' : (est.urgency === 'LEAVE_SOON' ? 'var(--status-approaching-bg)' : 'var(--surface-green)'),
                              color: est.urgency === 'LEAVE_IMMEDIATELY' ? 'var(--critical-red)' : (est.urgency === 'LEAVE_SOON' ? 'var(--warning-amber)' : 'var(--accent-primary)'),
                              border: `1px solid ${est.urgency === 'LEAVE_IMMEDIATELY' ? 'var(--status-closed-border)' : (est.urgency === 'LEAVE_SOON' ? 'var(--status-approaching-border)' : 'var(--surface-green-border)')}`
                            }}>
                              {est.urgency === 'LEAVE_IMMEDIATELY' ? 'Leave Now!' : (est.urgency === 'LEAVE_SOON' ? 'Leave Soon' : 'On Track')}
                            </span>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px', color: 'var(--text-secondary)' }}>
                            <div>Distance: <strong style={{ color: 'var(--text-primary)' }}>{est.distanceKm} km</strong></div>
                            <div>Travel: <strong style={{ color: 'var(--text-primary)' }}>{est.travelDurationMin}m</strong></div>
                            <div>Crossing Delay: <strong style={{ color: est.potentialCrossingDelayMin > 0 ? 'var(--warning-amber)' : 'var(--status-open)' }}>{est.potentialCrossingDelayMin > 0 ? `+${est.potentialCrossingDelayMin}m` : '0m'}</strong></div>
                            <div>Prep Time: <strong style={{ color: 'var(--text-primary)' }}>{est.prepTimeMin}m</strong></div>
                          </div>

                          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 700, color: 'var(--accent-primary)' }}>
                              Depart: {est.recommendedDepartureTime}
                            </span>
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                              Target: {est.targetArrivalTime}
                            </span>
                          </div>

                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: '1.25' }}>
                            {est.reason}
                          </div>
                        </div>
                      );
                    })()}
                  </React.Fragment>
                ))}
              </div>
            )}

            {/* START NAVIGATION PRIMARY CTA */}
            {activeRoute && !isNavigating && (
              <button
                onClick={handleStartNavigation}
                className="btn btn-primary"
                style={{
                  width: '100%',
                  padding: '12px',
                  fontSize: '13.5px',
                  fontWeight: 800,
                  marginTop: '4px'
                }}
              >
                <Play size={14} fill="#070b14" />
                <span>Start Commuter Navigation</span>
              </button>
            )}

            {/* Departure Offset Selector */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '6px', borderTop: '1px solid var(--border-subtle)' }}>
              <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>Departure Time:</span>
              <select
                value={departureOffsetSec}
                onChange={(e) => {
                  const sec = Number(e.target.value);
                  setDepartureOffsetSec(sec);
                  handleCalculateRoute(sec, travelMode);
                }}
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-soft)',
                  color: 'var(--text-primary)',
                  fontSize: '11.5px',
                  borderRadius: 'var(--radius-sm)',
                  padding: '5px 8px',
                  outline: 'none'
                }}
              >
                <option value={0}>Leave Now</option>
                <option value={300}>Leave in 5 min</option>
                <option value={600}>Leave in 10 min</option>
                <option value={900}>Leave in 15 min</option>
                <option value={1200}>Leave in 20 min</option>
                <option value={1800}>Leave in 30 min</option>
              </select>
            </div>
          </div>
        )}
      </div>
      )}

      {/* 5. CONTEXTUAL CROSSING DETAIL PANEL (FLOATING RIGHT PANEL) */}
      {selectedCrossing && (
        <div style={{
          position: 'absolute',
          bottom: '24px',
          right: '24px',
          zIndex: 1100,
          width: 'min(92vw, 360px)',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-soft)',
          borderRadius: 'var(--radius-lg)',
          padding: '16px 18px',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--accent-primary)', letterSpacing: '0.05em' }}>
                CROSSING INTELLIGENCE
              </div>
              <div style={{ fontFamily: 'var(--font-brand)', fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
                {selectedCrossing.name}
              </div>
              {selectedCrossing.punjabiName && (
                <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                  {selectedCrossing.punjabiName}
                </div>
              )}
            </div>

            <button
              onClick={() => setSelectedCrossing(null)}
              className="btn btn-ghost"
              style={{
                padding: '2px',
                minHeight: '28px'
              }}
            >
              <X size={16} />
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11.5px', color: 'var(--text-secondary)' }}>
            <span>In {selectedCrossing.distanceAlongRouteKm} km</span>
            <span>•</span>
            <span>ETA: {new Date(selectedCrossing.userArrivalTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>

          {/* Status Badge */}
          <div style={{
            padding: '8px 12px',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: selectedCrossing.conflictSeverity === 'HIGH' ? 'var(--status-closed-bg)' : (selectedCrossing.isDelayUnknown ? 'var(--status-approaching-bg)' : 'var(--surface-green)'),
            border: `1px solid ${selectedCrossing.conflictSeverity === 'HIGH' ? 'var(--status-closed-border)' : (selectedCrossing.isDelayUnknown ? 'var(--status-approaching-border)' : 'var(--surface-green-border)')}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <span style={{
              fontSize: '11.5px',
              fontWeight: 800,
              color: selectedCrossing.conflictSeverity === 'HIGH' ? 'var(--critical-red)' : (selectedCrossing.isDelayUnknown ? 'var(--warning-amber)' : 'var(--status-open)')
            }}>
              {selectedCrossing.gateStatusLabel}
            </span>
            <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-primary)' }}>
              {selectedCrossing.isDelayUnknown ? 'Delay Unconfirmed' : (selectedCrossing.delaySec ? `+${Math.round(selectedCrossing.delaySec / 60)}m estimated delay` : 'No delay')}
            </span>
          </div>

          {/* Railway Status & Details */}
          <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            <div><strong>Railway Line:</strong> {selectedCrossing.corridorName || 'Amritsar Line'}</div>
            <div style={{ marginTop: '2px' }}><strong>Station Updates:</strong> {selectedCrossing.observedRailwayStationEvents || 'No active train recorded in this area.'}</div>
            <div style={{ marginTop: '2px' }}><strong>Barrier Status:</strong> Estimated from live train movement</div>
            {selectedCrossing.uncertaintyReason && (
              <div style={{ marginTop: '4px', fontSize: '10.5px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                {selectedCrossing.uncertaintyReason}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Smart Departure Commute Alarm Modal */}
      <SmartAlarmModal
        isOpen={alarmModalOpen}
        onClose={() => {
          setAlarmModalOpen(false);
          setEditingAlarm(null);
        }}
        destinationName={getDestLabel() || 'Destination'}
        destinationCoords={resolveCoordinates(destinationId) || [31.6340, 74.8723]}
        originName={getOriginLabel() || 'Current Location'}
        travelMode={travelMode}
        existingAlarm={editingAlarm}
        onAlarmSaved={() => {
          setActiveAlarms(nativeService.getSmartAlarms());
          setEditingAlarm(null);
        }}
      />
    </div>
  );
};
