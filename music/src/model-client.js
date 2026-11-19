// Sends one photo to Akshat's model server and gets its scene card back.
// Server: "01_autoencoder/model_app" (Gradio), API name /predict.
//
//   const card = await photoToCard(fileOrBlob, "photo_123", (msg) => console.log(msg));
//
// Another server (e.g. a local one on port 7860): put VITE_MODEL_URL=http://localhost:7860
// in music/.env.local, or open chroma.html?model=http://localhost:7860

export const MODEL_URL = (
  new URLSearchParams(location.search).get("model")
  ?? import.meta.env.VITE_MODEL_URL
  ?? "https://team8-chroma-model.onrender.com"
).replace(/\/$/, "");

const MAX_SIDE = 640; // the model only needs a small photo; this keeps the upload fast

// Photo (File, Blob or canvas) → small JPEG as a data URL.
export async function shrink(photo) {
  const bitmap = photo instanceof HTMLCanvasElement ? photo : await createImageBitmap(photo);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.88);
}

// Gradio's two-step API: POST starts the job, GET streams the answer.
export async function photoToCard(photo, name = "", onStatus = () => {}) {
  const dataUrl = typeof photo === "string" ? photo : await shrink(photo);
  onStatus("sending the photo…");
  const slow = setTimeout(() => onStatus("waking up the model server (the free server sleeps; about a minute)…"), 4000);
  try {
    const start = await fetch(`${MODEL_URL}/gradio_api/call/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: [dataUrl, name] }),
    });
    if (!start.ok) throw new Error(`model server answered ${start.status}`);
    const { event_id: id } = await start.json();
    onStatus("recognising the place…");
    const res = await fetch(`${MODEL_URL}/gradio_api/call/predict/${id}`);
    const text = await res.text();
    // The answer looks like:  event: complete \n data: [ {scene card} ]
    const event = text.match(/event:\s*(\w+)/g)?.pop()?.split(/:\s*/)[1];
    const data = text.split("\n").filter((l) => l.startsWith("data:")).pop()?.slice(5).trim();
    if (event !== "complete" || !data) throw new Error(`the model could not read this photo (${event ?? "no answer"})`);
    return JSON.parse(data)[0];
  } finally {
    clearTimeout(slow);
  }
}
