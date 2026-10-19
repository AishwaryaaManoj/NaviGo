from app.rides import router as rides_router
from app.compare import router as compare_router
from app.profile import router as profile_router
from app.fares import router as fares_router
from app.weather import router as weather_router
from fastapi import FastAPI, HTTPException, Query
from math import radians, sin, cos, sqrt, atan2
import httpx

app = FastAPI(title="NaviGo API")
app.include_router(rides_router)
app.include_router(compare_router)
app.include_router(profile_router)
app.include_router(fares_router)
app.include_router(weather_router)

# OpenStreetMap transit data servers
OVERPASS_URLS = [
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass-api.de/api/interpreter",
]

# Dedicated OpenStreetMap walking router
WALKING_ROUTER = (
    "https://routing.openstreetmap.de/"
    "routed-foot/route/v1/driving"
)


def distance_km(lat1, lon1, lat2, lon2):
    earth_radius = 6371
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)

    a = (
        sin(dlat / 2) ** 2
        + cos(radians(lat1))
        * cos(radians(lat2))
        * sin(dlon / 2) ** 2
    )

    return 2 * earth_radius * atan2(
        sqrt(a), sqrt(1 - a)
    )


@app.get("/")
def home():
    return {"message": "Welcome to NaviGo Backend!"}


@app.get("/health")
def health():
    return {"status": "ok"}


# EXISTING API: nearby bus stops and metro stations
@app.get("/stops/nearby")
async def nearby_stops(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
    radius_km: float = Query(3, gt=0, le=10),
):
    radius_m = int(radius_km * 1000)

    query = f"""
    [out:json][timeout:15];
    (
      node(around:{radius_m},{latitude},{longitude})["highway"="bus_stop"];
      node(around:{radius_m},{latitude},{longitude})["railway"="station"];
      node(around:{radius_m},{latitude},{longitude})["station"="subway"];
      node(around:{radius_m},{latitude},{longitude})["public_transport"="platform"];
      way(around:{radius_m},{latitude},{longitude})["railway"="station"];
      relation(around:{radius_m},{latitude},{longitude})["railway"="station"];
    );
    out center tags;
    """

    data = None
    last_error = "Map service is temporarily unavailable."

    for url in OVERPASS_URLS:
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                response = await client.post(
                    url,
                    data={"data": query},
                    headers={
                        "User-Agent": "NaviGoCollegePrototype/1.0"
                    },
                )
                response.raise_for_status()
                data = response.json()
                break

        except httpx.TimeoutException:
            last_error = "Map service timed out."

        except httpx.HTTPStatusError as exc:
            last_error = (
                f"Map service returned HTTP "
                f"{exc.response.status_code}."
            )

        except (httpx.HTTPError, ValueError):
            last_error = "Could not connect to map service."

    if data is None:
        return {
            "count": 0,
            "stops": [],
            "source": "OpenStreetMap",
            "error": last_error,
        }

    stops = []
    seen = set()

    for item in data.get("elements", []):
        tags = item.get("tags", {})
        name = tags.get("name")

        if not name:
            continue

        lat = item.get("lat")
        lon = item.get("lon")

        if lat is None or lon is None:
            center = item.get("center", {})
            lat = center.get("lat")
            lon = center.get("lon")

        if lat is None or lon is None:
            continue

        distance = distance_km(
            latitude, longitude, lat, lon
        )

        if distance > radius_km:
            continue

        if tags.get("highway") == "bus_stop":
            stop_type = "bus"
        elif (
            tags.get("railway") == "station"
            or tags.get("station") == "subway"
        ):
            stop_type = "rail"
        else:
            stop_type = "transit_platform"

        unique_key = (name, round(lat, 5), round(lon, 5))

        if unique_key in seen:
            continue

        seen.add(unique_key)

        stops.append({
            "name": name,
            "type": stop_type,
            "latitude": lat,
            "longitude": lon,
            "distance_km": round(distance, 2),
        })

    stops.sort(key=lambda stop: stop["distance_km"])

    return {
        "count": len(stops),
        "stops": stops,
        "source": "OpenStreetMap",
        "note": "Results depend on mapped data and may be incomplete.",
    }


# NEW API: walking route between two coordinates
@app.get("/route/walking")
async def walking_route(
    start_latitude: float = Query(..., ge=-90, le=90),
    start_longitude: float = Query(..., ge=-180, le=180),
    end_latitude: float = Query(..., ge=-90, le=90),
    end_longitude: float = Query(..., ge=-180, le=180),
):
    if (
        start_latitude == end_latitude
        and start_longitude == end_longitude
    ):
        raise HTTPException(
            status_code=400,
            detail="Start and destination must be different.",
        )

    # OSRM coordinate order is longitude,latitude.
    coordinates = (
        f"{start_longitude},{start_latitude};"
        f"{end_longitude},{end_latitude}"
    )

    params = {
        "overview": "full",
        "geometries": "geojson",
        "steps": "true",
        "alternatives": "false",
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(
                f"{WALKING_ROUTER}/{coordinates}",
                params=params,
                headers={
                    "User-Agent": "NaviGoCollegePrototype/1.0"
                },
            )
            response.raise_for_status()
            data = response.json()

    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail="Walking route service timed out. Try again later.",
        )

    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                "Walking route service returned HTTP "
                f"{exc.response.status_code}."
            ),
        )

    except (httpx.HTTPError, ValueError):
        raise HTTPException(
            status_code=502,
            detail="Could not connect to walking route service.",
        )

    if data.get("code") != "Ok" or not data.get("routes"):
        raise HTTPException(
            status_code=404,
            detail="No walking route found for these coordinates.",
        )

    route = data["routes"][0]
    distance_m = route["distance"]
    duration_s = route["duration"]

    return {
        "mode": "walking",
        "distance_meters": round(distance_m),
        "distance_km": round(distance_m / 1000, 2),
        "duration_seconds": round(duration_s),
        "duration_minutes": round(duration_s / 60, 1),
        "start": {
            "latitude": start_latitude,
            "longitude": start_longitude,
        },
        "destination": {
            "latitude": end_latitude,
            "longitude": end_longitude,
        },
        "geometry": route["geometry"],
        "source": "OpenStreetMap routing service",
        "note": (
            "Route and duration are estimates based on mapped paths. "
            "Availability and accuracy depend on the routing service."
        ),
    }
