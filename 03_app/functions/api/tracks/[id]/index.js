// GET    /api/tracks/<id> -> one track (its recipe), if I may hear it
// DELETE /api/tracks/<id> -> delete my track (it also leaves every playlist)
import { json } from "../../../_lib/auth.js";
import { needAccount } from "../../../_lib/social.js";
import { canHear, trackOut } from "../../../_lib/tracks.js";

export async function onRequestGet({ params, env, data }) {
  const no = needAccount(data.user); if (no) return no;
  if (!(await canHear(env, params.id, data.user.id))) return json({ error: "No such track." }, 404);
  const t = await env.DB.prepare(
    "SELECT t.id, t.title, t.source, t.genre, t.music_key, t.bpm, t.persona, t.seconds, t.audio_type, t.created_at, t.card, u.username AS owner_username FROM tracks t JOIN users u ON u.id = t.owner_id WHERE t.id = ?",
  ).bind(params.id).first();
  return json(trackOut(t));
}

export async function onRequestDelete({ params, env, data }) {
  const no = needAccount(data.user); if (no) return no;
  const t = await env.DB.prepare("SELECT id FROM tracks WHERE id = ? AND owner_id = ?").bind(params.id, data.user.id).first();
  if (!t) return json({ error: "No such track." }, 404);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM playlist_tracks WHERE track_id = ?").bind(t.id),
    env.DB.prepare("DELETE FROM tracks WHERE id = ?").bind(t.id),
  ]);
  return json({ ok: true });
}
