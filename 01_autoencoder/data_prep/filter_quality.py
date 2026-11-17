"""Second cleaning pass: remove photos that would confuse the colour music.

The close-up filter (filter_closeups.py) removes photos where a person or an object
is the subject. This pass removes photos that are bad as PICTURES of a place.
Every check is measured from the pixels (no AI), so it is fast and repeatable:

    black and white   almost no colour: old photos and greyscale scans
                      (colourfulness < 8, Hasler & Suesstrunk 2003)
    sepia / toned     colour, but only one warm hue: old toned prints
                      (colourfulness < 30, 90 % of pixels within 25 deg of one hue,
                      and that hue is brown-orange-yellow, 15-65 deg)
    too dark          mean lightness < 0.12: nothing to see, a black chord
    blown out         mean lightness > 0.92, or > 40 % of pixels pure white
    flat              lightness spread < 0.06: fog, a wall, a blank sky
    blurry            variance of the Laplacian < 40 (on a 256 px grey copy)
    frame / border    a solid band >= 6 % on two opposite sides (scans, letterbox)
    duplicate         a near copy of a photo already kept
                      (difference hash, Hamming distance <= 5 of 64 bits)

Input:  ../data/places_index.csv (+ own / wikimedia, see sources.py)
Output: ../data/quality.csv     file, keep_quality, reason_quality and the measures
        ../data/quality_removed.html   every removed photo with its reason, to check

Run from the 01_autoencoder/ folder, after filter_closeups.py:
    python data_prep/filter_quality.py
    python data_prep/filter_quality.py --report-only   (measure, but keep everything)
"""

import argparse
import html
from pathlib import Path

import numpy as np
import pandas as pd
from PIL import Image, ImageFilter

from sources import load_index

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

BW_COLOURFUL = 8.0                 # below: black and white
SEPIA_COLOURFUL, SEPIA_HUE_SHARE, SEPIA_HUE_DEG = 30.0, 0.90, 25
SEPIA_HUES = (15, 65)              # brown to yellow, in degrees
DARK, BRIGHT, WHITE_SHARE = 0.12, 0.92, 0.40
FLAT = 0.06
BLUR = 40.0
BORDER = 0.06                      # share of width / height
DUP_BITS = 5


def colourfulness(rgb):
    """Hasler & Suesstrunk (2003). ~0 grey, ~15 dull, ~35 average, 60+ vivid."""
    r, g, b = (rgb[..., i].astype(np.float32) for i in range(3))
    rg, yb = r - g, 0.5 * (r + g) - b
    return float(np.hypot(rg.std(), yb.std()) + 0.3 * np.hypot(rg.mean(), yb.mean()))


def hue_share(img):
    """Main hue (degrees) and the share of coloured pixels within SEPIA_HUE_DEG of it."""
    hsv = np.asarray(img.convert("HSV"), dtype=np.float32)
    h, s = hsv[..., 0] * 360 / 255, hsv[..., 1] / 255
    h = h[s > 0.08]
    if len(h) < 50:
        return 0.0, 1.0
    hist, _ = np.histogram(h, bins=36, range=(0, 360))
    centre = (hist.argmax() + 0.5) * 10
    d = np.abs((h - centre + 180) % 360 - 180)
    return float(centre), float((d <= SEPIA_HUE_DEG).mean())


def sharpness(grey):
    lap = np.asarray(grey.filter(ImageFilter.Kernel((3, 3), [0, 1, 0, 1, -4, 1, 0, 1, 0], 1, 128)),
                     dtype=np.float32)
    return float(lap.var())


