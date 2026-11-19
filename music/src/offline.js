// Walk-mode helpers merged from Akshat's Chroma Live (01_autoencoder/prototype/site/live.html):
//   readFrame(frame)   colours of a camera frame → { mood, stops }   (same rules as data_prep/extract_palette.py)
//   timeOfDay()        day / golden hour / night from the phone clock (Barcelona sun table)
//   offlinePlaces      CLIP in the browser (transformers.js, ~90 MB once): the place without the model server
//   walkLog            one row every few seconds, downloadable as CSV
// Used when the model server can't be reached, so walk mode keeps playing offline.

const clamp01 = (x) => Math.min(1, Math.max(0, x));

// ---------- colours of a frame ----------
const SIZE = 48, K = 6, MIN_WEIGHT = 0.05, MERGE_DIST = 12;
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fLab = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
function rgb2lab(r, g, b) {
  const R = lin(r), G = lin(g), B = lin(b);
  const x = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  const y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const fx = fLab(x), fy = fLab(y), fz = fLab(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
const toHex = (r, g, b) => "#" + [r, g, b].map((v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, "0")).join("");

// centre square of a video or canvas, drawn small
export function grab(src, ctx, size) {
  const vw = src.videoWidth || src.width, vh = src.videoHeight || src.height;
  if (!vw) return null;
  const side = Math.min(vw, vh);
  ctx.drawImage(src, (vw - side) / 2, (vh - side) / 2, side, side, 0, 0, size, size);
  return ctx.getImageData(0, 0, size, size).data;
}

const work = document.createElement("canvas");
work.width = work.height = SIZE;
const wctx = work.getContext("2d", { willReadFrequently: true });

export function readFrame(frame) {
  const px = grab(frame, wctx, SIZE);
  if (!px) return null;
  const n = SIZE * SIZE;
  const lab = new Float32Array(n * 3), rgb = new Float32Array(n * 3), rows = new Float32Array(n);
  let sumL = 0, sumL2 = 0, sumS = 0, warmNum = 0, warmDen = 0;
  for (let i = 0; i < n; i++) {
    const r = px[i * 4] / 255, g = px[i * 4 + 1] / 255, b = px[i * 4 + 2] / 255;
    const [L, A, Bb] = rgb2lab(r, g, b);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const s = mx === 0 ? 0 : (mx - mn) / mx;
    lab.set([L, A, Bb], i * 3); rgb.set([r, g, b], i * 3);
    rows[i] = Math.floor(i / SIZE) / (SIZE - 1);
    sumL += L / 100; sumL2 += (L / 100) ** 2; sumS += s;
    warmNum += (Bb + 0.5 * A) * (0.2 + s); warmDen += 0.2 + s;
  }
  const meanL = sumL / n;
  const mood = {
    brightness: +meanL.toFixed(3),
    warmth: +(2 * clamp01(0.5 + warmNum / warmDen / 60) - 1).toFixed(3), // scene card: −1 (blue) … 1 (orange)
    saturation: +(sumS / n).toFixed(3),
    contrast: +Math.min(Math.sqrt(Math.max(0, sumL2 / n - meanL ** 2)) / 0.3, 1).toFixed(3),
  };
  // k-means in Lab, started from lightness quantiles so it is repeatable frame to frame
  const order = [...Array(n).keys()].sort((a, b) => lab[a * 3] - lab[b * 3]);
  let cent = Array.from({ length: K }, (_, k) => {
    const i = order[Math.floor(((k + 0.5) / K) * n)];
    return [lab[i * 3], lab[i * 3 + 1], lab[i * 3 + 2]];
  });
  const lbl = new Uint8Array(n);
  for (let it = 0; it < 8; it++) {
    const acc = Array.from({ length: K }, () => [0, 0, 0, 0]);
    for (let i = 0; i < n; i++) {
      let best = 0, bd = Infinity;
      for (let k = 0; k < K; k++) {
        const d = (lab[i * 3] - cent[k][0]) ** 2 + (lab[i * 3 + 1] - cent[k][1]) ** 2 + (lab[i * 3 + 2] - cent[k][2]) ** 2;
        if (d < bd) { bd = d; best = k; }
      }
      lbl[i] = best;
      const a = acc[best]; a[0] += lab[i * 3]; a[1] += lab[i * 3 + 1]; a[2] += lab[i * 3 + 2]; a[3]++;
    }
    cent = acc.map((a, k) => (a[3] ? [a[0] / a[3], a[1] / a[3], a[2] / a[3]] : cent[k]));
  }
  const cl = cent.map((c) => ({ lab: c, n: 0, y: 0, rgb: [0, 0, 0] }));
  for (let i = 0; i < n; i++) {
    const c = cl[lbl[i]]; c.n++; c.y += rows[i];
    c.rgb[0] += rgb[i * 3]; c.rgb[1] += rgb[i * 3 + 1]; c.rgb[2] += rgb[i * 3 + 2];
  }
  cl.sort((a, b) => b.n - a.n);
  const merged = [];
  for (const c of cl) {
    if (!c.n) continue;
    const m = merged.find((m) => Math.hypot(...m.lab.map((v, j) => v - c.lab[j])) < MERGE_DIST);
    if (m) {
      const tot = m.n + c.n;
      m.lab = m.lab.map((v, j) => (v * m.n + c.lab[j] * c.n) / tot);
      m.n = tot; m.y += c.y; m.rgb = m.rgb.map((v, j) => v + c.rgb[j]);
    } else merged.push({ ...c, rgb: [...c.rgb] });
  }
  const stops = merged
    .filter((m) => m.n / n >= MIN_WEIGHT)
    .map((m) => [toHex(m.rgb[0] / m.n, m.rgb[1] / m.n, m.rgb[2] / m.n), +(m.n / n).toFixed(3), +(m.y / m.n).toFixed(3)]);
  mood.n_colours = stops.length;
  return { mood, stops };
}

// ---------- time of day from the phone clock ----------
const SUN = { 1: [8.2, 17.7], 2: [7.9, 18.2], 3: [7.3, 18.8], 4: [7.2, 20.3], 5: [6.6, 20.9], 6: [6.3, 21.3],
  7: [6.5, 21.3], 8: [7.0, 20.8], 9: [7.5, 20.0], 10: [8.0, 19.1], 11: [7.6, 17.6], 12: [8.1, 17.4] };
export function timeOfDay(d = new Date()) {
  const [rise, set] = SUN[d.getMonth() + 1];
  const h = d.getHours() + d.getMinutes() / 60;
  if (Math.abs(h - rise) <= 1 || Math.abs(h - set) <= 1) return "golden_hour";
  return h > rise && h < set ? "day" : "night";
}

// ---------- the place without the server: CLIP in the browser ----------
// Prompts per place; they fix the gaps Akshat saw on our own photos
// (city views from hills → green, bars and restaurants → square, train windows → transit).
const PROMPTS = {
  green: ["a park with trees and grass", "a view over a city from a hill with trees", "a forest path on a hill"],
  street: ["a city street with buildings", "a narrow old town street", "a busy avenue with traffic"],
  transit: ["a metro station platform", "the view from a train window", "an airport terminal", "inside a bus or tram"],
  club: ["a dark nightclub with coloured lights", "people dancing at a party"],
  market: ["a food market with stalls", "a busy outdoor food festival"],
  waterfront: ["a beach and the sea", "a harbour with boats", "a seaside promenade"],
  square: ["a bar or restaurant interior", "a public square with people", "people eating at long tables"],
};
const LABELS = Object.keys(PROMPTS);
const clipCanvas = document.createElement("canvas");
clipCanvas.width = clipCanvas.height = 224;
const clipCtx = clipCanvas.getContext("2d", { willReadFrequently: true });

export const offlinePlaces = {
  model: null, loading: null, probs: null,
  get ready() { return !!this.model; },
  load(onProgress = () => {}) {
    this.loading ??= (async () => {
      const { pipeline, env } = await import(/* @vite-ignore */ "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2");
      env.allowLocalModels = false;
      env.backends.onnx.wasm.numThreads = 1;
      const files = {};
      this.model = await pipeline("zero-shot-image-classification", "Xenova/clip-vit-base-patch32", {
        quantized: true,
        progress_callback: (p) => {
          if (p.status !== "progress" || !p.total) return;
          files[p.file] = [p.loaded, p.total];
          const [l, t] = Object.values(files).reduce((a, [x, y]) => [a[0] + x, a[1] + y], [0, 0]);
          onProgress(l / t);
        },
      });
    })().catch((err) => { this.loading = null; throw err; });
    return this.loading;
  },
  // frame → { label, confidence }, smoothed over the last guesses so one odd frame doesn't switch the genre
  async guess(frame) {
    if (!this.model || !grab(frame, clipCtx, 224)) return null;
    const prompts = LABELS.flatMap((k) => PROMPTS[k].map((p) => `a photo of ${p}`));
    const out = await this.model(clipCanvas.toDataURL("image/jpeg", 0.85), prompts);
    const probs = Object.fromEntries(LABELS.map((k) => [k, 0]));
    for (const { label, score } of out) probs[LABELS.find((k) => PROMPTS[k].some((p) => label.endsWith(p)))] += score;
    this.probs = this.probs ? Object.fromEntries(LABELS.map((k) => [k, this.probs[k] * 0.5 + probs[k] * 0.5])) : probs;
    const best = LABELS.reduce((a, b) => (this.probs[b] > this.probs[a] ? b : a));
    return { label: best, confidence: +this.probs[best].toFixed(2) };
  },
};

// A scene card made on the phone: colours from the frame, place from CLIP (or the last known place).
export async function offlineCard(frame, lastPlace) {
  const f = readFrame(frame);
  if (!f || !f.stops.length) return null;
  const place = (await offlinePlaces.guess(frame).catch(() => null)) ?? lastPlace ?? { label: "street", confidence: 0.3 };
  return { version: 2, name: `walk_${Date.now()}`, place, time_of_day: timeOfDay(), time: { label: timeOfDay(), confidence: 0.9 }, mood: f.mood, stops: f.stops, offline: true };
}

// ---------- walk log ----------
export const walkLog = {
  rows: [],
  add(row) { this.rows.push({ time: new Date().toISOString(), ...row }); },
  clear() { this.rows = []; },
  download() {
    if (!this.rows.length) return;
    const cols = [...new Set(this.rows.flatMap((r) => Object.keys(r)))];
    const csv = [cols.join(","), ...this.rows.map((r) => cols.map((c) => `"${String(r[c] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `chroma-walk-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.csv`;
    a.click();
  },
};
