// GET /api/tracks/<id>/audio -> the small compressed recording, if I may hear the track (?download=1 to save it)
import { json } from "../../../_lib/auth.js";
import { needAccount } from "../../../_lib/social.js";
import { canHear } from "../../../_lib/tracks.js";

export async function onRequestGet({ request, params, env, data }) {
  const no = needAccount(data.user); if (no) return no;
  if (!(await canHear(env, params.id, data.user.id))) return json({ error: "No such track." }, 404);
  const t = await env.DB.prepare("SELECT title, audio, audio_type FROM tracks WHERE id = ?").bind(params.id).first();
  if (!t?.audio) return json({ error: "This track has no recording; play it from its recipe." }, 404);
  const ext = t.audio_type.includes("mp4") || t.audio_type.includes("aac") ? "m4a" : t.audio_type.includes("ogg") ? "ogg" : "webm";
  const name = `chroma-${t.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "track"}.${ext}`;
  const download = new URL(request.url).searchParams.has("download");
  return new Response(new Uint8Array(t.audio), { headers: {
    "Content-Type": t.audio_type.split(";")[0], "Cache-Control": "private, max-age=86400",
    "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${name}"` } });
}
