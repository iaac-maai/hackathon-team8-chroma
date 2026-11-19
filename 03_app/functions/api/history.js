// GET /api/history: the 30 most recent scenes, read from D1 (with their scene cards, to play them again)
export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(
    "SELECT id, created_at, file_name, place, time, season, warmth, brightness, persona, card FROM scenes ORDER BY created_at DESC LIMIT 30",
  ).all();
  return Response.json(results.map((r) => ({ ...r, card: JSON.parse(r.card) })));
}