def border(light):
    """Widest solid band (share of the side) on two opposite sides."""
    def band(lines):                   # lines: rows from the edge inwards
        ref = lines[0].mean()
        n = 0
        for line in lines:
            if line.std() > 0.03 or abs(line.mean() - ref) > 0.05:
                break
            n += 1
        return n / len(lines) * 2      # we look at half of the image
    h, w = light.shape
    top, bottom = band(light[: h // 2]), band(light[::-1][: h // 2])
    left, right = band(light.T[: w // 2]), band(light.T[::-1][: w // 2])
    return float(max(min(top, bottom), min(left, right)))


def dhash(grey):
    a = np.asarray(grey.resize((9, 8), Image.Resampling.BILINEAR), dtype=np.int16)
    return np.packbits((a[:, 1:] > a[:, :-1]).ravel())


def measure(path):
    img = Image.open(path).convert("RGB")
    img.thumbnail((256, 256))
    rgb = np.asarray(img)
    grey = img.convert("L")
    light = np.asarray(grey, dtype=np.float32) / 255
    hue, share = hue_share(img)
    return {
        "colourful": round(colourfulness(rgb), 2),
        "main_hue": round(hue),
        "hue_share": round(share, 3),
        "lightness": round(float(light.mean()), 3),
        "white_share": round(float((light > 0.97).mean()), 3),
        "spread": round(float(light.std()), 3),
        "sharpness": round(sharpness(grey), 1),
        "border": round(border(light), 3),
    }, dhash(grey)


def verdict(m):
    if m["lightness"] < DARK:
        return "too dark"
    if m["lightness"] > BRIGHT or m["white_share"] > WHITE_SHARE:
        return "blown out"
    if m["colourful"] < BW_COLOURFUL:
        return "black and white"
    if (m["colourful"] < SEPIA_COLOURFUL and m["hue_share"] >= SEPIA_HUE_SHARE
            and SEPIA_HUES[0] <= m["main_hue"] <= SEPIA_HUES[1]):
        return "sepia / toned"
    if m["spread"] < FLAT:
        return "flat"
    if m["sharpness"] < BLUR:
        return "blurry"
    if m["border"] >= BORDER:
        return "frame / border"
    return ""


def report(df):
    out = df[df["keep_quality"] == 0]
    tiles = "\n".join(
        f'<figure><img loading="lazy" src="{html.escape(r.file)}"><figcaption><b>{html.escape(r.reason_quality)}</b>'
        f'<br>{html.escape(str(r.place))} · c {r.colourful} · L {r.lightness} · sharp {r.sharpness}</figcaption></figure>'
        for r in out.sort_values(["reason_quality", "place"]).itertuples())
    (DATA / "quality_removed.html").write_text(f"""<!doctype html><meta charset="utf-8">
<title>Removed by quality filter</title>
<style>body{{font:13px system-ui;margin:16px;background:#f6f5f2}}
div{{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px}}
figure{{margin:0;background:#fff;border:1px solid #ddd;border-radius:8px;overflow:hidden}}
img{{width:100%;aspect-ratio:1;object-fit:cover;display:block}}figcaption{{padding:6px}}</style>
<h1>Removed by the quality filter: {len(out)} photos</h1><div>{tiles}</div>""", encoding="utf-8")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--report-only", action="store_true", help="measure but keep every photo")
    args = ap.parse_args()

    index = load_index()
    closeups = DATA / "closeups.csv"
    kept_before = (set(pd.read_csv(closeups).query("keep == 1")["file"]) if closeups.exists()
                   else set(index["file"]))

    rows, hashes = [], []           # hashes of photos kept so far
    for i, f in enumerate(index["file"], 1):
        try:
            m, h = measure(DATA / f)
        except Exception as e:      # unreadable file
            rows.append({"file": f, "keep_quality": 0, "reason_quality": f"unreadable ({type(e).__name__})"})
            continue
        reason = verdict(m)
        if not reason and f in kept_before:
            if any(np.unpackbits(h ^ k).sum() <= DUP_BITS for k in hashes):
                reason = "duplicate"
            else:
                hashes.append(h)
        rows.append({"file": f, "keep_quality": int(args.report_only or not reason),
                     "reason_quality": reason, **m})
        if i % 500 == 0:
            print(f"{i}/{len(index)}")

    df = index[["file", "place"]].merge(pd.DataFrame(rows), on="file")
    if args.report_only:            # show what WOULD be removed
        df["keep_quality"] = (df["reason_quality"] == "").astype(int)
    report(df)
    df.drop(columns="place").assign(keep_quality=1 if args.report_only else df["keep_quality"]) \
      .to_csv(DATA / "quality.csv", index=False)

    both = df[df["file"].isin(kept_before)]
    print(f"\nOf the {len(both)} photos the close-up filter kept, this pass removes "
          f"{int((both['keep_quality'] == 0).sum())}:")
    print(both[both["keep_quality"] == 0].groupby(["place", "reason_quality"]).size().unstack(fill_value=0))
    print("\nKept per place after both filters:")
    print(both[both["keep_quality"] == 1]["place"].value_counts())
    print("\nCheck data/quality_removed.html before trusting the thresholds.")


if __name__ == "__main__":
    main()
