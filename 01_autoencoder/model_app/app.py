"""Chroma model server: one photo of a place in, one scene card out (Gradio + ONNX Runtime).

The page is for people (upload a photo, see its colours, its gradient, the most similar
library scenes and the scene card). The API is for programs: `/predict` takes a base64
photo and returns the scene card JSON; `/embed` returns the 64-number latent
and the most similar library scenes that Bo's music and Bhavini's app read
(contract: Bo/scene-card/README.md, version 2).

How the card is made:
    mood, stops, gradient   measured from the pixels, the same formulas as data_prep/
                            (extract_palette.py, extract_gradient.py): exact, no AI
    place, time, season     the autoencoder (chroma_ae.onnx) turns the photo into 64 numbers;
                            the 10 most similar library scenes vote, weighted by similarity.
                            confidence = share of the vote.

Runs locally (`python app.py`, then http://localhost:7860) and on Render (render.yaml at
the repository root). No PyTorch, no scikit: numpy only, so it fits Render's free 512 MB.
"""
import base64
import hashlib
import io
import json
import os
from pathlib import Path

import gradio as gr
import numpy as np
import onnxruntime as ort
from PIL import Image

HERE = Path(__file__).parent
CONFIG = json.loads((HERE / "chroma_ae_config.json").read_text())
SIZE = CONFIG["image_size"]                       # 64: the autoencoder's input
session = ort.InferenceSession(str(HERE / "chroma_ae.onnx"))
LIB_Z = np.load(HERE / "library_latent.npy").astype(np.float32)          # (n, 64), L2-normalised
LIB = [r for r in __import__("csv").DictReader(open(HERE / "library.csv", encoding="utf-8"))]

# Our own place model (data_prep/train_place_model.py, trained on the Colab labels). Optional:
# when place_model.onnx is here, it recognises place, time, season and indoor directly;
# without it, the 10 most similar library scenes vote (the old way).
PLACE_MODEL = None
if (HERE / "place_model.onnx").exists():
    PLACE_MODEL = ort.InferenceSession(str(HERE / "place_model.onnx"))
    PLACE_CFG = json.loads((HERE / "place_model.json").read_text())

# The team's place names (Bo/scene-card/README.md). The library was labelled with the old names.
TEAM_PLACE = {"beach": "waterfront", "mountains": "green", "metro": "transit", "airport": "transit"}
K_NEIGHBOURS = 10

# Colour settings: the same as data_prep/extract_palette.py and extract_gradient.py
PALETTE_SIZE, K, MIN_WEIGHT, MERGE_DIST = 64, 6, 0.05, 12      # extract_palette.py
GRADIENT_SIZE, GRADIENT_STOPS = 128, 8                           # extract_gradient.py


# ---- colour maths in numpy (same formulas as scikit-image, D65 white) -------------------
def rgb2lab(rgb):
    c = np.where(rgb > 0.04045, ((rgb + 0.055) / 1.055) ** 2.4, rgb / 12.92)
    m = np.array([[0.412453, 0.357580, 0.180423], [0.212671, 0.715160, 0.072169], [0.019334, 0.119193, 0.950227]])
    xyz = c @ m.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], axis=-1)


def lab2rgb(lab):
    fy = (lab[..., 0] + 16) / 116
    f = np.stack([fy + lab[..., 1] / 500, fy, fy - lab[..., 2] / 200], axis=-1)
    xyz = np.where(f > 0.2068966, f ** 3, (f - 16 / 116) / 7.787) * np.array([0.95047, 1.0, 1.08883])
    m = np.array([[3.24048134, -1.53715152, -0.49853633], [-0.96925495, 1.87599, 0.04155593],
                  [0.05564664, -0.20404134, 1.05731107]])
    c = xyz @ m.T
    c = np.where(c > 0.0031308, 1.055 * np.clip(c, 0, None) ** (1 / 2.4) - 0.055, 12.92 * c)
    return np.clip(c, 0, 1)


