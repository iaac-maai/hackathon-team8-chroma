// Saved tracks and playlists: who may hear what.
// A track is heard by its owner, by a friend it was sent to in chat, and by friends a playlist holding it is shared with.
export const MAX_AUDIO = 400 * 1024;            // compressed audio only (Opus/AAC at ~32 kbit/s is ~40 KB per 10 s)
export const MAX_SHARES = 10;                   // a playlist is shared with up to 10 friends
export const AUDIO_TYPES = /^audio\/(webm|ogg|mp4|aac|mpeg)/;

export async function canHear(env, trackId, userId) {
  const r = await env.DB.prepare(
    `SELECT 1 FROM tracks t WHERE t.id = ?1 AND (
        t.owner_id = ?2
        OR EXISTS (SELECT 1 FROM messages m WHERE m.track_id = t.id AND m.to_id = ?2)
        OR EXISTS (SELECT 1 FROM playlist_tracks pt JOIN playlist_shares ps ON ps.playlist_id = pt.playlist_id
                    WHERE pt.track_id = t.id AND ps.user_id = ?2))`,
  ).bind(trackId, userId).first();
  return !!r;
}
export async function canSeePlaylist(env, playlistId, userId) {
  return env.DB.prepare(
    "SELECT p.*, (p.owner_id = ?2) AS mine FROM playlists p WHERE p.id = ?1 AND (p.owner_id = ?2 OR EXISTS (SELECT 1 FROM playlist_shares s WHERE s.playlist_id = p.id AND s.user_id = ?2))",
  ).bind(playlistId, userId).first();
}
// a track as the page sees it (never the audio bytes; those come from /api/tracks/<id>/audio)
export const trackOut = (t) => ({ id: t.id, title: t.title, source: t.source, genre: t.genre, key: t.music_key, bpm: t.bpm,
  persona: t.persona, seconds: t.seconds, has_audio: !!t.audio_type, created_at: t.created_at, owner: t.owner_username ?? undefined,
  card: t.card ? JSON.parse(t.card) : undefined });
