"""Recognise the details of each place: architecture, street furniture, furniture,
paving, nature, people and their clothing.

Two models, both ready-made (no training):

1. SEGMENTATION, SegFormer-B0 trained on ADE20K (150 classes). Every pixel gets a
   class. For each photo we store the share of the image each element covers,
   grouped into families, plus a coloured overlay (one colour per family).

2. DESCRIPTION, CLIP zero-shot, for what segmentation cannot name:
   paving material, architectural style, facade details, and clothing
   (clothing only when people cover at least 1 % of the image).

Output:
    ../data/details.csv              per photo: family shares, top elements, CLIP descriptions
    ../data/segmentation/<name>.png  the photo with the families coloured over it

Run from the 01_autoencoder/ folder:
    python data_prep/detect_details.py
"""

import json
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from PIL import Image
from transformers import (AutoImageProcessor, CLIPModel, CLIPProcessor,
                          SegformerForSemanticSegmentation)

from label_time_season import as_tensor, text_features
from sources import load_index

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = DATA / "segmentation"
SEG_MODEL = "nvidia/segformer-b0-finetuned-ade-512-512"
CLIP_MODEL = "openai/clip-vit-base-patch32"
SIZE = 256
MIN_SHARE = 0.005        # elements under 0.5 % of the image are ignored

# ADE20K classes -> families. Colours are for the overlay.
FAMILIES = {
    "architecture": ("#e4572e", ["wall", "building", "house", "skyscraper", "windowpane", "door", "screen door",
                                 "column", "stairs", "stairway", "step", "railing", "bannister", "awning", "canopy",
                                 "tower", "fence", "bridge", "ceiling", "arcade machine", "hovel", "booth"]),
    "street furniture": ("#f3a712", ["bench", "streetlight", "pole", "signboard", "traffic light", "ashcan",
                                     "fountain", "bulletin board", "flag", "trade name", "sculpture", "poster",
                                     "clock", "tent"]),
    "furniture": ("#a8c686", ["chair", "table", "seat", "armchair", "sofa", "stool", "counter", "shelf", "cabinet",
                              "desk", "lamp", "light", "chandelier", "sconce", "coffee table", "bar", "case",
                              "buffet", "countertop", "kitchen island", "bookcase", "curtain", "blind", "rug"]),
    "paving": ("#8d6a9f", ["road", "sidewalk", "path", "floor", "earth", "dirt track", "runway", "land", "pier"]),
    "nature": ("#2e8b57", ["tree", "plant", "palm", "flower", "grass", "field", "mountain", "hill", "rock",
                           "sand", "sea", "water", "river", "lake", "waterfall"]),
    "sky": ("#7fb7e8", ["sky"]),
    "people": ("#ff4f9a", ["person", "apparel", "bag"]),
    "vehicles": ("#5c6b73", ["car", "bus", "truck", "van", "bicycle", "minibike", "boat", "ship", "airplane",
                             "escalator", "conveyer belt"]),
    "goods": ("#c9a227", ["food", "basket", "box", "barrel", "bottle", "tray", "vase", "pot", "plate", "glass",
                          "book", "plaything", "ball", "bulletin board"]),
}

CLIP_GROUPS = {
    "paving_material": {
        "cobblestones": ["a street paved with old cobblestones"],
        "asphalt": ["an asphalt road"],
        "pavement tiles": ["a sidewalk of square pavement tiles"],
        "stone slabs": ["a square paved with large stone slabs"],
        "dirt or gravel": ["a dirt or gravel path"],
        "sand": ["sand on a beach"],
        "wooden deck": ["a wooden boardwalk or deck"],
        "indoor floor": ["a polished indoor floor"],
    },
    "architecture_style": {
        "gothic / medieval": ["a gothic medieval stone building with pointed arches"],
        "modernist (art nouveau)": ["an art nouveau modernist facade with curved organic shapes and mosaics"],
        "classical / 19th century": ["a 19th century neoclassical apartment building with balconies"],
        "mid-century blocks": ["plain 1960s concrete apartment blocks"],
        "contemporary glass": ["a contemporary glass and steel building"],
        "industrial brick": ["an old industrial brick building with a chimney"],
        "no buildings": ["a landscape with no buildings"],
    },
    "facade_detail": {
        "iron balconies": ["balconies with wrought iron railings"],
        "shuttered windows": ["windows with wooden shutters"],
        "shop fronts": ["ground floor shop fronts with glass windows and signs"],
        "arches and arcades": ["stone arches and arcades"],
        "large glass walls": ["large glass walls and curtain walls"],
        "plain walls": ["plain walls with few windows"],
    },
    "clothing": {
        "winter coats": ["people wearing winter coats and scarves"],
        "light summer clothes": ["people in t-shirts, shorts and summer dresses"],
        "swimwear": ["people in swimwear on a beach"],
        "business clothes": ["people in suits and business clothes"],
        "sportswear": ["people in sportswear running or cycling"],
        "tourists with backpacks": ["tourists with backpacks and cameras"],
        "uniforms": ["staff in uniforms or high-visibility vests"],
    },
}


