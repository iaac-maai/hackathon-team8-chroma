"""Extract our six places from the Places365 validation set.

Input  (downloaded into ../data/raw/):
    val_256.tar                       36,500 validation photos, 256 x 256
    filelist_places365-standard.tar   labels (places365_val.txt) and category names

Output (in ../data/):
    places/<place>/<file>.jpg         only the categories we use
    places_index.csv                  file, place, places365_category, indoor

Run from the 01_autoencoder/ folder:
    python data_prep/prepare_places365.py
"""

import csv
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "places"
INDEX = ROOT / "data" / "places_index.csv"

# Our place -> the Places365 categories that belong to it.
PLACES = {
    "market":    ["/m/market/outdoor", "/m/market/indoor"],
    "street":    ["/s/street"],
    "beach":     ["/b/beach"],
    "mountains": ["/m/mountain", "/m/mountain_path", "/m/mountain_snowy"],
    "metro":     ["/s/subway_station/platform"],
    "airport":   ["/a/airport_terminal"],
}
# Categories where you cannot see the sky: season is not visible.
INDOOR = {"/m/market/indoor", "/s/subway_station/platform", "/a/airport_terminal"}


def read_text_from_tar(tar_path, name_suffix):
    with tarfile.open(tar_path) as tar:
        member = next(m for m in tar.getmembers() if m.name.endswith(name_suffix))
        return tar.extractfile(member).read().decode("utf-8").splitlines()


def main():
    filelist = RAW / "filelist_places365-standard.tar"
    categories = [line.split()[0] for line in read_text_from_tar(filelist, "categories_places365.txt")]
    wanted = {cat: place for place, cats in PLACES.items() for cat in cats}

    # places365_val.txt: "Places365_val_00000001.jpg 165"
    file_to_cat = {}
    for line in read_text_from_tar(filelist, "places365_val.txt"):
        name, idx = line.split()
        cat = categories[int(idx)]
        if cat in wanted:
            file_to_cat[name] = cat

    rows = []
    with tarfile.open(RAW / "val_256.tar") as tar:
        for member in tar:
            name = Path(member.name).name
            if name not in file_to_cat:
                continue
            cat = file_to_cat[name]
            place = wanted[cat]
            dest = OUT / place / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(tar.extractfile(member).read())
            rows.append({
                "file": f"places/{place}/{name}",
                "place": place,
                "places365_category": cat,
                "indoor": int(cat in INDOOR),
            })

    rows.sort(key=lambda r: (r["place"], r["file"]))
    with open(INDEX, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)

    print(f"{len(rows)} photos written to {OUT}")
    for place in PLACES:
        print(f"  {place:10s} {sum(r['place'] == place for r in rows)}")


if __name__ == "__main__":
    main()