def rgb2hsv(rgb):
    mx, mn = rgb.max(-1), rgb.min(-1)
    d = mx - mn
    s = np.where(mx > 0, d / np.where(mx > 0, mx, 1), 0)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    dd = np.where(d > 0, d, 1)
    h = np.where(mx == r, ((g - b) / dd) % 6, np.where(mx == g, (b - r) / dd + 2, (r - g) / dd + 4)) / 6
    return np.stack([np.where(d > 0, h, 0), s, mx], axis=-1)


def to_hex(rgb):
    return "#{:02x}{:02x}{:02x}".format(*(np.clip(rgb, 0, 1) * 255).round().astype(int))


def kmeans(x, k, seed=0, iters=25):
    """k-means++ start, then Lloyd iterations."""
    rng = np.random.default_rng(seed)
    centres = [x[rng.integers(len(x))]]
    for _ in range(1, k):
        d = np.min(((x[:, None] - np.array(centres)[None]) ** 2).sum(-1), axis=1)
        centres.append(x[rng.choice(len(x), p=d / d.sum())] if d.sum() > 0 else x[rng.integers(len(x))])
    c = np.array(centres)
    for _ in range(iters):
        labels = ((x[:, None] - c[None]) ** 2).sum(-1).argmin(1)
        new = np.array([x[labels == j].mean(0) if (labels == j).any() else c[j] for j in range(k)])
        if np.allclose(new, c):
            break
        c = new
    return c, labels


# ---- the measurements -------------------------------------------------------------------
def mood_of(rgb):
    lab, hsv = rgb2lab(rgb), rgb2hsv(rgb)
    L, s = lab[..., 0] / 100, hsv[..., 1]
    warm = np.average(lab[..., 2] + 0.5 * lab[..., 1], weights=0.2 + s)
    return {
        "brightness": round(float(L.mean()), 3),
        "warmth": round(float(np.clip(warm / 30, -1, 1)), 3),
        "saturation": round(float(s.mean()), 3),
        "contrast": round(float(min(L.std() / 0.3, 1)), 3),
    }


def palette_of(rgb):
    h, w, _ = rgb.shape
    lab = rgb2lab(rgb).reshape(-1, 3)
    rows = np.repeat(np.arange(h), w) / (h - 1)
    centres, labels = kmeans(lab, K)
    cols = sorted(({"lab": centres[k], "n": int((labels == k).sum()), "y": rows[labels == k].mean() if (labels == k).any() else 0.5}
                   for k in range(K)), key=lambda c: -c["n"])
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
    keep = [m for m in merged if m["n"] / len(lab) >= MIN_WEIGHT]
    total = sum(m["n"] for m in keep)
    return [[to_hex(lab2rgb(m["lab"])), round(m["n"] / total, 3), round(float(m["y"]), 3)] for m in keep]


def gradient_of(rgb):
    lab = rgb2lab(rgb).reshape(-1, 3)
    groups = np.array_split(np.argsort(lab[:, 0]), GRADIENT_STOPS)
    return [to_hex(lab2rgb(lab[g].mean(0))) for g in groups]           # dark -> light


LAYER_NAMES = ("top", "middle", "ground")       # sky / facades / street, by height in the photo
SCAN_STEPS = 16                                  # left -> right, like reading a score


def detail_map(L):
    """How busy each pixel's surroundings are: brightness change to the neighbours, 0-1."""
    gy, gx = np.abs(np.diff(L, axis=0, append=L[-1:])), np.abs(np.diff(L, axis=1, append=L[:, -1:]))
    return np.clip((gx + gy) / 0.12, 0, 1)


