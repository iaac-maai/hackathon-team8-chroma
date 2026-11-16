"""Add our own Barcelona photos to the dataset.

Put the ORIGINAL photo files (straight from the phone, not sent through WhatsApp
or Instagram, which delete the date) into:
    ../data/own_raw/<place>/      place = market, street, beach, mountains, metro, airport
    ../data/own_raw/unsorted/     if you do not know yet (set the place in the library)

For each photo this script:
  - reads the date and time it was taken (EXIF DateTimeOriginal);
  - turns them into the TRUE time of day and season for Barcelona;
  - saves a 256 x 256 copy WITHOUT metadata (no GPS) to ../data/own/<place>/.

The true labels let us measure how often CLIP's guesses are right.

Output: ../data/own_index.csv

Run from the 01_autoencoder/ folder:
    python data_prep/prepare_own_photos.py
"""

import csv
from datetime import datetime
from pathlib import Path

from PIL import Image, ImageOps

try:  # iPhone photos (.heic) need this extra package
    from pillow_heif import register_heif_opener
    register_heif_opener()
except ImportError:
    pass

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "own_raw"
OUT = ROOT / "data" / "own"
INDEX = ROOT / "data" / "own_index.csv"
SIZE = 256
EXTS = {".jpg", ".jpeg", ".png", ".heic", ".webp"}
INDOOR_PLACES = {"metro", "airport"}

# Approximate sunrise and sunset in Barcelona (local clock time, hours) per month.
SUN = {1: (8.2, 17.7), 2: (7.9, 18.2), 3: (7.3, 18.8), 4: (7.2, 20.3),
       5: (6.6, 20.9), 6: (6.3, 21.3), 7: (6.5, 21.3), 8: (7.0, 20.8),
       9: (7.5, 20.0), 10: (8.0, 19.1), 11: (7.6, 17.6), 12: (8.1, 17.4)}


def season_of(month):
    """Meteorological seasons, northern hemisphere."""
    return {12: "winter", 1: "winter", 2: "winter", 3: "spring", 4: "spring", 5: "spring",
            6: "summer", 7: "summer", 8: "summer"}.get(month, "autumn")


def time_of(dt):
    """day / golden hour (1 h around sunrise or sunset) / night."""
    rise, set_ = SUN[dt.month]
    h = dt.hour + dt.minute / 60
    if abs(h - rise) <= 1 or abs(h - set_) <= 1:
        return "golden hour"
    return "day" if rise < h < set_ else "night"


def taken_at(img):
    exif = img.getexif()
    raw = exif.get_ifd(0x8769).get(36867) or exif.get(306)  # DateTimeOriginal, else DateTime
    if not raw:
        return None
    try:
        return datetime.strptime(str(raw).strip("\x00 "), "%Y:%m:%d %H:%M:%S")
    except ValueError:
        return None


def square(img):
    img = ImageOps.exif_transpose(img).convert("RGB")
    return ImageOps.fit(img, (SIZE, SIZE), Image.Resampling.LANCZOS)


def main():
    files = sorted(p for p in RAW.rglob("*") if p.suffix.lower() in EXTS)
    if not files:
        print(f"No photos found. Put them in {RAW}/<place>/ and run again.")
        return

    rows = []
    for i, path in enumerate(files, 1):
        place = path.parent.name if path.parent != RAW else "unsorted"
        with Image.open(path) as img:
            dt = taken_at(img)
            small = square(img)
        name = f"own_{i:04d}.jpg"
        dest = OUT / place / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        small.save(dest, quality=92)  # saved without EXIF: no GPS, no phone model
        rows.append({
            "file": f"own/{place}/{name}",
            "place": place,
            "places365_category": "own",
            "indoor": int(place in INDOOR_PLACES),
            "taken_at": dt.isoformat(timespec="minutes") if dt else "",
            "time_true": time_of(dt) if dt else "",
            "season_true": season_of(dt.month) if dt else "",
            "original_name": path.name,
        })

    with open(INDEX, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)

    dated = sum(bool(r["taken_at"]) for r in rows)
    print(f"{len(rows)} photos written to {OUT}; {dated} have a date in their metadata.")
    if dated < len(rows):
        print("Photos without a date were probably sent through a messaging app. "
              "Use the original files to get true labels.")


if __name__ == "__main__":
    main()
