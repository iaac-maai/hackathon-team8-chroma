"""Gradient maps in three depth layers: near, middle and far.

extract_gradient.py gives one gradient for the whole photo. Here the photo is
first split by DEPTH, so the foreground and the background each get their own
gradient: a warm market stall in front and a cool evening sky behind become
two different gradients instead of one average.

    1. Depth Anything V2 (Small, ready-made, no training) estimates how far away
       every pixel is (relative depth: it knows near from far, not metres);
    2. the pixels are cut into three layers with the same number of pixels:
       near = closest third, mid = middle third, far = farthest third
       (equal thirds, so every photo always has all three layers: a metro
       platform without sky still gets a "far");
    3. each layer gets its own 8-stop gradient map, exactly as in
       extract_gradient.py (Lab, sorted dark -> light, 8 equal groups).

Every photo becomes 3 layers x 8 stops x (L, a, b) = 72 numbers, always in the
order near, mid, far and dark -> light.

Output:
    ../data/gradient_layers.csv           file, near/mid/far stops (hex + lightness), 72 numbers
    ../data/gradient_layers/<name>.png    photo | depth | layers | repainted, with the 3 gradient bars

Run from the 01_autoencoder/ folder (after extract_gradient.py):
    pip install transformers torch
    python data_prep/extract_gradient_layers.py
    python data_prep/extract_gradient_layers.py --limit 20     (quick test on 20 photos)
"""

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from PIL import Image
from skimage.color import lab2rgb, rgb2lab
from transformers import AutoImageProcessor, AutoModelForDepthEstimation

from extract_gradient import SIZE, STOPS, gradient_of, to_hex
from sources import load_index

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = DATA / "gradient_layers"
DEPTH_MODEL = "depth-anything/Depth-Anything-V2-Small-hf"
LAYERS = ["near", "mid", "far"]
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
TINT = {"near": (230, 120, 60), "mid": (90, 170, 90), "far": (80, 130, 220)}   # for the picture only


def depth_of(img, proc, model):
    """Relative depth at SIZE x SIZE. Depth Anything returns inverse depth: larger = closer."""
    with torch.inference_mode():
        pred = model(**proc(images=img, return_tensors="pt").to(DEVICE)).predicted_depth.float().cpu()      # (1, h, w)
    pred = torch.nn.functional.interpolate(pred[None], size=(SIZE, SIZE), mode="bicubic",
                                           align_corners=False)[0, 0]
    return pred.numpy()


def layers_of(depth):
    """0 = near, 1 = mid, 2 = far, in three equal thirds of the pixels."""
    order = np.argsort(-depth.ravel())               # closest first
    layer = np.empty(depth.size, dtype=np.int8)
    for k, part in enumerate(np.array_split(order, 3)):
        layer[part] = k
    return layer.reshape(depth.shape)


def bar(stops, w):
    xs = np.linspace(0, STOPS - 1, w)
    lab = np.stack([np.interp(xs, np.arange(STOPS), stops[:, k]) for k in range(3)], axis=1)
    return np.repeat(np.clip(lab2rgb(lab[None]), 0, 1), 12, axis=0)


def picture(rgb, depth, layer, all_stops):
    """Four panels side by side, and the near / mid / far gradient bars underneath."""
    d = (depth - depth.min()) / (np.ptp(depth) + 1e-6)
    tint = np.array([TINT[n] for n in LAYERS], dtype=np.float64)[layer] / 255
    lab = rgb2lab(rgb)
    mapped = np.zeros_like(rgb)
    for k, stops in enumerate(all_stops):            # repaint each layer through its own gradient
        m = layer == k
        L = lab[..., 0][m]
        mapped[m] = np.clip(lab2rgb(np.stack([np.interp(L, stops[:, 0], stops[:, j]) for j in range(3)],
                                             axis=1)[None])[0], 0, 1)
    top = np.hstack([rgb, np.repeat(d[..., None], 3, axis=2), 0.5 * rgb + 0.5 * tint, mapped])
    w = top.shape[1]
    bars = np.vstack([bar(s, w) for s in all_stops])
    return Image.fromarray((np.vstack([top, bars]) * 255).astype(np.uint8))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="only the first N photos (to test)")
    args = ap.parse_args()

    index = load_index()
    if args.limit:
        index = index.head(args.limit)
    OUT.mkdir(exist_ok=True)

    proc = AutoImageProcessor.from_pretrained(DEPTH_MODEL)
    model = AutoModelForDepthEstimation.from_pretrained(DEPTH_MODEL).eval().to(DEVICE)
    print("device:", DEVICE)

    rows = []
    for i, f in enumerate(index["file"], 1):
        img = Image.open(DATA / f).convert("RGB")
        depth = depth_of(img, proc, model)
        rgb = np.asarray(img.resize((SIZE, SIZE), Image.Resampling.BILINEAR), dtype=np.float64) / 255
        layer = layers_of(depth)

        all_stops = [gradient_of(rgb[layer == k][None])[0] for k in range(3)]
        name = Path(f).with_suffix(".png").name
        picture(rgb, depth, layer, all_stops).save(OUT / name)

        row = {"file": f, "gradient_layers_png": f"gradient_layers/{name}"}
        for n, stops in zip(LAYERS, all_stops):
            row[f"{n}_stops"] = json.dumps([{"hex": to_hex(s), "L": round(float(s[0]) / 100, 3)} for s in stops])
        for n, stops in zip(LAYERS, all_stops):
            for k, s in enumerate(stops, 1):
                row[f"{n}_s{k}_L"], row[f"{n}_s{k}_a"], row[f"{n}_s{k}_b"] = (round(float(v), 2) for v in s)
        rows.append(row)
        if i % 100 == 0:
            print(f"{i}/{len(index)}", flush=True)

    pd.DataFrame(rows).to_csv(DATA / "gradient_layers.csv", index=False)
    print(f"Wrote {len(rows)} layered gradient maps to {OUT} and {DATA / 'gradient_layers.csv'}")


if __name__ == "__main__":
    main()
