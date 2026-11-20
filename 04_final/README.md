# 04 · Chroma: the final app

**Group 08 · Akshat · Bo · Bhavini · AI Methods hackathon, IAAC MaAI, 16–20 November 2026**

## Use case

Someone walking through Barcelona (a visitor, or someone who lives there) wants to *feel* a place, not only see it.
Chroma turns what the phone camera sees into music, live. The place picks the genre, the light and colours pick the mood,
key and chords, and the walking pace sets the tempo. The product is the **live walk**: the camera stays on, a new view is read
every 3.5 s while walking (10 s standing), and the music keeps changing. The single photo (10 s of music, saved in
"My places") was step 01 and is still in the app.

Everyone has their own account. Friends find each other by username, chat, and start a **jam**: up to 6 phones hear the
same walk on the same beat, and anyone in the jam can take over the camera. That is how you share the tune of your walk.

## Live URLs

| What | URL |
|---|---|
| App (make an account on the login page; the team admin logs in with the shared password, sent with the hand-in) | https://chroma-jam.pages.dev |
| Model server (Render, free plan: sleeps after 15 min, ~1 min to wake) | https://team8-chroma-model.onrender.com |
| Model (Hugging Face) | https://huggingface.co/iaac-maai/hackathon-team8-chroma-ae |

The app runs on Bhavini's Cloudflare account with its own D1 database (`chroma-jam-db`), deployed with
`03_app/scripts/deploy-chroma-jam.sh`. The older chroma-team8.pages.dev still runs the version before accounts and jams.

## Diagrams

In [`diagrams/`](diagrams/). Every arrow is checked against the code.

| Diagram | File |
|---|---|
| System: the parts and how they connect (browser, Pages Functions, D1, Render, Hugging Face) | [`diagrams/system.md`](diagrams/system.md) |
| User flow: what a user does and sees | [`diagrams/user_flow.md`](diagrams/user_flow.md) |
| Sequence: S1 one photo, S2 one live-walk view, S3 one view in a jam | [`diagrams/sequence.md`](diagrams/sequence.md) |

Proofs (database, 401 lock, Render, no secrets): [`PROOFS.md`](PROOFS.md).

## Where the data lives

| What | Where | Persistent? |
|---|---|---|
| Uploaded photo (small JPEG, ~50 KB) + its scene card + who took it | D1, table `scenes` | yes |
| Live-walk views (scene card only, no photo) + who walked + which jam | D1, table `live_views` | yes |
| Accounts: username, email, name, password **hash** (PBKDF2, random salt), last seen | D1, table `users` | yes |
| Every login attempt (who, when, right or wrong) | D1, table `logins` | yes |
| Friends (asked / accepted) and chat messages | D1, tables `friendships`, `messages` | yes |
| Jams: who started, who drives, who joined, every view and tempo change | D1, tables `jams`, `jam_members`, `jam_events` | yes |
| Saved tracks: the recipe (scene card) + a small compressed recording (Opus/AAC, ~36 KB per 10 s, never WAV) | D1, table `tracks` | yes |
| Playlists, their tracks, shared with up to 10 friends; tracks sent in chat | D1, tables `playlists`, `playlist_tracks`, `playlist_shares`; `messages.track_id` | yes |
| Listener type | `persona` cookie (7 days), copied into each row's `persona` column | cookie: per browser; column: yes |
| Login | `session` cookie = user id + expiry + HMAC signature (HttpOnly, 7 days); the signing key and the team password are Cloudflare secrets | per browser |
| The music | made in the browser (Tone.js) from the card; only a saved track keeps a small recording | only when saved |
| Model and search library | Hugging Face (`chroma_ae.onnx`), downloaded by Render at build; `library_latent.npy` + `library.csv` in `01_autoencoder/model_app/` | yes |
| Model server memory | Render | no (sleeps after 15 min) |

No R2: it needs a payment card, so photos are small BLOBs in D1 (max 1 MB per upload, D1 rows hold up to 2 MB).


## Arrow check against the code

