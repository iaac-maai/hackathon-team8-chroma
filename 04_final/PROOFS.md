# Chroma · proofs

Commands run on Thursday 19 November 2026, ~15:30 UTC, against the live services. Outputs are copied as they came,
with blank lines and wrangler's banner removed. The app password is not in this file.

## 1. A database

```bash
cd 03_app
npx wrangler d1 execute chroma-db --remote --command "SELECT name FROM sqlite_master"
```

```text
🌀 Executing on remote database chroma-db (d96b40e8-4b57-47bc-ad9e-730b50ba78f1):
🚣 Executed 1 command in 0.27ms
[ { "results": [
      { "name": "_cf_KV" },
      { "name": "scenes" },
      { "name": "sqlite_autoindex_scenes_1" },
      { "name": "idx_scenes_created_at" },
      { "name": "live_views" },
      { "name": "sqlite_autoindex_live_views_1" },
      { "name": "idx_live_views_created_at" } ],
    "success": true } ]
```

`scenes` (one row per photo: card + 512 px photo BLOB) and `live_views` (one row per live-walk view: card only),
as in [`../03_app/schema.sql`](../03_app/schema.sql). `_cf_KV` is Cloudflare's own internal table.

## 2. Locked on the server

Without the login cookie, every API route answers **401**, and pages redirect to the login:

```bash
curl -i https://chroma-team8.pages.dev/api/history
```

```text
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{"error":"Not logged in"}
```

The same check, one line each:

```text
GET  /api/history              → 401 Unauthorized
GET  /api/live                 → 401 Unauthorized
GET  /api/predict              → 401 Unauthorized
POST /api/predict              → 401 Unauthorized
GET  /gradio_api/call/predict  → 401 Unauthorized   (the live-walk route to Render)
GET  /                         → 302 Found, Location: https://chroma-team8.pages.dev/login
```

Code: [`../03_app/functions/_middleware.js`](../03_app/functions/_middleware.js). The shared password is a Cloudflare secret
(`APP_PASSWORD`). It is sent with the course hand-in, never in the repository.

## 3. Connected to Render

The `MODEL_URL` line from [`../03_app/wrangler.toml`](../03_app/wrangler.toml):

```toml
MODEL_URL = "https://team8-chroma-model.onrender.com"
```

**Screenshot of one live result in the app:** _TODO (team): log in at https://chroma-team8.pages.dev, upload one photo,
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
git check-ignore -v 03_app/.dev.vars
# 03_app/.gitignore:3:.dev.vars    03_app/.dev.vars
```

Only `.dev.vars.example` is committed, and it holds a placeholder (`APP_PASSWORD=choose-a-local-test-password`).

**AI tool's answer** (Claude Code, asked: *"Check my repo and my Cloudflare account for secrets that are in code or in
the git history."*):

> - **Code (current files):** no API keys, tokens or passwords found. Searched for `api_key / secret / token / password = …`,
>   Hugging Face tokens (`hf_…`), OpenAI-style keys (`sk-…`) and AWS keys (`AKIA…`).
> - **Git history:** the **app password was in plain text** in `Akshat - Image processing/HANDIN.md` of the team's private workspace repo (the Tuesday system
>   and sequence diagrams), added in commit `4475a26`. It is removed from the current file. It stays in the history,
>   so the password should be changed: `npx wrangler pages secret put APP_PASSWORD --project-name chroma-team8`.
> - **Cloudflare account:** `wrangler.toml` holds only plain settings (`MODEL_URL`, `MODEL_API_NAME`, the D1 id, which is
>   not a secret). The password is meant to be a Pages secret. ⚠️ `npx wrangler pages secret list --project-name chroma-team8`
>   printed **no secret names** for production or preview. Check this in the Cloudflare dashboard (Pages → chroma-team8 →
>   Settings → Variables and Secrets). Without `APP_PASSWORD` nobody can log in.

_TODO (team): after the password is changed, re-run the check and replace this answer._

## 5–6. Login and own data only

Not applicable: Chroma has no user accounts, only the shared password. Every logged-in visitor sees the same
"My places" and "My walks".
