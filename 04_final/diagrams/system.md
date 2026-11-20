# System diagram · Chroma final version

The parts of the system and how they connect. Solid arrows run while someone uses the app; dashed arrows
run once, at deploy or build time. Every arrow points to the code that makes it (table below).

```mermaid
flowchart LR
  subgraph PHONE["Phone or laptop browser"]
    PAGE["Page<br/>index.html · login · register · persona<br/>(photo, My places, My walks, friends, chat)"]
    LIVE["Live walk on the home page<br/>Bo's engine (public/engine)<br/>camera · steps · compass"]
    JAM["jam.js<br/>checks in about once a second,<br/>plays each view at apply_at"]
    TONE["Tone.js<br/>music made in the browser"]
  end

  subgraph CF["Cloudflare (chroma-jam.pages.dev)"]
    MW["Pages Functions<br/>_middleware.js: signed session, else 401"]
    API["/api/register · login · logout · me · persona<br/>predict · history · images · live · wake<br/>friends · users/search · messages · jams<br/>/gradio_api/call/predict (live frames)"]
    SECRET[["Secrets SESSION_SECRET, APP_PASSWORD (team admin)"]]
    D1[("D1 chroma-jam-db<br/>scenes: card + small photo BLOB<br/>live_views: card only<br/>users (password hash) · logins<br/>friendships · messages<br/>jams · jam_members · jam_events")]
  end

  subgraph RENDER["Render, free plan (team8-chroma-model.onrender.com)"]
    GR["Gradio app.py<br/>/predict → scene card<br/>/embed → 64 numbers"]
    AE["ONNX Runtime<br/>chroma_ae.onnx (conv-64)<br/>+ library_latent.npy, library.csv"]
  end

  HF[("Hugging Face<br/>iaac-maai/hackathon-team8-chroma-ae")]
  GH[("GitHub workspace repo")]
  CDN["tonejs.github.io<br/>piano + drum samples"]

  PAGE -->|"photo (small JPEG) + session cookie"| MW
  LIVE -->|"camera frame + session cookie"| MW
  JAM -->|"check-in, driver's view events"| MW
  MW --> API
  SECRET -.->|"signs sessions; team login"| API
  API -->|"POST + GET /gradio_api/call/predict<br/>retry while waking"| GR
  API -->|"GET / (wake on page load)"| GR
  GR --> AE
  GR -->|"scene card"| API
  API <-->|"INSERT / SELECT"| D1
  API -->|"scene card, history, photos"| PAGE
  API -->|"scene card"| LIVE
  API -->|"jam events + server time"| JAM
  JAM --> LIVE
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
| live walk → Functions (frame) | `public/index.html` → `/gradio_api/call/predict` on our own app; Bo's engine in `public/engine` |
| login check, else 401 | `03_app/functions/_middleware.js`, `_lib/auth.js` (`readSession`) |
| accounts, sessions | `functions/api/register.js`, `login.js` (PBKDF2 hash, `users`, `logins`); `SESSION_SECRET` signs the cookie; `APP_PASSWORD` = team admin |
| friends, chat | `functions/api/friends/`, `users/search.js`, `messages.js`; `_lib/social.js` |
| jam check-in and events | `public/jam.js` ↔ `functions/api/jams/`, `_lib/jam.js` (`addEvent`: `apply_at` = now + 2.5 s) |
| Functions → Render, with retry | `functions/_lib/model.js` (`startJob`, `readJob`), `MODEL_URL` in `wrangler.toml` |
| wake on page load | `functions/api/wake.js` |
| Gradio → ONNX + library | `01_autoencoder/model_app/app.py` (`ort.InferenceSession`, `library_latent.npy`) |
| Functions ↔ D1 | `api/predict.js` (INSERT `scenes`), `gradio_api/call/predict/[id].js` (INSERT `live_views`), `api/history.js`, `api/live.js`, `api/images/[id].js` (SELECT); tables in `03_app/schema.sql`; binding `DB` in `wrangler.toml` |
| page / player → Tone.js | `index.html` `play()`, `Bo/src/chroma.js` |
| samples from tonejs.github.io | `Bo/src/chroma.js` (drum samples, Salamander piano) |
| Hugging Face → Render at build | `render.yaml` `buildCommand` (`curl … /resolve/main/chroma_ae.onnx`) |
| GitHub → Render | `render.yaml` (`rootDir`, Blueprint) |

**Not drawn, on purpose:** the optional "Offline places" button in the live player loads CLIP in the browser
(`Bo/src/offline.js`: transformers.js from jsDelivr, model `Xenova/clip-vit-base-patch32` from Hugging Face). It is
only used when the model server can't be reached, and it is not part of the normal path.

**Changed since Tuesday (Miro):** there is no R2 (it needs a payment card), so small photos are stored as BLOBs in D1. The
"Worker" is now Pages Functions in the same project as the page. The live walk now goes through our Functions
instead of calling Render directly from the browser. On Thursday the shared password became accounts, with friends, chat
and jams; the app moved to chroma-jam.pages.dev (Bhavini's Cloudflare account, database `chroma-jam-db`).
