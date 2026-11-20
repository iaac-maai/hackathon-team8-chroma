// GET  /api/playlists        -> {mine, shared}: my playlists and the ones friends shared with me (with track counts)
// POST /api/playlists {name} -> a new playlist of mine
import { json, now } from "../../_lib/auth.js";
import { needAccount, body } from "../../_lib/social.js";

export async function onRequestGet({ env, data }) {
  const no = needAccount(data.user); if (no) return no;
  const me = data.user.id;
  const count = "(SELECT COUNT(*) FROM playlist_tracks pt WHERE pt.playlist_id = p.id) AS tracks";
  const { results: mine } = await env.DB.prepare(
    `SELECT p.id, p.name, p.created_at, ${count}, (SELECT COUNT(*) FROM playlist_shares s WHERE s.playlist_id = p.id) AS shared_with
       FROM playlists p WHERE p.owner_id = ? ORDER BY p.created_at DESC`,
  ).bind(me).all();
  const { results: shared } = await env.DB.prepare(
    `SELECT p.id, p.name, p.created_at, ${count}, u.username AS owner FROM playlist_shares s JOIN playlists p ON p.id = s.playlist_id
       JOIN users u ON u.id = p.owner_id WHERE s.user_id = ? ORDER BY s.shared_at DESC`,
  ).bind(me).all();
  return json({ mine, shared });
}

export async function onRequestPost({ request, env, data }) {
  const no = needAccount(data.user); if (no) return no;
  const name = String((await body(request)).name || "").trim().slice(0, 60);
  if (!name) return json({ error: "Give the playlist a name." }, 400);
  const p = { id: crypto.randomUUID(), name, created_at: now() };
  await env.DB.prepare("INSERT INTO playlists (id, owner_id, name, created_at) VALUES (?, ?, ?, ?)").bind(p.id, data.user.id, p.name, p.created_at).run();
  return json(p, 201);
}
