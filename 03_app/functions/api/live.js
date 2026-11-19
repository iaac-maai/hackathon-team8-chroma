// GET /api/live: the last live views (one row per camera frame of a walk), newest first,
// with the 8-colour gradient so the page can draw the walk as a colour strip.
export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(
    "SELECT id, created_at, place, place_confidence, time, season, warmth, brightness, persona, json_extract(card, '$.gradient') AS gradient FROM live_views ORDER BY created_at DESC LIMIT 200",
  ).all();
  return Response.json(results.map((r) => ({ ...r, gradient: r.gradient ? JSON.parse(r.gradient) : [] })));
}
