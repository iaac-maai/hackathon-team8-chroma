-- One row per photo. No R2 (it needs a card on the account): the small photo lives in the row.
-- Run with: npx wrangler d1 execute chroma-db --remote --file=schema.sql
-- A database made before the persona column: run migrations/0001_persona.sql once;
-- before accounts, friends and jams: migrations/0002_accounts_friends_jams.sql
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
  user_id     TEXT,                           -- who read this photo (users.id, or "team")
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
  user_id           TEXT,                     -- who walked (the driver, in a jam)
  jam_id            TEXT,                     -- set when the view was part of a jam
  card              TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_live_views_created_at ON live_views (created_at);

-- ── accounts, friends, chat and jams ──
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,                  -- random UUID
  username    TEXT NOT NULL UNIQUE,              -- lowercase, 3-20 letters, digits, _ or . (how friends find you)
  email       TEXT NOT NULL UNIQUE,              -- lowercase
  name        TEXT,                              -- shown to friends (optional)
  pass_hash   TEXT NOT NULL,                     -- PBKDF2-SHA256, never the password itself
  pass_salt   TEXT NOT NULL,
  created_at  TEXT NOT NULL,                     -- when they signed up
  last_seen   TEXT,                              -- last request while logged in (about once a minute)
  login_count INTEGER NOT NULL DEFAULT 0,
  country     TEXT,                              -- ISO country code from Cloudflare (latest seen), never the IP
  timezone    TEXT,                              -- IANA time zone from Cloudflare (latest seen)
  area_lat    REAL,                              -- rough area: latitude rounded to whole degrees (~100 km)
  area_lon    REAL                               -- rough area: longitude rounded to whole degrees
);

-- One row per login attempt, so we know who came in and when (and spot guessing)
CREATE TABLE IF NOT EXISTS logins (
  id          TEXT PRIMARY KEY,
  user_id     TEXT,                              -- null when the name was not found
  identifier  TEXT,                              -- what was typed (username or email), lowercase
  ok          INTEGER NOT NULL,                  -- 1 = logged in, 0 = wrong password
  at          TEXT NOT NULL,
  country     TEXT                               -- where the attempt came from (ISO code)
);
CREATE INDEX IF NOT EXISTS idx_logins_user ON logins (user_id, at);

-- Friends: one row per pair. The requester asks, the other accepts.
CREATE TABLE IF NOT EXISTS friendships (
  id            TEXT PRIMARY KEY,
  requester_id  TEXT NOT NULL,
  addressee_id  TEXT NOT NULL,
  status        TEXT NOT NULL,                   -- pending | accepted
  created_at    TEXT NOT NULL,
  responded_at  TEXT,
  UNIQUE (requester_id, addressee_id)
);
CREATE INDEX IF NOT EXISTS idx_friend_addressee ON friendships (addressee_id, status);

-- Chat between friends
CREATE TABLE IF NOT EXISTS messages (
  id          TEXT PRIMARY KEY,
  from_id     TEXT NOT NULL,
  to_id       TEXT NOT NULL,
  body        TEXT NOT NULL,                     -- up to 1000 characters
  track_id    TEXT,                              -- a saved track sent with the message
  created_at  TEXT NOT NULL,
  read_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_messages_pair ON messages (from_id, to_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_to ON messages (to_id, read_at);

-- A jam: up to 6 friends hear the same walk. Chroma's clock is the conductor.
CREATE TABLE IF NOT EXISTS jams (
  id          TEXT PRIMARY KEY,
  created_by  TEXT NOT NULL,                     -- who started it
  driver_id   TEXT NOT NULL,                     -- whose camera makes the music now
  started_at  TEXT NOT NULL,                     -- the shared beat starts here (server time)
  ended_at    TEXT,
  end_reason  TEXT,                              -- ended | driver left
  seq         INTEGER NOT NULL DEFAULT 0         -- number of the last event
);

-- Who was invited, who joined, who left
CREATE TABLE IF NOT EXISTS jam_members (
  jam_id      TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  status      TEXT NOT NULL,                     -- invited | joined | left | declined
  invited_at  TEXT NOT NULL,
  joined_at   TEXT,
  left_at     TEXT,
  last_seen   TEXT,                              -- last time this phone checked in
  PRIMARY KEY (jam_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_jam_members_user ON jam_members (user_id, status);

-- What every phone plays, and when: a new view, a tempo change, a new driver
CREATE TABLE IF NOT EXISTS jam_events (
  jam_id      TEXT NOT NULL,
  seq         INTEGER NOT NULL,
  type        TEXT NOT NULL,                     -- view | tempo | driver | end
  user_id     TEXT,                              -- who sent it
  at          TEXT NOT NULL,                     -- when the server received it
  apply_at    INTEGER NOT NULL,                  -- server time in ms when every phone applies it
  data        TEXT NOT NULL,                     -- JSON: {card, bpm, level, dna} or {driver}
  PRIMARY KEY (jam_id, seq)
);

-- ── saved tracks, playlists, sharing ──
CREATE TABLE IF NOT EXISTS tracks (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL,                 -- who saved it
  title       TEXT NOT NULL,                 -- e.g. "Street at golden hour"
  source      TEXT NOT NULL,                 -- photo | walk | jam
  card        TEXT NOT NULL,                 -- the scene card (JSON): the recipe of the music
  genre       TEXT,
  music_key   TEXT,
  bpm         INTEGER,
  persona     TEXT,                          -- listener type at the time
  audio       BLOB,                          -- the compressed recording (max 400 KB), or null
  audio_type  TEXT,                          -- e.g. audio/webm;codecs=opus or audio/mp4
  seconds     REAL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tracks_owner ON tracks (owner_id, created_at);

CREATE TABLE IF NOT EXISTS playlists (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL,
  name        TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_playlists_owner ON playlists (owner_id);

CREATE TABLE IF NOT EXISTS playlist_tracks (
  playlist_id TEXT NOT NULL,
  track_id    TEXT NOT NULL,
  position    INTEGER NOT NULL,
  added_at    TEXT NOT NULL,
  PRIMARY KEY (playlist_id, track_id)
);

-- A playlist shared with up to 10 friends (they can listen, not change it)
CREATE TABLE IF NOT EXISTS playlist_shares (
  playlist_id TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  shared_at   TEXT NOT NULL,
  PRIMARY KEY (playlist_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_playlist_shares_user ON playlist_shares (user_id);
