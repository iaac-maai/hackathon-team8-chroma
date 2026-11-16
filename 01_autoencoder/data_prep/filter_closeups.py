"""Remove close-ups: photos where a person, an animal or one object fills the frame.

We want photos of PLACES. People are allowed in a place (a crowded market, a
hiker on a mountain), but not as the subject (a portrait, a selfie, a dog).

A ready-made object detector (Faster R-CNN, MobileNet v3, trained on COCO)
draws a box around every person, animal and object. The rule uses the share of
the image each box covers:

    person   one person covers >= 15 % of the image, or all people together >= 35 %
    animal   one animal covers >= 15 %
    object   one object (chair, bottle, table ...) covers >= 40 %; vehicles are
             allowed, because trains and buses belong to stations and streets

Input:  ../data/places_index.csv and ../data/own_index.csv (if it exists)
Output: ../data/closeups.csv   file, keep, reason and the box shares

Run from the 01_autoencoder/ folder:
    python data_prep/filter_closeups.py
"""

from pathlib import Path

import pandas as pd
import torch
from PIL import Image
from torchvision.models.detection import (FasterRCNN_MobileNet_V3_Large_FPN_Weights,
                                          fasterrcnn_mobilenet_v3_large_fpn)

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

MIN_SCORE = 0.6          # ignore boxes the detector is unsure about
PERSON_ONE, PERSON_ALL = 0.15, 0.35
ANIMAL_ONE = 0.15
OBJECT_ONE = 0.40

WEIGHTS = FasterRCNN_MobileNet_V3_Large_FPN_Weights.DEFAULT
NAMES = WEIGHTS.meta["categories"]
VEHICLES = {"bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat"}
ANIMALS = {"bird", "cat", "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe"}


def check(boxes, labels, scores, area):
    person, animal, obj = [], [], []
    for b, l, s in zip(boxes, labels, scores):
        if s < MIN_SCORE:
            continue
        name = NAMES[int(l)]
        share = float((b[2] - b[0]) * (b[3] - b[1])) / area
        if name == "person":
            person.append(share)
        elif name in ANIMALS:
            animal.append((share, name))
        elif name not in VEHICLES:
            obj.append((share, name))

    p_max, p_sum = max(person, default=0), min(sum(person), 1)
    a_max, a_name = max(animal, default=(0, ""))
    o_max, o_name = max(obj, default=(0, ""))

    reason = ""
    if p_max >= PERSON_ONE:
        reason = "person close-up"
    elif p_sum >= PERSON_ALL:
        reason = "people fill the frame"
    elif a_max >= ANIMAL_ONE:
        reason = f"{a_name} close-up"
    elif o_max >= OBJECT_ONE:
        reason = f"{o_name} close-up"
    return {
        "keep": int(not reason), "reason": reason, "n_people": len(person),
        "person_max": round(p_max, 3), "person_sum": round(p_sum, 3),
        "animal_max": round(a_max, 3), "object_max": round(o_max, 3), "object": o_name,
    }


def main():
    index = pd.read_csv(DATA / "places_index.csv")
    own = DATA / "own_index.csv"
    if own.exists():
        index = pd.concat([index, pd.read_csv(own, keep_default_na=False)], ignore_index=True)

    model = fasterrcnn_mobilenet_v3_large_fpn(weights=WEIGHTS).eval()
    prep = WEIGHTS.transforms()

    rows = []
    for i, f in enumerate(index["file"], 1):
        img = Image.open(DATA / f).convert("RGB")
        with torch.no_grad():
            det = model([prep(img)])[0]
        rows.append({"file": f, **check(det["boxes"], det["labels"], det["scores"],
                                        img.width * img.height)})
        if i % 100 == 0:
            print(f"{i}/{len(index)}")

    out = pd.DataFrame(rows)
    out.to_csv(DATA / "closeups.csv", index=False)
    merged = index[["file", "place"]].merge(out, on="file")
    print(f"\nKept {out['keep'].sum()} of {len(out)} photos.")
    print(merged[merged["keep"] == 0].groupby(["place", "reason"]).size().unstack(fill_value=0))
    print("\nKept per place:")
    print(merged[merged["keep"] == 1]["place"].value_counts())


if __name__ == "__main__":
    main()