def layers_of(rgb):
    """Three horizontal layers (top, middle, ground) and a left-to-right scan.
    Each layer: its main colour, brightness, saturation and detail (flat 0 -> busy 1).
    scan: per step, brightness and detail of that vertical strip (for melody and rhythm)."""
    lab, hsv = rgb2lab(rgb), rgb2hsv(rgb)
    L = lab[..., 0] / 100
    d = detail_map(L)
    out = {}
    for name, rows in zip(LAYER_NAMES, np.array_split(np.arange(rgb.shape[0]), 3)):
        out[name] = {"colour": to_hex(lab2rgb(lab[rows].reshape(-1, 3).mean(0))),
                     "brightness": round(float(L[rows].mean()), 3),
                     "saturation": round(float(hsv[rows][..., 1].mean()), 3),
                     "detail": round(float(d[rows].mean()), 3)}
    cols = np.array_split(np.arange(rgb.shape[1]), SCAN_STEPS)
    scan = {"brightness": [round(float(L[:, c].mean()), 3) for c in cols],
            "detail": [round(float(d[:, c].mean()), 3) for c in cols]}
    return out, scan, round(float(d.mean()), 3)


def similar(image):
    x = np.asarray(image.convert("RGB").resize((SIZE, SIZE), Image.Resampling.BILINEAR), dtype=np.float32) / 255
    z = session.run(["latent"], {"image": x.transpose(2, 0, 1)[None]})[0][0]
    sims = LIB_Z @ (z / np.linalg.norm(z))
    top = np.argsort(-sims)[:K_NEIGHBOURS]
    return [(LIB[i], float(sims[i])) for i in top]


def vote(neighbours, key, skip=("", "unknown")):
    score = {}
    for row, sim in neighbours:
        v = TEAM_PLACE.get(row[key], row[key]).replace(" ", "_") if key == "place" else row[key].replace(" ", "_")
        if v not in skip:
            score[v] = score.get(v, 0) + max(sim, 0)
    if not score:
        return None
    label = max(score, key=score.get)
    return {"label": label, "confidence": round(score[label] / sum(score.values()), 2)}


def recognise(image):
    """Our place model: place, time, season, indoor with the model's own confidence."""
    c = PLACE_CFG
    s = c["image_size"]
    w, h = image.size
    r = s / min(w, h)                                    # resize the short side, then centre crop
    im = image.resize((max(s, round(w * r)), max(s, round(h * r))), Image.Resampling.BILINEAR)
    left, top = (im.width - s) // 2, (im.height - s) // 2
    x = (np.asarray(im.crop((left, top, left + s, top + s)), dtype=np.float32) / 255 - c["mean"]) / c["std"]
    outs = PLACE_MODEL.run(None, {"image": x.transpose(2, 0, 1)[None].astype(np.float32)})
    answer = {}
    for (head, classes), logits in zip(c["heads"].items(), outs):
        p = np.exp(logits[0] - logits[0].max()); p /= p.sum()
        answer[head] = {"label": classes[int(p.argmax())], "confidence": round(float(p.max()), 2)}
    return answer


def scene_card(image, name=None):
    image = image.convert("RGB")
    rgb = np.asarray(image.resize((PALETTE_SIZE, PALETTE_SIZE), Image.Resampling.BILINEAR), dtype=np.float64) / 255
    rgb_g = np.asarray(image.resize((GRADIENT_SIZE, GRADIENT_SIZE), Image.Resampling.BILINEAR), dtype=np.float64) / 255
    stops = palette_of(rgb)
    neighbours = similar(image)
    if PLACE_MODEL is not None:
        r = recognise(image)
        place, time, season = r["place"], r["time"], r["season"]
    else:
        r = None
        place, time, season = vote(neighbours, "place"), vote(neighbours, "time"), vote(neighbours, "season")
    if not name:
        name = "photo_" + hashlib.sha1(image.tobytes()).hexdigest()[:10]
    card = {"version": 2, "name": name, "place": place,
            "mood": {**mood_of(rgb), "n_colours": len(stops)},
            "stops": sorted(stops, key=lambda s: s[2]),                 # top of the image -> bottom
            "gradient": gradient_of(rgb_g)}
    card["layers"], card["scan"], card["detail"] = layers_of(rgb_g)
    if time:
        card["time_of_day"] = time["label"]
        card["time"] = time
    if season:
        card["season"] = season
    if r:
        card["indoor"] = {"value": r["indoor"]["label"] == "yes", "confidence": r["indoor"]["confidence"]}
    return card, neighbours


