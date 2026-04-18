from dataclasses import dataclass
from dotenv import load_dotenv
import os

load_dotenv()


@dataclass
class Config:
    firms_map_key: str
    usgs_feed_url: str
    env: str
    db_path: str
    cors_origins: list


def get_config() -> Config:
    cors_raw = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:4173")
    return Config(
        firms_map_key=os.getenv("FIRMS_MAP_KEY", ""),
        usgs_feed_url=os.getenv(
            "USGS_FEED_URL",
            "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson",
        ),
        env=os.getenv("ENV", "development"),
        db_path=os.getenv("DB_PATH", "aegis.db"),
        cors_origins=[o.strip() for o in cors_raw.split(",") if o.strip()],
    )


config = get_config()
