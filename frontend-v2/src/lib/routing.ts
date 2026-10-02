/**
 * Unified Routing Engine for EMEFast
 * Single source of truth for Road Distance, ETA, Traffic, and Route Geometry.
 * Keys are kept strictly server-side — API requests route through the FastAPI backend proxy.
 */

import api from "./api";

export interface Point {
  lat: number;
  lng: number;
}

export interface RouteResult {
  provider: "tomtom" | "osrm" | "straight-line";
  distanceKm: number;
  durationMin: number;
  trafficDelayMin: number;
  trafficAvailable: boolean;
  trafficStatus: "NORMAL" | "MODERATE" | "HEAVY" | "UNAVAILABLE";
  isRoadRoute: boolean;
  isFailed: boolean;
  geometry: [number, number][]; // [lat, lng] pairs for Leaflet polyline
  calculatedAt: number;
}

const OSRM_URL = "https://router.project-osrm.org/route/v1/driving";

export function haversineDistanceKm(p1: Point, p2: Point): number {
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

// In-memory cache to prevent duplicate queries
const routeCache = new Map<string, { result: RouteResult; timestamp: number }>();

export async function fetchAuthoritativeRoute(
  origin: Point,
  destination: Point,
  signal?: AbortSignal
): Promise<RouteResult> {
  const cacheKey = `${origin.lat.toFixed(4)},${origin.lng.toFixed(4)}->${destination.lat.toFixed(4)},${destination.lng.toFixed(4)}`;
  const cached = routeCache.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.timestamp < 15000) {
    return cached.result;
  }

  // TIER 1: Secure Backend Proxy Route (TomTom traffic-aware, API key hidden on server)
  try {
    const res = await api.get("/routing/route", {
      params: {
        origin_lat: origin.lat,
        origin_lng: origin.lng,
        dest_lat: destination.lat,
        dest_lng: destination.lng,
      },
      signal,
      timeout: 8000,
    });
    if (res.data && res.data.geometry?.length) {
      const d = res.data;
      const result: RouteResult = {
        provider: d.provider || "tomtom",
        distanceKm: Number(d.distanceKm || 0),
        durationMin: Number(d.durationMin || 1),
        trafficDelayMin: Number(d.trafficDelayMin || 0),
        trafficAvailable: Boolean(d.trafficAvailable),
        trafficStatus: d.trafficStatus || (d.trafficDelayMin > 0 ? "MODERATE" : "NORMAL"),
        isRoadRoute: Boolean(d.isRoadRoute),
        isFailed: Boolean(d.isFailed),
        geometry: d.geometry,
        calculatedAt: Date.now(),
      };
      routeCache.set(cacheKey, { result, timestamp: Date.now() });
      return result;
    }
  } catch {
    // If backend proxy fails or is temporarily unreachable, fall through to client OSRM
  }

  // TIER 2: Direct Client OSRM Driving Road Routing (Open/Public, no secret required)
  try {
    const osrmUrl = `${OSRM_URL}/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`;
    const res = await fetch(osrmUrl, { signal });
    if (res.ok) {
      const data = await res.json();
      const route = data?.routes?.[0];
      if (route?.geometry?.coordinates?.length) {
        const geometry: [number, number][] = route.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]);
        const distanceKm = Number(route.distance || 0) / 1000;
        const durationMin = Math.max(1, Math.round(Number(route.duration || 0) / 60));

        const result: RouteResult = {
          provider: "osrm",
          distanceKm,
          durationMin,
          trafficDelayMin: 0,
          trafficAvailable: false,
          trafficStatus: "UNAVAILABLE",
          isRoadRoute: true,
          isFailed: false,
          geometry,
          calculatedAt: Date.now(),
        };
        routeCache.set(cacheKey, { result, timestamp: Date.now() });
        return result;
      }
    }
  } catch {
    // Fall through to Tier 3
  }

  // TIER 3: Routing Unavailable (Straight-Line Haversine Fallback)
  const distKm = haversineDistanceKm(origin, destination);
  const result: RouteResult = {
    provider: "straight-line",
    distanceKm: distKm,
    durationMin: Math.max(2, Math.round((distKm / 35) * 60)), // 35 km/h urban estimate
    trafficDelayMin: 0,
    trafficAvailable: false,
    trafficStatus: "UNAVAILABLE",
    isRoadRoute: false,
    isFailed: true,
    geometry: [
      [origin.lat, origin.lng],
      [destination.lat, destination.lng],
    ],
    calculatedAt: Date.now(),
  };
  return result;
}
