// GET  /api/tracks -> my saved tracks, newest first (no audio bytes)
// POST /api/tracks (multipart: card = scene card JSON, title, source, genre, key, bpm, seconds, audio = small compressed file)
//      -> save a track: its recipe and, if sent, a compressed recording (WAV is refused: too big)
import { json, now } from "../../_lib/auth.js";
import { needAccount } from "../../_lib/social.js";
import { personaFrom } from "../../_lib/persona.js";
import { MAX_AUDIO, AUDIO_TYPES, trackOut } from "../../_lib/tracks.js";

export async function onRequestGet({ env, data }) {
  const no = needAccount(data.user); if (no) return no;
  const { results } = await env.DB.prepare(
    "SELECT id, title, source, genre, music_key, bpm, persona, seconds, audio_type, created_at, card FROM tracks WHERE owner_id = ? ORDER BY created_at DESC LIMIT 100",
  ).bind(data.user.id).all();
  return json(results.map(trackOut));
}

export async function onRequestPost({ request, env, data }) {
  const no = needAccount(data.user); if (no) return no;
  const form = await request.formData().catch(() => null);
  if (!form) return json({ error: "Send the track as a form." }, 400);
  let card;
  try { card = JSON.parse(String(form.get("card") || "")); } catch { return json({ error: "The scene card is missing." }, 400); }
  if (!card || !Array.isArray(card.stops) || JSON.stringify(card).length > 24000) return json({ error: "That scene card does not look right." }, 400);
  const source = ["photo", "walk", "jam"].includes(form.get("source")) ? form.get("source") : "photo";
  const title = String(form.get("title") || "").trim().slice(0, 80) || "A place";
  let audio = null, audioType = null;
  const file = form.get("audio");
  if (file && typeof file !== "string" && file.size) {
    const type = (file.type || "").toLowerCase();
    if (!AUDIO_TYPES.test(type)) return json({ error: "Save the sound as a small compressed file (Opus/AAC), not WAV." }, 415);
    if (file.size > MAX_AUDIO) return json({ error: "The sound file is too big (max 400 KB)." }, 413);
    audio = new Uint8Array(await file.arrayBuffer()); audioType = type;
  }
  const t = { id: crypto.randomUUID(), created_at: now() };
  const num = (k) => (Number.isFinite(Number(form.get(k))) && form.get(k) !== null && form.get(k) !== "" ? Number(form.get(k)) : null);
  await env.DB.prepare(
    "INSERT INTO tracks (id, owner_id, title, source, card, genre, music_key, bpm, persona, audio, audio_type, seconds, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(t.id, data.user.id, title, source, JSON.stringify(card), String(form.get("genre") || "").slice(0, 40) || null,
         String(form.get("key") || "").slice(0, 24) || null, num("bpm") ? Math.round(num("bpm")) : null, personaFrom(request),
         audio, audioType, num("seconds"), t.created_at).run();
  return json({ id: t.id, title, source, has_audio: !!audio, bytes: audio?.length ?? 0 }, 201);
}
