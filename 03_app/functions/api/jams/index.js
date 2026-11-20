// GET  /api/jams                 -> {active: the jam I am in (or null), invites: jams my friends asked me to join}
// POST /api/jams {friends: [ids]} -> start a jam with up to 5 friends; I am the driver (my camera makes the music)
import { json, now } from "../../_lib/auth.js";
import { needAccount, areFriends, body } from "../../_lib/social.js";
import { MAX_PEOPLE, loadJam, endJam, jamState } from "../../_lib/jam.js";

export async function onRequestGet({ env, data }) {
  const no = needAccount(data.user); if (no) return no;
  const me = data.user.id;
  const active = await env.DB.prepare(
    "SELECT j.* FROM jams j JOIN jam_members m ON m.jam_id = j.id WHERE m.user_id = ? AND m.status = 'joined' AND j.ended_at IS NULL ORDER BY j.started_at DESC LIMIT 1",
  ).bind(me).first();
  const { results: invites } = await env.DB.prepare(
    `SELECT j.id, j.started_at, u.username AS driver_username, u.name AS driver_name,
            (SELECT COUNT(*) FROM jam_members x WHERE x.jam_id = j.id AND x.status = 'joined') AS listening
       FROM jam_members m JOIN jams j ON j.id = m.jam_id JOIN users u ON u.id = j.driver_id
      WHERE m.user_id = ? AND m.status = 'invited' AND j.ended_at IS NULL AND j.started_at > ?
      ORDER BY j.started_at DESC`,
  ).bind(me, new Date(Date.now() - 6 * 3600e3).toISOString()).all();
  return json({ active: active ? (await jamState(env, active, active.seq)).jam : null, invites, now: Date.now() });
}

export async function onRequestPost({ request, env, data }) {
  const no = needAccount(data.user); if (no) return no;
  const me = data.user.id;
  const ids = [...new Set((await body(request)).friends || [])].filter((id) => id && id !== me);
  if (!ids.length) return json({ error: "Pick at least one friend." }, 400);
  if (ids.length > MAX_PEOPLE - 1) return json({ error: `A jam is up to ${MAX_PEOPLE} people: pick at most ${MAX_PEOPLE - 1} friends.` }, 400);
  for (const id of ids) if (!(await areFriends(env, me, id))) return json({ error: "You can only jam with friends." }, 403);

  // one jam at a time: leave (or end, if I drive) the one I am in
  const { results: mine } = await env.DB.prepare(
    "SELECT j.* FROM jams j JOIN jam_members m ON m.jam_id = j.id WHERE m.user_id = ? AND m.status = 'joined' AND j.ended_at IS NULL",
  ).bind(me).all();
  for (const j of mine) {
    if (j.driver_id === me) await endJam(env, j, "ended");
    else await env.DB.prepare("UPDATE jam_members SET status = 'left', left_at = ? WHERE jam_id = ? AND user_id = ?").bind(now(), j.id, me).run();
  }

  const id = crypto.randomUUID(), t = now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO jams (id, created_by, driver_id, started_at, seq) VALUES (?, ?, ?, ?, 0)").bind(id, me, me, t),
    env.DB.prepare("INSERT INTO jam_members (jam_id, user_id, status, invited_at, joined_at, last_seen) VALUES (?, ?, 'joined', ?, ?, ?)").bind(id, me, t, t, t),
    ...ids.map((u) => env.DB.prepare("INSERT INTO jam_members (jam_id, user_id, status, invited_at) VALUES (?, ?, 'invited', ?)").bind(id, u, t)),
  ]);
  return json(await jamState(env, await loadJam(env, id)), 201);
}
