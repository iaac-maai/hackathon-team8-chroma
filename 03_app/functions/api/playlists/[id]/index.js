// GET    /api/playlists/<id> -> the playlist with its tracks (owner or a friend it is shared with), and who it is shared with
// DELETE /api/playlists/<id> -> delete my playlist (the tracks stay in my tracks)
import { json } from "../../../_lib/auth.js";
import { needAccount } from "../../../_lib/social.js";
import { canSeePlaylist, trackOut } from "../../../_lib/tracks.js";

export async function onRequestGet({ params, env, data }) {
  const no = needAccount(data.user); if (no) return no;
  const p = await canSeePlaylist(env, params.id, data.user.id);
  if (!p) return json({ error: "No such playlist." }, 404);
  const { results: tracks } = await env.DB.prepare(
    `SELECT t.id, t.title, t.source, t.genre, t.music_key, t.bpm, t.persona, t.seconds, t.audio_type, t.created_at, t.card, u.username AS owner_username
       FROM playlist_tracks pt JOIN tracks t ON t.id = pt.track_id JOIN users u ON u.id = t.owner_id
      WHERE pt.playlist_id = ? ORDER BY pt.position`,
  ).bind(p.id).all();
  const { results: shares } = await env.DB.prepare(
    "SELECT u.id, u.username, u.name FROM playlist_shares s JOIN users u ON u.id = s.user_id WHERE s.playlist_id = ? ORDER BY s.shared_at",
  ).bind(p.id).all();
  const owner = await env.DB.prepare("SELECT username FROM users WHERE id = ?").bind(p.owner_id).first();
  return json({ id: p.id, name: p.name, mine: !!p.mine, owner: owner?.username, tracks: tracks.map(trackOut), shared_with: p.mine ? shares : undefined });
}

export async function onRequestDelete({ params, env, data }) {
  const no = needAccount(data.user); if (no) return no;
  const p = await env.DB.prepare("SELECT id FROM playlists WHERE id = ? AND owner_id = ?").bind(params.id, data.user.id).first();
  if (!p) return json({ error: "No such playlist." }, 404);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM playlist_tracks WHERE playlist_id = ?").bind(p.id),
    env.DB.prepare("DELETE FROM playlist_shares WHERE playlist_id = ?").bind(p.id),
    env.DB.prepare("DELETE FROM playlists WHERE id = ?").bind(p.id),
  ]);
  return json({ ok: true });
}
