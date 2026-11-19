import { callModel, toBase64 } from "../_lib/model.js";
import { personaFrom, addListener } from "../_lib/persona.js";

// POST /api/predict with a form field "image" (a photo):
// 1. send it to our model server on Render -> scene card,
// 2. store the scene card and the small photo in D1, 3. answer the page (which turns the card into music).

export async function onRequestPost({ request, env }) {
  const form = await request.formData();
  const file = form.get("image");
  if (!file || typeof file === "string") {
    return Response.json({ error: "Send a photo in the field 'image'." }, { status: 400 });
  }
  if (file.size > 1024 * 1024) {
    // the page makes photos ~50 KB; a D1 row may hold at most 2 MB
    return Response.json({ error: "Photo too large (max 1 MB)." }, { status: 413 });
  }
  const bytes = new Uint8Array(await file.arrayBuffer());

  // 1. Ask the model for the scene card
  let card;
  try {
    card = await callModel(env, toBase64(bytes));
  } catch (err) {
    // The most common reason: the free model server was asleep and is still starting
    return Response.json(
      { waking: true, error: "The model is waking up, about one minute.", detail: String(err) },
      { status: 503 },
    );
  }

  // The visitor's listener type (persona cookie) goes into the card, so the music and the history know it
  const persona = personaFrom(request);
  addListener(card, persona);

  // 2. Store one row in D1. The "?" placeholders keep user input out of the SQL text
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const label = (v) => (v && typeof v === "object" ? v.label : v) || null;
  await env.DB.prepare(
    "INSERT INTO scenes (id, created_at, photo, photo_type, file_name, place, time, season, warmth, brightness, persona, card) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(id, createdAt, bytes.buffer, file.type || "image/jpeg", file.name || null, label(card.place), label(card.time) || card.time_of_day || null,
          label(card.season), card.mood?.warmth ?? null, card.mood?.brightness ?? null, persona, JSON.stringify(card))
    .run();

  // 3. Answer the page
  return Response.json({ id, created_at: createdAt, card });
}
