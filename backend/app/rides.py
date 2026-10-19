
from fastapi import APIRouter

router = APIRouter()


@router.get("/rides/providers")
def get_ride_providers():
    return {
        "providers": [
            {
                "name": "Uber",
                "website": "https://www.uber.com/in/en/ride/",
                "vehicle_types": ["Auto", "Cab"],
                "booking_method": "Continue on Uber",
            },
            {
                "name": "Ola",
                "website": "https://www.olacabs.com/",
                "vehicle_types": ["Auto", "Cab"],
                "booking_method": "Continue on Ola",
            },
            {
                "name": "Rapido",
                "website": "https://www.rapido.bike/",
                "vehicle_types": ["Bike taxi", "Auto", "Cab"],
                "booking_method": "Continue on Rapido",
            },
        ],
        "booking_status": "external_provider_required",
        "note": (
            "NaviGo does not book or confirm rides directly. "
            "Users must continue with the provider to check "
            "availability, pricing, and complete a booking."
        ),
    }
