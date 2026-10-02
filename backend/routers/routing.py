from fastapi import APIRouter, HTTPException, Query, Response
from typing import Optional
import os
import urllib.request
import json
import ssl

router = APIRouter(prefix="/api/routing", tags=["routing"])

TOMTOM_API_KEY = os.getenv("TOMTOM_API_KEY", "FtEclPAu7Ksrt5sy6f5XvnHr4JmDZ8uB").strip()

def _create_ssl_context():
    try:
        return ssl.create_default_context()
    except Exception:
        return ssl._create_unverified_context()

@router.get("/route")
def get_route(
    origin_lat: float = Query(...),
    origin_lng: float = Query(...),
    dest_lat: float = Query(...),
    dest_lng: float = Query(...),
):
    """Calculate road route with real-time traffic delay via secure backend TomTom proxy.
    Falls back gracefully to OSRM if TomTom is unavailable.
    """
    # 1. Try TomTom Traffic-Aware Route
    if TOMTOM_API_KEY:
        try:
            url = (
                f"https://api.tomtom.com/routing/1/calculateRoute/"
                f"{origin_lat},{origin_lng}:{dest_lat},{dest_lng}/json"
                f"?key={TOMTOM_API_KEY}&traffic=true"
            )
            ctx = _create_ssl_context()
            req = urllib.request.Request(url, headers={"User-Agent": "EMEFast/3.0"})
            with urllib.request.urlopen(req, timeout=7, context=ctx) as resp:
                data = json.loads(resp.read().decode())
                route = data.get("routes", [{}])[0]
                summary = route.get("summary", {})
                points = route.get("legs", [{}])[0].get("points", [])

                if summary and points:
                    geometry = [[p["latitude"], p["longitude"]] for p in points]
                    dist_km = float(summary.get("lengthInMeters", 0)) / 1000.0
                    duration_min = max(1, round(float(summary.get("travelTimeInSeconds", 0)) / 60.0))
                    delay_min = max(0, round(float(summary.get("trafficDelayInSeconds", 0)) / 60.0))

                    # Traffic status classification
                    traffic_status = "NORMAL"
                    if delay_min >= 10:
                        traffic_status = "HEAVY"
                    elif delay_min >= 3:
                        traffic_status = "MODERATE"

                    return {
                        "provider": "tomtom",
                        "distanceKm": dist_km,
                        "durationMin": duration_min,
                        "trafficDelayMin": delay_min,
                        "trafficAvailable": True,
                        "trafficStatus": traffic_status,
                        "isRoadRoute": True,
                        "isFailed": False,
                        "geometry": geometry,
                    }
        except Exception:
            pass

    # 2. Fallback to OSRM Driving Engine
    try:
        osrm_url = (
            f"https://router.project-osrm.org/route/v1/driving/"
            f"{origin_lng},{origin_lat};{dest_lng},{dest_lat}"
            f"?overview=full&geometries=geojson"
        )
        req = urllib.request.Request(osrm_url, headers={"User-Agent": "EMEFast/3.0"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode())
            route = data.get("routes", [{}])[0]
            coords = route.get("geometry", {}).get("coordinates", [])
            if coords:
                geometry = [[c[1], c[0]] for c in coords]
                dist_km = float(route.get("distance", 0)) / 1000.0
                duration_min = max(1, round(float(route.get("duration", 0)) / 60.0))
                return {
                    "provider": "osrm",
                    "distanceKm": dist_km,
                    "durationMin": duration_min,
                    "trafficDelayMin": 0,
                    "trafficAvailable": False,
                    "trafficStatus": "UNAVAILABLE",
                    "isRoadRoute": True,
                    "isFailed": False,
                    "geometry": geometry,
                }
    except Exception:
        pass

    # 3. Straight-Line Fallback
    import math
    dlat = math.radians(dest_lat - origin_lat)
    dlng = math.radians(dest_lng - origin_lng)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(origin_lat)) * math.cos(math.radians(dest_lat)) * math.sin(dlng / 2) ** 2
    dist_km = 6371 * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return {
        "provider": "straight-line",
        "distanceKm": dist_km,
        "durationMin": max(2, round((dist_km / 35.0) * 60.0)),
        "trafficDelayMin": 0,
        "trafficAvailable": False,
        "trafficStatus": "UNAVAILABLE",
        "isRoadRoute": False,
        "isFailed": True,
        "geometry": [[origin_lat, origin_lng], [dest_lat, dest_lng]],
    }

@router.get("/traffic-tile/{z}/{x}/{y}.png")
def get_traffic_tile(z: int, x: int, y: int):
    """Proxy TomTom real-time traffic flow raster tile securely without exposing API key."""
    if not TOMTOM_API_KEY:
        raise HTTPException(status_code=503, detail="Traffic tile service unconfigured")

    url = f"https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key={TOMTOM_API_KEY}"
    try:
        ctx = _create_ssl_context()
        req = urllib.request.Request(url, headers={"User-Agent": "EMEFast/3.0"})
        with urllib.request.urlopen(req, timeout=5, context=ctx) as resp:
            content = resp.read()
            return Response(content=content, media_type="image/png", headers={
                "Cache-Control": "public, max-age=60",
            })
    except Exception:
        # Return 1x1 transparent png if tile unavailable
        transparent_1x1 = (
            b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
            b"\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\rIDATx\x9cc`\x00\x00\x00\x02"
            b"\x00\x01H\xaf\xa4q\x00\x00\x00\x00IEND\xaeB`\x82"
        )
        return Response(content=transparent_1x1, media_type="image/png")
