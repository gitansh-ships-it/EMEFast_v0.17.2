import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const originLat = searchParams.get("origin_lat");
  const originLng = searchParams.get("origin_lng");
  const destLat = searchParams.get("dest_lat");
  const destLng = searchParams.get("dest_lng");

  if (!originLat || !originLng || !destLat || !destLng) {
    return NextResponse.json({ detail: "Missing coordinates" }, { status: 400 });
  }

  const tomtomKey = "FtEclPAu7Ksrt5sy6f5XvnHr4JmDZ8uB";
  const url = `https://api.tomtom.com/routing/1/calculateRoute/${originLat},${originLng}:${destLat},${destLng}/json?key=${tomtomKey}&traffic=true`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "EMEFast/3.0" },
      next: { revalidate: 30 },
    });

    if (res.ok) {
      const data = await res.json();
      const route = data?.routes?.[0];
      const summary = route?.summary;
      const points = route?.legs?.[0]?.points;

      if (summary && Array.isArray(points) && points.length > 0) {
        const geometry = points.map((p: any) => [p.latitude, p.longitude]);
        const distanceKm = Number(summary.lengthInMeters || 0) / 1000;
        const durationMin = Math.max(1, Math.round(Number(summary.travelTimeInSeconds || 0) / 60));
        const delayMin = Math.round(Number(summary.trafficDelayInSeconds || 0) / 60);

        let trafficStatus = "NORMAL";
        if (delayMin >= 10) trafficStatus = "HEAVY";
        else if (delayMin >= 3) trafficStatus = "MODERATE";

        return NextResponse.json({
          provider: "tomtom",
          distanceKm,
          durationMin,
          trafficDelayMin: Math.max(0, delayMin),
          trafficAvailable: true,
          trafficStatus,
          isRoadRoute: true,
          isFailed: false,
          geometry,
        });
      }
    }
  } catch {}

  // Fallback to OSRM Driving Road Routing
  try {
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${originLng},${originLat};${destLng},${destLat}?overview=full&geometries=geojson`;
    const res = await fetch(osrmUrl);
    if (res.ok) {
      const data = await res.json();
      const route = data?.routes?.[0];
      if (route?.geometry?.coordinates?.length) {
        const geometry = route.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]);
        const distanceKm = Number(route.distance || 0) / 1000;
        const durationMin = Math.max(1, Math.round(Number(route.duration || 0) / 60));

        return NextResponse.json({
          provider: "osrm",
          distanceKm,
          durationMin,
          trafficDelayMin: 0,
          trafficAvailable: false,
          trafficStatus: "UNAVAILABLE",
          isRoadRoute: true,
          isFailed: false,
          geometry,
        });
      }
    }
  } catch {}

  return NextResponse.json({ detail: "Routing unavailable" }, { status: 502 });
}