| Arrow | Code |
|---|---|
| wake on page load | `03_app/public/index.html` `fetch("/api/wake")`, `functions/api/wake.js` |
| login check before every route (else 401 or the login page) | `functions/_middleware.js`, `functions/_lib/auth.js` |
| sign up, log in, log out | `functions/api/register.js`, `login.js`, `logout.js`; `users`, `logins` in `schema.sql` |
| friends, search, chat | `functions/api/friends/`, `users/search.js`, `messages.js` |
| jam: start, join, take over, send a view, end | `functions/api/jams/`, `functions/_lib/jam.js`; `public/jam.js` |
| retry to Render, then 503 | `functions/_lib/model.js` (`callModel`), `functions/api/predict.js` |
| page retry on 503 | `index.html` `send()` (9 tries, 10 s) |
| INSERT / SELECT in D1 | `predict.js`, `history.js`, `images/[id].js`; table in `schema.sql` |
| music from the card | `index.html` `play()` (Tone.js) |
| walk: frames → our server → model | `public/index.html` (camera on the home page) and `public/engine` (Bo's engine); `functions/gradio_api/call/predict.js` and `predict/[id].js` |
| walk views in D1 | `predict/[id].js` INSERT into `live_views`; `functions/api/live.js`; `schema.sql` |
| walk: steps, speed, turns | `Bo/src/walk.js` `startWalk`, `walkTempo`; `chroma.js` `followWalk` |

## Miro vs built

- **No R2:** Miro has an R2 bucket for photos. R2 needs a payment card, so the small photo is stored as a BLOB in the same D1 row.
- **Two retry loops:** Miro shows one retry; the code retries on the server first (`_lib/model.js`), then the page retries on 503.
- **Extra arrow:** `/api/wake` on page load was not on Miro; added here.
- **Live walk moved inside the app:** at first Bo's player called Render straight from the browser (no login, nothing saved). Now it is built into the app at `/live/chroma`: same login, frames go through our server code (with the wake-up retry) and every view is saved in D1 (`live_views`, card only, no photo).
- **Accounts, friends, chat and jams (added Thursday):** Miro had one shared password. Now each person has an account,
  "My places" and "My walks" show only your own, and the server conducts jams (shared clock, each view sent 2.5 s ahead).
- **Same as Miro:** login checked on the server, Render only called from server code in the Cloudflare app, music made in the browser.

## Three statements

_Team draft (Akshat, Bo, Bhavini), also on the "Three statements" slide. Edit before the hand-in if you disagree._

### What is clear

The autoencoder learns light and colour, not place: brightness explains its main direction (r = 0.9), and its place
search is 1.6× chance. That is enough for music, which runs on light and colour. The whole path works live, on public URLs.

### What is unclear

Whether listeners hear the place in the music: we have not run a listening test. How well it names Barcelona places:
9 of 27 right. How a jam holds up with six phones on a mobile network.

### What comes next

Add club and square photos and a GPS hint, so places get better. Run a listening test with people. Grow the saved
tracks and shared playlists (done on Friday) into a feed of places your friends heard.

## Limitations

- **Place recognition is weak.** The server finds the place by letting the 10 most similar library scenes vote
  (autoencoder codes). The autoencoder groups photos by light and colour, not by kind of place (place precision@5 0.35, chance 0.22).
  On 27 real Barcelona photos the place was right for 9 (Bo's test, `Bo/talk/TALK_OUTLINE.md`).
- **Two places are missing:** the library has no `club` or `square` photos, so the server never answers them.
- **Not in the card yet:** `indoor`, paving, details, city layers. They need CLIP or segmentation, which is too big for Render's free plan.
- **Labels are guesses:** time and season in the library come from CLIP. Season leans to "summer", and golden hour and night are rare.
- **Cold start:** the free model server sleeps after 15 min, and the first request then takes about a minute (handled with a wake call and two retry loops).
- **Jams poll the server about once a second** (no WebSockets on Pages Functions), so a change is announced 2.5 s ahead.
  A jam ends if the driver's phone is silent for a minute.
- **Walk sensors need a phone:** steps and compass need motion permission (iPhone asks after a tap). On a laptop the photo and chance pick the style.
- **The old team password is in the git history** (Tuesday's `HANDIN.md`). It is removed from the file, but it still logs in
  as the team admin. Change it before the hand-in (see `PROOFS.md` §4).