# ---- for people: the page --------------------------------------------------------------
def swatches(colours, label):
    cells = "".join(f'<span style="flex:1;background:{c}"></span>' for c in colours)
    return (f'<div style="margin:6px 0"><div style="font-size:12px;opacity:.7">{label}</div>'
            f'<div style="display:flex;height:26px;border-radius:6px;overflow:hidden">{cells}</div></div>')


def for_page(image):
    if image is None:
        raise gr.Error("Upload a photo first.")
    card, neighbours = scene_card(image)
    stops = "".join(f'<span style="flex:{w};background:{h}"></span>' for h, w, _ in card["stops"])
    html = (swatches(card["gradient"], "gradient map: shadows → highlights")
            + f'<div style="font-size:12px;opacity:.7;margin-top:8px">palette (width = share of the image, top → bottom)</div>'
            f'<div style="display:flex;height:26px;border-radius:6px;overflow:hidden">{stops}</div>')
    rows = [[r["name"], TEAM_PLACE.get(r["place"], r["place"]), r["time"], r["season"], round(s, 3)] for r, s in neighbours]
    return card, html, rows


def predict(image_b64: str, name: str = "") -> dict:
    """Make a scene card from one photo. Send a base64 PNG or JPEG (a 'data:image/...;base64,' prefix is fine).
    Optional `name`: the unique id of the photo (e.g. the D1 row id); default = a hash of the image."""
    if "," in image_b64[:100]:
        image_b64 = image_b64.split(",", 1)[1]
    card, _ = scene_card(Image.open(io.BytesIO(base64.b64decode(image_b64))), name or None)
    return card


def embed(image_b64: str, top: int = 5) -> dict:
    """The autoencoder's 64 numbers for one photo (L2-normalised), plus the most similar library scenes.
    Use it to compare two places (cosine = dot product of two latents) or to find similar scenes."""
    if "," in image_b64[:100]:
        image_b64 = image_b64.split(",", 1)[1]
    image = Image.open(io.BytesIO(base64.b64decode(image_b64))).convert("RGB")
    x = np.asarray(image.resize((SIZE, SIZE), Image.Resampling.BILINEAR), dtype=np.float32) / 255
    z = session.run(["latent"], {"image": x.transpose(2, 0, 1)[None]})[0][0]
    z = z / np.linalg.norm(z)
    sims = LIB_Z @ z
    best = np.argsort(-sims)[:max(1, min(int(top), 20))]
    return {"dim": int(z.shape[0]), "latent": [round(float(v), 5) for v in z],
            "similar": [{"name": LIB[i]["name"], "place": TEAM_PLACE.get(LIB[i]["place"], LIB[i]["place"]),
                         "time": LIB[i]["time"], "season": LIB[i]["season"], "similarity": round(float(sims[i]), 3)}
                        for i in best]}


with gr.Blocks(title="Chroma scene card") as demo:
    gr.Markdown(
        "# Chroma: a photo becomes a scene card\n"
        "Upload a photo of a place. The colours and the gradient are measured from the pixels; "
        "place, time of day and season come from the 10 most similar scenes in the library "
        "(autoencoder, 64 numbers per photo). The scene card is what the music reads."
    )
    with gr.Row():
        with gr.Column():
            image_in = gr.Image(type="pil", label="Photo of a place")
            button = gr.Button("Make the scene card", variant="primary")
        with gr.Column():
            colours_out = gr.HTML()
            card_out = gr.JSON(label="Scene card (version 2)")
    similar_out = gr.Dataframe(headers=["library scene", "place", "time", "season", "similarity"],
                               label="Most similar library scenes (they vote for place, time and season)")
    button.click(for_page, inputs=image_in, outputs=[card_out, colours_out, similar_out], api_visibility="private")
    gr.api(predict, api_name="predict")
    gr.api(embed, api_name="embed")

if __name__ == "__main__":
    # Render tells the app its port in PORT; locally it is 7860
    demo.launch(server_name="0.0.0.0", server_port=int(os.environ.get("PORT", 7860)))
