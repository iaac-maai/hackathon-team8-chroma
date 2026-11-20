// GET  /api/messages?with=<user id>&since=<ISO time> -> the chat with one friend (last 100), oldest first;
//                                                      messages to me are marked as read
// POST /api/messages {to, body, track_id?}            -> send a message to a friend (up to 1000 characters),
//                                                      optionally with one of my saved tracks
import { json, now } from "../_lib/auth.js";
import { needAccount, areFriends, body as readBody } from "../_lib/social.js";

export async function onRequestGet({ request, env, data }) {
  const no = needAccount(data.user); if (no) return no;
  const me = data.user.id, url = new URL(request.url), other = url.searchParams.get("with");
  if (!other || !(await areFriends(env, me, other))) return json({ error: "You can only chat with friends." }, 403);
  const since = url.searchParams.get("since") || "";
  const { results } = await env.DB.prepare(
    `SELECT * FROM (SELECT m.id, m.from_id, m.to_id, m.body, m.created_at, m.read_at, m.track_id,
              t.title AS track_title, t.genre AS track_genre, t.audio_type AS track_audio
         FROM messages m LEFT JOIN tracks t ON t.id = m.track_id
       WHERE ((m.from_id = ?1 AND m.to_id = ?2) OR (m.from_id = ?2 AND m.to_id = ?1)) AND m.created_at > ?3
       ORDER BY m.created_at DESC LIMIT 100) ORDER BY created_at`,
  ).bind(me, other, since).all();
  await env.DB.prepare("UPDATE messages SET read_at = ?3 WHERE from_id = ?2 AND to_id = ?1 AND read_at IS NULL").bind(me, other, now()).run();
  return json({ messages: results.map(({ track_id, track_title, track_genre, track_audio, ...m }) => ({ ...m, mine: m.from_id === me,
    track: track_id && track_title ? { id: track_id, title: track_title, genre: track_genre, has_audio: !!track_audio } : null })), now: now() });
}

export async function onRequestPost({ request, env, data }) {
  const no = needAccount(data.user); if (no) return no;
  const b = await readBody(request);
  const to = String(b.to || ""), trackId = b.track_id ? String(b.track_id) : null;
  let text = String(b.body || "").trim().slice(0, 1000);
  if (!(await areFriends(env, data.user.id, to))) return json({ error: "You can only chat with friends." }, 403);
  let track = null;
  if (trackId) {
    track = await env.DB.prepare("SELECT id, title, genre, audio_type FROM tracks WHERE id = ? AND owner_id = ?").bind(trackId, data.user.id).first();
    if (!track) return json({ error: "You can only send your own saved tracks." }, 404);
    if (!text) text = `♪ ${track.title}`;
  }
  if (!text) return json({ error: "Write something first." }, 400);
  const m = { id: crypto.randomUUID(), from_id: data.user.id, to_id: to, body: text, created_at: now() };
  await env.DB.prepare("INSERT INTO messages (id, from_id, to_id, body, created_at, track_id) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(m.id, m.from_id, m.to_id, m.body, m.created_at, track?.id ?? null).run();
  return json({ ...m, mine: true, track: track ? { id: track.id, title: track.title, genre: track.genre, has_audio: !!track.audio_type } : null }, 201);
}
