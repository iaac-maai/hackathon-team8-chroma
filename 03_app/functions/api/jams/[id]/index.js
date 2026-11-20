// GET /api/jams/<id>?since=<seq> -> the jam now: people, driver, events after <seq>, the newest view, the server clock.
// Every phone in the jam calls this about once a second; that is also how the server knows who is still here.
import { json, now } from "../../../_lib/auth.js";
import { needAccount } from "../../../_lib/social.js";
import { loadJam, member, endJam, jamState, notInJam, GONE_MS } from "../../../_lib/jam.js";

export async function onRequestGet({ request, params, env, data }) {
  const no = needAccount(data.user); if (no) return no;
  const jam = await loadJam(env, params.id);
  if (!jam) return json({ error: "No such jam." }, 404);
  const m = await member(env, jam.id, data.user.id);
  if (!m) return notInJam();
  if (m.status === "joined" && !jam.ended_at) {
    await env.DB.prepare("UPDATE jam_members SET last_seen = ? WHERE jam_id = ? AND user_id = ?").bind(now(), jam.id, data.user.id).run();
    // the driver has gone quiet: end the jam (anyone could have taken over before)
    const driver = await member(env, jam.id, jam.driver_id);
    if (driver?.last_seen && Date.now() - Date.parse(driver.last_seen) > GONE_MS) await endJam(env, jam, "driver left");
  }
  const since = Number(new URL(request.url).searchParams.get("since") || 0);
  return json({ ...(await jamState(env, jam, since)), me: { status: m.status } });
}
