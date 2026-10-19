from fastapi import APIRouter, Query

router = APIRouter()


@router.get("/routes/compare")
def compare_routes(
    distance_km: float = Query(..., gt=0, le=200),
    walking_distance_km: float = Query(0, ge=0, le=200),
):
    options = [
        {
            "mode": "Bike taxi",
            "base_fare": 20,
            "fare_per_km": 10,
            "estimated_walking_km": 0.2,
        },
        {
            "mode": "Auto",
            "base_fare": 30,
            "fare_per_km": 18,
            "estimated_walking_km": 0.1,
        },
        {
            "mode": "Cab",
            "base_fare": 60,
            "fare_per_km": 22,
            "estimated_walking_km": 0.1,
        },
    ]

    results = []

    for option in options:
        fare = (
            option["base_fare"]
            + distance_km * option["fare_per_km"]
        )

        results.append({
            "mode": option["mode"],
            "distance_km": distance_km,
            "estimated_fare_inr": round(fare),
            "estimated_walking_km": round(
                walking_distance_km
                + option["estimated_walking_km"], 2
            ),
            "source": "NaviGo prototype estimate",
        })

    results.sort(key=lambda item: item["estimated_fare_inr"])

    return {
        "routes": results,
        "cheapest_mode": results[0]["mode"],
        "note": (
            "Illustrative estimates only. These are not live fares "
            "or verified transport routes. Walking distances are "
            "assumptions and do not represent measured route data."
        ),
    }
