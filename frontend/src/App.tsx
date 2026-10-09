import React, { useState, useEffect, useRef } from 'react';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { MetricsBar } from './components/MetricsBar';
import { DrillModal } from './components/DrillModal';
import { OverviewView } from './views/OverviewView';
import { CrossingsView } from './views/CrossingsView';
import { UpcomingClosuresView } from './views/UpcomingClosuresView';
import { TrainMovementsView } from './views/TrainMovementsView';
import { AnalyticsView } from './views/AnalyticsView';
import { DataHealthView } from './views/DataHealthView';
import { RailwayMap } from './components/RailwayMap';
import { CrossingDetailPanel } from './components/CrossingDetailPanel';

import { 
  ActiveView, 
  RailwayCrossing, 
  SectorTrain, 
  RailwayCorridor, 
  OperationalMetrics, 
  TelemetryPayload 
} from './types';
import { railwayApi } from './services/apiService';
import { 
  INITIAL_CROSSINGS, 
  INITIAL_TRAINS, 
  INITIAL_CORRIDORS, 
  INITIAL_METRICS 
} from './services/amritsarData';

export function App() {
  const [activeView, setActiveView] = useState<ActiveView>('overview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [selectedCrossing, setSelectedCrossing] = useState<RailwayCrossing | null>(null);
  const [drillModalOpen, setDrillModalOpen] = useState(false);
  const [drillInitialCrossing, setDrillInitialCrossing] = useState<RailwayCrossing | null>(null);

  // Live telemetry state
  const [crossings, setCrossings] = useState<RailwayCrossing[]>(INITIAL_CROSSINGS);
  const [trains, setTrains] = useState<SectorTrain[]>(INITIAL_TRAINS);
  const [corridors, setCorridors] = useState<RailwayCorridor[]>(INITIAL_CORRIDORS);
  const [metrics, setMetrics] = useState<OperationalMetrics>(INITIAL_METRICS);
  const [lastUpdate, setLastUpdate] = useState<string>(new Date().toISOString());

  // Track previous crossing statuses to trigger audio alerts on state change
  const prevStatusesRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    // Initial fetch
    railwayApi.getCrossings().then(data => {
      if (data.crossings?.length) setCrossings(data.crossings);
      if (data.corridors?.length) setCorridors(data.corridors);
      if (data.metrics) setMetrics(data.metrics);
    });

    railwayApi.getTrains().then(trainData => {
      if (trainData?.length) setTrains(trainData);
    });

    // Subscribe to live telemetry stream
    const unsubscribe = railwayApi.subscribe((payload: TelemetryPayload) => {
      setCrossings(payload.crossings);
      setTrains(payload.trains);
      if (payload.activeCorridors?.length) {
        setCorridors(payload.activeCorridors);
      }
      setMetrics(payload.metrics);
      setLastUpdate(payload.timestamp);

      // Check for status changes to trigger audible chime
      payload.crossings.forEach(c => {
        const prev = prevStatusesRef.current.get(c.id);
        if (prev && prev !== c.status) {
          if (c.status === 'CLOSED') {
            railwayApi.playAudioChime('CLOSED');
          } else if (c.status === 'APPROACHING') {
            railwayApi.playAudioChime('APPROACH');
          } else if (c.status === 'OPEN') {
            railwayApi.playAudioChime('OPEN');
          }
        }
        prevStatusesRef.current.set(c.id, c.status);
      });

      // Update selected crossing with latest data if open
      setSelectedCrossing(current => {
        if (!current) return null;
        const updated = payload.crossings.find(item => item.id === current.id);
        return updated || current;
      });
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleOpenDrill = (crossing?: RailwayCrossing) => {
    setDrillInitialCrossing(crossing || null);
    setDrillModalOpen(true);
  };

  return (
    <div className="app-container">
      {/* TOP NAVIGATION */}
      <Navbar
        metrics={metrics}
        crossings={crossings}
        onSelectCrossing={(c) => {
          setSelectedCrossing(c);
          setActiveView('overview');
        }}
        onOpenDrillModal={() => handleOpenDrill()}
        lastUpdateTimestamp={lastUpdate}
      />

      {/* METRICS QUICK STATS BAR */}
      <MetricsBar metrics={metrics} />

      {/* BODY WITH SIDEBAR & MAIN VIEW */}
      <div className="app-body">
        <Sidebar
          activeView={activeView}
          onViewChange={(view) => setActiveView(view)}
          metrics={metrics}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />

        <main className="main-viewport">
          {activeView === 'overview' && (
            <OverviewView
              crossings={crossings}
              trains={trains}
              corridors={corridors}
              selectedCrossing={selectedCrossing}
              onSelectCrossing={setSelectedCrossing}
              onOpenDrill={handleOpenDrill}
            />
          )}

          {activeView === 'map' && (
            <div style={{ width: '100%', height: '100%', position: 'relative' }}>
              <RailwayMap
                crossings={crossings}
                trains={trains}
                corridors={corridors}
                selectedCrossing={selectedCrossing}
                onSelectCrossing={setSelectedCrossing}
                height="100%"
              />
              {selectedCrossing && (
                <CrossingDetailPanel
                  crossing={selectedCrossing}
                  corridors={corridors}
                  trains={trains}
                  onClose={() => setSelectedCrossing(null)}
                  onOpenDrill={handleOpenDrill}
                />
              )}
            </div>
          )}

          {activeView === 'crossings' && (
            <CrossingsView
              crossings={crossings}
              trains={trains}
              corridors={corridors}
              onSelectCrossing={setSelectedCrossing}
              onNavigateToMap={() => setActiveView('map')}
              onOpenDrill={handleOpenDrill}
            />
          )}

          {activeView === 'upcoming' && (
            <UpcomingClosuresView
              crossings={crossings}
              trains={trains}
              onSelectCrossing={setSelectedCrossing}
              onNavigateToMap={() => setActiveView('map')}
            />
          )}

          {activeView === 'trains' && (
            <TrainMovementsView
              trains={trains}
              crossings={crossings}
              onSelectCrossing={setSelectedCrossing}
              onNavigateToMap={() => setActiveView('map')}
            />
          )}

          {activeView === 'analytics' && (
            <AnalyticsView crossings={crossings} />
          )}

          {activeView === 'health' && (
            <DataHealthView metrics={metrics} />
          )}
        </main>
      </div>

      {/* OPERATIONAL DRILL SIMULATOR MODAL */}
      <DrillModal
        isOpen={drillModalOpen}
        onClose={() => setDrillModalOpen(false)}
        crossings={crossings}
        initialCrossing={drillInitialCrossing}
      />
    </div>
  );
}

export default App;
