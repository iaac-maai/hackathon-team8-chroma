"""One list of all photos, from every source, for the labelling scripts.

    places365   ../data/places_index.csv     place known (Places365 category)
    own         ../data/own_index.csv        our photos; place from the folder, true time/season from EXIF
    wikimedia   ../data/wikimedia_index.csv  geotagged Barcelona photos; place guessed by CLIP,
                                             true time/season when the file has a capture date

Columns: file, source, place, places365_category, indoor, lat, lon, taken_at,
         time_true, season_true
"""

from datetime import datetime
from pathlib import Path

import pandas as pd

DATA = Path(__file__).resolve().parent.parent / "data"

# Approximate Barcelona sunrise / sunset (local hours) per month, and seasons.
SUN = {1: (8.2, 17.7), 2: (7.9, 18.2), 3: (7.3, 18.8), 4: (7.2, 20.3), 5: (6.6, 20.9), 6: (6.3, 21.3),
       7: (6.5, 21.3), 8: (7.0, 20.8), 9: (7.5, 20.0), 10: (8.0, 19.1), 11: (7.6, 17.6), 12: (8.1, 17.4)}


def season_of(month):
    return {12: "winter", 1: "winter", 2: "winter", 3: "spring", 4: "spring", 5: "spring",
            6: "summer", 7: "summer", 8: "summer"}.get(month, "autumn")


def time_of(dt):
    rise, set_ = SUN[dt.month]
    h = dt.hour + dt.minute / 60
    if abs(h - rise) <= 1 or abs(h - set_) <= 1:
        return "golden hour"
    return "day" if rise < h < set_ else "night"


def parse_date(s):
    s = str(s or "").strip().replace("T", " ")
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y:%m:%d %H:%M:%S", "%Y-%m-%d %H:%M"):
        try:
            return datetime.strptime(s[:19] if "S" in fmt else s[:16], fmt)
        except ValueError:
            continue
    return None


def load_index(min_bytes=2000):
    frames = [pd.read_csv(DATA / "places_index.csv").assign(source="places365")]

    own = DATA / "own_index.csv"
    if own.exists():
        frames.append(pd.read_csv(own, keep_default_na=False).assign(source="own"))

    wiki = DATA / "wikimedia_index.csv"
    if wiki.exists():
        w = pd.read_csv(wiki)
        # only files that were downloaded and are real images
        w = w[w["file"].apply(lambda f: (DATA / f).exists() and (DATA / f).stat().st_size > min_bytes)].copy()
        dates = w["taken_at"].apply(parse_date)
        # a time of day is only meaningful with a real clock time (not midnight placeholders)
        has_time = dates.apply(lambda d: d is not None and (d.hour, d.minute, d.second) != (0, 0, 0))
        w["time_true"] = [time_of(d) if ok else "" for d, ok in zip(dates, has_time)]
        w["season_true"] = [season_of(d.month) if d is not None else "" for d in dates]
        w["taken_at"] = [d.isoformat(timespec="minutes") if d is not None else "" for d in dates]
        w["place"] = ""                     # filled by CLIP in label_time_season.py
        w["places365_category"] = "wikimedia"
        w["indoor"] = 0
        frames.append(w[["file", "place", "places365_category", "indoor", "lat", "lon", "taken_at",
                         "time_true", "season_true", "licence", "author", "url"]].assign(source="wikimedia"))

    return pd.concat(frames, ignore_index=True)
