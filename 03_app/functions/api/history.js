// GET /api/history: my 30 most recent photos, read from D1 (with their scene cards, to play them again).
// The team login (admin) sees everyone's.
import { isAdmin } from "../_lib/auth.js";

export async function onRequestGet({ env, data }) {
  const admin = isAdmin(data.user);
  const q = env.DB.prepare(
    `SELECT id, created_at, file_name, place, time, season, warmth, brightness, persona, card FROM scenes
      ${admin ? "" : "WHERE user_id = ?1"} ORDER BY created_at DESC LIMIT 30`,
  );
  const { results } = await (admin ? q : q.bind(data.user.id)).all();
  return Response.json(results.map((r) => ({ ...r, card: JSON.parse(r.card) })));
}
