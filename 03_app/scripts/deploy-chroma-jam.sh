#!/usr/bin/env bash
# Deploy this app to https://chroma-jam.pages.dev (Bhavini's Cloudflare account, its own database chroma-jam-db).
# The normal wrangler.toml stays pointed at Akshat's project (chroma-team8); this builds a copy with the other database.
#   bash scripts/deploy-chroma-jam.sh            (from this folder, logged in with `npx wrangler login`)
# First time only (already done on 19 Nov 2026): d1 create chroma-jam-db, apply schema.sql --remote,
# pages project create chroma-jam, and the secret SESSION_SECRET (random). Optional: APP_PASSWORD for the team admin login.
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
tmp="$(mktemp -d)"
cp -r "$here/public" "$here/functions" "$tmp/"
cat > "$tmp/wrangler.toml" <<'EOF'
name = "chroma-jam"
pages_build_output_dir = "./public"
compatibility_date = "2026-11-01"

[vars]
MODEL_URL = "https://team8-chroma-model.onrender.com"
MODEL_API_NAME = "predict"
# who can open the team dashboard /admin (chroma-jam usernames, comma-separated)
ADMINS = "aksster, boderoeck, bhavini"

[[d1_databases]]
binding = "DB"
database_name = "chroma-jam-db"
database_id = "820ad71a-8d3e-4db6-a01c-b46f77360c46"
EOF
cd "$tmp"
npx --prefix "$here" wrangler pages deploy public --project-name chroma-jam --branch main --commit-dirty=true
rm -rf "$tmp"
