-- Saved tracks, playlists, sharing (20 November). Run once on the live database:
--   npx wrangler d1 execute chroma-jam-db --remote --file=migrations/0004_tracks_playlists.sql
-- A track keeps two things: its recipe (the scene card, ~2 KB: the music can be made again from it) and a small
-- compressed recording of what was heard (Opus or AAC, ~32 kbit/s: about 40 KB for 10 s), never a WAV.

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

-- A track sent in a chat message
ALTER TABLE messages ADD COLUMN track_id TEXT;
