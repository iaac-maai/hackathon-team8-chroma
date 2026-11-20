// Keeps the Render model awake. Render's free plan puts a service to sleep after 15 minutes without requests,
// and the first request after that waits about a minute. This Worker opens the model page every 10 minutes.
// Free Render gives 750 instance hours a month; one service awake all month is about 720, so it fits
// as long as it is the only free web service in that Render workspace.
export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(ping(env));
  },
  // open https://chroma-keepwarm.<account>.workers.dev to see if the model answers right now
  async fetch(request, env) {
    const r = await ping(env);
    return Response.json(r);
  },
};

async function ping(env) {
  const t = Date.now();
  try {
    const r = await fetch(env.MODEL_URL, { headers: { "user-agent": "chroma-keepwarm" } });
    return { model: env.MODEL_URL, status: r.status, ms: Date.now() - t };
  } catch (e) {
    return { model: env.MODEL_URL, error: String(e), ms: Date.now() - t };
  }
}
