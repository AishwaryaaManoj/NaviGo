import json
import sqlite3
from pathlib import Path
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter()

DATABASE = Path(__file__).resolve().parent / "profiles.db"


def initialize_database():
    with sqlite3.connect(DATABASE) as connection:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS profile (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                preferred_travel_mode TEXT NOT NULL,
                home_location TEXT,
                college_location TEXT,
                preferences TEXT NOT NULL
            )
        """)

        connection.execute("""
            INSERT OR IGNORE INTO profile
            (id, name, preferred_travel_mode,
             home_location, college_location, preferences)
            VALUES (1, 'NaviGo User', 'bus', '', '', '[]')
        """)


initialize_database()


class ProfileUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    preferred_travel_mode: Literal[
        "walking", "bus", "metro", "auto", "cab", "bike"
    ] = "bus"
    home_location: str = Field(default="", max_length=200)
    college_location: str = Field(default="", max_length=200)
    preferences: list[str] = Field(default_factory=list)


@router.get("/profile")
def get_profile():
    with sqlite3.connect(DATABASE) as connection:
        connection.row_factory = sqlite3.Row
        row = connection.execute(
            "SELECT * FROM profile WHERE id = 1"
        ).fetchone()

    return {
        "name": row["name"],
        "preferred_travel_mode": row["preferred_travel_mode"],
        "home_location": row["home_location"],
        "college_location": row["college_location"],
        "preferences": json.loads(row["preferences"]),
    }


@router.put("/profile")
def update_profile(profile: ProfileUpdate):
    with sqlite3.connect(DATABASE) as connection:
        connection.execute("""
            UPDATE profile
            SET name = ?,
                preferred_travel_mode = ?,
                home_location = ?,
                college_location = ?,
                preferences = ?
            WHERE id = 1
        """, (
            profile.name.strip(),
            profile.preferred_travel_mode,
            profile.home_location.strip(),
            profile.college_location.strip(),
            json.dumps(profile.preferences),
        ))

    return {
        "message": "Profile saved successfully",
        "profile": profile.model_dump(),
    }