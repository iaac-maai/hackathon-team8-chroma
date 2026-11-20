// POST /api/jams/<id>/end -> the driver (or whoever started it) ends the jam for everyone
import { json } from "../../../_lib/auth.js";
import { needAccount } from "../../../_lib/social.js";
import { loadJam, endJam } from "../../../_lib/jam.js";

export async function onRequestPost({ params, env, data }) {
  const no = needAccount(data.user); if (no) return no;
  const jam = await loadJam(env, params.id);
  if (!jam) return json({ error: "No such jam." }, 404);
  if (jam.driver_id !== data.user.id && jam.created_by !== data.user.id) return json({ error: "Only the driver can end the jam. You can leave it." }, 403);
  await endJam(env, jam, "ended");
  return json({ ok: true });
}
