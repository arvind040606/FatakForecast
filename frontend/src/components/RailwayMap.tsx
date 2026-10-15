import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { 
  RotateCcw, 
  Layers, 
  Eye, 
  EyeOff, 
  TrainTrack,
  Filter
} from 'lucide-react';
import { RailwayCrossing, SectorTrain, RailwayCorridor } from '../types';
import rawOsmTracks from '../data/amritsar_tracks_osm.json';
import { findImpactingTrainForCrossing } from '../utils/trainHelpers';
import { normalizeBearingDiff, snapToTrackGeometry, validateTrainCoordinates } from '../utils/geoUtils';


interface RailwayMapProps {
  crossings: RailwayCrossing[];
  trains: SectorTrain[];
  corridors: RailwayCorridor[];
  selectedCrossing: RailwayCrossing | null;
  onSelectCrossing: (crossing: RailwayCrossing) => void;
  height?: string;
  statusFilter?: string;
  onStatusFilterChange?: (status: string) => void;
  showControlsBar?: boolean;
  selectedTrain?: SectorTrain | null;
  onSelectTrain?: (train: SectorTrain | null) => void;
  onOpenTrainSchedule?: (train: SectorTrain) => void;
}

const AMRITSAR_CENTER: [number, number] = [31.6340, 74.8723];
const DEFAULT_ZOOM = 13;

