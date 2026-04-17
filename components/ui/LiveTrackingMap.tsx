'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Renders a Google Map focused on the active driver's live GPS coordinates.
 */
export function LiveTrackingMap({ 
  location 
}: { 
  location: { lat: number; lng: number } 
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [isScriptLoaded, setIsScriptLoaded] = useState(false);
  const mapInstance = useRef<any>(null);
  const markerInstance = useRef<any>(null);

  useEffect(() => {
    // Inject the Google Maps script
    if (document.querySelector('#google-maps-script') || (window as any).google?.maps) {
      setIsScriptLoaded(true);
      return;
    }

    const apiKey = "AIzaSyDzrdK6kOwUuDQ-1XPizCrTf5DHW5dAJuI";
    const script = document.createElement('script');
    script.id = 'google-maps-script';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=marker`;
    script.async = true;
    script.defer = true;
    script.onload = () => setIsScriptLoaded(true);
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!isScriptLoaded || !mapRef.current || !(window as any).google?.maps) return;

    if (!mapInstance.current) {
      // Initialize map dynamically
      mapInstance.current = new (window as any).google.maps.Map(mapRef.current, {
        center: location,
        zoom: 16,
        disableDefaultUI: true,
        zoomControl: true,
        mapId: 'LIVE_TRACKING_MAP_ID' // AdvancedMarkerElement standard
      });

      // Initialize marker
      markerInstance.current = new (window as any).google.maps.Marker({
        position: location,
        map: mapInstance.current,
        icon: {
          url: 'https://cdn-icons-png.flaticon.com/512/754/754707.png', // Delivery bike icon
          scaledSize: new (window as any).google.maps.Size(40, 40)
        },
        animation: (window as any).google.maps.Animation.DROP,
      });
    } else {
      // Update existing map and marker
      mapInstance.current.panTo(location);
      markerInstance.current.setPosition(location);
    }
  }, [isScriptLoaded, location]);

  return (
    <div className="w-full h-full rounded-2xl overflow-hidden shadow-inner border border-slate-200 relative bg-slate-50">
      <div className="absolute top-2 left-2 z-10 bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-full shadow-md text-xs font-bold text-slate-800 flex items-center gap-2 border border-slate-200/50">
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        Live GPS Signal
      </div>
      <div ref={mapRef} className="w-full h-full" />
    </div>
  );
}
