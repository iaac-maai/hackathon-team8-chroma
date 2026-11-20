// POST   /api/playlists/<id>/tracks {track_id}   -> add one of my tracks to my playlist (at the end)
// DELETE /api/playlists/<id>/tracks?track=<id>    -> take it out again
import { json, now } from "../../../_lib/auth.js";
import { needAccount, body } from "../../../_lib/social.js";

const mine = (env, id, me) => env.DB.prepare("SELECT id FROM playlists WHERE id = ? AND owner_id = ?").bind(id, me).first();

export async function onRequestPost({ request, params, env, data }) {
  const no = needAccount(data.user); if (no) return no;
  const p = await mine(env, params.id, data.user.id);
  if (!p) return json({ error: "No such playlist." }, 404);
  const trackId = String((await body(request)).track_id || "");
  const t = await env.DB.prepare("SELECT id FROM tracks WHERE id = ? AND owner_id = ?").bind(trackId, data.user.id).first();
  if (!t) return json({ error: "You can only add your own saved tracks." }, 404);
  const n = await env.DB.prepare("SELECT COALESCE(MAX(position), 0) + 1 AS next, COUNT(*) AS c FROM playlist_tracks WHERE playlist_id = ?").bind(p.id).first();
  if (n.c >= 200) return json({ error: "A playlist holds up to 200 tracks." }, 400);
  await env.DB.prepare("INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position, added_at) VALUES (?, ?, ?, ?)").bind(p.id, t.id, n.next, now()).run();
  return json({ ok: true }, 201);
}

export async function onRequestDelete({ request, params, env, data }) {
  const no = needAccount(data.user); if (no) return no;
  const p = await mine(env, params.id, data.user.id);
  if (!p) return json({ error: "No such playlist." }, 404);
  await env.DB.prepare("DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?").bind(p.id, new URL(request.url).searchParams.get("track") || "").run();
  return json({ ok: true });
}
