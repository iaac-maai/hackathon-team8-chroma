# 03 · Chroma app on Cloudflare

**Public URL:** https://chroma-team8.pages.dev

## What the app does

**The product is the live walk** (`/live/chroma`): the phone camera stays on, and every 3.5 s while walking
(10 s standing) a frame goes, through our own server code, to our model server on Render (`MODEL_URL`). The answer
is a **scene card** (place, time of day, season, warmth, brightness, palette, 8-colour gradient). The music
(Bo's player, Tone.js in the browser) keeps changing with it: a new place brings a new style, your steps set the
tempo, the layers build up while you walk, and a corner brings a new view. Every view is saved in D1
(`live_views`), and the home page shows each walk as a colour strip ("My walks").

**Step 01, one photo**: upload a photo and hear 10 seconds made from its card. The small photo and its card are
stored together in one D1 row (`scenes`), so "My places" is still there after a reload.

The live player is built from `Bo/src` (no changes to Bo's code):
`VITE_MODEL_URL="" npx vite build --base ./ --outDir "../Akshat - Image processing/03_app/public/live"`.
With an empty model URL it calls `/gradio_api/call/predict` on our own app, which checks the login and passes
the frame on to Render.

## How a user logs in

One shared password, checked on the server. The password is a Cloudflare **secret** (`APP_PASSWORD`); it is
sent with the course hand-in, never in this repository. Without the login cookie every `/api/...` route
answers **401**.

## Cloudflare services and why

| Service | Used for | Why |
|---|---|---|
| **Pages** | the page (`public/`) | static HTML, free, a public `*.pages.dev` URL |
| **Pages Functions** | the API (`functions/`): login, live frames (`gradio_api/call/predict`), predict, history, live, images, wake | server code: the password check and the call to Render happen here, not in the browser |
| **D1** | `live_views`: one row per live frame (scene card only); `scenes`: one row per uploaded photo (card + small photo as BLOB) | walks and places must survive a reload |
| **Secret** | `APP_PASSWORD` | the password never sits in code or in git |

## The model server sleeps

Render's free plan sleeps after 15 minutes. The page asks `/api/wake` as soon as it opens, and if a photo
arrives while the server is still starting, the API answers 503 and the page shows **"The model is waking up,
about one minute"** and tries again every 10 seconds (9 times).
The server code also retries by itself (`functions/_lib/model.js`: 4 tries, about 90 s) before it answers 503. The first photo after a pause can take about a minute.

## Run and deploy

```bash
npm install
npx wrangler login
npx wrangler d1 create chroma-db                 # paste the id into wrangler.toml
npx wrangler d1 execute chroma-db --remote --file=schema.sql
npx wrangler pages deploy                        # first time: creates the project chroma-team8
npx wrangler pages secret put APP_PASSWORD --project-name chroma-team8
```

Local test: copy `.dev.vars.example` to `.dev.vars`, then `npm run db:local` and `npm run dev`.

## Diagrams

`diagrams/` (also on Miro): two user stories, the system diagram, two sequence diagrams.
Source: [`../HANDIN.md`](../HANDIN.md).

## Compare: diagrams vs the app we built

- **R2 → D1:** the diagram has an R2 bucket for photos. R2 needs a payment card, so the app shrinks each photo to 512 px in the browser and stores it as a BLOB in the same D1 row as its scene card.
- **Live first:** the first diagrams were about one photo; the product is the live walk, now inside the app with the same login and D1.
- **Music in the browser:** the diagram's "music" box is not a server; Tone.js in the page turns the scene card into sound, so no audio passes through Cloudflare.
- **Wake-up is two loops:** the sequence diagram shows one retry; in the code the server retries first (`_lib/model.js`), then the page retries on 503.
- **Extra arrow:** `/api/wake` (page → Function → Render on page load) was not in the first diagram; it is added now.
- **Same as designed:** password check in `_middleware.js` before every `/api/` route, Render called only from server code.

## Team dashboard (/admin)

https://chroma-jam.pages.dev/admin shows how many people joined, who is active, sign-ups per day, what they did
(photos, walk views, jams, friends) and the last login attempts. It refreshes every 30 s and can download the user list as CSV.
Emails are masked; password hashes are never sent.

**Where they are:** the number of countries, and one card per country with its users, its local time now and that
place's sky right now (the real sun height, the same formula as the app's living gradient).
Country, time zone and a rough area (whole degrees, ~100 km) come from Cloudflare's `request.cf`: no GPS, no permission,
no IP address stored. They are saved on sign-up, login and at most once a minute while someone uses the app, so older
accounts fill in on their next visit. Needs `migrations/0003_country_timezone.sql` on the database **before** deploying.

Only Akshat (@aksster), Bo (@boderoeck) and Bhavini (@bhavini) can open it: `ADMINS` in `wrangler.toml` and
`scripts/deploy-chroma-jam.sh`. Everyone else (the shared team login too) gets "Team only".
Code: `functions/api/admin/stats.js`, `public/admin.html`.

## The sky is the visitor's own

The page's living gradient used Barcelona whenever a visitor had not allowed GPS. Now `/api/me` also returns
roughly where the request comes from (Cloudflare, city level, not stored), and the sky, weather and caption use that city.
GPS still wins when allowed; Barcelona is only the last resort, and the caption then says "Barcelona (default)".

## Keeping the model awake (keepwarm/)

Render's free plan puts the model to sleep after 15 minutes without requests; the next photo then waits about a minute.
`keepwarm/` is a tiny Cloudflare Worker that opens the model page every 10 minutes, so it never sleeps.
Free Render gives 750 hours a month; one service awake all month is about 720, so it fits.

```bash
cd keepwarm && npx --prefix .. wrangler deploy
```
