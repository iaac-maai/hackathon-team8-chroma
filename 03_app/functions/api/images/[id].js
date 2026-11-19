// GET /api/images/<id>: the small photo, read back from its D1 row (behind the password like everything else)
export async function onRequestGet({ params, env }) {
  const row = await env.DB.prepare("SELECT photo, photo_type FROM scenes WHERE id = ?").bind(params.id).first();
  if (!row) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(new Uint8Array(row.photo), {
    headers: { "Content-Type": row.photo_type, "Cache-Control": "private, max-age=86400" },
  });
}
