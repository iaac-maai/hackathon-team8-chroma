"""Add layers to every photo: place (with confidence), time of day and season.

Places365 has no such labels, so a ready-made image-text model (CLIP) guesses
them "zero-shot": it compares each photo with short text descriptions and picks
the closest one. Every guess keeps its confidence (0-1), so the library can show
which labels are uncertain and need a human check.

Input:  every source in sources.py (Places365, own photos, Wikimedia)
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

from sources import load_index

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
MODEL = "openai/clip-vit-base-patch32"

# Several descriptions per label; their scores are averaged (prompt ensembling).
# Place: our six places, plus "other" for everything else (museums, food, documents ...).
PLACE = {
    "market": ["a photo of a food market with stalls", "a busy market hall with fruit and vegetables"],
    "street": ["a photo of a city street with buildings", "a narrow old town street", "a wide avenue with traffic"],
    "beach": ["a photo of a beach and the sea", "a sandy beach with people and waves"],
    "mountains": ["a view over a city from a hill", "a photo of hills and mountains", "a forest path on a hill"],
    "metro": ["a photo of a metro station platform", "an underground train station"],
    "airport": ["a photo of an airport terminal", "an airport hall with check-in desks"],
    "other": ["a photo of a museum interior", "a photo of a painting or artwork", "a photo of food on a plate",
              "a scanned document or map", "a close-up of a building detail or sculpture", "a photo of a church interior"],
}
INDOOR_PLACES = {"metro", "airport"}

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


# Is the PLACE the subject, or a person, animal or object in front of it?
# Only "scene" photos are kept: close-ups do not show what a place looks like.
SUBJECT = {
    "scene": [
        "a wide photo of a city street with buildings",
        "a view over a city and its neighbourhoods",
        "a wide view of a public square or market",
        "a wide view of a beach and the sea",
        "a landscape photo of hills and mountains",
        "the inside of a large station or terminal hall",
    ],
    "person": [
        "a portrait photo of a person",
        "a close-up photo of a person posing for the camera",
        "a photo of a child",
        "a selfie",
    ],
    "animal": [
        "a close-up photo of a dog",
        "a close-up photo of an animal",
    ],
    "object": [
        "a close-up photo of an object",
        "a product photo of a single thing",
        "a close-up photo of a chair",
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
    index = load_index()
    print(index["source"].value_counts().to_string())
    model = CLIPModel.from_pretrained(MODEL).eval()
    processor = CLIPProcessor.from_pretrained(MODEL)

    t_feats = text_features(model, processor, TIME)
    s_feats = text_features(model, processor, SEASON)
    c_feats = text_features(model, processor, SUBJECT)
    p_feats = text_features(model, processor, PLACE)
    scale = model.logit_scale.exp()

    rows = []
    batch = 32
    for start in range(0, len(index), batch):
        part = index.iloc[start:start + batch]
        images = [Image.open(DATA / f).convert("RGB") for f in part["file"]]
        if start % 1600 == 0:
            print(f"{start:,}/{len(index):,}", flush=True)
        inputs = processor(images=images, return_tensors="pt")
        with torch.inference_mode():
            img = as_tensor(model.get_image_features(**inputs))
        img = img / img.norm(dim=-1, keepdim=True)
        p_time = (scale * img @ t_feats.T).softmax(dim=-1)
        p_season = (scale * img @ s_feats.T).softmax(dim=-1)
        p_subject = (scale * img @ c_feats.T).softmax(dim=-1)
        p_place = (scale * img @ p_feats.T).softmax(dim=-1)

        for (_, r), pt, ps, pc, pp in zip(part.iterrows(), p_time, p_season, p_subject, p_place):
            row = r.to_dict()
            pi = int(pp.argmax())
            row["place_clip"], row["place_conf"] = list(PLACE)[pi], round(float(pp[pi]), 3)
            if not row.get("place"):                      # Wikimedia: no place label of its own
                row["place"] = row["place_clip"]
                row["indoor"] = int(row["place"] in INDOOR_PLACES)
            ci = int(pc.argmax())
            row["subject"] = list(SUBJECT)[ci]
            row["subject_conf"] = round(float(pc[ci]), 3)
            row["keep"] = int(row["subject"] == "scene")
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

    out = pd.DataFrame(rows)
    out.to_csv(DATA / "labels_auto.csv", index=False)
    print(f"\nWrote {DATA / 'labels_auto.csv'}")
    print(pd.crosstab(out["place"], out["subject"]))
    print(f"Kept {out['keep'].sum()} of {len(out)} photos as scenes.\n")
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
