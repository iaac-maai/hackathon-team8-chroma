// GET  /api/friends            -> {friends, incoming, outgoing}; each friend with unread messages and when last seen
// POST /api/friends {username} -> ask that person to be friends (if they already asked you, you are friends now)
import { json, now, cleanUsername } from "../../_lib/auth.js";
import { needAccount, friendship, body } from "../../_lib/social.js";

export async function onRequestGet({ env, data }) {
  const no = needAccount(data.user); if (no) return no;
  const me = data.user.id;
  const { results } = await env.DB.prepare(
    `SELECT f.id, f.status, f.created_at, f.responded_at, f.requester_id, u.id AS uid, u.username, u.name, u.last_seen,
            (SELECT COUNT(*) FROM messages m WHERE m.from_id = u.id AND m.to_id = ?1 AND m.read_at IS NULL) AS unread
       FROM friendships f JOIN users u ON u.id = CASE WHEN f.requester_id = ?1 THEN f.addressee_id ELSE f.requester_id END
      WHERE f.requester_id = ?1 OR f.addressee_id = ?1
      ORDER BY u.username`,
  ).bind(me).all();
  const person = (r) => ({ id: r.uid, username: r.username, name: r.name || r.username, last_seen: r.last_seen });
  return json({
    friends: results.filter((r) => r.status === "accepted").map((r) => ({ ...person(r), friendship: r.id, since: r.responded_at, unread: r.unread })),
    incoming: results.filter((r) => r.status === "pending" && r.requester_id !== me).map((r) => ({ ...person(r), friendship: r.id, asked: r.created_at })),
    outgoing: results.filter((r) => r.status === "pending" && r.requester_id === me).map((r) => ({ ...person(r), friendship: r.id, asked: r.created_at })),
  });
}

export async function onRequestPost({ request, env, data }) {
  const no = needAccount(data.user); if (no) return no;
  const me = data.user.id;
  const username = cleanUsername((await body(request)).username);
  if (!username) return json({ error: "Type a username." }, 400);
  const other = await env.DB.prepare("SELECT id, username, name FROM users WHERE username = ?").bind(username).first();
  if (!other) return json({ error: `Nobody is called @${username}.` }, 404);
  if (other.id === me) return json({ error: "That is you." }, 400);
  const f = await friendship(env, me, other.id);
  if (f?.status === "accepted") return json({ ok: true, status: "accepted", message: `You and @${other.username} are already friends.` });
  if (f && f.requester_id === me) return json({ ok: true, status: "pending", message: `Already asked @${other.username}.` });
  if (f) { // they asked you first: accepting
    await env.DB.prepare("UPDATE friendships SET status = 'accepted', responded_at = ? WHERE id = ?").bind(now(), f.id).run();
    return json({ ok: true, status: "accepted", message: `You and @${other.username} are friends now.` });
  }
  await env.DB.prepare("INSERT INTO friendships (id, requester_id, addressee_id, status, created_at) VALUES (?, ?, ?, 'pending', ?)")
    .bind(crypto.randomUUID(), me, other.id, now()).run();
  return json({ ok: true, status: "pending", message: `Asked @${other.username}. You are friends once they accept.` }, 201);
}
