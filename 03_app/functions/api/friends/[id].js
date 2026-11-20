// POST   /api/friends/<friendship id> -> accept a request someone sent you
// DELETE /api/friends/<friendship id> -> decline a request, take back your own, or stop being friends
import { json, now } from "../../_lib/auth.js";
import { needAccount } from "../../_lib/social.js";

async function mine(env, id, me) {
  return env.DB.prepare("SELECT * FROM friendships WHERE id = ?1 AND (requester_id = ?2 OR addressee_id = ?2)").bind(id, me).first();
}

export async function onRequestPost({ params, env, data }) {
  const no = needAccount(data.user); if (no) return no;
  const f = await mine(env, params.id, data.user.id);
  if (!f) return json({ error: "No such request." }, 404);
  if (f.addressee_id !== data.user.id) return json({ error: "Only the person who was asked can accept." }, 403);
  if (f.status !== "accepted") await env.DB.prepare("UPDATE friendships SET status = 'accepted', responded_at = ? WHERE id = ?").bind(now(), f.id).run();
  return json({ ok: true, status: "accepted" });
}

export async function onRequestDelete({ params, env, data }) {
  const no = needAccount(data.user); if (no) return no;
  const f = await mine(env, params.id, data.user.id);
  if (!f) return json({ error: "No such friend." }, 404);
  await env.DB.prepare("DELETE FROM friendships WHERE id = ?").bind(f.id).run();
  return json({ ok: true });
}
