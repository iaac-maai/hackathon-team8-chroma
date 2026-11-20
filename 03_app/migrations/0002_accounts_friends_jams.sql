-- Accounts, friends, chat and jams (19 November). Run once on a database made before this:
--   npx wrangler d1 execute chroma-db --remote --file=migrations/0002_accounts_friends_jams.sql
-- (schema.sql already contains everything below for a new database.)

ALTER TABLE scenes ADD COLUMN user_id TEXT;       -- who read this photo (users.id, or "team")
ALTER TABLE live_views ADD COLUMN user_id TEXT;   -- who walked (the driver, in a jam)
ALTER TABLE live_views ADD COLUMN jam_id TEXT;    -- set when the view was part of a jam

CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,                  -- random UUID
  username    TEXT NOT NULL UNIQUE,              -- lowercase, 3-20 letters, digits, _ or . (how friends find you)
  email       TEXT NOT NULL UNIQUE,              -- lowercase
  name        TEXT,                              -- shown to friends (optional)
  pass_hash   TEXT NOT NULL,                     -- PBKDF2-SHA256, never the password itself
  pass_salt   TEXT NOT NULL,
  created_at  TEXT NOT NULL,                     -- when they signed up
  last_seen   TEXT,                              -- last request while logged in (about once a minute)
  login_count INTEGER NOT NULL DEFAULT 0
);

-- One row per login attempt, so we know who came in and when (and spot guessing)
CREATE TABLE IF NOT EXISTS logins (
  id          TEXT PRIMARY KEY,
  user_id     TEXT,                              -- null when the name was not found
  identifier  TEXT,                              -- what was typed (username or email), lowercase
  ok          INTEGER NOT NULL,                  -- 1 = logged in, 0 = wrong password
  at          TEXT NOT NULL
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
