import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { BottomNav } from './components/BottomNav';
import { geofenceService } from './services/geofenceService';

import { HomeView } from './views/HomeView';
import { CrossingsView } from './views/CrossingsView';

// Code-split non-critical routes to eliminate 500KB+ from initial bundle
const UpcomingClosuresView = lazy(() => import('./views/UpcomingClosuresView').then(m => ({ default: m.UpcomingClosuresView })));
const TrainMovementsView = lazy(() => import('./views/TrainMovementsView').then(m => ({ default: m.TrainMovementsView })));
const AnalyticsView = lazy(() => import('./views/AnalyticsView').then(m => ({ default: m.AnalyticsView })));
const DataHealthView = lazy(() => import('./views/DataHealthView').then(m => ({ default: m.DataHealthView })));
const JourneyPlannerView = lazy(() => import('./views/JourneyPlannerView').then(m => ({ default: m.JourneyPlannerView })));
const SavedPlacesView = lazy(() => import('./views/SavedPlacesView').then(m => ({ default: m.SavedPlacesView })));
const NotificationsView = lazy(() => import('./views/NotificationsView').then(m => ({ default: m.NotificationsView })));
const SettingsView = lazy(() => import('./views/SettingsView').then(m => ({ default: m.SettingsView })));

// Lazy-loaded interactive modals (deferred until user opens them)
const CrossingDetailPanel = lazy(() => import('./components/CrossingDetailPanel').then(m => ({ default: m.CrossingDetailPanel })));
const TrainScheduleModal = lazy(() => import('./components/TrainScheduleModal').then(m => ({ default: m.TrainScheduleModal })));
const LocationOnboardingModal = lazy(() => import('./components/LocationOnboardingModal').then(m => ({ default: m.LocationOnboardingModal })));
const CrossingSurveyModal = lazy(() => import('./components/CrossingSurveyModal').then(m => ({ default: m.CrossingSurveyModal })));
const UserSurveysModal = lazy(() => import('./components/UserSurveysModal').then(m => ({ default: m.UserSurveysModal })));
const CinematicIntro = lazy(() => import('./components/CinematicIntro').then(m => ({ default: m.CinematicIntro })));

import { 
  ActiveRoute, 
  RailwayCrossing, 
  SectorTrain, 
  RailwayCorridor, 
  OperationalMetrics, 
  TelemetryPayload,
  UserLocationProfile 
} from './types';
import { railwayApi } from './services/apiService';
import { nativeService } from './services/nativeService';
import { 
  INITIAL_CROSSINGS, 
  INITIAL_TRAINS, 
  INITIAL_CORRIDORS, 
  INITIAL_METRICS 
} from './services/amritsarData';
import { WifiOff, RefreshCw } from 'lucide-react';
import { findImpactingTrainForCrossing } from './utils/trainHelpers';

import { AnimatePresence } from 'framer-motion';
import { App as CapApp } from '@capacitor/app';

// Fast skeleton placeholder for lazy-loaded views
const ViewFallback: React.FC = () => (
  <div className="page-container" style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px' }} aria-busy="true">
    <div className="skeleton-box" style={{ width: '220px', height: '24px', borderRadius: '4px', marginBottom: '8px' }} />
    <div className="skeleton-box" style={{ width: '100%', height: '140px', borderRadius: 'var(--radius-lg)' }} />
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))', gap: '14px', marginTop: '12px' }}>
      {[1, 2, 3].map(i => (
        <div key={i} className="skeleton-box" style={{ width: '100%', height: '180px', borderRadius: 'var(--radius-lg)' }} />
      ))}
    </div>
  </div>
);

// Map pathnames to valid ActiveRoute
function getInitialRoute(): ActiveRoute {
  const path = window.location.pathname;
  if (path === '/crossings') return '/crossings';
  if (path === '/forecasts') return '/forecasts';
  if (path === '/trains') return '/trains';
  if (path === '/planner') return '/planner';
  if (path === '/saved-places') return '/saved-places';
  if (path === '/notifications') return '/notifications';
  if (path === '/data-health') return '/data-health';
  if (path === '/settings') return '/settings';
  if (path === '/analytics') return '/analytics';
  return '/';
}

