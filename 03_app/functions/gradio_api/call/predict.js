// POST /gradio_api/call/predict: the live walk player (public/live, Bo's code) sends a camera frame here,
// in exactly the Gradio format it would send to Render. We check the login (_middleware.js), then pass it on
// to our model server with the wake-up retry (_lib/model.js). Answer: {event_id}, like Gradio.
import { startJob } from "../../_lib/model.js";

export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.data) || typeof body.data[0] !== "string") {
    return Response.json({ error: "Send {data: [base64 photo, name]}." }, { status: 400 });
  }
  if (body.data[0].length > 1.5 * 1024 * 1024) {
    return Response.json({ error: "Frame too large." }, { status: 413 });
  }
  try {
    const event_id = await startJob(env, { data: [body.data[0], body.data[1] ?? ""] });
    return Response.json({ event_id });
  } catch (err) {
    return Response.json(
      { waking: true, error: "The model is waking up, about one minute.", detail: String(err) },
      { status: 503 },
    );
  }
}
