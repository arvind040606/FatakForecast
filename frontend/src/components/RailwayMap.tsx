import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { 
  Maximize2, 
  Layers, 
  RotateCcw, 
  Eye, 
  EyeOff, 
  Navigation2, 
  MapPin, 
  TrainTrack 
} from 'lucide-react';
import { RailwayCrossing, SectorTrain, RailwayCorridor } from '../types';

interface RailwayMapProps {
  crossings: RailwayCrossing[];
  trains: SectorTrain[];
  corridors: RailwayCorridor[];
  selectedCrossing: RailwayCrossing | null;
  onSelectCrossing: (crossing: RailwayCrossing) => void;
  height?: string;
}

const AMRITSAR_CENTER: [number, number] = [31.6340, 74.8723];
const DEFAULT_ZOOM = 13;

export const RailwayMap: React.FC<RailwayMapProps> = ({
  crossings,
  trains,
  corridors,
  selectedCrossing,
  onSelectCrossing,
  height = '100%'
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const crossingMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const trainMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const corridorLayersRef = useRef<L.Polyline[]>([]);

  const [showTracks, setShowTracks] = useState(true);
  const [showTrains, setShowTrains] = useState(true);
  const [activeTileLayer, setActiveTileLayer] = useState<'dark' | 'satellite'>('dark');

  // Tile layer references
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  // Initialize Map Once
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: AMRITSAR_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: true,
      attributionControl: true
    });

    // Dark Matter tile layer (CartoDB dark matter)
    const darkTileLayer = L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      {
        attribution: '&copy; <a href="https://carto.com/">CARTO</a> | Northern Railway NR-FZR',
        maxZoom: 19,
        subdomains: 'abcd'
      }
    ).addTo(map);

    tileLayerRef.current = darkTileLayer;
    mapInstanceRef.current = map;

    // Station landmark markers for context
    const stations = [
      { name: 'Amritsar Junction (ASR)', coords: [31.6337, 74.8655] as [number, number], code: 'ASR' },
      { name: 'Verka Junction (VKA)', coords: [31.6811, 74.9224] as [number, number], code: 'VKA' },
      { name: 'Chheharta (CIA)', coords: [31.6385, 74.7892] as [number, number], code: 'CIA' },
      { name: 'Bhagtanwala (BGTN)', coords: [31.6055, 74.8680] as [number, number], code: 'BGTN' },
      { name: 'Manawala (MOW)', coords: [31.5760, 74.9780] as [number, number], code: 'MOW' }
    ];

    stations.forEach(st => {
      const icon = L.divIcon({
        className: 'custom-station-marker',
        html: `
          <div style="
            display: flex;
            align-items: center;
            gap: 4px;
            background: rgba(12, 18, 34, 0.85);
            border: 1px solid rgba(255, 255, 255, 0.2);
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: 600;
            color: #94a3b8;
            font-family: var(--font-mono);
            white-space: nowrap;
            box-shadow: 0 2px 6px rgba(0,0,0,0.5);
          ">
            <span style="color: #38bdf8;">🚉</span>
            <span>${st.code}</span>
          </div>
        `,
        iconSize: [60, 20],
        iconAnchor: [30, 10]
      });

      L.marker(st.coords, { icon })
        .bindTooltip(`<strong>${st.name}</strong><br/>Railway Division Hub`, { direction: 'top' })
        .addTo(map);
    });

    // Responsive auto-resize observer
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
          attribution: '&copy; Esri & NASA',
          maxZoom: 18
        }
      ).addTo(map);
    } else {
      tileLayerRef.current = L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        {
          attribution: '&copy; CARTO | Northern Railway NR-FZR',
          maxZoom: 19,
          subdomains: 'abcd'
        }
      ).addTo(map);
    }
  }, [activeTileLayer]);

  // Render or Update Railway Tracks
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Clear previous tracks
    corridorLayersRef.current.forEach(layer => map.removeLayer(layer));
    corridorLayersRef.current = [];

    if (!showTracks) return;

    corridors.forEach(corridor => {
      // Background glow track
      const glowLine = L.polyline(corridor.coordinates, {
        color: '#0284c7',
        weight: 6,
        opacity: 0.35,
        lineCap: 'round'
      }).addTo(map);

      // Core railway track
      const trackLine = L.polyline(corridor.coordinates, {
        color: '#38bdf8',
        weight: 2.5,
        opacity: 0.85,
        dashArray: '8, 8'
      }).addTo(map);

      trackLine.bindTooltip(`
        <div style="font-family: var(--font-main); font-size: 11px;">
          <strong style="color: #38bdf8;">${corridor.name}</strong><br/>
          <span>${corridor.type} • Max ${corridor.speedLimitKmH} km/h</span>
        </div>
      `, { sticky: true });

      corridorLayersRef.current.push(glowLine, trackLine);
    });
  }, [corridors, showTracks]);

  // Update Crossing Markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    crossings.forEach(c => {
      const isSelected = selectedCrossing?.id === c.id;
      let statusColor = 'var(--status-open)';
      let statusGlow = 'var(--status-open-glow)';
      let iconSymbol = '🔓';
      let animClass = '';

      if (c.status === 'CLOSED') {
        statusColor = 'var(--status-closed)';
        statusGlow = 'var(--status-closed-glow)';
        iconSymbol = '⛔';
        animClass = 'animation: pulse-red 2s infinite ease-in-out;';
      } else if (c.status === 'APPROACHING') {
        statusColor = 'var(--status-approaching)';
        statusGlow = 'var(--status-approaching-glow)';
        iconSymbol = '⚠️';
        animClass = 'animation: pulse-amber 1.5s infinite ease-in-out;';
      }

      const icon = L.divIcon({
        className: 'custom-crossing-marker',
        html: `
          <div style="
            position: relative;
            display: flex;
            flex-direction: column;
            align-items: center;
          ">
            <div style="
              width: ${isSelected ? '36px' : '30px'};
              height: ${isSelected ? '36px' : '30px'};
              border-radius: 8px;
              background: #0c1222;
              border: 2px solid ${statusColor};
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 14px;
              box-shadow: 0 0 14px ${statusGlow};
              ${animClass}
              transition: all 0.2s ease;
            ">
              <span>${iconSymbol}</span>
            </div>
            <div style="
              background: rgba(7, 11, 20, 0.9);
              border: 1px solid ${statusColor};
              padding: 1px 6px;
              border-radius: 4px;
              font-size: 10px;
              font-weight: 700;
              color: #f8fafc;
              font-family: var(--font-mono);
              margin-top: 3px;
              white-space: nowrap;
              box-shadow: 0 2px 6px rgba(0,0,0,0.8);
            ">
              ${c.name}
            </div>
          </div>
        `,
        iconSize: [80, 48],
        iconAnchor: [40, 24]
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
          <div style="font-family: var(--font-main);">
            <div style="font-weight: 700; color: #fff; font-size: 12px;">${c.name} (${c.punjabiName})</div>
            <div style="font-size: 10px; color: #94a3b8;">${c.officialCode}</div>
            <div style="margin-top: 4px; font-size: 11px; font-weight: 600; color: ${statusColor};">
              STATUS: ${c.status}
            </div>
            ${c.timeToNextClosureSec > 0 ? `<div style="font-size: 10px; color: #f59e0b;">Closure in ~${Math.round(c.timeToNextClosureSec / 60)}m</div>` : ''}
          </div>
        `, { direction: 'top', offset: [0, -20] });

        crossingMarkersRef.current.set(c.id, marker);
      }
    });
  }, [crossings, selectedCrossing, onSelectCrossing]);

  // Update Train Markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (!showTrains) {
      trainMarkersRef.current.forEach(m => map.removeLayer(m));
      trainMarkersRef.current.clear();
      return;
    }

    trains.forEach(t => {
      const isApproachingGate = t.status === 'CROSSING_GATE';
      const icon = L.divIcon({
        className: 'custom-train-marker',
        html: `
          <div style="
            display: flex;
            align-items: center;
            gap: 6px;
            background: rgba(14, 23, 42, 0.95);
            border: 1px solid #38bdf8;
            padding: 3px 8px;
            border-radius: 6px;
            box-shadow: 0 0 12px rgba(56, 189, 248, 0.4);
            white-space: nowrap;
          ">
            <div style="
              transform: rotate(${t.bearing}deg);
              transition: transform 0.3s ease;
              display: flex;
              align-items: center;
              justify-content: center;
            ">
              <span style="font-size: 12px; color: #38bdf8;">▲</span>
            </div>
            <div style="display: flex; flex-direction: column;">
              <span style="font-size: 10px; font-weight: 700; color: #ffffff; font-family: var(--font-mono);">
                #${t.number}
              </span>
              <span style="font-size: 8px; color: ${isApproachingGate ? '#f59e0b' : '#38bdf8'}; font-weight: 600;">
                ${t.speedKmH} km/h • ${t.direction}
              </span>
            </div>
          </div>
        `,
        iconSize: [85, 30],
        iconAnchor: [42, 15]
      });

      if (trainMarkersRef.current.has(t.id)) {
        const marker = trainMarkersRef.current.get(t.id)!;
        marker.setIcon(icon);
        marker.setLatLng([t.lat, t.lng]);
      } else {
        const marker = L.marker([t.lat, t.lng], { icon }).addTo(map);
        marker.bindTooltip(`
          <div style="font-family: var(--font-main);">
            <div style="font-weight: 700; color: #38bdf8;">${t.name} (${t.number})</div>
            <div style="font-size: 10px; color: #94a3b8;">${t.type} • ${t.rakeType}</div>
            <div style="font-size: 10px; color: #cbd5e1; margin-top: 4px;">
              Route: ${t.origin} ➔ ${t.destination}
            </div>
            <div style="font-size: 10px; color: #7dd3fc; margin-top: 2px;">
              Telemetry: ${t.telemetrySource}
            </div>
          </div>
        `, { direction: 'top', offset: [0, -15] });

        trainMarkersRef.current.set(t.id, marker);
      }
    });

    // Clean up old trains
    const currentTrainIds = new Set(trains.map(t => t.id));
    trainMarkersRef.current.forEach((marker, id) => {
      if (!currentTrainIds.has(id)) {
        map.removeLayer(marker);
        trainMarkersRef.current.delete(id);
      }
    });
  }, [trains, showTrains]);

  // Center on selected crossing if changed
  useEffect(() => {
    if (!selectedCrossing || !mapInstanceRef.current) return;
    mapInstanceRef.current.flyTo([selectedCrossing.lat, selectedCrossing.lng], 15, {
      duration: 1.2
    });
  }, [selectedCrossing]);

  const handleResetView = () => {
    if (!mapInstanceRef.current) return;
    mapInstanceRef.current.flyTo(AMRITSAR_CENTER, DEFAULT_ZOOM, { duration: 1 });
  };

  return (
    <div style={{ position: 'relative', width: '100%', height, minHeight: '380px' }}>
      {/* Map DOM Element */}
      <div 
        ref={mapContainerRef} 
        style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }} 
      />

      {/* FLOATING MAP TOOLBAR */}
      <div style={{
        position: 'absolute',
        top: '16px',
        right: '16px',
        zIndex: 500,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
      }}>
        {/* Reset View */}
        <button
          onClick={handleResetView}
          title="Reset View to Amritsar"
          className="btn-secondary"
          style={{ padding: '8px', borderRadius: '6px', background: 'rgba(12, 18, 34, 0.9)' }}
        >
          <RotateCcw size={16} />
        </button>

        {/* Toggle Tracks */}
        <button
          onClick={() => setShowTracks(!showTracks)}
          title={showTracks ? "Hide Railway Tracks" : "Show Railway Tracks"}
          className="btn-secondary"
          style={{
            padding: '8px',
            borderRadius: '6px',
            background: 'rgba(12, 18, 34, 0.9)',
            color: showTracks ? 'var(--accent-cyan)' : 'var(--text-muted)'
          }}
        >
          <TrainTrack size={16} />
        </button>

        {/* Toggle Trains */}
        <button
          onClick={() => setShowTrains(!showTrains)}
          title={showTrains ? "Hide Active Trains" : "Show Active Trains"}
          className="btn-secondary"
          style={{
            padding: '8px',
            borderRadius: '6px',
            background: 'rgba(12, 18, 34, 0.9)',
            color: showTrains ? 'var(--accent-cyan)' : 'var(--text-muted)'
          }}
        >
          {showTrains ? <Eye size={16} /> : <EyeOff size={16} />}
        </button>

        {/* Toggle Tile Layer */}
        <button
          onClick={() => setActiveTileLayer(activeTileLayer === 'dark' ? 'satellite' : 'dark')}
          title="Toggle Satellite / Dark Mode"
          className="btn-secondary"
          style={{
            padding: '8px',
            borderRadius: '6px',
            background: 'rgba(12, 18, 34, 0.9)'
          }}
        >
          <Layers size={16} />
        </button>
      </div>

      {/* MAP LEGEND OVERLAY */}
      <div style={{
        position: 'absolute',
        bottom: '16px',
        left: '16px',
        zIndex: 500,
        background: 'rgba(12, 18, 34, 0.92)',
        border: '1px solid var(--bg-panel-border)',
        borderRadius: '6px',
        padding: '8px 12px',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        fontSize: '11px',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.5)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span className="status-dot open" />
          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Open</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span className="status-dot approaching" />
          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Approaching (Warning)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span className="status-dot closed" />
          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Closed (Gate Locked)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: 'var(--accent-cyan)', fontSize: '10px' }}>▲</span>
          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Live Train Bearing</span>
        </div>
      </div>
    </div>
  );
};
