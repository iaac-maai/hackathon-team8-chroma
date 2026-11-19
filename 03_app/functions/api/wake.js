// GET /api/wake: knock on the model server's door so a sleeping Render server starts waking up
// while the visitor is still choosing a photo. Answers { awake: true | false }.
export async function onRequestGet({ env }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const r = await fetch(`${env.MODEL_URL}/`, { signal: controller.signal });
    return Response.json({ awake: r.ok });
  } catch {
    return Response.json({ awake: false });
  } finally {
    clearTimeout(timer);
  }
}
