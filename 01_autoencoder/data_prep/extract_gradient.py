"""Turn every photo into its own gradient map.

A gradient map describes a photo by the colours it has at each level of light:
what colour are its deepest shadows, its mid-tones, its highlights.

    1. sort all pixels from darkest to lightest (Lab lightness L);
    2. cut them into 8 groups with the same number of pixels
       (stop 1 = darkest 12.5 %, ..., stop 8 = lightest 12.5 %);
    3. each stop = the average colour of its group (averaged in Lab, so it
       matches what the eye sees), plus its lightness;
    4. repaint the photo through that gradient: each pixel takes the colour of
       the stop at its lightness (Photoshop's "Gradient Map").

Every photo becomes the same fixed format: 8 stops x (L, a, b) = 24 numbers,
always ordered dark -> light. That fixed shape is what a music model can learn from.

Output:
    ../data/gradient_maps.csv        file, 8 stops (hex + lightness), 24-number vector
    ../data/gradient_maps/<name>.png the photo repainted through its gradient,
                                     with the gradient bar underneath

Run from the 01_autoencoder/ folder:
    python data_prep/extract_gradient.py
"""

import json
from pathlib import Path

import numpy as np
import pandas as pd
from PIL import Image
from skimage.color import lab2rgb, rgb2lab

from sources import load_index

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = DATA / "gradient_maps"
STOPS = 8
SIZE = 128


def gradient_of(rgb):
    lab = rgb2lab(rgb).reshape(-1, 3)
    order = np.argsort(lab[:, 0])
    groups = np.array_split(order, STOPS)
    stops = np.stack([lab[g].mean(axis=0) for g in groups])          # (8, 3) Lab, dark -> light
    return stops, lab


def to_hex(lab):
    rgb = np.clip(lab2rgb(lab[None, None])[0, 0], 0, 1)
    return "#{:02x}{:02x}{:02x}".format(*(rgb * 255).round().astype(int))


def repaint(lab_pixels, stops, shape):
    """Each pixel takes the colour of the gradient at its own lightness."""
    L = lab_pixels[:, 0]
    out = np.stack([np.interp(L, stops[:, 0], stops[:, k]) for k in range(3)], axis=1)
    return np.clip(lab2rgb(out.reshape(shape)), 0, 1)


def picture(mapped, stops):
    """Repainted photo with the gradient bar underneath."""
    h, w, _ = mapped.shape
    bar = np.zeros((16, w, 3))
    xs = np.linspace(0, STOPS - 1, w)
    bar_lab = np.stack([np.interp(xs, np.arange(STOPS), stops[:, k]) for k in range(3)], axis=1)
    bar[:] = np.clip(lab2rgb(bar_lab[None]), 0, 1)
    return Image.fromarray((np.vstack([mapped, bar]) * 255).astype(np.uint8))


def main():
    index = load_index()
    OUT.mkdir(exist_ok=True)

    rows = []
    for i, f in enumerate(index["file"], 1):
        img = Image.open(DATA / f).convert("RGB").resize((SIZE, SIZE), Image.Resampling.BILINEAR)
        rgb = np.asarray(img, dtype=np.float64) / 255
        stops, lab = gradient_of(rgb)
        picture(repaint(lab, stops, rgb.shape), stops).save(OUT / Path(f).with_suffix(".png").name)
        row = {"file": f, "gradient_png": f"gradient_maps/{Path(f).with_suffix('.png').name}",
               "stops": json.dumps([{"hex": to_hex(s), "L": round(float(s[0]) / 100, 3)} for s in stops])}
        for k, s in enumerate(stops, 1):
            row[f"s{k}_L"], row[f"s{k}_a"], row[f"s{k}_b"] = (round(float(v), 2) for v in s)
        rows.append(row)
        if i % 2000 == 0:
            print(f"{i}/{len(index)}", flush=True)

    pd.DataFrame(rows).to_csv(DATA / "gradient_maps.csv", index=False)
    print(f"Wrote {len(rows)} gradient maps to {OUT} and {DATA / 'gradient_maps.csv'}")


if __name__ == "__main__":
    main()
