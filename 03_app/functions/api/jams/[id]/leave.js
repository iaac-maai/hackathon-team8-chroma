// POST /api/jams/<id>/leave -> stop listening; an invite I never joined is declined.
// If the driver leaves and someone else is still listening, the camera passes to them; if nobody is left, the jam ends.
import { json, now } from "../../../_lib/auth.js";
import { needAccount } from "../../../_lib/social.js";
import { loadJam, member, endJam, addEvent, notInJam } from "../../../_lib/jam.js";

export async function onRequestPost({ params, env, data }) {
  const no = needAccount(data.user); if (no) return no;
  const me = data.user.id, jam = await loadJam(env, params.id);
  if (!jam) return json({ error: "No such jam." }, 404);
  const m = await member(env, jam.id, me);
  if (!m) return notInJam();
  await env.DB.prepare("UPDATE jam_members SET status = ?3, left_at = ?4 WHERE jam_id = ?1 AND user_id = ?2")
    .bind(jam.id, me, m.status === "invited" ? "declined" : "left", now()).run();
  if (!jam.ended_at && jam.driver_id === me) {
    const next = await env.DB.prepare("SELECT user_id FROM jam_members WHERE jam_id = ? AND status = 'joined' ORDER BY last_seen DESC LIMIT 1").bind(jam.id).first();
    if (next) {
      await env.DB.prepare("UPDATE jams SET driver_id = ? WHERE id = ?").bind(next.user_id, jam.id).run();
      await addEvent(env, jam, "driver", me, { driver: next.user_id, reason: "the driver left" });
    } else await endJam(env, jam, "ended");
  } else if (!jam.ended_at) {
    const left = await env.DB.prepare("SELECT COUNT(*) AS n FROM jam_members WHERE jam_id = ? AND status = 'joined'").bind(jam.id).first();
    if (!left.n) await endJam(env, jam, "ended");
  }
  return json({ ok: true });
}
