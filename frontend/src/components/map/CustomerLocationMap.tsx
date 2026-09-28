import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { createMap, setMapStyle, locationPin } from '../../lib/map';

interface CustomerLocationMapProps {
  lat: number;
  lng: number;
  className?: string;
}

/** Read-only preview map with a single pin. */
export const CustomerLocationMap: React.FC<CustomerLocationMapProps> = ({ lat, lng, className = 'h-52' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = createMap(containerRef.current, [lat, lng], 16);
    map.dragging.disable();
    map.touchZoom.disable();
    map.doubleClickZoom.disable();
    map.scrollWheelZoom.disable();
    map.boxZoom.disable();
    map.keyboard.disable();
    setMapStyle(map, 'street');
    markerRef.current = L.marker([lat, lng], { icon: locationPin(), interactive: false }).addTo(map);
    mapRef.current = map;
    const kick = window.setTimeout(() => map.invalidateSize(), 250);
    return () => {
      window.clearTimeout(kick);
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  useEffect(() => {
    mapRef.current?.setView([lat, lng], mapRef.current.getZoom(), { animate: false });
    markerRef.current?.setLatLng([lat, lng]);
  }, [lat, lng]);

  return <div ref={containerRef} className={`w-full z-0 ${className}`} />;
};
