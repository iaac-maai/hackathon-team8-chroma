"""Label every photo with its colour parameters, and the music they lead to.

The parameters are measured from the pixels (no AI guess), so they are exact:

    palette        up to 6 main colours (k-means in Lab colour space), each with
                   its hex code, hue, weight (share of the image) and height
                   (0 = top of the image, 1 = bottom)
    n_colours      colours that cover at least 5 % of the image, after merging
                   colours that look almost the same (Lab distance < 12)
    brightness     mean lightness, 0 (black) to 1 (white)
    saturation     mean colourfulness, 0 (grey) to 1 (vivid)
    contrast       spread of lightness, 0 (flat) to 1 (hard light and shadow)
    warmth         0 = blue/cool, 0.5 = neutral, 1 = orange/warm
                   (mean Lab b* plus a little a*, weighted by saturation)

The music columns follow the team's mapping (everything in D):

    scale          warm and bright -> lydian, bright -> major, dark -> minor,
                   in between -> dorian
    chords         one chord per palette colour, top to bottom of the image;
                   the dominant colour is the home chord (I = D); the others take
                   a scale degree from their hue distance to it; bars = weight
    sevenths       5 or more colours -> 7th chords
    tone           brightness -> how bright or muffled the chords sound (0-1)
    melody         saturation >= 0.30 -> a melody plays
    drums          contrast -> how hard the drums hit (0-1)

Input:  ../data/places_index.csv (+ ../data/own_index.csv)
Output: ../data/palette.csv

Run from the 01_autoencoder/ folder:
    python data_prep/extract_palette.py
"""

import json
from pathlib import Path

import numpy as np
import pandas as pd
from PIL import Image
from skimage.color import lab2rgb, rgb2hsv, rgb2lab
from sklearn.cluster import KMeans

from sources import load_index

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
SIZE = 64
K = 6
MIN_WEIGHT = 0.05
MERGE_DIST = 12
DEGREES = ["I", "ii", "iii", "IV", "V", "vi", "vii"]


def palette_of(rgb):
    """k-means on Lab pixels -> merged colours with weight, hue and height."""
    h, w, _ = rgb.shape
    lab = rgb2lab(rgb).reshape(-1, 3)
    rows = np.repeat(np.arange(h), w) / (h - 1)
    km = KMeans(n_clusters=K, n_init=3, random_state=0).fit(lab)
    cols = []
    for k in range(K):
        sel = km.labels_ == k
        cols.append({"lab": km.cluster_centers_[k], "n": sel.sum(), "y": rows[sel].mean()})
    # merge colours that look the same
    cols.sort(key=lambda c: -c["n"])
    merged = []
    for c in cols:
        for m in merged:
            if np.linalg.norm(c["lab"] - m["lab"]) < MERGE_DIST:
                tot = m["n"] + c["n"]
                m["lab"] = (m["lab"] * m["n"] + c["lab"] * c["n"]) / tot
                m["y"] = (m["y"] * m["n"] + c["y"] * c["n"]) / tot
                m["n"] = tot
                break
        else:
            merged.append(dict(c))
    out = []
    for m in merged:
        weight = m["n"] / lab.shape[0]
        if weight < MIN_WEIGHT:
            continue
        c_rgb = np.clip(lab2rgb(m["lab"][None, None])[0, 0], 0, 1)
        hsv = rgb2hsv(c_rgb[None, None])[0, 0]
        out.append({
            "hex": "#{:02x}{:02x}{:02x}".format(*(c_rgb * 255).round().astype(int)),
            "hue": round(float(hsv[0] * 360), 1),
            "sat": round(float(hsv[1]), 3),
            "weight": round(float(weight), 3),
            "height": round(float(m["y"]), 3),
        })
    return out


def features(rgb):
    lab = rgb2lab(rgb)
    hsv = rgb2hsv(rgb)
    L, a, b = lab[..., 0] / 100, lab[..., 1], lab[..., 2]
    s = hsv[..., 1]
    warm = np.average(b + 0.5 * a, weights=0.2 + s)        # Lab: +b yellow, +a red
    return {
        "brightness": round(float(L.mean()), 3),
        "saturation": round(float(s.mean()), 3),
        "contrast": round(float(min(L.std() / 0.3, 1)), 3),
        "warmth": round(float(np.clip(0.5 + warm / 60, 0, 1)), 3),
    }


def music(f, pal):
    if f["brightness"] >= 0.55 and f["warmth"] >= 0.6:
        scale = "lydian"
    elif f["brightness"] >= 0.5:
        scale = "major"
    elif f["brightness"] < 0.35:
        scale = "minor"
    else:
        scale = "dorian"
    home = max(pal, key=lambda c: c["weight"])
    chords = []
    for c in sorted(pal, key=lambda c: c["height"]):             # top to bottom
        if c is home:
            deg = "I"
        else:
            dist = (c["hue"] - home["hue"]) % 360
            deg = DEGREES[1 + int(dist / 360 * 6) % 6]           # ii .. vii
        chords.append({"degree": deg, "bars": max(1, round(c["weight"] * 8)), "hex": c["hex"]})
    return {
        "scale": scale,
        "chords": json.dumps(chords),
        "sevenths": int(len(pal) >= 5),
        "tone": f["brightness"],
        "melody": int(f["saturation"] >= 0.30),
        "drums": f["contrast"],
    }


def main():
    index = load_index()

    rows = []
    for i, f in enumerate(index["file"], 1):
        img = Image.open(DATA / f).convert("RGB").resize((SIZE, SIZE), Image.Resampling.BILINEAR)
        rgb = np.asarray(img, dtype=np.float64) / 255
        pal = palette_of(rgb)
        feat = features(rgb)
        rows.append({"file": f, **feat, "n_colours": len(pal),
                     "palette": json.dumps(pal), **music(feat, pal)})
        if i % 2000 == 0:
            print(f"{i}/{len(index)}", flush=True)

    out = pd.DataFrame(rows)
    out.to_csv(DATA / "palette.csv", index=False)
    print(f"\nWrote {DATA / 'palette.csv'}")
    m = index[["file", "place"]].merge(out, on="file")
    print(m.groupby("place")[["brightness", "saturation", "contrast", "warmth", "n_colours"]].mean().round(2))
    print(pd.crosstab(m["place"], m["scale"]))


if __name__ == "__main__":
    main()
