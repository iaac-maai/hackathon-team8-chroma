-- One row per photo. No R2 (it needs a card on the account): the small photo lives in the row.
-- Run with: npx wrangler d1 execute chroma-db --remote --file=schema.sql
-- A database made before the persona column: run migrations/0001_persona.sql once
CREATE TABLE IF NOT EXISTS scenes (
  id          TEXT PRIMARY KEY,               -- a random id (crypto.randomUUID)
  created_at  TEXT NOT NULL,                  -- ISO date and time, UTC
  photo       BLOB NOT NULL,                  -- the photo, made small in the browser (512 px JPEG, ~50 KB)
  photo_type  TEXT NOT NULL,                  -- e.g. image/jpeg
  file_name   TEXT,                           -- the name of the uploaded file
  place       TEXT,                           -- green, street, transit, club, market, waterfront, square
  time        TEXT,                           -- day, golden hour, night
  season      TEXT,
  warmth      REAL,                           -- -1 cool .. 1 warm
  brightness  REAL,                           -- 0 .. 1
  persona     TEXT,                           -- listener type: mellow, unpretentious, sophisticated, intense, contemporary (null = none)
  card        TEXT NOT NULL                   -- the full scene card (JSON) that the music is made from
);

CREATE INDEX IF NOT EXISTS idx_scenes_created_at ON scenes (created_at);

-- One row per view of a live walk (a camera frame every 3.5-10 s). Only the scene card, no photo:
-- a walk makes hundreds of frames, and the music only needs the card.
CREATE TABLE IF NOT EXISTS live_views (
  id                TEXT PRIMARY KEY,
  created_at        TEXT NOT NULL,
  place             TEXT,
  place_confidence  REAL,
  time              TEXT,
  season            TEXT,
  warmth            REAL,
  brightness        REAL,
  persona           TEXT,                     -- listener type, as in scenes
  card              TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_live_views_created_at ON live_views (created_at);
