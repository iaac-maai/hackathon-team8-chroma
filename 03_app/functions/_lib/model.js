// Everything about talking to our model server on Render, in one place.
// The free Render server sleeps after 15 min; the first call then waits while it starts (about one minute)
// or fails with 502/503/504. Our first call is enough to start it waking.
// We never keep the phone waiting in silence for long: phones and mobile networks drop a request that gets no answer
// for a minute or two, and the page then only sees "NetworkError" (bug of 20 Nov, BUG_photo_upload.md).
// So after about 20 s we give up and the API answers 503; the page shows "the model is waking up" and asks again
// every 10 s until the model is up.

const DEADLINE_MS = 20000;          // stop trying after this
const TRIES = 3;                    // tries in total
const PAUSE_MS = [0, 3000, 5000];   // wait before try 1, 2, 3

// Gradio's HTTP API has two steps: start a job (POST -> event_id), then read its result (GET).

// Step 1 with the retry: send the Gradio body {data: [...]} and get the event_id back.
export async function startJob(env, body) {
  const start = Date.now();
  let lastError;
  for (let i = 0; i < TRIES; i++) {
    if (PAUSE_MS[i]) await sleep(PAUSE_MS[i]);
    const left = DEADLINE_MS - (Date.now() - start);
    if (left < 5000) break;
    try {
      const r = await fetchWithTimeout(jobUrl(env), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }, left);
      if (r.ok) return (await r.json()).event_id;
      lastError = new Error(`Model server answered ${r.status}`);
      if (r.status < 500) throw Object.assign(lastError, { final: true }); // our request is wrong: no retry
    } catch (err) {
      lastError = err;
      if (err.final) throw err;     // 5xx or no connection = still waking up: try again
    }
  }
  throw lastError || new Error("The model server did not answer in time.");
}

// Step 2: read the result stream, e.g. "event: complete\ndata: [ {...} ]". Returns the raw text.
export async function readJob(env, eventId) {
  const r = await fetchWithTimeout(`${jobUrl(env)}/${eventId}`, {}, 25000);   // the model is awake by now: a few seconds
  return r.text();
}

// The scene card inside a result stream, or null
export function cardFrom(text) {
  const complete = text.split("event: complete")[1];
  if (!complete) return null;
  return JSON.parse(complete.split("data:")[1].trim())[0];
}

// Both steps: one photo (base64) in, one scene card out
export async function callModel(env, imageBase64) {
  const eventId = await startJob(env, { data: [imageBase64, ""] });
  const text = await readJob(env, eventId);
  const card = cardFrom(text);
  if (!card) throw new Error(`No result from the model server: ${text.slice(0, 200)}`);
  return card;
}

const jobUrl = (env) => `${env.MODEL_URL}/gradio_api/call/${env.MODEL_API_NAME}`;

async function fetchWithTimeout(url, options = {}, ms = 60000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

export function toBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}
