// POST /api/jams/<id>/join -> accept the invite and start listening (leaves any other jam I am in)
import { json, now } from "../../../_lib/auth.js";
import { needAccount } from "../../../_lib/social.js";
import { loadJam, member, endJam, jamState, notInJam, jamOver } from "../../../_lib/jam.js";

export async function onRequestPost({ params, env, data }) {
  const no = needAccount(data.user); if (no) return no;
  const me = data.user.id, jam = await loadJam(env, params.id);
  if (!jam) return json({ error: "No such jam." }, 404);
  if (jam.ended_at) return jamOver();
  const m = await member(env, jam.id, me);
  if (!m) return notInJam();
  const { results: others } = await env.DB.prepare(
    "SELECT j.* FROM jams j JOIN jam_members x ON x.jam_id = j.id WHERE x.user_id = ? AND x.status = 'joined' AND j.ended_at IS NULL AND j.id <> ?",
  ).bind(me, jam.id).all();
  for (const j of others) {
    if (j.driver_id === me) await endJam(env, j, "ended");
    else await env.DB.prepare("UPDATE jam_members SET status = 'left', left_at = ? WHERE jam_id = ? AND user_id = ?").bind(now(), j.id, me).run();
  }
  const t = now();
  await env.DB.prepare("UPDATE jam_members SET status = 'joined', joined_at = COALESCE(joined_at, ?2), left_at = NULL, last_seen = ?2 WHERE jam_id = ?1 AND user_id = ?3")
    .bind(jam.id, t, me).run();
  return json(await jamState(env, jam, 0));
}