export function App() {
  const [currentRoute, setCurrentRoute] = useState<ActiveRoute>(getInitialRoute);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [selectedCrossing, setSelectedCrossing] = useState<RailwayCrossing | null>(null);
  const [selectedTrain, setSelectedTrain] = useState<SectorTrain | null>(null);
  const [scheduleModalTrain, setScheduleModalTrain] = useState<SectorTrain | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(true);

  // Check if commuter already saw intro in current session or on device to eliminate 3.5s block
  const [showIntro, setShowIntro] = useState<boolean>(() => {
    try {
      if (typeof window !== 'undefined' && (
        sessionStorage.getItem('fatak_intro_seen') === 'true' ||
        localStorage.getItem('fatak_intro_seen') === 'true'
      )) {
        return false;
      }
    } catch {}
    return true;
  });

  // User Location Profile (persisted locally across restarts)
  const [userProfile, setUserProfile] = useState<UserLocationProfile | null>(() => {
    return nativeService.getUserLocationProfile();
  });
  const [showLocationModal, setShowLocationModal] = useState<boolean>(false);

  // Synchronize user profile and theme updates across app components
  useEffect(() => {
    // Initial theme sync
    nativeService.applyEffectiveTheme(nativeService.getEffectiveTheme());

    const handleProfileUpdate = (e: any) => {
      setUserProfile(e.detail);
    };
    const handleReplayIntro = () => {
      setShowIntro(true);
    };
    window.addEventListener('fatak:location-profile-updated', handleProfileUpdate);
    window.addEventListener('fatak:replay-intro', handleReplayIntro);
    return () => {
      window.removeEventListener('fatak:location-profile-updated', handleProfileUpdate);
      window.removeEventListener('fatak:replay-intro', handleReplayIntro);
    };
  }, []);

  const [surveyCrossing, setSurveyCrossing] = useState<RailwayCrossing | null>(null);
  const [showUserSurveysModal, setShowUserSurveysModal] = useState<boolean>(false);

  // Trigger first-time onboarding modal after startup intro has concluded
  useEffect(() => {
    if (!showIntro && !nativeService.isLocationOnboarded()) {
      setShowLocationModal(true);
    }
  }, [showIntro]);

  // Synchronous hydration from cached telemetry for instant 0ms initial render
  const initialPayload = railwayApi.getLastPayload();
  const [crossings, setCrossings] = useState<RailwayCrossing[]>(initialPayload?.crossings?.length ? initialPayload.crossings : INITIAL_CROSSINGS);
  const [trains, setTrains] = useState<SectorTrain[]>(initialPayload?.trains?.length ? initialPayload.trains : INITIAL_TRAINS);
  const [corridors, setCorridors] = useState<RailwayCorridor[]>(initialPayload?.activeCorridors?.length ? initialPayload.activeCorridors : INITIAL_CORRIDORS);
  const [metrics, setMetrics] = useState<OperationalMetrics>(initialPayload?.metrics || INITIAL_METRICS);
  const [lastUpdate, setLastUpdate] = useState<string>(initialPayload?.timestamp || new Date().toISOString());

  // Geofence proximity monitoring and custom event triggers
  useEffect(() => {
    if (crossings && crossings.length > 0 && userProfile?.gpsConsent) {
      geofenceService.startMonitoring(crossings);
    } else {
      geofenceService.stopMonitoring();
    }

    const handleGeofenceCrossing = (e: any) => {
      const crossing = e.detail?.crossing;
      if (crossing) {
        setSurveyCrossing(crossing);
      }
    };
    const handleOpenSurveys = () => {
      setShowUserSurveysModal(true);
    };

    window.addEventListener('fatak:geofence-crossing-entered', handleGeofenceCrossing);
    window.addEventListener('fatak:open-my-surveys', handleOpenSurveys);

    return () => {
      geofenceService.stopMonitoring();
      window.removeEventListener('fatak:geofence-crossing-entered', handleGeofenceCrossing);
      window.removeEventListener('fatak:open-my-surveys', handleOpenSurveys);
    };
  }, [crossings, userProfile?.gpsConsent]);

  // Track previous crossing statuses to trigger audio alerts on state change
  const prevStatusesRef = useRef<Map<string, string>>(new Map());

  // Browser navigation popstate listener
  useEffect(() => {
    const handlePopState = () => {
      setCurrentRoute(getInitialRoute());
    };
    window.addEventListener('popstate', handlePopState);

    // Native Android Hardware Back Button Handler
    let backSub: any = null;
    try {
      backSub = CapApp.addListener('backButton', () => {
        if (selectedCrossing) {
          setSelectedCrossing(null);
        } else if (window.location.pathname !== '/') {
          navigateTo('/');
        } else {
          CapApp.exitApp();
        }
      });
    } catch (e) {}

    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (backSub) {
        backSub.then((s: any) => s?.remove?.()).catch(() => {});
      }
    };
  }, [selectedCrossing]);

  // Online / offline listeners
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    setIsOnline(navigator.onLine);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const navigateTo = (route: ActiveRoute) => {
    if (window.location.pathname !== route) {
      window.history.pushState({}, '', route);
    }
    setCurrentRoute(route);
  };

  useEffect(() => {
    // Subscribe to live telemetry stream (which handles initial delivery & continuous updates without redundant REST calls)
    const unsubscribe = railwayApi.subscribe((payload: TelemetryPayload) => {
      // Structural sharing for crossings to avoid unnecessary component remounts and re-renders
      setCrossings(prev => {
        if (!prev || prev.length !== payload.crossings.length) {
          return payload.crossings;
        }
        const prevMap = new Map(prev.map(c => [c.id, c]));
        let anyChanged = false;
        const merged = payload.crossings.map(nextC => {
          const prevC = prevMap.get(nextC.id);
          if (
            prevC &&
            prevC.status === nextC.status &&
            prevC.upcomingTrainId === nextC.upcomingTrainId &&
            prevC.estimatedGateClosingTime === nextC.estimatedGateClosingTime &&
            prevC.predictedReopenTime === nextC.predictedReopenTime &&
            prevC.timeToNextClosureSec === nextC.timeToNextClosureSec &&
            prevC.remainingWaitSec === nextC.remainingWaitSec
          ) {
            return prevC;
          }
          anyChanged = true;
          return nextC;
        });
        return anyChanged ? merged : prev;
      });

      if (Array.isArray(payload.trains) && payload.trains.length > 0) {
        setTrains(prev => {
          if (!prev || prev.length !== payload.trains.length) {
            return payload.trains;
          }
          const prevMap = new Map(prev.map(t => [String(t.number || t.id), t]));
          let anyChanged = false;
          const merged = payload.trains.map(nextT => {
            const prevT = prevMap.get(String(nextT.number || nextT.id));
            if (
              prevT &&
              prevT.status === nextT.status &&
              prevT.dataState === nextT.dataState &&
              prevT.lat === nextT.lat &&
              prevT.lng === nextT.lng &&
              prevT.speedKmH === nextT.speedKmH &&
              prevT.delayMinutes === nextT.delayMinutes &&
              prevT.isWithinAmritsarSector === nextT.isWithinAmritsarSector
            ) {
              return prevT;
            }
            anyChanged = true;
            return nextT;
          });
          return anyChanged ? merged : prev;
        });
      }
      if (payload.activeCorridors?.length) {
        setCorridors(payload.activeCorridors);
      }

      setMetrics(prev => {
        if (
          prev &&
          prev.totalCrossings === payload.metrics.totalCrossings &&
          prev.openCount === payload.metrics.openCount &&
          prev.closedCount === payload.metrics.closedCount &&
          prev.approachingCount === payload.metrics.approachingCount &&
          prev.unknownCount === payload.metrics.unknownCount &&
          prev.activeSectorTrains === payload.metrics.activeSectorTrains &&
          prev.feedStatus === payload.metrics.feedStatus
        ) {
          return prev;
        }
        return payload.metrics;
      });
      setLastUpdate(payload.timestamp);

      // Track previous statuses for state transitions without noisy automatic chimes
      payload.crossings.forEach(c => {
        prevStatusesRef.current.set(c.id, c.status);
      });

      // Evaluate and trigger reliable alerts for relevant approaching crossings & credible predicted closures
      nativeService.processTelemetryCrossingAlerts(payload.crossings, payload.trains);

      // Update selected crossing with latest data if open (preserve object identity if unchanged)
      setSelectedCrossing(current => {
        if (!current) return null;
        const updated = payload.crossings.find(item => item.id === current.id);
        if (!updated) return current;
        if (
          current.status === updated.status &&
          current.upcomingTrainId === updated.upcomingTrainId &&
          current.estimatedGateClosingTime === updated.estimatedGateClosingTime &&
          current.predictedReopenTime === updated.predictedReopenTime &&
          current.timeToNextClosureSec === updated.timeToNextClosureSec &&
          current.remainingWaitSec === updated.remainingWaitSec
        ) {
          return current;
        }
        return updated;
      });

      // Update selected train with latest live telemetry (preserve object identity if unchanged)
      setSelectedTrain(current => {
        if (!current) return null;
        const updated = payload.trains.find(t => t.id === current.id || String(t.number) === String(current.number));
        if (!updated) return current;
        if (
          current.status === updated.status &&
          current.dataState === updated.dataState &&
          current.lat === updated.lat &&
          current.lng === updated.lng &&
          current.speedKmH === updated.speedKmH &&
          current.delayMinutes === updated.delayMinutes &&
          current.isWithinAmritsarSector === updated.isWithinAmritsarSector
        ) {
          return current;
        }
        return updated;
      });
    });

    // Periodic check for due Smart Commute Alarms (evaluates current time, weekdays/weekends, GPS)
    const alarmInterval = setInterval(() => {
      nativeService.evaluateAndTriggerDueAlarms();
    }, 25000);

    return () => {
      unsubscribe();
      clearInterval(alarmInterval);
    };
  }, []);

  const handleSelectCrossingAndOpenDetails = (crossing: RailwayCrossing, train?: SectorTrain | null) => {
    const impacting = train || findImpactingTrainForCrossing(crossing, trains);
    setSelectedCrossing(crossing);
    setSelectedTrain(impacting || null);
  };

  return (
    <div className="app-shell">
      {/* PERSISTENT SIDEBAR FOR DESKTOP / TABLET */}
      <Sidebar
        currentRoute={currentRoute}
        onRouteChange={navigateTo}
        metrics={metrics}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* MAIN VIEWPORT */}
      <div className="app-main">
        {/* TOP HEADER */}
        <Navbar
          metrics={metrics}
          lastUpdateTimestamp={lastUpdate}
          userProfile={userProfile}
          onChangeLocation={() => setShowLocationModal(true)}
        />

        {/* OFFLINE BANNER */}
        {!isOnline && (
          <div style={{
            background: 'var(--surface-orange)',
            borderBottom: '1px solid var(--surface-orange-border)',
            color: 'var(--critical-red)',
            padding: '8px 18px',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            zIndex: 50
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <WifiOff size={15} />
              <span style={{ fontWeight: 600 }}>You are currently offline. Showing cached crossing information.</span>
            </div>
            <button 
              onClick={() => railwayApi.initWebSocket()}
              style={{
                background: '#FFFFFF',
                border: '1px solid var(--surface-orange-border)',
                borderRadius: '6px',
                color: 'var(--text-primary)',
                padding: '4px 10px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}
            >
              <RefreshCw size={12} />
              <span>Retry</span>
            </button>
          </div>
        )}

        {/* ROUTED PAGES */}
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', position: 'relative' }}>
          {currentRoute === '/' && (
            <HomeView
              metrics={metrics}
              crossings={crossings}
              trains={trains}
              corridors={corridors}
              onNavigate={navigateTo}
              onSelectCrossing={handleSelectCrossingAndOpenDetails}
            />
          )}

          {(currentRoute === '/crossings' || currentRoute === '/forecasts') && (
            <CrossingsView
              crossings={crossings}
              trains={trains}
              corridors={corridors}
              metrics={metrics}
              lastUpdateTimestamp={lastUpdate}
              onSelectCrossing={handleSelectCrossingAndOpenDetails}
              onNavigate={navigateTo}
              initialFilter={currentRoute === '/forecasts' ? 'CLOSURE_EXPECTED' : undefined}
            />
          )}

          <Suspense fallback={<ViewFallback />}>
            {currentRoute === '/planner' && (
              <JourneyPlannerView
                crossings={crossings}
                trains={trains}
                corridors={corridors}
                onSelectCrossing={handleSelectCrossingAndOpenDetails}
                onNavigate={navigateTo}
              />
            )}

            {currentRoute === '/trains' && (
              <TrainMovementsView
                trains={trains}
                crossings={crossings}
                onSelectCrossing={handleSelectCrossingAndOpenDetails}
                onNavigate={navigateTo}
              />
            )}

            {currentRoute === '/saved-places' && (
              <SavedPlacesView
                crossings={crossings}
                trains={trains}
                onNavigate={navigateTo}
                onSelectCrossing={handleSelectCrossingAndOpenDetails}
              />
            )}

            {currentRoute === '/notifications' && (
              <NotificationsView
                onNavigate={navigateTo}
              />
            )}

            {currentRoute === '/data-health' && (
              <DataHealthView metrics={metrics} />
            )}

            {currentRoute === '/settings' && (
              <SettingsView
                onNavigate={navigateTo}
              />
            )}

            {currentRoute === '/analytics' && (
              <AnalyticsView />
            )}
          </Suspense>
        </div>

        {/* MOBILE ANDROID BOTTOM NAVIGATION BAR */}
        <BottomNav
          currentRoute={currentRoute}
          onRouteChange={navigateTo}
          metrics={metrics}
        />
      </div>

      {/* LAZY LOADED MODALS & OVERLAYS */}
      <Suspense fallback={null}>
        {/* CROSSING DETAIL OVERLAY PANEL */}
        <AnimatePresence>
          {selectedCrossing && (
            <CrossingDetailPanel
              crossing={selectedCrossing}
              corridors={corridors}
              trains={trains}
              onClose={() => setSelectedCrossing(null)}
              onOpenSurvey={(c) => setSurveyCrossing(c)}
            />
          )}
        </AnimatePresence>

        {/* TRAIN SCHEDULE MODAL */}
        {scheduleModalTrain && (
          <TrainScheduleModal
            isOpen={true}
            train={scheduleModalTrain}
            onClose={() => setScheduleModalTrain(null)}
          />
        )}

        {/* CINEMATIC APPLICATION INTRODUCTION (INITIAL LAUNCH ONLY) */}
        {showIntro && (
          <CinematicIntro
            onComplete={() => {
              try {
                sessionStorage.setItem('fatak_intro_seen', 'true');
                localStorage.setItem('fatak_intro_seen', 'true');
              } catch {}
              setShowIntro(false);
              if (!nativeService.isLocationOnboarded()) {
                setShowLocationModal(true);
              }
            }}
          />
        )}

        {/* LOCATION ONBOARDING & PREFERENCES MODAL */}
        {showLocationModal && (
          <LocationOnboardingModal
            isOpen={showLocationModal}
            onClose={() => setShowLocationModal(false)}
            crossings={crossings}
            trains={trains}
            existingProfile={userProfile}
            onSaveProfile={(saved) => {
              setUserProfile(saved);
              setShowLocationModal(false);
            }}
            isInitialOnboarding={!userProfile}
          />
        )}

        {/* CROWDSOURCED CROSSING SURVEY MODAL */}
        {surveyCrossing && (
          <CrossingSurveyModal
            isOpen={!!surveyCrossing}
            crossings={crossings}
            crossing={surveyCrossing}
            onClose={() => setSurveyCrossing(null)}
            onSuccess={() => {
              setSurveyCrossing(null);
            }}
          />
        )}

        {/* USER SURVEY HISTORY MODAL */}
        {showUserSurveysModal && (
          <UserSurveysModal
            isOpen={showUserSurveysModal}
            onClose={() => setShowUserSurveysModal(false)}
          />
        )}
      </Suspense>
    </div>
  );
}

export default App;
