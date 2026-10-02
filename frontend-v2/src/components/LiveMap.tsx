"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Point, RouteResult, fetchAuthoritativeRoute } from "@/lib/routing";

export type { Point, RouteResult };

export type RouteInfo = {
  distanceKm: number;
  durationMin: number;
  isTrafficAware?: boolean;
  isRoadRoute?: boolean;
  trafficDelayMin?: number;
  trafficStatus?: string;
  isFailed?: boolean;
  provider?: string;
  calculatedAt?: number;
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

// Clean CartoDB Basemap styles (subtle roads, muted labels, no saturated green or CSS invert)
const CARTO_DARK = "https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const CARTO_LIGHT = "https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
const MAP_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener noreferrer">CARTO</a>';

function getTrafficTileUrl(): string {
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") {
      return "http://" + host + ":8000/api/routing/traffic-tile/{z}/{x}/{y}.png";
    }
  }
  return "https://emefast-v17.onrender.com/api/routing/traffic-tile/{z}/{x}/{y}.png";
}

function validPoint(p?: Point | null): boolean {
  return !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;
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
  const trafficTileLayerRef = useRef<any>(null);
  const originMarkerRef = useRef<any>(null);
  const destinationMarkerRef = useRef<any>(null);
  const routeUnderlineRef = useRef<any>(null);
  const routeRef = useRef<any>(null);
  const lastRouteRef = useRef<string>("");
  const lastRouteAtRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [livePosition, setLivePosition] = useState<Point>(origin);
  const livePositionRef = useRef<Point>(origin);
  const [currentAccuracy, setCurrentAccuracy] = useState<number | null>(gpsAccuracy);

  // Authoritative Route State
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [isRoutingLoading, setIsRoutingLoading] = useState(false);
  const [routeRetryCount, setRouteRetryCount] = useState(0);

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

  // 1. Initialize Leaflet Map, Clean Basemap Layer, and Traffic Layer
  useEffect(() => {
    if (!validPoint(origin)) {
      setStatus("error");
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
            }
          });
        }

        // Compact Zoom Controls
        L.control.zoom({ position: "bottomright" }).addTo(localMap);

        // Compact Center on Location Button
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
            if (point && validPoint(point)) localMap?.flyTo([point.lat, point.lng], 16, { duration: 0.6 });
          });
          return button;
        };
        locateControl.addTo(localMap);

        // 1. BASE TILE LAYER: Genuine CartoDB dark or light basemap (No CSS invert filter)
        const light = isLightMode();
        const baseTileUrl = light ? CARTO_LIGHT : CARTO_DARK;
        const tileLayer = L.tileLayer(baseTileUrl, {
          maxZoom: 19,
          attribution: MAP_ATTRIBUTION,
          subdomains: "abcd",
        }).addTo(localMap);
        baseTileLayerRef.current = tileLayer;

        // Dedicated Map Panes to guarantee strict rendering hierarchy:
        // BASEMAP (zIndex 200 default tilePane)
        // ↓
        // TRAFFIC FLOW (trafficPane, zIndex 350)
        // ↓
        // ROUTE OUTLINE (routeOutlinePane, zIndex 450)
        // ↓
        // ROUTE (routePane, zIndex 460)
        // ↓
        // MARKERS (zIndex 600 default markerPane)
        localMap.createPane("trafficPane");
        localMap.getPane("trafficPane").style.zIndex = "350";

        localMap.createPane("routeOutlinePane");
        localMap.getPane("routeOutlinePane").style.zIndex = "450";

        localMap.createPane("routePane");
        localMap.getPane("routePane").style.zIndex = "460";

        // 2. LIVE TRAFFIC LAYER: Server-side secure TomTom flow tiles
        const trafficTileUrl = getTrafficTileUrl();
        const trafficLayer = L.tileLayer(trafficTileUrl, {
          pane: "trafficPane",
          maxZoom: 19,
          opacity: 0.85,
        }).addTo(localMap);
        trafficTileLayerRef.current = trafficLayer;

        leafletMapRef.current = localMap;

        // Force resize calculation
        requestAnimationFrame(() => localMap?.invalidateSize({ animate: false }));
        const resizeObserver =
          typeof ResizeObserver !== "undefined" && mapRef.current
            ? new ResizeObserver(() => localMap?.invalidateSize({ animate: false }))
            : null;
        resizeObserver?.observe(mapRef.current);
        (localMap as any).__emefastResizeObserver = resizeObserver;

        // 3. DISTINCT PROFESSIONAL MARKERS
        // Patient Marker: Clean blue radar pulse with high-contrast white ring
        const currentIcon = L.divIcon({
          className: "emefast-map-marker patient-marker",
          html: '<span class="emefast-patient-ring"></span><span class="emefast-patient-core"></span>',
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });

        // Hospital Destination Marker: Professional medical cross badge with contrast shadow
        const hospitalIcon = L.divIcon({
          className: "emefast-map-marker hospital-marker",
          html: '<div class="emefast-hosp-pin"><span class="emefast-hosp-symbol">✚</span></div>',
          iconSize: [36, 42],
          iconAnchor: [18, 40],
        });

        const patientMarker = L.marker([origin.lat, origin.lng], { icon: currentIcon, zIndexOffset: 1000 }).addTo(localMap);
        originMarkerRef.current = patientMarker;

        patientMarker.bindPopup(`
          <div style="font-family:monospace;padding:3px 1px;font-size:11px;color:#f1f5f9;">
            <div style="font-weight:800;color:#38bdf8;letter-spacing:0.5px;font-size:10px;">PATIENT INCIDENT ORIGIN</div>
            <div style="font-weight:bold;margin-top:2px;">
              ${currentAccuracy != null ? `GPS CONFIRMED · ±${Math.round(currentAccuracy)} m` : (allowManualPick ? "MANUAL PIN LOCATION" : "LOCATION APPROXIMATE")}
            </div>
            <div style="font-size:10px;color:#94a3b8;margin-top:2px;">
              ${origin.lat.toFixed(5)}°, ${origin.lng.toFixed(5)}°
            </div>
          </div>
        `);

        if (destination && validPoint(destination)) {
          const hospMarker = L.marker([destination.lat, destination.lng], { icon: hospitalIcon, zIndexOffset: 1100 }).addTo(localMap);
          destinationMarkerRef.current = hospMarker;

          hospMarker.bindPopup(`
            <div style="font-family:monospace;padding:3px 1px;font-size:11px;color:#f1f5f9;">
              <div style="font-weight:800;color:#ef4444;letter-spacing:0.5px;font-size:10px;">EMERGENCY DESTINATION FACILITY</div>
              <div style="font-weight:bold;margin-top:2px;">${destinationLabel}</div>
              <div style="font-size:10px;color:#94a3b8;margin-top:2px;">
                ${destination.lat.toFixed(5)}°, ${destination.lng.toFixed(5)}°
              </div>
            </div>
          `);

          const bounds = L.latLngBounds([[origin.lat, origin.lng], [destination.lat, destination.lng]]);
          localMap.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
        } else {
          localMap.setView([origin.lat, origin.lng], 15);
        }

        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    };

    start();

    return () => {
      cancelled = true;
      if (localMap) {
        const ro = (localMap as any).__emefastResizeObserver;
        if (ro) ro.disconnect();
        localMap.remove();
      }
      leafletMapRef.current = null;
      baseTileLayerRef.current = null;
      trafficTileLayerRef.current = null;
      originMarkerRef.current = null;
      destinationMarkerRef.current = null;
      routeUnderlineRef.current = null;
      routeRef.current = null;
    };
  }, [origin.lat, origin.lng, destination?.lat, destination?.lng, destinationLabel, allowManualPick]);

  // 2. Dynamic Dark/Light Theme Switching Without Map Recreation
  useEffect(() => {
    const updateTileTheme = (light: boolean) => {
      if (baseTileLayerRef.current) {
        baseTileLayerRef.current.setUrl(light ? CARTO_LIGHT : CARTO_DARK);
      }
      if (routeRef.current) {
        const strokeColor = light ? "#dc2626" : "#ef4444";
        routeRef.current.setStyle({ color: strokeColor });
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
    const observer = new MutationObserver(() => {
      updateTileTheme(isLightMode());
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });

    return () => {
      window.removeEventListener("emefast-theme-change", handleThemeChange);
      observer.disconnect();
    };
  }, []);

  // 3. Single Source of Truth Route Calculation
  const calculateRoute = useCallback(async () => {
    const map = leafletMapRef.current;
    if (!validPoint(destination) || !validPoint(livePosition)) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsRoutingLoading(true);

    try {
      const result = await fetchAuthoritativeRoute(
        livePosition,
        destination!,
        controller.signal
      );

      // Prevent race conditions: ensure this is still the active request
      if (controller.signal.aborted) return;

      setRouteResult(result);
      onRouteInfo?.({
        distanceKm: result.distanceKm,
        durationMin: result.durationMin,
        isTrafficAware: result.trafficAvailable,
        isRoadRoute: result.isRoadRoute,
        trafficDelayMin: result.trafficDelayMin,
        trafficStatus: result.trafficStatus,
        isFailed: result.isFailed,
        provider: result.provider,
        calculatedAt: result.calculatedAt,
      });

      const L = (window as any).L;
      const activeMap = leafletMapRef.current;
      if (L && activeMap && result.geometry?.length) {
        // Clear previous lines
        if (routeUnderlineRef.current) {
          try { routeUnderlineRef.current.remove(); } catch {}
        }
        if (routeRef.current) {
          try { routeRef.current.remove(); } catch {}
        }

        // Layer 1: Subtle dark outline underneath for contrast against traffic and map tiles
        routeUnderlineRef.current = L.polyline(result.geometry, {
          pane: "routeOutlinePane",
          color: "#09090b",
          weight: 7,
          opacity: 0.9,
          lineCap: "round",
          lineJoin: "round",
        }).addTo(activeMap);

        // Layer 2: Clean, professional emergency red (5px width, rounded joins, zero neon glow)
        const strokeColor = isLightMode() ? "#dc2626" : "#ef4444";
        routeRef.current = L.polyline(result.geometry, {
          pane: "routePane",
          color: strokeColor,
          weight: 5,
          opacity: 1.0,
          lineCap: "round",
          lineJoin: "round",
        }).addTo(activeMap);

        const bounds = L.latLngBounds(result.geometry);
        activeMap.fitBounds(bounds, { padding: [55, 55], maxZoom: 16 });
      }
    } catch {
      // Aborted or failed
    } finally {
      setIsRoutingLoading(false);
    }
  }, [destination, livePosition, onRouteInfo]);

  // Trigger route computation when coordinates change or when map finishes initializing
  useEffect(() => {
    if (status !== "ready") return;
    if (!validPoint(destination) || !validPoint(livePosition)) return;
    const key = `${livePosition.lat.toFixed(4)},${livePosition.lng.toFixed(4)}-${destination!.lat.toFixed(4)},${destination!.lng.toFixed(4)}-${routeRetryCount}`;
    const now = Date.now();
    if (key === lastRouteRef.current && now - lastRouteAtRef.current < 4000) return;
    lastRouteRef.current = key;
    lastRouteAtRef.current = now;

    calculateRoute();
  }, [status, livePosition.lat, livePosition.lng, destination?.lat, destination?.lng, routeRetryCount, calculateRoute]);

  const refreshGPS = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
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
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 }
    );
  };

  return (
    <div className="live-map-shell flex flex-col w-full h-full relative overflow-hidden rounded-2xl border border-white/10 shadow-xl bg-[#090a0f]">
      {/* MAP VIEWPORT */}
      <div className="relative flex-1 w-full min-h-[300px] sm:min-h-[380px]">
        <div ref={mapRef} className="live-map w-full h-full" aria-label="Live emergency route map" />

        {/* COMPACT TOP HUD: LOCATION (Left) & TRAFFIC STATUS (Right) */}
        <div className="absolute top-2.5 left-2.5 right-2.5 z-[250] flex items-center justify-between pointer-events-none gap-2">
          {/* Top-Left GPS Badge: Compact, subtle pill */}
          <div className="pointer-events-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#12131a]/85 backdrop-blur-md border border-white/15 text-white shadow-md text-[10px] font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
            <span className="font-semibold tracking-wide">
              {currentAccuracy != null
                ? `GPS CONFIRMED · ±${Math.round(currentAccuracy)}m`
                : (allowManualPick ? "MANUAL PIN" : "LOCATION APPROXIMATE")}
            </span>
            {trackDeviceGps && (
              <button
                type="button"
                onClick={refreshGPS}
                className="ml-0.5 text-white/60 hover:text-white transition-colors cursor-pointer"
                title="Refresh GPS"
                aria-label="Refresh GPS"
              >
                ↻
              </button>
            )}
          </div>

          {/* Top-Right Traffic Badge: Honest live traffic status */}
          <div className="pointer-events-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#12131a]/85 backdrop-blur-md border border-white/15 text-white shadow-md text-[10px] font-mono">
            {routeResult?.trafficAvailable ? (
              <>
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  routeResult.trafficStatus === "HEAVY" ? "bg-red-500 animate-pulse" :
                  routeResult.trafficStatus === "MODERATE" ? "bg-amber-400 animate-pulse" :
                  "bg-emerald-400"
                }`} />
                <span className="font-bold">
                  {routeResult.trafficStatus === "HEAVY" ? (
                    <span className="text-red-400">LIVE TRAFFIC · HEAVY {routeResult.trafficDelayMin > 0 ? `(+${routeResult.trafficDelayMin}m)` : ""}</span>
                  ) : routeResult.trafficStatus === "MODERATE" ? (
                    <span className="text-amber-300">LIVE TRAFFIC · MODERATE {routeResult.trafficDelayMin > 0 ? `(+${routeResult.trafficDelayMin}m)` : ""}</span>
                  ) : (
                    <span className="text-emerald-400">TRAFFIC · NORMAL</span>
                  )}
                </span>
              </>
            ) : (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-neutral-500 shrink-0" />
                <span className="text-neutral-400 font-medium">LIVE TRAFFIC UNAVAILABLE</span>
              </>
            )}
          </div>
        </div>

        {/* COMPACT MAP TRAFFIC LEGEND (Bottom-Left) */}
        <div className="absolute bottom-2.5 left-2.5 z-[250] pointer-events-auto bg-[#12131a]/90 backdrop-blur-md border border-white/10 rounded-lg px-2.5 py-1.5 text-[9px] font-mono text-neutral-300 shadow-md hidden sm:flex items-center gap-2.5">
          <span className="font-bold uppercase tracking-wider text-neutral-400">Traffic:</span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#30d158]" /> Normal
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#ffd60a]" /> Moderate
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#ff453a]" /> Heavy
          </span>
        </div>

        {status === "error" && (
          <div className="absolute inset-0 z-[300] bg-black/80 flex items-center justify-center p-4 text-center text-xs text-red-300 font-mono">
            Map initialization failed. Check network connection and location permissions.
          </div>
        )}
      </div>

      {/* STRUCTURED MAP FOOTER (Single source of truth distance & ETA) */}
      {destination && (
        <div className="live-map-footer border-t border-white/10 bg-[#0d0e14] px-4 py-3 flex items-center justify-between gap-3 text-xs font-mono shrink-0">
          {routeResult?.isFailed ? (
            <div className="flex items-center justify-between w-full gap-3">
              <div>
                <span className="text-red-400 font-bold block uppercase tracking-wider text-[11px]">ROUTE UNAVAILABLE</span>
                <span className="text-neutral-300 text-[11px]">
                  Approx. straight-line distance: <strong>{routeResult.distanceKm.toFixed(1)} km</strong>
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
          ) : routeResult ? (
            <>
              <div>
                <span className="text-[10px] uppercase text-neutral-400 tracking-wider block">
                  {routeResult.isRoadRoute ? "Road Distance" : "Approx. Straight-Line"}
                </span>
                <strong className="text-sm sm:text-base text-white font-bold">
                  {routeResult.distanceKm.toFixed(1)} km
                </strong>
              </div>

              <div className="text-right">
                <span className="text-[10px] uppercase text-neutral-400 tracking-wider block">
                  {routeResult.trafficAvailable ? "Traffic-Aware ETA" : "Driving ETA"}
                </span>
                <div className="flex items-center justify-end gap-1.5">
                  <strong className="text-sm sm:text-base text-emerald-400 font-bold">
                    {routeResult.durationMin} MIN
                  </strong>
                </div>
              </div>
            </>
          ) : (
            <div className="text-neutral-400 text-xs italic">Calculating authoritative road route…</div>
          )}
        </div>
      )}
    </div>
  );
}
