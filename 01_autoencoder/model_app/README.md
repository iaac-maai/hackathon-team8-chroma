# Chroma model server

One photo of a place in, one **scene card** out (the contract in `music/scene-card/README.md`, version 2).
Gradio page for people, `/predict` API for programs (Bhavini's app). ONNX Runtime + numpy only:
about 180 MB of memory, so it fits Render's free plan.

| Scene card field | How it is made |
|---|---|
| `mood` (brightness, warmth −1..1, saturation, contrast, n_colours) | measured from the pixels, same formulas as `data_prep/extract_palette.py` |
| `stops` `[hex, weight, y]` | the palette (k-means in Lab), top of the image → bottom |
| `gradient` (8 colours) | the gradient map, same as `data_prep/extract_gradient.py` |
| `place`, `time`, `season` (+ confidence) | our own place model if `place_model.onnx` is here; otherwise the autoencoder (`chroma_ae.onnx`) finds the 10 most similar library scenes; they vote, weighted by similarity. Confidence = share of the vote |
| `layers` (top, middle, ground: colour, brightness, saturation, detail), `scan` (16 steps left → right), `detail` | measured from the pixels; for melody, bass, rhythm (see the team notes on picture layers → music layers) |
| `indoor` | only with our own place model (`place_model.onnx`, from `data_prep/train_place_model.py`) |
| `name` | the `name` you send, or a hash of the photo |

Not in the card yet (need CLIP / segmentation, too big for the free server): `indoor`, `paving`,
`details`, `city`, and the places `club` and `square` (the library has only the 5 other places).
They come once the Colab labels are in the library.

## Run it

```bash
pip install -r requirements.txt
python app.py            # then open http://localhost:7860
```

## Call the API

```python
from gradio_client import Client, handle_file
import base64
b64 = base64.b64encode(open("photo.jpg", "rb").read()).decode()
card = Client("https://team8-chroma-model.onrender.com").predict(b64, "row_42", api_name="/predict")
```

Or with two HTTP requests:

```bash
curl -X POST https://team8-chroma-model.onrender.com/gradio_api/call/predict \
     -H "Content-Type: application/json" -d '{"data": ["<base64 photo>", "row_42"]}'
# -> {"event_id": "..."}
curl -N https://team8-chroma-model.onrender.com/gradio_api/call/predict/<event_id>
```

### `/embed`: the autoencoder's 64 numbers

Why the product needs it: compare two places (similarity = dot product of two latents, 1 = same look),
or find library scenes that look alike without making a whole scene card. Send both arguments
(Gradio needs every one): the base64 photo and how many similar scenes (1-20).

```bash
curl -X POST https://team8-chroma-model.onrender.com/gradio_api/call/embed      -H "Content-Type: application/json" -d '{"data": ["<base64 photo>", 5]}'
curl -N https://team8-chroma-model.onrender.com/gradio_api/call/embed/<event_id>
# -> {"dim": 64, "latent": [64 numbers, L2-normalised], "similar": [{"name", "place", "time", "season", "similarity"}, ...]}
```

## Deploy on Render

The Render service `team8-chroma-model` is created from the `render.yaml` of the team's workspace repo, which points Render to this folder (`rootDir`) and downloads `chroma_ae.onnx` from Hugging Face at build. (The `render.yaml` in this repository serves the prototype site.)
render.com → **New → Blueprint** → this repository → **Apply**. Region Frankfurt, free plan.
The free server sleeps after 15 minutes: the first request after a pause takes about a minute.
