# 04 · Chroma: the final app

**Group 08 · Akshat · Bo · Bhavini · AI Methods hackathon, IAAC MaAI, 16–20 November 2026**

## Use case

Someone walking through Barcelona (a visitor, or someone who lives there) wants to *feel* a place, not only see it.
Chroma turns what the phone camera sees into music, live. The place picks the genre, the light and colours pick the mood,
key and chords, and the walking pace sets the tempo. The product is the **live walk**: the camera stays on, a new view is read
every 3.5 s while walking (10 s standing), and the music keeps changing. The single photo (10 s of music, saved in
"My places") was step 01 and is still in the app.

## Live URLs

| What | URL |
|---|---|
| App (login with the shared password, sent with the hand-in) | https://chroma-team8.pages.dev · live walk at `/live/chroma` |
| Model server (Render, free plan: sleeps after 15 min, ~1 min to wake) | https://team8-chroma-model.onrender.com |
| Model (Hugging Face) | https://huggingface.co/iaac-maai/hackathon-team8-chroma-ae |

## Diagrams

In [`diagrams/`](diagrams/). Every arrow is checked against the code.

| Diagram | File |
|---|---|
| System: the parts and how they connect (browser, Pages Functions, D1, Render, Hugging Face) | [`diagrams/system.md`](diagrams/system.md) |
| User flow: what a user does and sees | [`diagrams/user_flow.md`](diagrams/user_flow.md) |
| Sequence: S1 one photo, S2 one live-walk view | [`diagrams/sequence.md`](diagrams/sequence.md) |

Proofs (database, 401 lock, Render, no secrets): [`PROOFS.md`](PROOFS.md).

## Where the data lives

| What | Where | Persistent? |
|---|---|---|
| Uploaded photo (512 px JPEG, ~50 KB) + its scene card | D1 `chroma-db`, table `scenes` | yes |
| Live-walk views (scene card only, no photo) | D1 `chroma-db`, table `live_views` | yes |
| Listener type | `persona` cookie (7 days), copied into each row's `persona` column | cookie: per browser; column: yes |
| Login | `auth` cookie = hash of the password (HttpOnly, 7 days); password = Cloudflare secret | per browser |
| The music | not stored: rebuilt in the browser (Tone.js) from the card | no |
| Model and search library | Hugging Face (`chroma_ae.onnx`), downloaded by Render at build; `library_latent.npy` + `library.csv` in `01_autoencoder/model_app/` | yes |
| Model server memory | Render | no (sleeps after 15 min) |

No R2: it needs a payment card, so photos are small BLOBs in D1 (max 1 MB per upload, D1 rows hold up to 2 MB).


## Arrow check against the code

| Arrow | Code |
|---|---|
| wake on page load | `03_app/public/index.html` `fetch("/api/wake")`, `functions/api/wake.js` |
| password check before every /api/ | `functions/_middleware.js` |
| retry to Render, then 503 | `functions/_lib/model.js` (`callModel`), `functions/api/predict.js` |
| page retry on 503 | `index.html` `send()` (9 tries, 10 s) |
| INSERT / SELECT in D1 | `predict.js`, `history.js`, `images/[id].js`; table in `schema.sql` |
| music from the card | `index.html` `play()` (Tone.js) |
| walk: frames → our server → model | `public/live` (built from `music/src`: `scheduleSnaps`, `captureView`, `photoToCard`); `functions/gradio_api/call/predict.js` and `predict/[id].js` |
| walk views in D1 | `predict/[id].js` INSERT into `live_views`; `functions/api/live.js`; `schema.sql` |
| walk: steps, speed, turns | `music/src/walk.js` `startWalk`, `walkTempo`; `chroma.js` `followWalk` |

## Miro vs built

- **No R2:** Miro has an R2 bucket for photos. R2 needs a payment card, so the small photo is stored as a BLOB in the same D1 row.
- **Two retry loops:** Miro shows one retry; the code retries on the server first (`_lib/model.js`), then the page retries on 503.
- **Extra arrow:** `/api/wake` on page load was not on Miro; added here.
- **Live walk moved inside the app:** at first Bo's player called Render straight from the browser (no login, nothing saved). Now it is built into the app at `/live/chroma`: same login, frames go through our server code (with the wake-up retry) and every view is saved in D1 (`live_views`, card only, no photo).
- **Same as Miro:** login checked on the server, Render only called from server code in the Cloudflare app, music made in the browser.

## Three statements

_Written by the team (Akshat, Bo, Bhavini), one short paragraph each. Be honest: "we do not know yet" is fine._

### What is clear

_TODO (team)_

### What is still unclear

_TODO (team)_

### What we would do next

_TODO (team)_

## Limitations

- **Place recognition is weak.** The server finds the place by letting the 10 most similar library scenes vote
  (autoencoder codes). The autoencoder groups photos by light and colour, not by kind of place (place precision@5 0.35, chance 0.22).
  On 27 real Barcelona photos the place was right for 9 (Bo's test, team talk notes).
- **Two places are missing:** the library has no `club` or `square` photos, so the server never answers them.
- **Not in the card yet:** `indoor`, paving, details, city layers. They need CLIP or segmentation, which is too big for Render's free plan.
- **Labels are guesses:** time and season in the library come from CLIP. Season leans to "summer", and golden hour and night are rare.
- **Cold start:** the free model server sleeps after 15 min, and the first request then takes about a minute (handled with a wake call and two retry loops).
- **One shared password, no user accounts:** every logged-in visitor sees the same "My places" and "My walks".
- **Walk sensors need a phone:** steps and compass need motion permission (iPhone asks after a tap). On a laptop the photo and chance pick the style.
- **The old password is in the git history** (Tuesday's `HANDIN.md` in the team's private workspace repo). It is removed from the file. Change it before the hand-in (see `PROOFS.md` §4).