export const RailwayMap: React.FC<RailwayMapProps> = ({
  crossings,
  trains,
  corridors,
  selectedCrossing,
  onSelectCrossing,
  height = '100%',
  statusFilter = 'ALL',
  onStatusFilterChange,
  showControlsBar = true,
  selectedTrain,
  onSelectTrain,
  onOpenTrainSchedule
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const crossingMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const trainMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const corridorLayersRef = useRef<L.Polyline[]>([]);

  const [showTracks, setShowTracks] = useState(true);
  const [showTrains, setShowTrains] = useState(true);
  const [activeTileLayer, setActiveTileLayer] = useState<'dark' | 'satellite'>('dark');
  const [localStatusFilter, setLocalStatusFilter] = useState(statusFilter);
  const [internalSelectedTrain, setInternalSelectedTrain] = useState<SectorTrain | null>(null);

  const activeSelectedTrain = selectedTrain !== undefined ? selectedTrain : internalSelectedTrain;

  const handleSelectTrain = (t: SectorTrain | null) => {
    setInternalSelectedTrain(t);
    onSelectTrain?.(t);
  };

  const handleFlyToTrain = (t: SectorTrain) => {
    handleSelectTrain(t);
    if (mapInstanceRef.current && typeof t.lat === 'number' && typeof t.lng === 'number') {
      mapInstanceRef.current.flyTo([t.lat, t.lng], 15, { duration: 1.2 });
    }
  };

  const handleFitAllTrains = () => {
    if (!mapInstanceRef.current || trains.length === 0) return;
    const validTrainCoords = trains
      .filter(t => typeof t.lat === 'number' && typeof t.lng === 'number' && t.lat !== 0 && t.lng !== 0)
      .map(t => [t.lat!, t.lng!] as [number, number]);
    if (validTrainCoords.length > 0) {
      const bounds = L.latLngBounds(validTrainCoords);
      mapInstanceRef.current.fitBounds(bounds, { padding: [70, 70], maxZoom: 14 });
    }
  };

  const tileLayerRef = useRef<L.TileLayer | null>(null);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: AMRITSAR_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: false,
      attributionControl: true
    });

    // Custom positioned zoom control
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Esri World Dark Gray Base (Free, verified, reliable, no API key required)
    const darkTileLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
      {
        attribution: '&copy; <a href="https://www.esri.com/">Esri</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors (ODbL) | FatakForecast Amritsar',
        maxZoom: 16
      }
    ).addTo(map);

    tileLayerRef.current = darkTileLayer;
    mapInstanceRef.current = map;

    // Station landmark markers
    const stations = [
      { name: 'Amritsar Junction (ASR)', coords: [31.6337, 74.8655] as [number, number], code: 'ASR' },
      { name: 'Verka Junction (VKA)', coords: [31.6811, 74.9224] as [number, number], code: 'VKA' },
      { name: 'Chheharta (CIA)', coords: [31.6385, 74.7892] as [number, number], code: 'CIA' },
      { name: 'Bhagtanwala (BGTN)', coords: [31.6055, 74.8680] as [number, number], code: 'BGTN' },
      { name: 'Manawala (MOW)', coords: [31.5760, 74.9780] as [number, number], code: 'MOW' }
    ];

    stations.forEach(st => {
      const icon = L.divIcon({
        className: 'station-pin',
        html: `
          <div style="
            background: #111B2E;
            border: 1px solid #25344A;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: 600;
            color: #94A3B8;
            font-family: var(--font-mono);
            white-space: nowrap;
            box-shadow: 0 2px 6px rgba(0,0,0,0.4);
          ">
            <span style="color: #35C8F4;">🚉</span> ${st.code}
          </div>
        `,
        iconSize: [60, 20],
        iconAnchor: [30, 10]
      });

      L.marker(st.coords, { icon })
        .bindTooltip(`<strong>${st.name}</strong><br/>Railway Division Node`, { direction: 'top' })
        .addTo(map);
    });

    // Auto-resize observer
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

  // Handle Tile Layer Switch
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !tileLayerRef.current) return;

    map.removeLayer(tileLayerRef.current);

    if (activeTileLayer === 'satellite') {
      tileLayerRef.current = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: '&copy; Esri, Maxar, Earthstar Geographics',
          maxZoom: 18
        }
      ).addTo(map);
    } else {
      tileLayerRef.current = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: '&copy; <a href="https://www.esri.com/">Esri</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors (ODbL) | FatakForecast Amritsar',
          maxZoom: 16
        }
      ).addTo(map);
    }
  }, [activeTileLayer]);

  // Render Tracks
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    corridorLayersRef.current.forEach(layer => map.removeLayer(layer));
    corridorLayersRef.current = [];

    if (!showTracks) return;

    // 1. Render all 80 authentic OpenStreetMap railway track ways
    (rawOsmTracks as any[]).forEach(track => {
      if (!track.coordinates || track.coordinates.length < 2) return;
      
      const trackBase = L.polyline(track.coordinates, {
        color: '#1A2638',
        weight: 4,
        opacity: 0.8
      }).addTo(map);

      const trackRails = L.polyline(track.coordinates, {
        color: '#35C8F4',
        weight: 1.5,
        opacity: 0.7,
        dashArray: '5, 5'
      }).addTo(map);

      corridorLayersRef.current.push(trackBase, trackRails);
    });

    // 2. Render primary corridor highlighted alignment overlays
    corridors.forEach(corridor => {
      const corridorGlow = L.polyline(corridor.coordinates, {
        color: '#35C8F4',
        weight: 3,
        opacity: 0.4
      }).addTo(map);

      corridorGlow.bindTooltip(`
        <div style="font-size: 11px;">
          <strong style="color: #35C8F4;">${corridor.name}</strong><br/>
          <span>${corridor.type} • Max ${corridor.speedLimitKmH} km/h</span><br/>
          <span style="color: #94A3B8; font-size: 10px;">Source: OpenStreetMap Railway Tracks</span>
        </div>
      `, { sticky: true });

      corridorLayersRef.current.push(corridorGlow);
    });
  }, [corridors, showTracks]);

  // Update Crossing Markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const currentFilter = onStatusFilterChange ? statusFilter : localStatusFilter;

    crossings.forEach(c => {
      const isVisible = currentFilter === 'ALL' || c.status === currentFilter;
      
      if (!isVisible) {
        if (crossingMarkersRef.current.has(c.id)) {
          map.removeLayer(crossingMarkersRef.current.get(c.id)!);
          crossingMarkersRef.current.delete(c.id);
        }
        return;
      }

      const isSelected = selectedCrossing?.id === c.id;
      let statusColor = '#10B981';
      let iconSymbol = 'OPEN';

      if (c.status === 'CLOSURE_REPORTED' || c.status === 'CLOSED') {
        statusColor = '#EF4444';
        iconSymbol = 'CLOSED';
      } else if (c.status === 'CLOSURE_EXPECTED') {
        statusColor = '#F97316';
        iconSymbol = 'CLOSING';
      } else if (c.status === 'APPROACHING') {
        statusColor = '#F59E0B';
        iconSymbol = 'WARN';
      } else if (c.status === 'UNKNOWN') {
        statusColor = '#94A3B8';
        iconSymbol = 'UNKNOWN';
      }

      const icon = L.divIcon({
        className: 'custom-crossing-marker',
        html: `
          <div style="
            display: flex;
            align-items: center;
            gap: 6px;
            background: #111B2E;
            border: ${isSelected ? '2px solid #35C8F4' : `1px solid ${statusColor}`};
            padding: 3px 8px;
            border-radius: 5px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.6);
            white-space: nowrap;
            cursor: pointer;
          ">
            <span style="
              width: 7px; 
              height: 7px; 
              border-radius: 50%; 
              background: ${statusColor};
              display: inline-block;
            "></span>
            <span style="
              font-size: 11px; 
              font-weight: 600; 
              color: #F1F5F9; 
              font-family: var(--font-main);
            ">
              ${c.name}
            </span>
            <span style="
              font-size: 9px;
              font-weight: 700;
              color: ${statusColor};
              font-family: var(--font-mono);
              background: rgba(0,0,0,0.25);
              padding: 1px 4px;
              border-radius: 3px;
            ">
              ${iconSymbol}
            </span>
          </div>
        `,
        iconSize: [110, 26],
        iconAnchor: [55, 13]
      });

      if (crossingMarkersRef.current.has(c.id)) {
        const marker = crossingMarkersRef.current.get(c.id)!;
        marker.setIcon(icon);
        marker.setLatLng([c.lat, c.lng]);
      } else {
        const marker = L.marker([c.lat, c.lng], { icon }).addTo(map);
        marker.on('click', () => {
          onSelectCrossing(c);
        });
        marker.bindTooltip(`
          <div style="font-size: 11px; font-family: var(--font-main); line-height: 1.4;">
            <strong>${c.name}</strong> ${c.punjabiName ? `<span style="color: #94A3B8;">(${c.punjabiName})</span>` : ''}<br/>
            <span style="color: #35C8F4; font-family: var(--font-mono); font-size: 10px;">${c.id}</span><br/>
            <span style="color: #94A3B8; font-size: 10px;">${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}</span><br/>
            <span style="color: ${c.verificationStatus === 'REQUIRES_FIELD_VERIFICATION' ? '#F59E0B' : '#10B981'}; font-size: 10px; font-weight: 600;">
              ${c.verificationLabel}
            </span> • <span style="color: ${statusColor}; font-weight: 600;">${c.status}</span>
            ${(c.totalUpcomingTrains && c.totalUpcomingTrains > 1) ? `<br/><span style="color: #F59E0B; font-weight: 700; font-size: 10px;">⚡ ${c.totalUpcomingTrains} approaching trains</span>` : ''}
          </div>
        `, { direction: 'top', offset: [0, -12] });

        crossingMarkersRef.current.set(c.id, marker);
      }
    });
  }, [crossings, selectedCrossing, onSelectCrossing, statusFilter, localStatusFilter, onStatusFilterChange]);

  const [followTrainActive, setFollowTrainActive] = useState<boolean>(false);
  const approachTrajectoryLayerRef = useRef<L.Polyline | null>(null);
  const approachMidpointMarkerRef = useRef<L.Marker | null>(null);

  // High-Precision 60fps Dead-Reckoning Animation State Map
  const trainAnimStatesRef = useRef<Map<string, {
    currentLat: number;
    currentLng: number;
    targetLat: number;
    targetLng: number;
    currentBearing: number;
    targetBearing: number;
    startTime: number;
    durationMs: number;
    lastObservationMs?: number;
    isStationary?: boolean;
  }>>(new Map());

  // Link approaching train for selected crossing
  const linkedTrain = activeSelectedTrain || (selectedCrossing ? findImpactingTrainForCrossing(selectedCrossing, trains) : null);

  // Update Train Markers (Realistic 3D Locomotive & Coach Consist)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (!showTrains) {
      trainMarkersRef.current.forEach(m => map.removeLayer(m));
      trainMarkersRef.current.clear();
      trainAnimStatesRef.current.clear();
      return;
    }

    const now = performance.now();

    trains.forEach(t => {
      // 1. Strict validation: Missing, invalid, or out-of-sector coordinates must NEVER produce fabricated map markers
      if (typeof t.lat !== 'number' || typeof t.lng !== 'number' || !validateTrainCoordinates(t.lat, t.lng)) {
        if (trainMarkersRef.current.has(t.id)) {
          map.removeLayer(trainMarkersRef.current.get(t.id)!);
          trainMarkersRef.current.delete(t.id);
          trainAnimStatesRef.current.delete(t.id);
        }
        return;
      }

      const trainLat: number = t.lat;
      const trainLng: number = t.lng;

      // 2. Out-of-order & stale observation rejection
      const effectiveLastPing = t.lastPing || (t as any).updatedAt;
      const obsTimestamp = t.providerObservationTimestamp 
        ? new Date(t.providerObservationTimestamp).getTime() 
        : (effectiveLastPing ? new Date(effectiveLastPing).getTime() : now);
      
      const existingAnim = trainAnimStatesRef.current.get(t.id);
      if (existingAnim && existingAnim.lastObservationMs && obsTimestamp < existingAnim.lastObservationMs) {
        // Reject out-of-order stale telemetry packet
        return;
      }

      // 3. Snap to authentic OpenStreetMap track geometry
      const isStationary = t.speedKmH === 0 || t.status === 'PLATFORM_BOARDING' || t.status === 'STATIONARY' || t.status === 'TERMINATED' || t.status === 'NOT_STARTED';
      const snap = snapToTrackGeometry(trainLat, trainLng, rawOsmTracks as any, t.direction, 350);
      const resolvedLat: number = snap.isSnapped ? snap.lat : trainLat;
      const resolvedLng: number = snap.isSnapped ? snap.lng : trainLng;
      const resolvedBearing = (snap.isSnapped && snap.bearing !== 0)
        ? snap.bearing
        : (typeof t.bearing === 'number' ? t.bearing : 0);

      const isTargeted = Boolean(linkedTrain && linkedTrain.id === t.id);
      const isVande = t.number === '22488';
      const isPassenger = t.type.toLowerCase().includes('dmu') || t.type.toLowerCase().includes('passenger') || t.number === '74688';
      const isStale = Boolean(t.isStale || t.dataState === 'STALE');
      const themeClass = isVande ? 'vande-bharat' : (isPassenger ? 'passenger' : 'superfast');
      const themeColor = isVande ? '#38BDF8' : (isPassenger ? '#F59E0B' : '#EF4444');

      // 4. Update / Initialize animation state with shortest-arc angular reconciliation
      if (existingAnim) {
        const diffBearing = normalizeBearingDiff(resolvedBearing, existingAnim.currentBearing);
        trainAnimStatesRef.current.set(t.id, {
          currentLat: existingAnim.currentLat,
          currentLng: existingAnim.currentLng,
          targetLat: resolvedLat,
          targetLng: resolvedLng,
          currentBearing: existingAnim.currentBearing,
          targetBearing: existingAnim.currentBearing + diffBearing,
          startTime: now,
          durationMs: isStationary ? 500 : 3000,
          lastObservationMs: obsTimestamp,
          isStationary
        });
      } else {
        trainAnimStatesRef.current.set(t.id, {
          currentLat: resolvedLat,
          currentLng: resolvedLng,
          targetLat: resolvedLat,
          targetLng: resolvedLng,
          currentBearing: resolvedBearing,
          targetBearing: resolvedBearing,
          startTime: now,
          durationMs: 3000,
          lastObservationMs: obsTimestamp,
          isStationary
        });
      }


      const spdBadgeText = isStale ? 'STALE' : (isStationary ? 'HALT' : (t.speedKmH > 0 ? `${Math.round(t.speedKmH)} km/h` : 'HALT'));
      const posTypeLabel = t.positionClassification === 'PROVIDER_REPORTED_POSITION'
        ? 'Verified Live GPS'
        : t.positionClassification === 'EXTRAPOLATED_POSITION'
        ? 'Live Movement'
        : t.positionClassification === 'STATION_PROGRESS'
        ? 'Station Progress (Estimated)'
        : t.positionClassification === 'SCHEDULED_POSITION'
        ? 'Scheduled Departure'
        : t.positionClassification === 'SIMULATED_POSITION'
        ? 'Simulated Movement'
        : (snap.isSnapped ? 'Track Position' : 'Estimated Position');

      // 3D Realistic Locomotive Consist with High-Beam Headlights
      const icon = L.divIcon({
        className: 'live-train-marker-wrapper',
        html: `
          <div class="train-3d-marker-container">
            ${isTargeted ? '<div class="train-target-lock-halo"></div>' : ''}
            <div class="train-radar-ping ${themeClass} ${isStale ? 'stale' : ''}"></div>

            <!-- 3D Perspective Scene rotated along train bearing -->
            <div class="train-3d-scene" style="transform: rotate(${resolvedBearing}deg);">
              <!-- Realistic Ground Shadow on permanent way rails -->
              <div class="train-3d-shadow"></div>

              <!-- High-Intensity Forward Headlight Beam on track (dimmed if stationary or stale) -->
              <div class="train-headlight-cone" style="opacity: ${isStationary || isStale ? 0.25 : 0.95};"></div>

              <!-- 3D Vertical Train Consist (Locomotive Leading on Top, Coach Trailing on Bottom) -->
              <div class="train-3d-consist">
                <!-- Leading Locomotive Engine Cab -->
                <div class="train-loco-3d ${themeClass}">
                  <div class="loco-headlight-leds">
                    <div class="loco-lamp-dot"></div>
                    <div class="loco-lamp-dot"></div>
                  </div>
                  <div class="loco-windshield"></div>
                  <div class="loco-pantograph"></div>
                </div>

                <!-- Heavy Mechanical Coupler -->
                <div class="train-coupler-joint"></div>

                <!-- Trailing Passenger Coach -->
                <div class="train-coach-3d ${themeClass}">
                  <div class="coach-window-lit"></div>
                  <div class="coach-window-lit"></div>
                  <div class="coach-window-lit"></div>
                </div>
              </div>
            </div>

            <!-- Floating Live Radar HUD Tag -->
            <div class="train-3d-hud-tag ${isTargeted ? 'tracked' : ''} ${isStale ? 'stale' : ''}">
              <span>#${t.number}</span>
              <span class="spd-badge">${spdBadgeText}</span>
            </div>
          </div>
        `,
        iconSize: [60, 110],
        iconAnchor: [30, 55]
      });

      if (trainMarkersRef.current.has(t.id)) {
        const marker = trainMarkersRef.current.get(t.id)!;
        marker.setIcon(icon);
      } else {
        const marker = L.marker([resolvedLat, resolvedLng], { icon, zIndexOffset: 3500 }).addTo(map);
        marker.on('click', () => {
          handleFlyToTrain(t);
        });
        marker.bindTooltip(`
          <div style="font-size: 11px; font-family: var(--font-main); line-height: 1.4;">
            <strong style="color: #F1F5F9;">${t.name} (#${t.number})</strong><br/>
            <span style="color: #94A3B8;">Route: ${t.origin} ➔ ${t.destination}</span><br/>
            <span style="color: ${themeColor}; font-weight: 600;">Speed: ${t.speedKmH ? `${t.speedKmH} km/h` : 'Stationary'} • ${t.status}</span><br/>
            <span style="color: #35C8F4; font-size: 10px;">Classification: ${posTypeLabel}</span><br/>
            <span style="color: #64748B; font-size: 10px;">Corridor: ${t.corridorId || 'Amritsar Division'}</span>
          </div>
        `, { direction: 'top', offset: [0, -18] });

        trainMarkersRef.current.set(t.id, marker);
      }
    });

    const activeIds = new Set(trains.map(t => t.id));
    trainMarkersRef.current.forEach((m, id) => {
      if (!activeIds.has(id)) {
        map.removeLayer(m);
        trainMarkersRef.current.delete(id);
        trainAnimStatesRef.current.delete(id);
      }
    });
  }, [trains, showTrains, linkedTrain?.id]);

  // Smooth 60fps Continuous Motion Loop with Tab Suspension Guard & Bounded Extrapolation
  useEffect(() => {
    let animId: number;
    let lastFrameTime = performance.now();

    const animate = () => {
      const map = mapInstanceRef.current;
      const now = performance.now();

      // Guard against browser-tab suspension: Clamp large time deltas to prevent position jumps
      let dt = (now - lastFrameTime) / 1000;
      lastFrameTime = now;
      if (dt > 0.1) dt = 0.016; // Clamp frame delta if tab was suspended

      const lerpFactor = Math.min(0.2, Math.max(0.04, dt * 4.5));

      trainAnimStatesRef.current.forEach((anim, id) => {
        const marker = trainMarkersRef.current.get(id);
        if (!marker) return;

        // Bounded dead-reckoning: If train is stationary or no fresh update for > 5.5s, lock to target without drifting
        const elapsedSinceObservation = now - anim.startTime;
        if (anim.isStationary || elapsedSinceObservation > 5500) {
          anim.currentLat = anim.targetLat;
          anim.currentLng = anim.targetLng;
        } else {
          // Smooth glide toward reconciled target observation along rails
          anim.currentLat += (anim.targetLat - anim.currentLat) * lerpFactor;
          anim.currentLng += (anim.targetLng - anim.currentLng) * lerpFactor;
        }

        // Shortest-arc rotation interpolation (zero 360° flip spins)
        const diffBearing = normalizeBearingDiff(anim.targetBearing, anim.currentBearing);
        anim.currentBearing = (anim.currentBearing + diffBearing * lerpFactor + 360) % 360;

        marker.setLatLng([anim.currentLat, anim.currentLng]);

        const el = marker.getElement();
        if (el) {
          const sceneEl = el.querySelector('.train-3d-scene') as HTMLElement;
          if (sceneEl) {
            sceneEl.style.transform = `rotate(${Math.round(anim.currentBearing)}deg)`;
          }
        }

        // Dynamic approach trajectory line moving with 3D train
        if (approachTrajectoryLayerRef.current && selectedCrossing && linkedTrain && id === linkedTrain.id) {
          approachTrajectoryLayerRef.current.setLatLngs([
            [anim.currentLat, anim.currentLng],
            [selectedCrossing.lat, selectedCrossing.lng]
          ]);
        }

        // Camera auto-follow if active on this train
        if (followTrainActive && linkedTrain && linkedTrain.id === id && map) {
          map.panTo([anim.currentLat, anim.currentLng], { animate: false });
        }
      });

      animId = requestAnimationFrame(animate);
    };

    animId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animId);
  }, [followTrainActive, linkedTrain?.id, selectedCrossing?.id]);


  // Camera framing: Intelligently frame BOTH the crossing and its approaching train
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (selectedCrossing && linkedTrain && typeof linkedTrain.lat === 'number' && typeof linkedTrain.lng === 'number') {
      // Automatically fit viewport bounds between the crossing and the approaching train!
      const bounds = L.latLngBounds([
        [selectedCrossing.lat, selectedCrossing.lng],
        [linkedTrain.lat, linkedTrain.lng]
      ]);
      map.fitBounds(bounds, {
        paddingTopLeft: [70, 40],
        paddingBottomRight: [70, 400],
        maxZoom: 15
      });
    } else if (selectedCrossing) {
      map.flyTo([selectedCrossing.lat, selectedCrossing.lng], 15, { duration: 1 });
    } else if (linkedTrain && typeof linkedTrain.lat === 'number' && typeof linkedTrain.lng === 'number') {
      map.flyTo([linkedTrain.lat, linkedTrain.lng], 15, { duration: 1 });
    }
  }, [selectedCrossing?.id, linkedTrain?.id]);

  // Render Approach Trajectory Beam between Train & Target Crossing
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (approachTrajectoryLayerRef.current) {
      map.removeLayer(approachTrajectoryLayerRef.current);
      approachTrajectoryLayerRef.current = null;
    }
    if (approachMidpointMarkerRef.current) {
      map.removeLayer(approachMidpointMarkerRef.current);
      approachMidpointMarkerRef.current = null;
    }

    if (!selectedCrossing || !linkedTrain || typeof linkedTrain.lat !== 'number' || typeof linkedTrain.lng !== 'number') return;

    const beamColor = (selectedCrossing.status === 'CLOSED' || selectedCrossing.status === 'CLOSURE_REPORTED') ? '#EF4444' : selectedCrossing.status === 'CLOSURE_EXPECTED' ? '#F97316' : selectedCrossing.status === 'APPROACHING' ? '#F59E0B' : selectedCrossing.status === 'UNKNOWN' ? '#94A3B8' : '#35C8F4';

    // Direct approach vector polyline
    const trajCoords: [number, number][] = [
      [linkedTrain.lat, linkedTrain.lng],
      [selectedCrossing.lat, selectedCrossing.lng]
    ];

    const trajPolyline = L.polyline(trajCoords, {
      color: beamColor,
      weight: 3.5,
      dashArray: '8, 12',
      opacity: 0.85
    }).addTo(map);

    approachTrajectoryLayerRef.current = trajPolyline;

    // Midpoint distance / ETA badge
    const midLat = (linkedTrain.lat + selectedCrossing.lat) / 2;
    const midLng = (linkedTrain.lng + selectedCrossing.lng) / 2;
    const distText = selectedCrossing.distanceAlongTrackKm !== undefined && selectedCrossing.distanceAlongTrackKm !== null
      ? `${selectedCrossing.distanceAlongTrackKm} km`
      : 'Approaching Corridor';
    const etaText = selectedCrossing.estimatedTimeToArrivalSec
      ? `• ~${(selectedCrossing.estimatedTimeToArrivalSec / 60).toFixed(1)}m (Est.)`
      : (linkedTrain && linkedTrain.speedKmH === 0 ? '• Awaiting Movement' : '');

    const midIcon = L.divIcon({
      className: 'approach-midpoint-wrapper',
      html: `
        <div style="
          background: rgba(15, 23, 42, 0.94);
          backdrop-filter: blur(8px);
          border: 1px solid ${beamColor};
          padding: 3px 8px;
          border-radius: 5px;
          color: #F1F5F9;
          font-family: var(--font-mono);
          font-size: 10px;
          font-weight: 700;
          white-space: nowrap;
          box-shadow: 0 4px 14px rgba(0,0,0,0.7), 0 0 10px ${beamColor};
          transform: translate(-50%, -50%);
        ">
          ⚡ ${distText} ${etaText}
        </div>
      `,
      iconSize: [140, 24],
      iconAnchor: [70, 12]
    });

    const midMarker = L.marker([midLat, midLng], { icon: midIcon, interactive: false }).addTo(map);
    approachMidpointMarkerRef.current = midMarker;
  }, [selectedCrossing, linkedTrain]);

  const handleReset = () => {
    if (!mapInstanceRef.current) return;
    setFollowTrainActive(false);
    handleSelectTrain(null);
    mapInstanceRef.current.flyTo(AMRITSAR_CENTER, DEFAULT_ZOOM, { duration: 0.8 });
  };

  const handleFilter = (status: string) => {
    if (onStatusFilterChange) {
      onStatusFilterChange(status);
    } else {
      setLocalStatusFilter(status);
    }
  };

  const activeFilter = onStatusFilterChange ? statusFilter : localStatusFilter;

  return (
    <div style={{ position: 'relative', width: '100%', height, minHeight: '380px' }}>
      <div 
        ref={mapContainerRef} 
        style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }} 
      />

      {/* TOP FLOATING ACTIVE TRACKING HUD BANNER */}
      {linkedTrain && (
        <div className="map-tracking-hud-banner">
          <span style={{ fontSize: '15px' }}>🚂</span>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#F1F5F9' }}>
              Tracking Train #{linkedTrain.number} ({linkedTrain.name})
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
              {selectedCrossing ? (
                <span>Approaching <strong style={{ color: 'var(--accent-cyan)' }}>{selectedCrossing.name}</strong> • Speed: {linkedTrain.speedKmH ? `${linkedTrain.speedKmH} km/h` : 'Stationary'}</span>
              ) : (
                <span>Speed: {linkedTrain.speedKmH ? `${linkedTrain.speedKmH} km/h` : 'Stationary'} • Bearing: {linkedTrain.bearing}° ({linkedTrain.direction === 'DOWN' ? 'Inbound' : 'Outbound'})</span>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto', flexWrap: 'wrap' }}>
            <button
              onClick={() => setFollowTrainActive(!followTrainActive)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: followTrainActive ? 'rgba(16, 185, 129, 0.25)' : 'rgba(255, 255, 255, 0.08)',
                border: `1px solid ${followTrainActive ? '#10B981' : 'rgba(255, 255, 255, 0.2)'}`,
                color: followTrainActive ? '#10B981' : '#F1F5F9',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
              title="Camera follows moving train continuously"
            >
              <span>{followTrainActive ? '🎥 Following' : '🎥 Follow'}</span>
            </button>

            {selectedCrossing && typeof linkedTrain.lat === 'number' && typeof linkedTrain.lng === 'number' && (
              <button
                onClick={() => {
                  if (mapInstanceRef.current && typeof linkedTrain.lat === 'number' && typeof linkedTrain.lng === 'number') {
                    const bounds = L.latLngBounds([
                      [selectedCrossing.lat, selectedCrossing.lng],
                      [linkedTrain.lat, linkedTrain.lng]
                    ]);
                    mapInstanceRef.current.fitBounds(bounds, {
                      paddingTopLeft: [70, 40],
                      paddingBottomRight: [70, 400],
                      maxZoom: 15
                    });
                  }
                }}
                style={{
                  background: 'rgba(53, 200, 244, 0.15)',
                  border: '1px solid rgba(53, 200, 244, 0.4)',
                  color: '#35C8F4',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
                title="Fit both train and crossing in view"
              >
                🎯 Fit Both
              </button>
            )}

            <button
              onClick={handleReset}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                color: '#F1F5F9',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
              title="Return to Amritsar overview"
            >
              <span>🗺️ Overview</span>
            </button>

            <button
              onClick={() => {
                handleSelectTrain(null);
                setFollowTrainActive(false);
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '2px 6px',
                fontSize: '14px'
              }}
              title="Dismiss tracking"
            >
              ✕
            </button>
          </div>
        </div>
      )}


      {/* INTEGRATED MAP CONTROLS BAR (CLEAN, GROUPED, PROFESSIONAL) */}
      {showControlsBar && (
        <div style={{
          position: 'absolute',
          top: '12px',
          left: '12px',
          right: '12px',
          zIndex: 500,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          pointerEvents: 'none',
          gap: '12px'
        }}>
          {/* Status Filter Pill Group */}
          <div style={{
            display: 'flex',
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '5px',
            padding: '2px',
            pointerEvents: 'auto',
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)'
          }}>
            {['ALL', 'OPEN', 'APPROACHING', 'CLOSURE_EXPECTED', 'UNKNOWN'].map(status => (
              <button
                key={status}
                onClick={() => handleFilter(status)}
                style={{
                  background: activeFilter === status ? 'var(--bg-surface-elevated)' : 'transparent',
                  color: activeFilter === status ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                  border: 'none',
                  padding: '4px 10px',
                  borderRadius: '3px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-mono)'
                }}
              >
                {status}
              </button>
            ))}
          </div>

          {/* Map Layer Controls Group */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '5px',
            padding: '2px',
            gap: '2px',
            pointerEvents: 'auto',
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)'
          }}>
            <button
              onClick={handleReset}
              title="Reset View to Amritsar"
              className="btn btn-ghost"
              style={{ padding: '5px 8px' }}
            >
              <RotateCcw size={13} />
            </button>

            <button
              onClick={() => setShowTracks(!showTracks)}
              title={showTracks ? "Hide Tracks" : "Show Tracks"}
              className="btn btn-ghost"
              style={{
                padding: '5px 8px',
                color: showTracks ? 'var(--accent-cyan)' : 'var(--text-muted)'
              }}
            >
              <TrainTrack size={13} />
            </button>

            <button
              onClick={() => setShowTrains(!showTrains)}
              title={showTrains ? "Hide Trains" : "Show Trains"}
              className="btn btn-ghost"
              style={{
                padding: '5px 8px',
                color: showTrains ? 'var(--accent-cyan)' : 'var(--text-muted)'
              }}
            >
              {showTrains ? <Eye size={13} /> : <EyeOff size={13} />}
            </button>

            <button
              onClick={() => setActiveTileLayer(activeTileLayer === 'dark' ? 'satellite' : 'dark')}
              title={activeTileLayer === 'dark' ? "Switch to Satellite" : "Switch to Dark Map"}
              className="btn btn-ghost"
              style={{ padding: '5px 8px' }}
            >
              <Layers size={13} />
            </button>
          </div>
        </div>
      )}

      {/* FLOATING LIVE SECTOR TRAINS QUICK-FLY SELECTOR DOCK */}
      <div style={{
        position: 'absolute',
        bottom: '16px',
        left: '16px',
        right: selectedCrossing ? '420px' : '16px',
        zIndex: 400,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        pointerEvents: 'none',
        transition: 'right 0.3s ease'
      }}>
        {/* Dock Header & Focus All Button */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: 'rgba(15, 23, 42, 0.92)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(53, 200, 244, 0.35)',
          borderRadius: '7px',
          padding: '5px 10px',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
          pointerEvents: 'auto',
          flexShrink: 0
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="status-dot-sm open" style={{ boxShadow: '0 0 8px #10B981' }} />
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#F1F5F9', fontFamily: 'var(--font-mono)' }}>
              LIVE TRAINS ({trains.length})
            </span>
          </span>

          <button
            onClick={handleFitAllTrains}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              background: 'rgba(53, 200, 244, 0.15)',
              border: '1px solid rgba(53, 200, 244, 0.4)',
              color: '#35C8F4',
              padding: '3px 7px',
              borderRadius: '4px',
              fontSize: '10px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
            title="Fit all live trains in viewport"
          >
            🎯 Focus All
          </button>
        </div>

        {/* Scrollable Quick-Fly Train Chips */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          overflowX: 'auto',
          pointerEvents: 'auto',
          paddingBottom: '2px',
          scrollbarWidth: 'none'
        }}>
          {trains.map(t => {
            const isSelected = activeSelectedTrain?.id === t.id;
            const isVande = t.number === '22488';
            const isPassenger = t.type.toLowerCase().includes('dmu') || t.type.toLowerCase().includes('passenger') || t.number === '74688';
            const chipColor = isVande ? '#10B981' : (isPassenger ? '#F59E0B' : '#35C8F4');

            return (
              <button
                key={t.id}
                onClick={() => handleFlyToTrain(t)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  background: isSelected ? 'rgba(53, 200, 244, 0.22)' : 'rgba(15, 23, 42, 0.88)',
                  backdropFilter: 'blur(8px)',
                  border: `1px solid ${isSelected ? chipColor : 'rgba(255, 255, 255, 0.12)'}`,
                  color: isSelected ? chipColor : '#F1F5F9',
                  padding: '4px 8px',
                  borderRadius: '5px',
                  fontSize: '11px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                  transition: 'all 0.2s ease',
                  flexShrink: 0
                }}
              >
                <span style={{ fontSize: '10px' }}>🚆</span>
                <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>#{t.number}</span>
                <span style={{ 
                  color: t.speedKmH > 0 ? chipColor : '#94A3B8', 
                  fontSize: '10px',
                  background: 'rgba(0,0,0,0.25)',
                  padding: '1px 4px',
                  borderRadius: '3px'
                }}>
                  {t.speedKmH > 0 ? `${t.speedKmH}km/h` : 'ASR'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* FLOATING TRAIN TRACKING HUD CARD */}
      {activeSelectedTrain && !selectedCrossing && (
        <div style={{
          position: 'absolute',
          top: '56px',
          left: '16px',
          width: '320px',
          background: 'rgba(15, 23, 42, 0.96)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(53, 200, 244, 0.4)',
          borderRadius: '8px',
          padding: '14px',
          zIndex: 500,
          boxShadow: '0 12px 36px rgba(0,0,0,0.7)',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className="status-dot-sm open" style={{ boxShadow: '0 0 8px #10B981' }} />
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#F1F5F9' }}>
                  {activeSelectedTrain.name}
                </span>
              </div>
              <div style={{ fontSize: '11px', color: '#35C8F4', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                Train #{activeSelectedTrain.number} • {activeSelectedTrain.type}
              </div>
            </div>
            <button
              onClick={() => handleSelectTrain(null)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94A3B8',
                cursor: 'pointer',
                padding: '2px 4px',
                fontSize: '14px'
              }}
            >
              ✕
            </button>
          </div>

          {/* Telemetry Stats Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '8px',
            background: 'rgba(0,0,0,0.3)',
            padding: '8px',
            borderRadius: '6px'
          }}>
            <div>
              <div style={{ fontSize: '10px', color: '#94A3B8', textTransform: 'uppercase' }}>Live Speed</div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: activeSelectedTrain.speedKmH > 0 ? '#10B981' : '#94A3B8', fontFamily: 'var(--font-mono)' }}>
                {activeSelectedTrain.speedKmH > 0 ? `${activeSelectedTrain.speedKmH} km/h` : 'Stationary (0 km/h)'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '10px', color: '#94A3B8', textTransform: 'uppercase' }}>Direction</div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#F1F5F9', fontFamily: 'var(--font-mono)' }}>
                {activeSelectedTrain.bearing}° ({activeSelectedTrain.direction === 'DOWN' ? 'Inbound' : 'Outbound'})
              </div>
            </div>
            <div>
              <div style={{ fontSize: '10px', color: '#94A3B8', textTransform: 'uppercase' }}>Sector Distance</div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#F1F5F9', fontFamily: 'var(--font-mono)' }}>
                {activeSelectedTrain.distanceFromAmritsarKm} km to ASR
              </div>
            </div>
            <div>
              <div style={{ fontSize: '10px', color: '#94A3B8', textTransform: 'uppercase' }}>Status</div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: activeSelectedTrain.status === 'IN_TRANSIT' ? '#35C8F4' : '#F59E0B' }}>
                {activeSelectedTrain.status}
              </div>
            </div>
          </div>

          {/* Classification & Freshness */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10.5px' }}>
            <span style={{
              background: activeSelectedTrain.positionClassification === 'PROVIDER_REPORTED_POSITION' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(56, 189, 248, 0.15)',
              color: activeSelectedTrain.positionClassification === 'PROVIDER_REPORTED_POSITION' ? '#10B981' : '#38BDF8',
              border: `1px solid ${activeSelectedTrain.positionClassification === 'PROVIDER_REPORTED_POSITION' ? 'rgba(16, 185, 129, 0.4)' : 'rgba(56, 189, 248, 0.3)'}`,
              padding: '2px 7px',
              borderRadius: '4px',
              fontWeight: 600
            }}>
              {activeSelectedTrain.positionClassification === 'PROVIDER_REPORTED_POSITION'
                ? 'Verified Live GPS'
                : activeSelectedTrain.positionClassification === 'EXTRAPOLATED_POSITION'
                ? 'Live Track Movement'
                : activeSelectedTrain.positionClassification === 'STATION_PROGRESS'
                ? 'Station Progress (Estimated)'
                : activeSelectedTrain.positionClassification === 'SCHEDULED_POSITION'
                ? 'Scheduled Departure'
                : 'Track Position'}
            </span>
            <span style={{ color: activeSelectedTrain.isStale ? '#EF4444' : '#94A3B8', fontWeight: 500 }}>
              {activeSelectedTrain.isStale ? '⚠️ Delayed (>15m)' : '✓ Live Tracking'}
            </span>
          </div>

          {/* Location / Halt */}
          <div style={{ fontSize: '11px', color: '#94A3B8', lineHeight: 1.4 }}>
            <span style={{ color: '#F1F5F9', fontWeight: 600 }}>Location: </span>
            {activeSelectedTrain.lastReportedLocation || activeSelectedTrain.currentStationName}
          </div>

          {/* Quick Action Buttons Row */}
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={() => setFollowTrainActive(!followTrainActive)}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px',
                background: followTrainActive ? 'rgba(16, 185, 129, 0.25)' : 'rgba(255, 255, 255, 0.08)',
                border: `1px solid ${followTrainActive ? '#10B981' : 'rgba(255, 255, 255, 0.2)'}`,
                borderRadius: '5px',
                padding: '6px 10px',
                color: followTrainActive ? '#10B981' : '#F1F5F9',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <span>{followTrainActive ? '🎥 Following' : '🎥 Follow'}</span>
            </button>

            <button
              onClick={handleReset}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px',
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '5px',
                padding: '6px 10px',
                color: '#F1F5F9',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
              title="Return to Amritsar overview"
            >
              <span>🗺️ Overview</span>
            </button>
          </div>

          {/* Action Button: View Live Timetable */}
          <button
            onClick={() => onOpenTrainSchedule?.(activeSelectedTrain)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              background: 'linear-gradient(135deg, rgba(53, 200, 244, 0.22), rgba(53, 200, 244, 0.08))',
              border: '1px solid #35C8F4',
              borderRadius: '6px',
              padding: '7px 12px',
              color: '#35C8F4',
              fontWeight: 600,
              fontSize: '11px',
              cursor: 'pointer',
              width: '100%',
              transition: 'all 0.2s ease'
            }}
          >
            📅 View Live Timetable & Route Stops
          </button>
        </div>
      )}

    </div>
  );
};
