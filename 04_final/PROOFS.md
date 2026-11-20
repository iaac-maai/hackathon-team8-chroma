# Chroma · proofs

Commands run on Thursday 19 November 2026 against the live services (§1 and §3 at ~15:30 UTC, §2 at 17:21 UTC). Outputs are copied as they came,
with blank lines and wrangler's banner removed. The app password is not in this file.

## 1. A database

Run on Friday 20 November 2026, 09:36 UTC, against the final app's database `chroma-jam-db` (Bhavini's Cloudflare account):

```bash
cd 03_app
npx wrangler d1 execute chroma-jam-db --remote --command "SELECT name FROM sqlite_master WHERE type='table'"
```

```text
🌀 Executing on remote database chroma-jam-db (820ad71a-8d3e-4db6-a01c-b46f77360c46):
🚣 Executed 1 command in 0.27ms
[ { "results": [
      { "name": "_cf_KV" },
      { "name": "scenes" },
      { "name": "live_views" },
      { "name": "users" },
      { "name": "logins" },
      { "name": "friendships" },
      { "name": "messages" },
      { "name": "jams" },
      { "name": "jam_members" },
      { "name": "jam_events" },
      { "name": "tracks" },
      { "name": "playlists" },
      { "name": "playlist_tracks" },
      { "name": "playlist_shares" } ],
    "success": true } ]
```

`scenes` (one row per photo: card + 512 px photo BLOB), `live_views` (one row per walk view: card only), `users`, `logins`
(every login attempt), `friendships`, `messages` (chat, optionally with a track), `jams`, `jam_members` (invited / joined / left),
`jam_events` (every change the conductor sent), `tracks` (a saved piece: its recipe plus a ~40 KB Opus/AAC file), `playlists`,
`playlist_tracks`, `playlist_shares` (up to 10 friends), as in [`../03_app/schema.sql`](../03_app/schema.sql) and
`../03_app/migrations/0002`–`0004`. `_cf_KV` is Cloudflare's own internal table.

## 2. Locked on the server

Re-run on Thursday 19 November 2026, 17:21 UTC, against the final app (chroma-jam.pages.dev). Without a session cookie,
every API route answers **401**, and pages redirect to the login:

```bash
curl -i https://chroma-jam.pages.dev/api/history
```

```text
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{"error":"Not logged in"}
```

The same check, one line each:

```text
GET  /api/history              → 401
GET  /api/live                 → 401
GET  /api/predict              → 401
POST /api/predict              → 401
GET  /api/friends              → 401
GET  /api/jams                 → 401
GET  /api/messages             → 401
GET  /gradio_api/call/predict  → 401   (the live-walk route to Render)
GET  /                         → 302, Location: https://chroma-jam.pages.dev/login
```

Code: [`../03_app/functions/_middleware.js`](../03_app/functions/_middleware.js) and `_lib/auth.js`. The session cookie is
signed with the Cloudflare secret `SESSION_SECRET`; passwords are stored only as a PBKDF2 hash. The team admin password
(`APP_PASSWORD`) is a Cloudflare secret, sent with the course hand-in, never in the repository.

## 3. Connected to Render

The `MODEL_URL` line from [`../03_app/wrangler.toml`](../03_app/wrangler.toml):

```toml
MODEL_URL = "https://team8-chroma-model.onrender.com"
```

**Screenshot of one live result in the app:** _TODO (team): log in at https://chroma-jam.pages.dev, upload one photo,
take a screenshot of the result (place, time, gradient, music playing), and save it as `proofs/03_live_result.png`._

The model server answers on its own as well (Gradio's two-step API, one test image):

```bash
curl -X POST https://team8-chroma-model.onrender.com/gradio_api/call/predict \
     -H "Content-Type: application/json" -d '{"data": ["<base64 photo>", "proof"]}'
# {"event_id":"ad85b5bc5276497bb31f6095bf294b3c"}
curl -N https://team8-chroma-model.onrender.com/gradio_api/call/predict/ad85b5bc5276497bb31f6095bf294b3c
```

```text
event: complete
data: [{"version": 2, "name": "proof", "place": {"label": "green", "confidence": 0.61},
        "mood": {"brightness": 0.14, "warmth": -0.052, "saturation": 0.381, "contrast": 0.778, "n_colours": 3}, ...
        "time": {"label": "day", "confidence": 0.41}, "season": {"label": "winter", "confidence": 0.44}}]
card keys: version, name, place, mood, stops, gradient, layers, scan, detail, time_of_day, time, season
```

## 4. No secrets in git

`.dev.vars` is ignored:

```bash
git check-ignore -v "Akshat - Image processing/03_app/.dev.vars"
# Akshat - Image processing/03_app/.gitignore:3:.dev.vars    .dev.vars
```

Only `.dev.vars.example` is committed, and it holds a placeholder (`APP_PASSWORD=choose-a-local-test-password`).

**AI tool's answer** (Claude Code, asked: *"Check my repo and my Cloudflare account for secrets that are in code or in
the git history."*):

> - **Code (current files):** no API keys, tokens or passwords found. Searched for `api_key / secret / token / password = …`,
>   Hugging Face tokens (`hf_…`), OpenAI-style keys (`sk-…`) and AWS keys (`AKIA…`).
> - **Git history:** the **app password was in plain text** in `Akshat - Image processing/HANDIN.md` (the Tuesday system
>   and sequence diagrams), added in commit `4475a26`. It is removed from the current file. It stays in the history,
>   so the password should be changed: `npx wrangler pages secret put APP_PASSWORD --project-name chroma-team8` (now also on `chroma-jam`).
> - **Cloudflare account:** `wrangler.toml` holds only plain settings (`MODEL_URL`, `MODEL_API_NAME`, the D1 id, which is
>   not a secret). The password is meant to be a Pages secret. ⚠️ `npx wrangler pages secret list --project-name chroma-team8`
>   printed **no secret names** for production or preview. Check this in the Cloudflare dashboard (Pages → chroma-team8 →
>   Settings → Variables and Secrets). Without `APP_PASSWORD` nobody can log in.

**Re-check, Friday 20 November** (same question, on the final app):

> - **chroma-jam (the final app):** `npx wrangler pages secret list --project-name chroma-jam` shows one secret,
>   `SESSION_SECRET` (encrypted). There is **no `APP_PASSWORD`** on chroma-jam, so the old leaked team password
>   does not log in there. Everyone uses their own account; the dashboard (`/admin`) opens only for the three admins in `ADMINS`.
> - **This repo (files and full history):** no keys or tokens. The only password-like strings are throwaway test
>   passwords in `03_app/scripts/social-smoke.mjs` (for test accounts made and used only by the test) and
>   placeholder text in the docs.
> - **Still open:** the old password still works on the older `chroma-team8` (Akshat's account). Akshat changes it there
>   with `npx wrangler pages secret put APP_PASSWORD --project-name chroma-team8`.

## 5–6. Login and own data only

Everyone has an account (username, email, password of 8+ characters). Each user sees only their own data:

- "My places": `functions/api/history.js` reads `scenes ... WHERE user_id = ?` (the team admin sees all).
- "My walks": `functions/api/live.js` reads the user's own `live_views`, plus the views of jams they joined.
- Other users are shown only as username and name (`publicUser` in `_lib/auth.js`); emails are never sent to other users.
- Jams: only members can read a jam, and only the driver can send its views (`functions/api/jams/[id]/event.js`, 409 otherwise).

Run on Friday 20 November 2026 against a local copy of the final code (three throwaway accounts; the script refuses non-local hosts):

```bash
BASE=http://localhost:8791 node scripts/social-smoke.mjs
```

```text

```
