// POST /api/jams/<id>/takeover -> my camera makes the music now. The old driver keeps listening.
import { json } from "../../../_lib/auth.js";
import { needAccount } from "../../../_lib/social.js";
import { loadJam, member, addEvent, jamOver, notInJam } from "../../../_lib/jam.js";

export async function onRequestPost({ params, env, data }) {
  const no = needAccount(data.user); if (no) return no;
  const me = data.user.id, jam = await loadJam(env, params.id);
  if (!jam) return json({ error: "No such jam." }, 404);
  if (jam.ended_at) return jamOver();
  const m = await member(env, jam.id, me);
  if (m?.status !== "joined") return notInJam();
  if (jam.driver_id === me) return json({ ok: true, driver: me });
  const from = jam.driver_id;
  await env.DB.prepare("UPDATE jams SET driver_id = ? WHERE id = ?").bind(me, jam.id).run();
  return json(await addEvent(env, jam, "driver", me, { driver: me, from }), 201);
}
