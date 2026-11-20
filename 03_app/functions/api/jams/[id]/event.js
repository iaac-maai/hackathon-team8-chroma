// POST /api/jams/<id>/event {type: "view" | "tempo", card?, bpm, level, dna?} -> the driver tells everyone what to play.
// The answer says when (apply_at, server time in ms): the driver's own phone waits for that moment too,
// so all phones switch together.
import { json } from "../../../_lib/auth.js";
import { needAccount, body } from "../../../_lib/social.js";
import { loadJam, addEvent, jamOver } from "../../../_lib/jam.js";

const MAX_CARD = 24000; // a scene card is about 2 KB

export async function onRequestPost({ request, params, env, data }) {
  const no = needAccount(data.user); if (no) return no;
  const jam = await loadJam(env, params.id);
  if (!jam) return json({ error: "No such jam." }, 404);
  if (jam.ended_at) return jamOver();
  if (jam.driver_id !== data.user.id) return json({ error: "Only the driver's camera makes the music now." }, 409);
  const b = await body(request);
  const type = b.type === "tempo" ? "tempo" : "view";
  const bpm = Math.round(Number(b.bpm));
  const level = Math.max(1, Math.min(4, Math.round(Number(b.level) || 1)));
  if (!(bpm >= 30 && bpm <= 300)) return json({ error: "bpm must be between 30 and 300." }, 400);
  const out = { bpm, level };
  // the driver's walk (so every phone picks the same speed style) and beat grid (so every phone's beat lines up)
  if (b.walk && typeof b.walk === "object") {
    const w = b.walk;
    out.walk = { band: ["still", "walk", "run", "vehicle"].includes(w.band) ? w.band : "still", cadence: Number(w.cadence) || null,
      speed: Number.isFinite(Number(w.speed)) && w.speed !== null ? Number(w.speed) : null, moving: !!w.moving, fused: Number(w.fused) || 0,
      sources: Array.isArray(w.sources) ? w.sources.filter((s) => typeof s === "string").slice(0, 5) : [], source: String(w.source || "none").slice(0, 30), stillLong: !!w.stillLong };
  }
  if (b.grid && Number.isFinite(Number(b.grid.step)) && Number.isFinite(Number(b.grid.at))) out.grid = { step: Math.max(0, Math.round(b.grid.step)), at: Math.round(b.grid.at) };
  // no beat yet in this jam: this event starts it (step 0 at the shared moment)
  else if (!(await env.DB.prepare("SELECT 1 FROM jam_events WHERE jam_id = ? AND type IN ('view', 'tempo') LIMIT 1").bind(jam.id).first())) out.firstBeat = true;
  if (type === "view") {
    if (!b.card || typeof b.card !== "object" || !Array.isArray(b.card.stops)) return json({ error: "Send the scene card." }, 400);
    if (JSON.stringify(b.card).length > MAX_CARD) return json({ error: "The scene card is too big." }, 413);
    out.card = b.card; out.dna = String(b.dna || "").slice(0, 120);
  }
  return json(await addEvent(env, jam, type, data.user.id, out), 201);
}
