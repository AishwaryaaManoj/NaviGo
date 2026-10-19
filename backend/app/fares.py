from fastapi import APIRouter, Query

router = APIRouter()


@router.get("/fares/estimate")
def estimate_fares(
    distance_km: float = Query(..., gt=0, le=200),
):
    # Illustrative prototype rates, not live provider prices.
    options = [
        {
            "vehicle": "Auto",
            "base_fare": 30,
            "per_km": 18,
        },
        {
            "vehicle": "Bike taxi",
            "base_fare": 20,
            "per_km": 10,
        },
        {
            "vehicle": "Cab",
            "base_fare": 60,
            "per_km": 22,
        },
    ]

    estimates = []

    for option in options:
        estimated_fare = (
            option["base_fare"]
            + distance_km * option["per_km"]
        )

        estimates.append(
            {
                "vehicle": option["vehicle"],
                "estimated_fare_inr": round(estimated_fare),
                "currency": "INR",
            }
        )

    return {
        "distance_km": distance_km,
        "estimates": estimates,
        "source": "NaviGo prototype calculation",
        "note": (
            "Illustrative estimates only. Actual fares may differ "
            "due to provider pricing, traffic, demand, and fees."
        ),
    }
