"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export type Point = { lat: number; lng: number };

export type RouteInfo = {
  distanceKm: number;
  durationMin: number;
  isTrafficAware?: boolean;
  isRoadRoute?: boolean;
  trafficDelayMin?: number;
  isFailed?: boolean;
};

type LiveMapProps = {
  origin: Point;
  destination?: Point | null;
  destinationLabel?: string;
  onLivePosition?: (point: Point) => void;
  onRouteInfo?: (info: RouteInfo) => void;
  onPickPosition?: (point: Point) => void;
  allowManualPick?: boolean;
  trackDeviceGps?: boolean;
  gpsAccuracy?: number | null;
};

const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
const OSRM_URL = "https://router.project-osrm.org/route/v1/driving";

// CARTO official open tiles for clean Light & Dark styling
const CARTO_LIGHT_URL = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
const CARTO_DARK_URL = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const CARTO_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener noreferrer">CARTO</a>';

function validPoint(p?: Point | null): boolean {
  return !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;
}

function haversineDistanceKm(p1: Point, p2: Point): number {
  const R = 6371;
  const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
  const dLng = ((p2.lng - p1.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((p1.lat * Math.PI) / 180) *
      Math.cos((p2.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isLightMode(): boolean {
  if (typeof document === "undefined") return false;
  return (
    document.documentElement.classList.contains("theme-light") ||
    document.documentElement.getAttribute("data-theme") === "light"
  );
}

function loadLeaflet(): Promise<any> {
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

export default function LiveMap({
  origin,
  destination,
  destinationLabel = "Hospital",
  onLivePosition,
  onRouteInfo,
  onPickPosition,
  allowManualPick = false,
  trackDeviceGps = false,
  gpsAccuracy = null,
}: LiveMapProps) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<any>(null);
  const baseTileLayerRef = useRef<any>(null);
  const originMarkerRef = useRef<any>(null);
  const destinationMarkerRef = useRef<any>(null);
  const routeRef = useRef<any>(null);
  const watchRef = useRef<number | null>(null);
  const lastRouteRef = useRef<string>("");
  const lastRouteAtRef = useRef<number>(0);

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState(trackDeviceGps ? "Acquiring GPS satellite fix…" : "Incident map active");
  const [livePosition, setLivePosition] = useState<Point>(origin);
  const livePositionRef = useRef<Point>(origin);
  const [currentAccuracy, setCurrentAccuracy] = useState<number | null>(gpsAccuracy);

  // Routing State
  const [routeState, setRouteState] = useState<{
    distanceKm: number;
    durationMin: number;
    isTrafficAware: boolean;
    isRoadRoute: boolean;
    isFailed: boolean;
    trafficDelayMin: number;
  } | null>(null);
  const [isRoutingLoading, setIsRoutingLoading] = useState(false);
  const [routeRetryCount, setRouteRetryCount] = useState(0);

  // TomTom Configuration
  const tomtomApiKey = (process.env.NEXT_PUBLIC_TOMTOM_API_KEY || "").trim();
  const hasValidTomTomKey = Boolean(tomtomApiKey && tomtomApiKey !== "YOUR_TOMTOM_API_KEY_HERE");
  const [showTraffic, setShowTraffic] = useState(false);
  const trafficLayerRef = useRef<any>(null);

  // Synchronize incoming accuracy prop
  useEffect(() => {
    if (gpsAccuracy != null) setCurrentAccuracy(gpsAccuracy);
  }, [gpsAccuracy]);

  // Synchronize incoming origin prop if it changes externally
  useEffect(() => {
    if (validPoint(origin)) {
      setLivePosition(origin);
      livePositionRef.current = origin;
      if (originMarkerRef.current) {
        originMarkerRef.current.setLatLng([origin.lat, origin.lng]);
      }
    }
  }, [origin.lat, origin.lng]);

  // 1. Initialize Map and Tile Layer
  useEffect(() => {
    if (!validPoint(origin)) {
      setStatus("error");
      setMessage("A valid GPS coordinate is required to display the emergency map.");
      return;
    }

    let cancelled = false;
    let localMap: any = null;

    const start = async () => {
      try {
        const L = await loadLeaflet();
        if (cancelled || !mapRef.current) return;

        localMap = L.map(mapRef.current, {
          zoomControl: false,
          attributionControl: true,
        });

        if (allowManualPick) {
          localMap.on("click", (event: any) => {
            const point = { lat: Number(event.latlng.lat), lng: Number(event.latlng.lng) };
            if (validPoint(point)) {
              livePositionRef.current = point;
              setLivePosition(point);
              setCurrentAccuracy(null);
              onPickPosition?.(point);
              onLivePosition?.(point);
              setMessage("Pinned location · verify before sending");
            }
          });
        }

        L.control.zoom({ position: "bottomright" }).addTo(localMap);

        // Center on Location Button
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

        // Select initial theme tile URL
        const light = isLightMode();
        const initialTileUrl = light ? CARTO_LIGHT_URL : CARTO_DARK_URL;
        const tileLayer = L.tileLayer(initialTileUrl, {
          maxZoom: 19,
          subdomains: "abcd",
          attribution: CARTO_ATTRIBUTION,
        }).addTo(localMap);
        baseTileLayerRef.current = tileLayer;
        leafletMapRef.current = localMap;

        // Force resize recalculation
        requestAnimationFrame(() => localMap?.invalidateSize({ animate: false }));
        const resizeObserver =
          typeof ResizeObserver !== "undefined" && mapRef.current
            ? new ResizeObserver(() => localMap?.invalidateSize({ animate: false }))
            : null;
        resizeObserver?.observe(mapRef.current);
        (localMap as any).__emefastResizeObserver = resizeObserver;

        // Markers
        const currentIcon = L.divIcon({
          className: "emefast-map-marker patient-marker",
          html: '<span class="emefast-map-pulse"></span><span class="emefast-map-dot"></span>',
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });

        const hospitalIcon = L.divIcon({
          className: "emefast-map-marker hospital-marker",
          html: '<span class="emefast-map-hospital">+</span>',
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });

        const patientPopupHtml = `
          <div style="font-family:monospace;padding:2px 0;">
            <div style="font-size:10px;font-weight:900;color:#ff3b30;letter-spacing:0.5px;">PATIENT LOCATION</div>
            <div style="font-size:12px;font-weight:bold;margin-top:2px;color:currentColor;">
              ${currentAccuracy != null ? `GPS CONFIRMED · ±${Math.round(currentAccuracy)} m` : (allowManualPick ? "MANUAL PIN LOCATION" : "LOCATION APPROXIMATE · Accuracy unknown")}
            </div>
            <div style="font-size:10px;opacity:0.75;margin-top:2px;">
              ${origin.lat.toFixed(5)}°, ${origin.lng.toFixed(5)}°
            </div>
          </div>
        `;

        originMarkerRef.current = L.marker([origin.lat, origin.lng], { icon: currentIcon })
          .addTo(localMap)
          .bindPopup(patientPopupHtml);

        if (validPoint(destination)) {
          const hospitalPopupHtml = `
            <div style="font-family:monospace;padding:2px 0;">
              <div style="font-size:10px;font-weight:900;color:#30d158;letter-spacing:0.5px;">HOSPITAL</div>
              <div style="font-size:13px;font-weight:bold;margin-top:2px;color:currentColor;">${destinationLabel}</div>
              <div style="font-size:11px;color:#30d158;margin-top:3px;font-weight:600;">✓ Admin-verified emergency facility</div>
              <div style="font-size:10px;opacity:0.75;margin-top:2px;">
                ${destination!.lat.toFixed(5)}°, ${destination!.lng.toFixed(5)}°
              </div>
            </div>
          `;
          destinationMarkerRef.current = L.marker([destination!.lat, destination!.lng], { icon: hospitalIcon })
            .addTo(localMap)
            .bindPopup(hospitalPopupHtml);
        }

        const points = [origin, ...(validPoint(destination) ? [destination!] : [])];
        localMap.fitBounds(
          points.map((p) => [p.lat, p.lng]),
          { padding: [40, 40], maxZoom: points.length > 1 ? 15 : 16 }
        );

        setStatus("ready");
        setMessage(trackDeviceGps ? "Live GPS active" : "Incident location mapped");

        // Device GPS tracking
        if (trackDeviceGps && typeof navigator !== "undefined" && navigator.geolocation) {
          watchRef.current = navigator.geolocation.watchPosition(
            (pos) => {
              const reportedAccuracy = Number(pos.coords.accuracy);
              const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
              livePositionRef.current = next;
              setLivePosition(next);
              setCurrentAccuracy(reportedAccuracy);
              onLivePosition?.(next);
              originMarkerRef.current?.setLatLng([next.lat, next.lng]);
              if (!allowManualPick) localMap.panTo([next.lat, next.lng], { animate: true, duration: 0.6 });
              const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
              setMessage(`GPS Lock · ±${Math.round(reportedAccuracy)} m · ${timeStr}${reportedAccuracy > 100 ? " (approx)" : ""}`);
            },
            () => setMessage("Map active · precise device GPS unavailable; incident location pinned"),
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
      if (watchRef.current != null && typeof navigator !== "undefined" && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchRef.current);
      }
      watchRef.current = null;
      (localMap as any)?.__emefastResizeObserver?.disconnect?.();
      if (trafficLayerRef.current) {
        trafficLayerRef.current.remove();
        trafficLayerRef.current = null;
      }
      localMap?.remove();
      leafletMapRef.current = null;
      baseTileLayerRef.current = null;
      originMarkerRef.current = null;
      destinationMarkerRef.current = null;
      routeRef.current = null;
    };
  }, [origin.lat, origin.lng, destination?.lat, destination?.lng, destinationLabel, onLivePosition, onPickPosition, allowManualPick]);

  // 2. Dynamic Dark/Light Theme Switching without map recreation
  useEffect(() => {
    const updateTileTheme = (light: boolean) => {
      if (baseTileLayerRef.current) {
        const nextUrl = light ? CARTO_LIGHT_URL : CARTO_DARK_URL;
        baseTileLayerRef.current.setUrl(nextUrl);
      }
    };

    const handleThemeChange = (e: Event) => {
      const custom = e as CustomEvent<{ theme: string }>;
      if (custom?.detail?.theme) {
        updateTileTheme(custom.detail.theme === "light");
      } else {
        updateTileTheme(isLightMode());
      }
    };

    window.addEventListener("emefast-theme-change", handleThemeChange);

    // MutationObserver to watch class changes on <html>
    const observer = new MutationObserver(() => {
      updateTileTheme(isLightMode());
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });

    return () => {
      window.removeEventListener("emefast-theme-change", handleThemeChange);
      observer.disconnect();
    };
  }, []);

  // 3. True Road Route Calculation with TomTom Traffic & OSRM Fallback
  const calculateRoute = useCallback(async () => {
    const map = leafletMapRef.current;
    if (!map || !validPoint(destination) || !validPoint(livePosition)) return;

    setIsRoutingLoading(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 9000);

    let routeData: {
      distanceKm: number;
      durationMin: number;
      isTrafficAware: boolean;
      isRoadRoute: boolean;
      trafficDelayMin: number;
      latLngs: [number, number][];
    } | null = null;

    // TIER 1: TomTom Traffic-Aware Routing
    if (hasValidTomTomKey) {
      try {
        const tomtomUrl = `https://api.tomtom.com/routing/1/calculateRoute/${livePosition.lat},${livePosition.lng}:${destination!.lat},${destination!.lng}/json?key=${tomtomApiKey}&traffic=true`;
        const resp = await fetch(tomtomUrl, { signal: controller.signal });
        if (resp.ok) {
          const json = await resp.json();
          const route = json?.routes?.[0];
          const summary = route?.summary;
          const points = route?.legs?.[0]?.points;

          if (summary && Array.isArray(points) && points.length > 0) {
            const latLngs: [number, number][] = points.map((p: any) => [p.latitude, p.longitude]);
            const distKm = Number(summary.lengthInMeters || 0) / 1000;
            const durMin = Math.max(1, Math.round(Number(summary.travelTimeInSeconds || 0) / 60));
            const delayMin = Math.round(Number(summary.trafficDelayInSeconds || 0) / 60);

            routeData = {
              distanceKm: distKm,
              durationMin: durMin,
              isTrafficAware: true,
              isRoadRoute: true,
              trafficDelayMin: delayMin,
              latLngs,
            };
          }
        }
      } catch {
        // Fall through to Tier 2
      }
    }

    // TIER 2: OSRM Driving Road Routing Fallback
    if (!routeData) {
      try {
        const osrmUrl = `${OSRM_URL}/${livePosition.lng},${livePosition.lat};${destination!.lng},${destination!.lat}?overview=full&geometries=geojson`;
        const resp = await fetch(osrmUrl, { signal: controller.signal });
        if (resp.ok) {
          const json = await resp.json();
          const route = json?.routes?.[0];
          if (route?.geometry?.coordinates?.length) {
            const latLngs: [number, number][] = route.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]);
            const distKm = Number(route.distance || 0) / 1000;
            const durMin = Math.max(1, Math.round(Number(route.duration || 0) / 60));

            routeData = {
              distanceKm: distKm,
              durationMin: durMin,
              isTrafficAware: false, // OSRM demo does not supply live traffic
              isRoadRoute: true,
              trafficDelayMin: 0,
              latLngs,
            };
          }
        }
      } catch {
        // Fall through to Tier 3
      }
    }

    clearTimeout(timeoutId);
    setIsRoutingLoading(false);

    const L = (window as any).L;
    if (routeData && L) {
      // Draw ACTUAL road route polyline
      routeRef.current?.remove();
      const strokeColor = isLightMode() ? "#d70015" : "#ff3b30";
      routeRef.current = L.polyline(routeData.latLngs, {
        color: strokeColor,
        weight: 5,
        opacity: 0.95,
        lineCap: "round",
        lineJoin: "round",
      }).addTo(map);

      map.fitBounds(routeRef.current.getBounds(), { padding: [44, 44], maxZoom: 16 });

      const state = {
        distanceKm: routeData.distanceKm,
        durationMin: routeData.durationMin,
        isTrafficAware: routeData.isTrafficAware,
        isRoadRoute: true,
        isFailed: false,
        trafficDelayMin: routeData.trafficDelayMin,
      };
      setRouteState(state);
      onRouteInfo?.(state);
    } else {
      // TIER 3: Routing Unavailable Fallback
      routeRef.current?.remove();
      routeRef.current = null;

      const straightLineKm = haversineDistanceKm(livePosition, destination!);
      const state = {
        distanceKm: straightLineKm,
        durationMin: 0,
        isTrafficAware: false,
        isRoadRoute: false,
        isFailed: true,
        trafficDelayMin: 0,
      };
      setRouteState(state);
      onRouteInfo?.(state);
      setMessage("Route service unavailable · Showing straight-line distance fallback");
    }
  }, [destination, livePosition, hasValidTomTomKey, tomtomApiKey, onRouteInfo]);

  // Trigger route computation when origin, destination, or retry changes
  useEffect(() => {
    if (!validPoint(destination) || !validPoint(livePosition)) return;
    const key = `${livePosition.lat.toFixed(4)},${livePosition.lng.toFixed(4)}-${destination!.lat.toFixed(4)},${destination!.lng.toFixed(4)}-${routeRetryCount}`;
    const now = Date.now();
    if (key === lastRouteRef.current && now - lastRouteAtRef.current < 8000) return;
    lastRouteRef.current = key;
    lastRouteAtRef.current = now;

    calculateRoute();
  }, [livePosition.lat, livePosition.lng, destination?.lat, destination?.lng, routeRetryCount, calculateRoute]);

  // TomTom Live Traffic Flow Overlay
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map) return;
    const L = (window as any).L;
    if (!L) return;

    if (showTraffic && hasValidTomTomKey) {
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
  }, [showTraffic, hasValidTomTomKey, tomtomApiKey]);

  const toggleTraffic = () => {
    if (!hasValidTomTomKey) {
      setMessage("Add your TomTom API key to enable live traffic overlay");
      return;
    }
    const next = !showTraffic;
    setShowTraffic(next);
    setMessage(next ? "Live traffic overlay enabled (TomTom)" : "Live traffic overlay disabled");
  };

  const refreshGPS = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    setMessage("Refreshing device GPS fix…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const reportedAccuracy = Number(pos.coords.accuracy);
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        livePositionRef.current = next;
        setLivePosition(next);
        setCurrentAccuracy(reportedAccuracy);
        onLivePosition?.(next);
        originMarkerRef.current?.setLatLng([next.lat, next.lng]);
        if (!allowManualPick) leafletMapRef.current?.panTo([next.lat, next.lng], { animate: true, duration: 0.6 });
        const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        setMessage(`GPS Lock · ±${Math.round(reportedAccuracy)} m · ${timeStr}${reportedAccuracy > 100 ? " (approx)" : ""}`);
      },
      () => setMessage("Precise GPS unavailable · keeping current position"),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 }
    );
  };

  return (
    <div className="live-map-shell relative w-full h-full">
      <div ref={mapRef} className="live-map w-full h-full" aria-label="Live emergency route map" />

      {/* Top Status & GPS HUD */}
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

      {/* Route & Traffic Overlay Metrics Bar (if destination present) */}
      {destination && (
        <div className="absolute bottom-3 left-3 z-[250] max-w-[calc(100%-70px)] sm:max-w-md">
          {routeState?.isFailed ? (
            <div className="p-2.5 sm:p-3 rounded-xl bg-red-950/90 border border-red-500/40 text-white backdrop-blur-md shadow-xl flex items-center justify-between gap-3 text-xs font-mono">
              <div>
                <span className="text-red-400 font-bold block">ROUTE UNAVAILABLE</span>
                <span className="text-[11px] text-neutral-300">
                  Approx. straight-line distance: {routeState.distanceKm.toFixed(1)} km
                </span>
              </div>
              <button
                type="button"
                onClick={() => setRouteRetryCount((c) => c + 1)}
                disabled={isRoutingLoading}
                className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-[11px] font-bold shrink-0 transition-colors cursor-pointer"
              >
                {isRoutingLoading ? "Retrying…" : "Retry Route"}
              </button>
            </div>
          ) : routeState ? (
            <div className="p-2.5 sm:p-3 rounded-xl bg-[#15181c]/90 border border-white/15 text-white backdrop-blur-md shadow-xl flex items-center gap-3 text-xs font-mono">
              <div className="border-r border-white/15 pr-3">
                <span className="text-[10px] text-[var(--muted)] uppercase block">Road Distance</span>
                <strong className="text-sm text-white font-bold">{routeState.distanceKm.toFixed(1)} km</strong>
              </div>
              <div>
                <span className="text-[10px] text-[var(--muted)] uppercase block">
                  {routeState.isTrafficAware ? "Traffic-aware ETA" : "Road ETA"}
                </span>
                <div className="flex items-center gap-1.5">
                  <strong className="text-sm text-emerald-400 font-bold">{routeState.durationMin} MIN</strong>
                  <span
                    className={`text-[9px] px-1.5 py-0.2 rounded font-bold ${
                      routeState.isTrafficAware ? "bg-emerald-500/20 text-emerald-300" : "bg-neutral-700 text-neutral-300"
                    }`}
                  >
                    {routeState.isTrafficAware
                      ? routeState.trafficDelayMin > 0
                        ? `+${routeState.trafficDelayMin}m traffic`
                        : "Normal Flow"
                      : "Traffic unavailable"}
                  </span>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Traffic Overlay Toggle Button */}
      {hasValidTomTomKey && (
        <button
          type="button"
          onClick={toggleTraffic}
          className={`live-map-traffic-btn ${showTraffic ? "active" : ""}`}
          title={showTraffic ? "Hide TomTom live traffic flow" : "Show TomTom live traffic flow"}
          aria-label="Toggle live traffic layer"
        >
          <span className={`live-map-traffic-dot ${showTraffic ? "active" : ""}`} />
          <span>Traffic {showTraffic ? "ON" : "OFF"}</span>
        </button>
      )}

      {status === "error" && (
        <div className="live-map-error">
          Check network connection and location permissions, then retry.
        </div>
      )}
    </div>
  );
}
