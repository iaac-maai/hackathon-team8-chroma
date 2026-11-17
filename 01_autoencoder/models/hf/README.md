---
license: other
license_name: places365-non-commercial
license_link: http://places2.csail.mit.edu/
library_name: onnx
tags:
  - autoencoder
  - convolutional-autoencoder
  - similarity-search
  - places365
  - built-environment
  - onnx
pipeline_tag: image-feature-extraction
---

# Chroma autoencoder (conv-64)

**Team 8 · AI Methods hackathon, IAAC MaAI, Barcelona · November 2026**
Code: [github.com/iaac-maai/hackathon-team8-chroma](https://github.com/iaac-maai/hackathon-team8-chroma) (folder `01_autoencoder/`)

A small convolutional autoencoder that turns a photo of a place into **64 numbers** (its latent
vector). Photos that look alike get close vectors. In **Chroma**, a user takes a photo of a place;
the app finds the most similar scenes in a labelled library and turns their place, light and colours
into a short piece of music.

## What it does and for which use

- **Input:** an RGB photo, resized to 64 × 64, pixels scaled to 0–1, shape `(N, 3, 64, 64)`.
- **Outputs:** `reconstruction` `(N, 3, 64, 64)` and `latent` `(N, 64)`, L2-normalised.
- **Use: similarity search.** Cosine similarity between a photo's latent and the 731 library
  vectors in `library_latent.npy`; `library.csv` holds the labels of each library scene (place, time
  of day, season, colour values, palette, music values). The library contains **no photos**.

## Data

| | |
|---|---|
| Training | Places365 validation set (Zhou et al., 2017): **36,500 photos, 365 scene types**, split 80 / 10 / 10 (seed 8) |
| Library | 731 scenes of six places (market, street, beach, mountains, metro, airport) from the same set, after removing close-ups of people, animals and objects |
| Licence | Places365 photos are for non-commercial research and teaching and belong to their owners. They are not redistributed here; the figures show small 64 px examples for documentation. **This model is for non-commercial, educational use.** |

## Architecture and preprocessing

| | |
|---|---|
| Encoder | 4 × [Conv 4×4, stride 2 → BatchNorm → LeakyReLU 0.1], channels 32 / 64 / 128 / 256 (64 → 4 px), then Linear 4096 → **64** |
| Decoder | Linear 64 → 4096, 3 × [ConvTranspose 4×4, stride 2 → BatchNorm → LeakyReLU], ConvTranspose → 3 channels, Sigmoid |
| Parameters | 1.9 M · ONNX file 7.6 MB |
| Preprocessing | RGB, resize to 64 × 64 (bilinear), divide by 255 |

## Training and comparison of setups

MSE loss, Adam (learning rate 1e-3), batch 128, 12 epochs, laptop CPU. Same split and seed for all.

| Setup | Latent | Parameters | Train time | Val MSE | Test MSE | Place precision@5 |
|---|---|---|---|---|---|---|
| A · dense-64 | 64 | 12.7 M | 7 min | 0.0195 | 0.0193 | 0.319 |
| **B · conv-64 (this model)** | **64** | **1.9 M** | 20 min | 0.0129 | 0.0127 | **0.352** |
| C · conv-256 | 256 | 3.5 M | 22 min | 0.0079 | 0.0078 | 0.349 |

*Place precision@5*: of the 5 most similar library scenes, the share with the same place as the
query (79 test photos). **Chance = 0.218.** The model never sees a place label.

![Loss curves](figures/02_loss_curves.png)
![Reconstructions](figures/03_reconstructions.png)

## Result

- Convolutions beat the dense model with 7 × fewer parameters (test MSE 0.0127 vs 0.0193).
- A larger code (256) reconstructs better but does not search better, so we use the 64-number code.
- The 5 nearest scenes share the query's place **1.6 × more often than chance**.
- The latent space encodes **light and setting**: bright outdoor scenes on one side, indoor and
  night scenes on the other, warmth changing smoothly. A sunset at the beach finds other sunsets.

![Similarity search](figures/04_similarity.png)
![Latent map](figures/05_latent_map.png)

## Limits: where it fails

- 0.35 precision means **most neighbours are another place**: the model groups by light and colour
  (a bright beach finds bright snowy mountains; old black-and-white photos find pale beaches).
  Chroma takes the place label from CLIP, not from this model.
- 64 × 64 px: small details (signs, doors, people) are lost in the reconstruction.
- Trained on Places365, photographed worldwide, not in Barcelona.
- Indoor scenes are fewer than outdoor ones; golden-hour and night photos are rare in the library.

## How to use

```python
import json, numpy as np, onnxruntime as ort, pandas as pd
from huggingface_hub import hf_hub_download
from PIL import Image

repo = "iaac-maai/hackathon-team8-chroma-ae"
sess = ort.InferenceSession(hf_hub_download(repo, "chroma_ae.onnx"))
lib_z = np.load(hf_hub_download(repo, "library_latent.npy"))
lib = pd.read_csv(hf_hub_download(repo, "library.csv"))

img = Image.open("my_photo.jpg").convert("RGB").resize((64, 64), Image.Resampling.BILINEAR)
x = (np.asarray(img, dtype=np.float32) / 255.0).transpose(2, 0, 1)[None]   # (1, 3, 64, 64)
reconstruction, latent = sess.run(None, {"image": x})

scores = lib_z @ latent[0]                       # cosine similarity (both normalised)
top = np.argsort(-scores)[:5]
print(lib.loc[top, ["place", "time", "season", "scale"]].assign(similarity=scores[top].round(2)))
```

Model and figures are made by `01_autoencoder/notebook/autoencoder.ipynb` in the GitHub repository.
