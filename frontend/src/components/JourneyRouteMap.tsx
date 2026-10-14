import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Layers, Maximize2, RotateCcw, AlertCircle } from 'lucide-react';
import { CandidateJourneyRoute, RouteCrossingHit } from '../types';

interface JourneyRouteMapProps {
  userLocation: [number, number] | null;
  destination: [number, number] | null;
  routes: CandidateJourneyRoute[];
  selectedRoute: CandidateJourneyRoute | null;
  onSelectRoute: (route: CandidateJourneyRoute) => void;
  selectedCrossing: RouteCrossingHit | null;
  onSelectCrossing: (crossing: RouteCrossingHit) => void;
  isNavigating: boolean;
  nextCrossing: RouteCrossingHit | null;
  isSidebarCollapsed?: boolean;
  onMapClick?: (lat: number, lng: number) => void;
}

const AMRITSAR_CENTER: [number, number] = [31.6340, 74.8723];

export const JourneyRouteMap: React.FC<JourneyRouteMapProps> = ({
  userLocation,
  destination,
  routes,
  selectedRoute,
  onSelectRoute,
  selectedCrossing,
  onSelectCrossing,
  isNavigating,
  nextCrossing,
  onMapClick
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const routeLayersRef = useRef<L.LayerGroup>(L.layerGroup());
  const crossingLayersRef = useRef<L.LayerGroup>(L.layerGroup());
  const originMarkerRef = useRef<L.Marker | null>(null);
  const destMarkerRef = useRef<L.Marker | null>(null);
  const onMapClickRef = useRef(onMapClick);
  const isNavigatingRef = useRef(isNavigating);
  const lastFittedBoundsKeyRef = useRef<string>('');
  const [tileError, setTileError] = useState(false);
  const [activeTileSet, setActiveTileSet] = useState<'voyager' | 'streets'>('voyager');

  useEffect(() => {
    onMapClickRef.current = onMapClick;
    isNavigatingRef.current = isNavigating;
  }, [onMapClick, isNavigating]);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: AMRITSAR_CENTER,
      zoom: 13,
      zoomControl: false,
      attributionControl: false
    });

    // Custom compact zoom control at bottom-right
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Primary basemap: OpenStreetMap Standard (Clean, reliable, no watermark)
    const tileLayer = L.tileLayer(
      'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
        minZoom: 10
      }
    ).addTo(map);

    tileLayer.on('tileerror', () => {
      setTileError(true);
    });

    // Add layer groups
    routeLayersRef.current.addTo(map);
    crossingLayersRef.current.addTo(map);

    map.on('click', (e: L.LeafletMouseEvent) => {
      if (onMapClickRef.current && !isNavigatingRef.current) {
        onMapClickRef.current(e.latlng.lat, e.latlng.lng);
      }
    });

    mapInstanceRef.current = map;

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    if (mapContainerRef.current) {
      resizeObserver.observe(mapContainerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Handle Basemap Toggle
  const toggleBasemap = () => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const nextSet = activeTileSet === 'voyager' ? 'streets' : 'voyager';
    setActiveTileSet(nextSet);

    // Clear existing tile layers
    map.eachLayer(layer => {
      if (layer instanceof L.TileLayer) {
        map.removeLayer(layer);
      }
    });

    const newUrl = nextSet === 'voyager'
      ? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
      : 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

    L.tileLayer(newUrl, { maxZoom: 18, minZoom: 11 }).addTo(map);
  };

  // Auto-fit Selected Route
  const fitRouteBounds = () => {
    const map = mapInstanceRef.current;
    if (!map || !selectedRoute || selectedRoute.coordinates.length === 0) return;

    const bounds = L.latLngBounds(selectedRoute.coordinates);
    const isDesktop = window.innerWidth > 900;

    map.fitBounds(bounds, {
      paddingTopLeft: isDesktop ? [400, 60] : [16, 70],
      paddingBottomRight: isDesktop ? [60, 60] : [16, 70],
      maxZoom: 15
    });
  };

  // Recenter to Amritsar Center
  const recenterAmritsar = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    map.flyTo(AMRITSAR_CENTER, 13, { duration: 0.8 });
  };

  // Render Routes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    routeLayersRef.current.clearLayers();

    if (!routes || routes.length === 0) return;

    // Draw inactive routes first
    const inactiveRoutes = routes.filter(r => selectedRoute ? r.id !== selectedRoute.id : true);
    inactiveRoutes.forEach(route => {
      const isFlyover = route.isGradeSeparatedFlyover || route.type === 'AVOID_FATAKS';

      const polyline = L.polyline(route.coordinates, {
        color: isFlyover ? '#FF7849' : '#8A918A',
        weight: 4,
        opacity: 0.65,
        dashArray: '6, 8',
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(routeLayersRef.current);

      polyline.on('click', () => onSelectRoute(route));
      polyline.bindTooltip(
        `<div style="font-family: inherit; font-size: 11.5px; padding: 3px 6px;">
          <strong>${route.label}</strong><br/>
          <span>${route.distanceKm} km • ~${route.roadDurationMin} min • ${route.crossingsCount} fatak${route.crossingsCount === 1 ? '' : 's'}</span>
        </div>`,
        { direction: 'top', sticky: true }
      );
    });

    // Draw active selected route
    if (selectedRoute && selectedRoute.coordinates.length > 0) {
      const isFlyover = selectedRoute.isGradeSeparatedFlyover || selectedRoute.type === 'AVOID_FATAKS';
      const mainColor = isFlyover ? '#FF7849' : '#176B4D';

      // Pure white casing for contrast
      L.polyline(selectedRoute.coordinates, {
        color: '#FFFFFF',
        weight: 8,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(routeLayersRef.current);

      // Foreground navigation line
      const activeLine = L.polyline(selectedRoute.coordinates, {
        color: mainColor,
        weight: 5,
        opacity: 1,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(routeLayersRef.current);

      activeLine.on('click', () => onSelectRoute(selectedRoute));

      const oLat = userLocation ? userLocation[0].toFixed(3) : 'null';
      const oLng = userLocation ? userLocation[1].toFixed(3) : 'null';
      const dLat = destination ? destination[0].toFixed(3) : 'null';
      const dLng = destination ? destination[1].toFixed(3) : 'null';
      const boundsKey = `${oLat},${oLng}_${dLat},${dLng}_${selectedRoute.id}`;

      if (boundsKey !== lastFittedBoundsKeyRef.current && !isNavigating) {
        lastFittedBoundsKeyRef.current = boundsKey;
        fitRouteBounds();
      }
    }
  }, [routes, selectedRoute?.id, userLocation, destination, isNavigating]);

  // Render Origin & Destination Markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (userLocation) {
      if (originMarkerRef.current) map.removeLayer(originMarkerRef.current);

      const userIcon = L.divIcon({
        className: 'user-nav-marker',
        html: `
          <div style="position: relative; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">
            <div style="position: absolute; width: 30px; height: 30px; border-radius: 50%; background: rgba(23, 107, 77, 0.2);"></div>
            <div style="width: 14px; height: 14px; border-radius: 50%; background: #176B4D; border: 2.5px solid #FFFFFF; box-shadow: 0 2px 6px rgba(0,0,0,0.3);"></div>
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });

      originMarkerRef.current = L.marker(userLocation, { icon: userIcon, zIndexOffset: 2500 })
        .addTo(map)
        .bindTooltip(
          `<div style="font-size: 11px; font-weight: 600;">${isNavigating ? 'Current Location' : 'Start Location'}</div>`,
          { direction: 'top', offset: [0, -8] }
        );

      if (isNavigating) {
        map.panTo(userLocation, { animate: true });
      }
    }

    if (destination) {
      if (destMarkerRef.current) map.removeLayer(destMarkerRef.current);

      const destIcon = L.divIcon({
        className: 'dest-nav-marker',
        html: `
          <div style="width: 24px; height: 24px; border-radius: 50%; background: #FF7849; border: 2.5px solid #FFFFFF; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(255, 120, 73, 0.4);">
            <div style="width: 6px; height: 6px; border-radius: 50%; background: #FFFFFF;"></div>
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });

      destMarkerRef.current = L.marker(destination, { icon: destIcon, zIndexOffset: 2500 })
        .addTo(map)
        .bindTooltip(
          '<div style="font-size: 11px; font-weight: 600;">Destination</div>',
          { direction: 'top', offset: [0, -8] }
        );
    }
  }, [userLocation, destination, isNavigating]);

  // Render Crossing Markers
  useEffect(() => {
    crossingLayersRef.current.clearLayers();

    const activeCrossings = selectedRoute?.crossings || [];

    activeCrossings.forEach(hit => {
      const isNext = nextCrossing ? nextCrossing.id === hit.id : false;
      const isSelected = selectedCrossing ? selectedCrossing.id === hit.id : false;
      const isClosed = hit.predictedStatusAtArrival === 'CLOSED' || hit.conflictSeverity === 'HIGH';

      const statusColor = isClosed ? '#D84343' : (hit.predictedStatusAtArrival === 'APPROACHING' ? '#D99020' : '#176B4D');

      const markerHtml = `
        <div style="
          position: relative;
          background: #FFFFFF;
          border: 2px solid ${statusColor};
          border-radius: 18px;
          padding: 2px 7px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
          display: flex;
          align-items: center;
          gap: 4px;
          font-family: inherit;
          font-size: 10px;
          font-weight: 700;
          color: #242824;
          white-space: nowrap;
          cursor: pointer;
        ">
          <span style="width: 7px; height: 7px; border-radius: 50%; background: ${statusColor};"></span>
          <span>${hit.name.split(' ')[0]}</span>
        </div>
      `;

      const crossingIcon = L.divIcon({
        className: 'route-crossing-icon',
        html: markerHtml,
        iconSize: [70, 24],
        iconAnchor: [35, 12]
      });

      const marker = L.marker([hit.lat, hit.lng], { icon: crossingIcon, zIndexOffset: isNext ? 2200 : 1500 })
        .addTo(crossingLayersRef.current);

      marker.on('click', () => {
        onSelectCrossing(hit);
      });
    });
  }, [selectedRoute?.crossings, nextCrossing?.id, selectedCrossing?.id]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* MAP CANVAS */}
      <div 
        ref={mapContainerRef} 
        style={{ width: '100%', height: '100%', backgroundColor: '#F7F5EF' }}
      />

      {/* TOP RIGHT CONTROLS */}
      <div style={{
        position: 'absolute',
        top: '16px',
        right: '16px',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
      }}>
        <button
          onClick={recenterAmritsar}
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid var(--border-soft)',
            borderRadius: '8px',
            color: 'var(--text-primary)',
            padding: '8px',
            boxShadow: 'var(--shadow-sm)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          title="Recenter Amritsar"
        >
          <RotateCcw size={16} />
        </button>

        <button
          onClick={toggleBasemap}
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid var(--border-soft)',
            borderRadius: '8px',
            color: 'var(--text-primary)',
            padding: '8px',
            boxShadow: 'var(--shadow-sm)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          title="Toggle Map Style"
        >
          <Layers size={16} />
        </button>

        <button
          onClick={fitRouteBounds}
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid var(--border-soft)',
            borderRadius: '8px',
            color: 'var(--text-primary)',
            padding: '8px',
            boxShadow: 'var(--shadow-sm)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          title="Fit Route Bounds"
        >
          <Maximize2 size={16} />
        </button>
      </div>
    </div>
  );
};
