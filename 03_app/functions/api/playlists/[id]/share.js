// POST /api/playlists/<id>/share {friends: [ids]} -> share my playlist with these friends (replaces the list; up to 10)
import { json, now } from "../../../_lib/auth.js";
import { needAccount, areFriends, body } from "../../../_lib/social.js";
import { MAX_SHARES } from "../../../_lib/tracks.js";

export async function onRequestPost({ request, params, env, data }) {
  const no = needAccount(data.user); if (no) return no;
  const me = data.user.id;
  const p = await env.DB.prepare("SELECT id FROM playlists WHERE id = ? AND owner_id = ?").bind(params.id, me).first();
  if (!p) return json({ error: "No such playlist." }, 404);
  const ids = [...new Set((await body(request)).friends || [])].filter((x) => x && x !== me);
  if (ids.length > MAX_SHARES) return json({ error: `Share with up to ${MAX_SHARES} friends.` }, 400);
  for (const id of ids) if (!(await areFriends(env, me, id))) return json({ error: "You can only share with friends." }, 403);
  const t = now();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM playlist_shares WHERE playlist_id = ?").bind(p.id),
    ...ids.map((id) => env.DB.prepare("INSERT INTO playlist_shares (playlist_id, user_id, shared_at) VALUES (?, ?, ?)").bind(p.id, id, t)),
  ]);
  return json({ ok: true, shared_with: ids.length });
}