def hex_rgb(h):
    return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], dtype=np.float32)


def main():
    index = load_index()
    OUT.mkdir(exist_ok=True)

    seg_proc = AutoImageProcessor.from_pretrained(SEG_MODEL)
    seg = SegformerForSemanticSegmentation.from_pretrained(SEG_MODEL).eval()
    names = [seg.config.id2label[i].strip() for i in range(len(seg.config.id2label))]
    fam_of = {c: f for f, (_, cs) in FAMILIES.items() for c in cs}
    fam_colour = {f: hex_rgb(col) for f, (col, _) in FAMILIES.items()}
    lut = np.array([fam_colour.get(fam_of.get(n), np.array([0, 0, 0], np.float32)) for n in names])
    has_fam = np.array([n in fam_of for n in names])

    clip = CLIPModel.from_pretrained(CLIP_MODEL).eval()
    clip_proc = CLIPProcessor.from_pretrained(CLIP_MODEL)
    feats = {g: text_features(clip, clip_proc, labels) for g, labels in CLIP_GROUPS.items()}
    scale = clip.logit_scale.exp()

    rows = []
    batch = 16
    for start in range(0, len(index), batch):
        files = index["file"].iloc[start:start + batch].tolist()
        imgs = [Image.open(DATA / f).convert("RGB").resize((SIZE, SIZE), Image.Resampling.BILINEAR) for f in files]
        with torch.inference_mode():
            inp = seg_proc(images=imgs, return_tensors="pt", size={"height": SIZE, "width": SIZE})
            logits = seg(**inp).logits                                   # (B, 150, 64, 64)
            labels = torch.nn.functional.interpolate(logits, size=(SIZE, SIZE), mode="bilinear",
                                                     align_corners=False).argmax(1).numpy()
            ci = clip_proc(images=imgs, return_tensors="pt")
            z = as_tensor(clip.get_image_features(**ci))
            z = z / z.norm(dim=-1, keepdim=True)
            probs = {g: (scale * z @ f.T).softmax(-1) for g, f in feats.items()}

        for b, (f, img) in enumerate(zip(files, imgs)):
            lab = labels[b]
            counts = np.bincount(lab.ravel(), minlength=len(names)) / lab.size
            elems = {names[i]: round(float(counts[i]), 4) for i in np.argsort(-counts) if counts[i] >= MIN_SHARE}
            row = {"file": f, "elements": json.dumps(elems),
                   "top_elements": ", ".join(list(elems)[:6])}
            for fam in FAMILIES:
                row[f"fam_{fam.replace(' ', '_')}"] = round(sum(v for k, v in elems.items() if fam_of.get(k) == fam), 4)
            for g, labels_g in CLIP_GROUPS.items():
                p = probs[g][b]
                k = int(p.argmax())
                row[g], row[f"{g}_conf"] = list(labels_g)[k], round(float(p[k]), 3)
            if row["fam_people"] < 0.01:
                row["clothing"], row["clothing_conf"] = "no people", 0.0
            # overlay: photo at 45 %, family colours at 55 % where a family was found
            photo = np.asarray(img, dtype=np.float32)
            colour = lut[lab]
            mask = has_fam[lab][..., None]
            over = np.where(mask, 0.45 * photo + 0.55 * colour, photo * 0.6)
            name = Path(f).with_suffix(".png").name
            Image.fromarray(over.clip(0, 255).astype(np.uint8)).save(OUT / name)
            row["segmentation_png"] = f"segmentation/{name}"
            rows.append(row)
        if start % 800 == 0:
            print(f"{start:,}/{len(index):,}", flush=True)

    out = pd.DataFrame(rows)
    out.to_csv(DATA / "details.csv", index=False)
    (DATA / "segmentation" / "legend.json").write_text(json.dumps({f: c for f, (c, _) in FAMILIES.items()}))
    print(f"\nWrote {DATA / 'details.csv'} ({len(out):,} photos)")
    m = index[["file", "place"]].merge(out, on="file")
    fams = [c for c in out.columns if c.startswith("fam_")]
    print(m.groupby("place")[fams].mean().round(3).to_string())
    for g in CLIP_GROUPS:
        print(f"\n{g}:"); print(pd.crosstab(m["place"], m[g]).to_string())


if __name__ == "__main__":
    main()
