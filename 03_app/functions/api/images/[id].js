// GET /api/images/<id>: the small photo, read back from its D1 row. Only its owner (or the team admin) gets it.
import { isAdmin } from "../../_lib/auth.js";

export async function onRequestGet({ params, env, data }) {
  const admin = isAdmin(data.user);
  const q = env.DB.prepare(`SELECT photo, photo_type FROM scenes WHERE id = ?1${admin ? "" : " AND user_id = ?2"}`);
  const row = await (admin ? q.bind(params.id) : q.bind(params.id, data.user.id)).first();
  if (!row) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(new Uint8Array(row.photo), {
    headers: { "Content-Type": row.photo_type, "Cache-Control": "private, max-age=86400" },
  });
}
