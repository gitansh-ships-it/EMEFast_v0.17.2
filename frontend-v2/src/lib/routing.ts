/**
 * Unified Routing Engine for EMEFast
 * Single source of truth for Road Distance, ETA, Traffic, and Route Geometry.
 */

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

// In-memory cache to prevent duplicate / flashing queries
const routeCache = new Map<string, { result: RouteResult; timestamp: number }>();

export async function fetchAuthoritativeRoute(
  origin: Point,
  destination: Point,
  tomtomApiKey?: string,
  signal?: AbortSignal
): Promise<RouteResult> {
  const cacheKey = `${origin.lat.toFixed(4)},${origin.lng.toFixed(4)}->${destination.lat.toFixed(4)},${destination.lng.toFixed(4)}`;
  const cached = routeCache.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.timestamp < 15000) {
    return cached.result;
  }

  const effectiveTomTomKey =
    (tomtomApiKey && tomtomApiKey.trim() !== "" && tomtomApiKey !== "YOUR_TOMTOM_API_KEY_HERE"
      ? tomtomApiKey
      : process.env.NEXT_PUBLIC_TOMTOM_API_KEY || "FtEclPAu7Ksrt5sy6f5XvnHr4JmDZ8uB"
    ).trim();

  const validTomTomKey = Boolean(
    effectiveTomTomKey &&
    effectiveTomTomKey !== "" &&
    effectiveTomTomKey !== "YOUR_TOMTOM_API_KEY_HERE"
  );

  // TIER 1: TomTom Traffic-Aware Road Routing
  if (validTomTomKey) {
    try {
      const url = `https://api.tomtom.com/routing/1/calculateRoute/${origin.lat},${origin.lng}:${destination.lat},${destination.lng}/json?key=${effectiveTomTomKey}&traffic=true`;
      const res = await fetch(url, { signal });
      if (res.ok) {
        const data = await res.json();
        const route = data?.routes?.[0];
        const summary = route?.summary;
        const points = route?.legs?.[0]?.points;

        if (summary && Array.isArray(points) && points.length > 0) {
          const geometry: [number, number][] = points.map((p: any) => [p.latitude, p.longitude]);
          const distanceKm = Number(summary.lengthInMeters || 0) / 1000;
          const durationMin = Math.max(1, Math.round(Number(summary.travelTimeInSeconds || 0) / 60));
          const delayMin = Math.round(Number(summary.trafficDelayInSeconds || 0) / 60);

          const result: RouteResult = {
            provider: "tomtom",
            distanceKm,
            durationMin,
            trafficDelayMin: Math.max(0, delayMin),
            trafficAvailable: true,
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
      // Fall through to Tier 2
    }
  }

  // TIER 2: OSRM Driving Road Routing
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
          trafficAvailable: false, // OSRM public server does not supply live traffic
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
