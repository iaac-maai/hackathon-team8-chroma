// GET /api/live: my last live views (one row per camera frame of a walk), newest first, with the 8-colour
// gradient so the page can draw the walk as a colour strip. Jams I was in count too, whoever drove.
// The team login (admin) sees everyone's.
import { isAdmin } from "../_lib/auth.js";

export async function onRequestGet({ env, data }) {
  const admin = isAdmin(data.user);
  const q = env.DB.prepare(
    `SELECT id, created_at, place, place_confidence, time, season, warmth, brightness, persona, jam_id,
            json_extract(card, '$.gradient') AS gradient FROM live_views
      ${admin ? "" : "WHERE user_id = ?1 OR jam_id IN (SELECT jam_id FROM jam_members WHERE user_id = ?1 AND joined_at IS NOT NULL)"}
      ORDER BY created_at DESC LIMIT 200`,
  );
  const { results } = await (admin ? q : q.bind(data.user.id)).all();
  return Response.json(results.map((r) => ({ ...r, gradient: r.gradient ? JSON.parse(r.gradient) : [] })));
}
