# System diagram · Chroma final version

The parts of the system and how they connect. Solid arrows run while someone uses the app; dashed arrows
run once, at deploy or build time. Every arrow points to the code that makes it (table below).

```mermaid
flowchart LR
  subgraph PHONE["Phone or laptop browser"]
    PAGE["Page<br/>index.html · login.html · persona.html<br/>(photo, My places, My walks)"]
    LIVE["Live walk player<br/>/live/chroma (Bo's code)<br/>camera · steps · compass"]
    TONE["Tone.js<br/>music made in the browser"]
  end

  subgraph CF["Cloudflare (chroma-team8.pages.dev)"]
    MW["Pages Functions<br/>_middleware.js: login check, else 401"]
    API["/api/login · persona · predict · history<br/>images · live · wake<br/>/gradio_api/call/predict (live frames)"]
    SECRET[["Secret APP_PASSWORD"]]
    D1[("D1 chroma-db<br/>scenes: card + 512 px photo BLOB<br/>live_views: card only")]
  end

  subgraph RENDER["Render, free plan (team8-chroma-model.onrender.com)"]
    GR["Gradio app.py<br/>/predict → scene card<br/>/embed → 64 numbers"]
    AE["ONNX Runtime<br/>chroma_ae.onnx (conv-64)<br/>+ library_latent.npy, library.csv"]
  end

  HF[("Hugging Face<br/>iaac-maai/hackathon-team8-chroma-ae")]
  GH[("GitHub workspace repo")]
  CDN["tonejs.github.io<br/>piano + drum samples"]

  PAGE -->|"photo (512 px JPEG) + auth cookie"| MW
  LIVE -->|"camera frame (640 px) + auth cookie"| MW
  MW --> API
  SECRET -.->|"compared at login"| API
  API -->|"POST + GET /gradio_api/call/predict<br/>retry while waking"| GR
  API -->|"GET / (wake on page load)"| GR
  GR --> AE
  GR -->|"scene card"| API
  API <-->|"INSERT / SELECT"| D1
  API -->|"scene card, history, photos"| PAGE
  API -->|"scene card"| LIVE
  PAGE --> TONE
  LIVE --> TONE
  CDN -->|"samples"| TONE
  HF -.->|"chroma_ae.onnx at build (render.yaml)"| AE
  GH -.->|"Blueprint deploy (render.yaml)"| RENDER
```

## Arrow check against the code

| Arrow | Code |
|---|---|
| page → Functions (photo + cookie) | `03_app/public/index.html` (`fetch("/api/predict")`) |
| live player → Functions (frame) | `public/live` built from `music/src/model-client.js` with an empty `VITE_MODEL_URL` → `/gradio_api/call/predict` on our own app |
| login check, else 401 | `03_app/functions/_middleware.js` |
| secret compared at login | `functions/api/login.js` (`env.APP_PASSWORD`); set with `wrangler pages secret put` |
| Functions → Render, with retry | `functions/_lib/model.js` (`startJob`, `readJob`), `MODEL_URL` in `wrangler.toml` |
| wake on page load | `functions/api/wake.js` |
| Gradio → ONNX + library | `01_autoencoder/model_app/app.py` (`ort.InferenceSession`, `library_latent.npy`) |
| Functions ↔ D1 | `api/predict.js` (INSERT `scenes`), `gradio_api/call/predict/[id].js` (INSERT `live_views`), `api/history.js`, `api/live.js`, `api/images/[id].js` (SELECT); tables in `03_app/schema.sql`; binding `DB` in `wrangler.toml` |
| page / player → Tone.js | `index.html` `play()`, `music/src/chroma.js` |
| samples from tonejs.github.io | `music/src/chroma.js` (drum samples, Salamander piano) |
| Hugging Face → Render at build | workspace `render.yaml` `buildCommand` (`curl … /resolve/main/chroma_ae.onnx`) |
| GitHub → Render | `render.yaml` of the team workspace repo (`rootDir` = `01_autoencoder/model_app`, Blueprint) |

**Not drawn, on purpose:** the optional "Offline places" button in the live player loads CLIP in the browser
(`music/src/offline.js`: transformers.js from jsDelivr, model `Xenova/clip-vit-base-patch32` from Hugging Face). It is
only used when the model server can't be reached, and it is not part of the normal path.

**Changed since Tuesday (Miro):** there is no R2 (it needs a payment card), so small photos are stored as BLOBs in D1. The
"Worker" is now Pages Functions in the same project as the page. The live walk now goes through our Functions
instead of calling Render directly from the browser.
