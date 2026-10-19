from fastapi import APIRouter, Query, HTTPException
import httpx

router = APIRouter()


@router.get("/weather/current")
async def current_weather(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
):
    url = "https://api.open-meteo.com/v1/forecast"

    params = {
        "latitude": latitude,
        "longitude": longitude,
        "current": (
            "temperature_2m,"
            "relative_humidity_2m,"
            "apparent_temperature,"
            "precipitation,"
            "rain,"
            "weather_code,"
            "wind_speed_10m"
        ),
        "timezone": "auto",
    }

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
            data = response.json()

    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail="Weather service timed out. Please try again.",
        )
    except httpx.HTTPStatusError:
        raise HTTPException(
            status_code=502,
            detail="Weather service returned an error.",
        )
    except (httpx.HTTPError, ValueError):
        raise HTTPException(
            status_code=502,
            detail="Could not connect to the weather service.",
        )

    current = data.get("current")

    if not current:
        raise HTTPException(
            status_code=502,
            detail="Weather data is currently unavailable.",
        )

    return {
        "latitude": data.get("latitude"),
        "longitude": data.get("longitude"),
        "timezone": data.get("timezone"),
        "current": current,
        "source": "Open-Meteo",
        "note": "Current weather conditions, not a guarantee of future conditions.",
    }
