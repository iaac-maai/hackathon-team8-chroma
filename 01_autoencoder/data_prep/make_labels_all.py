"""Merge every label into one table: one row per photo, every source.

    place, place_conf        Places365 label, own folder, or CLIP's guess (Wikimedia)
    time, season             CLIP's guess with confidence; *_true from the capture date when known
    keep, reason             close-up filter; Wikimedia photos that CLIP calls "other"
                             (museum, artwork, food, document ...) are not kept either
    colours                  brightness, saturation, contrast, warmth, n_colours, palette
    gradient map             8 stops dark -> light, and the repainted image
    music                    scale, chords, sevenths, tone, melody, drums

Output: ../data/labels_all.csv

Run from the 01_autoencoder/ folder, after the other scripts:
    python data_prep/make_labels_all.py
"""

import json
from pathlib import Path

import pandas as pd

DATA = Path(__file__).resolve().parent.parent / "data"


def main():
    lab = pd.read_csv(DATA / "labels_auto.csv", keep_default_na=False, low_memory=False)
    cl = pd.read_csv(DATA / "closeups.csv", keep_default_na=False)[["file", "keep", "reason"]]
    pal = pd.read_csv(DATA / "palette.csv")
    gm = pd.read_csv(DATA / "gradient_maps.csv")[["file", "stops", "gradient_png"]]
    df = (lab.drop(columns=["keep"], errors="ignore")
             .merge(cl, on="file", how="left").merge(pal, on="file", how="left").merge(gm, on="file", how="left")
             .rename(columns={"stops": "gradient_stops", "palette": "palette_colours"}))
    other = df["place"] == "other"
    df.loc[other, "keep"] = 0
    df.loc[other & (df["reason"] == ""), "reason"] = "not one of our places"

    cols = ["file", "source", "place", "place_clip", "place_conf", "places365_category", "indoor",
            "keep", "reason", "lat", "lon", "taken_at",
            "time", "time_conf", "time_true", "season", "season_conf", "season_true",
            "brightness", "saturation", "contrast", "warmth", "n_colours", "palette_colours",
            "gradient_stops", "gradient_png", "scale", "chords", "sevenths", "tone", "melody", "drums",
            "licence", "author", "url"]
    df = df[[c for c in cols if c in df.columns]]
    df.to_csv(DATA / "labels_all.csv", index=False)

    ok = lambda s: isinstance(s, str) and len(json.loads(s)) > 0  # noqa: E731
    print(f"{len(df):,} photos  ·  kept {int(df['keep'].sum()):,}")
    print(f"  place        {(df['place'] != '').sum():,}")
    print(f"  time of day  {df['time'].isin(['day', 'golden hour', 'night']).sum():,}")
    print(f"  palette      {df['palette_colours'].apply(ok).sum():,}")
    print(f"  gradient     {df['gradient_stops'].apply(ok).sum():,}")
    k = df[df["keep"] == 1]
    print(pd.crosstab([k["source"], k["place"]], k["time"], margins=True))


if __name__ == "__main__":
    main()
