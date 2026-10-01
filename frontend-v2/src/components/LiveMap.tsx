"use client";

import { useEffect, useRef, useState } from "react";

type Point = { lat: number; lng: number };

type LiveMapProps = {
  origin: Point;
  destination?: Point | null;
  destinationLabel?: string;
  onLivePosition?: (point: Point) => void;
  onRouteInfo?: (info: { distanceKm: number; durationMin: number }) => void;
  onPickPosition?: (point: Point) => void;
  allowManualPick?: boolean;
  trackDeviceGps?: boolean;
};

const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
const OSRM_URL = "https://router.project-osrm.org/route/v1/driving";

function validPoint(p?: Point | null) {
  return !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;
}

function loadLeaflet() {
  return new Promise<any>((resolve, reject) => {
    if ((window as any).L) return resolve((window as any).L);
    const existing = document.querySelector(`script[src="${LEAFLET_JS}"]`) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve((window as any).L), { once: true });
      existing.addEventListener("error", () => reject(new Error("Map library could not load")), { once: true });
      return;
    }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = LEAFLET_CSS;
    document.head.appendChild(link);

    const script = document.createElement("script");
    script.src = LEAFLET_JS;
    script.async = true;
    script.onload = () => resolve((window as any).L);
    script.onerror = () => reject(new Error("Map library could not load"));
    document.body.appendChild(script);
  });
}

