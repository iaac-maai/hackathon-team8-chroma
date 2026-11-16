"""Download geotagged Barcelona photos from Wikimedia Commons.

Every file on Commons has a free licence (CC0, CC BY, CC BY-SA or public domain).
We search the city on a grid of points (1 km apart, 800 m radius), keep photos
(JPEG) with an open licence, and save a 256 px thumbnail of each.

Output:
    ../data/wikimedia/<pageid>.jpg   256 px thumbnails
    ../data/wikimedia_index.csv      file, lat, lon, taken_at, title, author,
                                     licence, url (the credit list)

Run from the 01_autoencoder/ folder:
    python data_prep/download_wikimedia.py            # index + download
    python data_prep/download_wikimedia.py --index    # only build the index
"""

import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import pandas as pd
import requests

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = DATA / "wikimedia"
INDEX = DATA / "wikimedia_index.csv"
API = "https://commons.wikimedia.org/w/api.php"
HEADERS = {"User-Agent": "course-project-client/0.1 (educational, non-commercial)"}
# Barcelona municipality, roughly
LAT0, LAT1, LON0, LON1 = 41.32, 41.47, 2.07, 2.23
STEP_KM, RADIUS_M = 1.0, 800
OPEN = re.compile(r"^(cc0|cc[- ]by|public domain|pd)", re.I)

S = requests.Session()
S.headers.update(HEADERS)


def api(params):
    params = {"format": "json", "formatversion": 2, "maxlag": 5, **params}
    for attempt in range(5):
        try:
            r = S.get(API, params=params, timeout=60)
            if r.status_code == 200 and "error" not in r.json():
                return r.json()
        except requests.RequestException:
            pass
        time.sleep(2 + 3 * attempt)
    return {}


def grid():
    dlat = STEP_KM / 111.0
    dlon = STEP_KM / (111.0 * np.cos(np.radians(41.4)))
    return [(la, lo) for la in np.arange(LAT0, LAT1, dlat) for lo in np.arange(LON0, LON1, dlon)]


def search():
    pages = {}
    pts = grid()
    for i, (la, lo) in enumerate(pts, 1):
        res = api({"action": "query", "list": "geosearch", "gscoord": f"{la}|{lo}",
                   "gsradius": RADIUS_M, "gslimit": 500, "gsnamespace": 6})
        for g in res.get("query", {}).get("geosearch", []):
            if g["title"].lower().endswith((".jpg", ".jpeg")):
                pages[g["pageid"]] = {"pageid": g["pageid"], "title": g["title"], "lat": g["lat"], "lon": g["lon"]}
        if i % 20 == 0:
            print(f"  grid {i}/{len(pts)}: {len(pages):,} photos so far", flush=True)
    return pages


def strip_html(s):
    return re.sub(r"<[^>]+>", "", s or "").strip()


def details(pages):
    ids = list(pages)
    for i in range(0, len(ids), 50):
        res = api({"action": "query", "pageids": "|".join(map(str, ids[i:i + 50])),
                   "prop": "imageinfo", "iiprop": "url|extmetadata", "iiurlwidth": 256,
                   "iiextmetadatafilter": "LicenseShortName|Artist|DateTimeOriginal"})
        for p in res.get("query", {}).get("pages", []):
            info = (p.get("imageinfo") or [{}])[0]
            meta = info.get("extmetadata", {})
            row = pages.get(p["pageid"])
            if row is None:
                continue
            row["licence"] = strip_html(meta.get("LicenseShortName", {}).get("value"))
            row["author"] = strip_html(meta.get("Artist", {}).get("value"))[:200]
            row["taken_at"] = strip_html(meta.get("DateTimeOriginal", {}).get("value"))[:19]
            row["thumb"] = info.get("thumburl", "")
            row["url"] = info.get("descriptionurl", "")
        if (i // 50) % 40 == 0:
            print(f"  details {i:,}/{len(ids):,}", flush=True)


def fetch(row):
    dest = OUT / f"{row['pageid']}.jpg"
    if dest.exists():
        return True
    for attempt in range(3):
        try:
            r = S.get(row["thumb"], timeout=60)
            if r.status_code == 200:
                dest.write_bytes(r.content)
                return True
            if r.status_code == 429:
                time.sleep(10 * (attempt + 1))
        except requests.RequestException:
            time.sleep(3)
    return False


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    if INDEX.exists():
        df = pd.read_csv(INDEX)
        print(f"Index exists: {len(df):,} photos")
    else:
        print("Searching Barcelona on a grid ...")
        pages = search()
        print(f"{len(pages):,} geotagged photos. Reading licences ...")
        details(pages)
        df = pd.DataFrame(pages.values())
        df = df[df["licence"].fillna("").str.match(OPEN) & (df["thumb"].fillna("") != "")]
        df["file"] = "wikimedia/" + df["pageid"].astype(str) + ".jpg"
        df.to_csv(INDEX, index=False)
        print(f"Kept {len(df):,} with an open licence -> {INDEX}")
        print(df["licence"].value_counts().head(8))
    if "--index" in sys.argv:
        return

    todo = df.to_dict("records")
    done = 0
    with ThreadPoolExecutor(4) as pool:
        for ok in pool.map(fetch, todo):
            done += ok
            if done % 500 == 0:
                print(f"  downloaded {done:,}/{len(todo):,}", flush=True)
    print(f"Downloaded {done:,} of {len(todo):,} thumbnails to {OUT}")


if __name__ == "__main__":
    main()
