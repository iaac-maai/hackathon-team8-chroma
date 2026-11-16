"""Add two layers to every photo: time of day and season.

Places365 has no such labels, so a ready-made image-text model (CLIP) guesses
them "zero-shot": it compares each photo with short text descriptions and picks
the closest one. Every guess keeps its confidence (0-1), so the library can show
which labels are uncertain and need a human check.

Input:  ../data/places_index.csv  (from prepare_places365.py)
Output: ../data/labels_auto.csv   index columns + time, time_conf, season, season_conf
                                  + one probability column per label

Run from the 01_autoencoder/ folder:
    python data_prep/label_time_season.py
"""

from pathlib import Path

import pandas as pd
import torch
from PIL import Image
from transformers import CLIPModel, CLIPProcessor

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
MODEL = "openai/clip-vit-base-patch32"

# Several descriptions per label; their scores are averaged (prompt ensembling).
TIME = {
    "day": [
        "a photo taken in bright daylight",
        "a place at midday under a clear sky",
        "a daytime photo",
    ],
    "golden hour": [
        "a photo taken at sunset",
        "a photo taken at sunrise with warm orange light",
        "a place at dusk with a golden sky",
    ],
    "night": [
        "a photo taken at night",
        "a place at night lit by street lights",
        "a dark night-time photo",
    ],
}
SEASON = {
    "spring": [
        "a photo taken in spring with blossoming flowers",
        "fresh green leaves and flowers in spring",
    ],
    "summer": [
        "a photo taken in summer with hot sun",
        "people in t-shirts and shorts on a summer day",
    ],
    "autumn": [
        "a photo taken in autumn with orange and brown leaves",
        "fallen leaves in autumn",
    ],
    "winter": [
        "a photo taken in winter with snow",
        "bare trees and people in coats in winter",
    ],
}


def as_tensor(out):
    """transformers 5 returns an output object; older versions return the tensor."""
    return out if isinstance(out, torch.Tensor) else out.pooler_output


def text_features(model, processor, label_prompts):
    """One normalised text vector per label (mean of its prompts)."""
    feats = []
    for prompts in label_prompts.values():
        inputs = processor(text=prompts, return_tensors="pt", padding=True)
        with torch.no_grad():
            f = as_tensor(model.get_text_features(**inputs))
        f = f / f.norm(dim=-1, keepdim=True)
        f = f.mean(dim=0)
        feats.append(f / f.norm())
    return torch.stack(feats)


def main():
    index = pd.read_csv(DATA / "places_index.csv").assign(source="places365")
    own = DATA / "own_index.csv"
    if own.exists():  # our photos: they also carry the true labels from EXIF
        index = pd.concat([index, pd.read_csv(own, keep_default_na=False).assign(source="own")],
                          ignore_index=True)
    model = CLIPModel.from_pretrained(MODEL).eval()
    processor = CLIPProcessor.from_pretrained(MODEL)

    t_feats = text_features(model, processor, TIME)
    s_feats = text_features(model, processor, SEASON)
    scale = model.logit_scale.exp()

    rows = []
    batch = 32
    for start in range(0, len(index), batch):
        part = index.iloc[start:start + batch]
        images = [Image.open(DATA / f).convert("RGB") for f in part["file"]]
        inputs = processor(images=images, return_tensors="pt")
        with torch.no_grad():
            img = as_tensor(model.get_image_features(**inputs))
        img = img / img.norm(dim=-1, keepdim=True)
        p_time = (scale * img @ t_feats.T).softmax(dim=-1)
        p_season = (scale * img @ s_feats.T).softmax(dim=-1)

        for (_, r), pt, ps in zip(part.iterrows(), p_time, p_season):
            row = r.to_dict()
            ti, si = int(pt.argmax()), int(ps.argmax())
            row["time"] = list(TIME)[ti]
            row["time_conf"] = round(float(pt[ti]), 3)
            # Season is not visible indoors (metro, airport terminal, covered market).
            if r["indoor"]:
                row["season"], row["season_conf"] = "unknown", 0.0
            else:
                row["season"] = list(SEASON)[si]
                row["season_conf"] = round(float(ps[si]), 3)
            for k, p in zip(TIME, pt):
                row[f"p_time_{k.replace(' ', '_')}"] = round(float(p), 3)
            for k, p in zip(SEASON, ps):
                row[f"p_season_{k}"] = round(float(p), 3)
            rows.append(row)
        print(f"{min(start + batch, len(index))}/{len(index)}")

    out = pd.DataFrame(rows)
    out.to_csv(DATA / "labels_auto.csv", index=False)
    print(f"\nWrote {DATA / 'labels_auto.csv'}")
    print(pd.crosstab(out["place"], out["time"]))
    print(pd.crosstab(out["place"], out["season"]))

    # How often is CLIP right? Only our own photos have true labels.
    if "time_true" in out:
        mine = out[(out["source"] == "own") & (out["time_true"].fillna("") != "")]
        if len(mine):
            t_acc = (mine["time"] == mine["time_true"]).mean()
            s = mine[mine["season"] != "unknown"]
            s_acc = (s["season"] == s["season_true"]).mean() if len(s) else float("nan")
            print(f"\nCLIP vs EXIF on {len(mine)} own photos: "
                  f"time of day {t_acc:.0%} right, season {s_acc:.0%} right")


if __name__ == "__main__":
    main()
