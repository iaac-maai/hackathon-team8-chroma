// GET /gradio_api/call/predict/{event_id}: read the model's answer for one live frame,
// add the visitor's listener type (persona cookie) to the scene card,
// save the card in D1 (table live_views, no photo: a walk makes a frame every few seconds),
// and pass the answer on in the same Gradio format so the live player can make the music.
// ?jam=<id>: the view belongs to that jam (only its driver may tag it); it is saved under the driver's walks.
import { readJob, cardFrom } from "../../../_lib/model.js";
import { personaFrom, addListener } from "../../../_lib/persona.js";

export async function onRequestGet({ request, params, env, data }) {
  let text = await readJob(env, params.id);
  const card = cardFrom(text);
  let jamId = new URL(request.url).searchParams.get("jam");
  if (jamId && !(await env.DB.prepare("SELECT 1 FROM jams WHERE id = ? AND driver_id = ? AND ended_at IS NULL").bind(jamId, data.user.id).first())) jamId = null;
  if (card) {
    const persona = personaFrom(request);
    if (persona) {
      addListener(card, persona);
      // the same stream, with the changed card as the first output
      const [before, after] = text.split("event: complete");
      const outputs = JSON.parse(after.split("data:")[1].trim());
      outputs[0] = card;
      text = `${before}event: complete\ndata: ${JSON.stringify(outputs)}\n\n`;
    }
    const label = (v) => (v && typeof v === "object" ? v.label : v) || null;
    await env.DB.prepare(
      "INSERT INTO live_views (id, created_at, place, place_confidence, time, season, warmth, brightness, persona, card, user_id, jam_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(crypto.randomUUID(), new Date().toISOString(), label(card.place), card.place?.confidence ?? null,
            label(card.time) || card.time_of_day || null, label(card.season),
            card.mood?.warmth ?? null, card.mood?.brightness ?? null, persona, JSON.stringify(card), data.user.id, jamId)
      .run();
  }
  return new Response(text, { headers: { "Content-Type": "text/event-stream; charset=utf-8" } });
}