export default function LiveMap({ origin, destination, destinationLabel = "Hospital", onLivePosition, onRouteInfo, onPickPosition, allowManualPick = false, trackDeviceGps = false }: LiveMapProps) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<any>(null);
  const originMarkerRef = useRef<any>(null);
  const destinationMarkerRef = useRef<any>(null);
  const routeRef = useRef<any>(null);
  const watchRef = useRef<number | null>(null);
  const lastRouteRef = useRef<string>("");
  const lastRouteAtRef = useRef<number>(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState(trackDeviceGps ? "Loading live map…" : "Incident map active");
  const [livePosition, setLivePosition] = useState<Point>(origin);
  const livePositionRef = useRef<Point>(origin);
  const [showTraffic, setShowTraffic] = useState(false);
  const trafficLayerRef = useRef<any>(null);

  const tomtomApiKey = (process.env.NEXT_PUBLIC_TOMTOM_API_KEY || "").trim();
  const hasValidKey = Boolean(tomtomApiKey && tomtomApiKey !== "YOUR_TOMTOM_API_KEY_HERE");

  useEffect(() => {
    if (!validPoint(origin)) {
      setStatus("error");
      setMessage("A valid GPS position is required to show the map.");
      return;
    }

    let cancelled = false;
    let localMap: any = null;

    const start = async () => {
      try {
        const L = await loadLeaflet();
        if (cancelled || !mapRef.current) return;

        localMap = L.map(mapRef.current, { zoomControl: false, attributionControl: true });
        if (allowManualPick) {
          localMap.on("click", (event: any) => {
            const point = { lat: Number(event.latlng.lat), lng: Number(event.latlng.lng) };
            if (validPoint(point)) {
              livePositionRef.current = point;
              setLivePosition(point);
              onPickPosition?.(point);
              onLivePosition?.(point);
              setMessage("Pinned location · verify before sending");
            }
          });
        }
        L.control.zoom({ position: "bottomright" }).addTo(localMap);

        const locateControl = L.control({ position: "bottomright" });
        locateControl.onAdd = () => {
          const button = L.DomUtil.create("button", "emefast-map-locate");
          button.type = "button";
          button.title = "Center on current location";
          button.setAttribute("aria-label", "Center on current location");
          button.innerHTML = "⌖";
          L.DomEvent.disableClickPropagation(button);
          L.DomEvent.on(button, "click", () => {
            const point = livePositionRef.current;
            if (point && validPoint(point)) localMap?.flyTo([point.lat, point.lng], 16, { duration: 0.7 });
          });
          return button;
        };
        locateControl.addTo(localMap);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap contributors',
        }).addTo(localMap);
        leafletMapRef.current = localMap;
        // Leaflet needs a size refresh after flex/grid responsive layouts settle.
        requestAnimationFrame(() => localMap?.invalidateSize({ animate: false }));
        const resizeObserver = typeof ResizeObserver !== "undefined" && mapRef.current
          ? new ResizeObserver(() => localMap?.invalidateSize({ animate: false }))
          : null;
        resizeObserver?.observe(mapRef.current);
        (localMap as any).__emefastResizeObserver = resizeObserver;

        const currentIcon = L.divIcon({
          className: "emefast-map-marker",
          html: '<span class="emefast-map-pulse"></span><span class="emefast-map-dot"></span>',
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });
        const hospitalIcon = L.divIcon({
          className: "emefast-map-marker",
          html: '<span class="emefast-map-hospital">+</span>',
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });

        originMarkerRef.current = L.marker([origin.lat, origin.lng], { icon: currentIcon }).addTo(localMap).bindPopup(allowManualPick ? "Selected incident location" : "Incident location");
        if (validPoint(destination)) {
          destinationMarkerRef.current = L.marker([destination!.lat, destination!.lng], { icon: hospitalIcon }).addTo(localMap).bindPopup(destinationLabel);
        }

        const points = [origin, ...(validPoint(destination) ? [destination!] : [])];
        localMap.fitBounds(points.map((p) => [p.lat, p.lng]), { padding: [40, 40], maxZoom: points.length > 1 ? 15 : 16 });
        setStatus("ready");
        setMessage(trackDeviceGps ? "Live map active" : "Incident location mapped");

        if (trackDeviceGps && navigator.geolocation) {
          watchRef.current = navigator.geolocation.watchPosition(
            (pos) => {
              // Use the real browser location even when desktop accuracy is coarse.
              // Never replace it with a demo/landmark coordinate. The UI reports accuracy honestly.
              const reportedAccuracy = Number(pos.coords.accuracy);
              const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
              livePositionRef.current = next;
              setLivePosition(next);
              onLivePosition?.(next);
              originMarkerRef.current?.setLatLng([next.lat, next.lng]);
              if (!allowManualPick) localMap.panTo([next.lat, next.lng], { animate: true, duration: 0.6 });
              const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
              setMessage(`Live location · ±${Math.round(reportedAccuracy)} m · ${timeStr}${reportedAccuracy > 100 ? " (approx)" : ""}`);
            },
            () => setMessage("Map active · precise device GPS unavailable; case location remains unchanged"),
            { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
          );
        }
      } catch (error) {
        if (!cancelled) {
          setStatus("error");
          setMessage(error instanceof Error ? error.message : "Map could not load");
        }
      }
    };

    start();
    return () => {
      cancelled = true;
      if (watchRef.current != null && navigator.geolocation) navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
      (localMap as any)?.__emefastResizeObserver?.disconnect?.();
      if (trafficLayerRef.current) {
        trafficLayerRef.current.remove();
        trafficLayerRef.current = null;
      }
      localMap?.remove();
      leafletMapRef.current = null;
      originMarkerRef.current = null;
      destinationMarkerRef.current = null;
      routeRef.current = null;
    };
  }, [origin.lat, origin.lng, destination?.lat, destination?.lng, destinationLabel, onLivePosition, onPickPosition, allowManualPick]);

  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map || !validPoint(destination) || !validPoint(livePosition)) return;
    const key = `${livePosition.lat.toFixed(4)},${livePosition.lng.toFixed(4)}-${destination!.lat.toFixed(4)},${destination!.lng.toFixed(4)}`;
    const now = Date.now();
    if (key === lastRouteRef.current && now - lastRouteAtRef.current < 10000) return;
    if (now - lastRouteAtRef.current < 10000) return;
    lastRouteRef.current = key;
    lastRouteAtRef.current = now;

    const controller = new AbortController();
    const fetchRoute = async () => {
      try {
        const url = `${OSRM_URL}/${livePosition.lng},${livePosition.lat};${destination!.lng},${destination!.lat}?overview=full&geometries=geojson`;
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error("Routing service unavailable");
        const data = await response.json();
        const route = data?.routes?.[0];
        if (!route?.geometry?.coordinates?.length) throw new Error("No route found");
        const L = (window as any).L;
        const latLngs = route.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]);
        routeRef.current?.remove();
        routeRef.current = L.polyline(latLngs, { color: "#ff3b30", weight: 5, opacity: 0.9, lineCap: "round", lineJoin: "round" }).addTo(map);
        onRouteInfo?.({ distanceKm: Number(route.distance || 0) / 1000, durationMin: Math.max(1, Math.round(Number(route.duration || 0) / 60)) });
        map.fitBounds(routeRef.current.getBounds(), { padding: [44, 44], maxZoom: 16 });
      } catch {
        if (!controller.signal.aborted) setMessage("Map active · live route temporarily unavailable");
      }
    };
    fetchRoute();
    return () => controller.abort();
  }, [livePosition.lat, livePosition.lng, destination?.lat, destination?.lng, onRouteInfo]);

  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map) return;
    const L = (window as any).L;
    if (!L) return;

    if (showTraffic && hasValidKey) {
      if (!trafficLayerRef.current) {
        trafficLayerRef.current = L.tileLayer(
          `https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key=${tomtomApiKey}`,
          {
            maxZoom: 19,
            opacity: 0.8,
            attribution: '&copy; <a href="https://www.tomtom.com" target="_blank" rel="noopener noreferrer">TomTom</a>',
          }
        );
      }
      if (!map.hasLayer(trafficLayerRef.current)) {
        trafficLayerRef.current.addTo(map);
      }
    } else {
      if (trafficLayerRef.current && map.hasLayer(trafficLayerRef.current)) {
        map.removeLayer(trafficLayerRef.current);
      }
    }
  }, [showTraffic, hasValidKey, tomtomApiKey]);

  const toggleTraffic = () => {
    if (!hasValidKey) {
      setMessage("Add your free TomTom API key to .env.local to enable live traffic");
      return;
    }
    const next = !showTraffic;
    setShowTraffic(next);
    setMessage(next ? "Live traffic overlay enabled (TomTom)" : "Live traffic overlay disabled");
  };

  const refreshGPS = () => {
    if (!navigator.geolocation) return;
    setMessage("Refreshing device GPS…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const reportedAccuracy = Number(pos.coords.accuracy);
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        livePositionRef.current = next;
        setLivePosition(next);
        onLivePosition?.(next);
        originMarkerRef.current?.setLatLng([next.lat, next.lng]);
        if (!allowManualPick) leafletMapRef.current?.panTo([next.lat, next.lng], { animate: true, duration: 0.6 });
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setMessage(`Live location · ±${Math.round(reportedAccuracy)} m · ${timeStr}${reportedAccuracy > 100 ? " (approx)" : ""}`);
      },
      () => setMessage("Precise GPS unavailable · keeping current position"),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 }
    );
  };

  return (
    <div className="live-map-shell">
      <div ref={mapRef} className="live-map" aria-label="Live emergency route map" />
      <div className={`live-map-status ${status === "error" ? "error" : ""}`}>
        <span className="live-map-status-dot" />
        <span className="live-map-status-text">{message}</span>
        {trackDeviceGps && (
          <button
            type="button"
            onClick={refreshGPS}
            className="live-map-refresh-btn"
            title="Refresh device GPS"
            aria-label="Refresh device GPS"
          >
            ↻
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={toggleTraffic}
        className={`live-map-traffic-btn ${showTraffic ? "active" : ""}`}
        title={
          !hasValidKey
            ? "Add your free TomTom API key in .env.local to activate traffic layer"
            : showTraffic
            ? "Hide live traffic flow"
            : "Show TomTom live traffic flow"
        }
        aria-label="Toggle live traffic layer"
      >
        <span className={`live-map-traffic-dot ${showTraffic ? "active" : ""}`} />
        <span>Traffic {showTraffic ? "ON" : "OFF"}</span>
      </button>

      {status === "error" && <div className="live-map-error">Check your internet connection and GPS permission, then refresh the page.</div>}
    </div>
  );
}
