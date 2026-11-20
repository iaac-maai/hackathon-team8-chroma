// Chroma · the living gradient behind every page.
// A tiny canvas (24 × 36) is painted each frame, scaled up by the browser and blurred by CSS, so it reads as soft light.
//   intro    : pale pink with a drifting orange glow (login)
//   ambient  : the sky now: sun height from the time and place + live weather (Open-Meteo: temperature, clouds).
//              Hot → warmer, cold → bluer, cloudy → washed out.
//   camera   : the phone's back camera, blended in a little each frame so the colours flow as you move
//   palette  : the colours of one photo's scene card (after a reading)
// Every half second it measures 8 colours (shadows → highlights) and tells the page.
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const hex = (c) => "#" + c.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0")).join("");
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const W = 24, H = 36;
// Last resort only (no GPS and no rough location from the server, e.g. a local test): Barcelona, and the caption says so.
const HOME = { lat: 41.39, lon: 2.17, label: "Barcelona (default)" };

export function sunElevation(lat, lon, d = new Date()) {   // NOAA short formula, about 1° accurate
  const rad = Math.PI / 180, day = (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 0)) / 864e5;
  const hour = d.getUTCHours() + d.getUTCMinutes() / 60, g = (2 * Math.PI / 365) * (day - 1 + (hour - 12) / 24);
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const ha = ((hour * 60 + eqt + 4 * lon) / 4 - 180) * rad;
  const cosZ = Math.sin(lat * rad) * Math.sin(decl) + Math.cos(lat * rad) * Math.cos(decl) * Math.cos(ha);
  return 90 - Math.acos(clamp(cosZ, -1, 1)) / rad;
}
const PHASES = [
  [-6, "night", "#0b1030", ["#1b2350", "#3a2f6b", "#e8b04a", "#14172e", "#5a4a8a"]],
  [0, "blue hour", "#1f2a6b", ["#5b5fb0", "#c77dbb", "#ff9f80", "#2c3a8f", "#8a6fc9"]],
  [10, "golden hour", "#ff9a52", ["#ff5e7a", "#ffd08a", "#6a8cff", "#ff7a3d", "#ffe2c4"]],
  [90, "day", "#cfe7ff", ["#7ec8ff", "#fff1d6", "#ffd27a", "#9fd7ff", "#f2a46b"]],
];
const INTRO = { bg: rgb("#f7e4e8"), blobs: ["#ff7a3d", "#ffb36b", "#ff5e7a", "#f7e4e8", "#ffd0a0"].map(rgb) };

export function livingGradient({ canvas, grain }) {
  canvas.width = W; canvas.height = H;
  const fx = canvas.getContext("2d", { willReadFrequently: true });
  const S = { mode: "intro", flow: 0.35, place: null, sun: null, weather: null, stream: null, video: null, photo: null, colours: [], mood: null, listeners: [] };

  if (grain) {                                          // a 128 px noise tile, repeated at its real size
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const x = c.getContext("2d"), img = x.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    x.putImageData(img, 0, 0); grain.style.backgroundImage = `url(${c.toDataURL()})`;
  }

  const phase = () => (PHASES.find((p) => (S.sun ?? 20) <= p[0]) ?? PHASES[3]);
  function ambient() {
    const ph = phase();
    let bg = rgb(ph[2]), blobs = ph[3].map(rgb);
    const w = S.weather;
    if (w) {
      const t = clamp((w.temperature - 18) / 14, -1, 1), toward = t > 0 ? [255, 110, 50] : [80, 130, 255];
      bg = mix(bg, toward, Math.abs(t) * 0.22); blobs = blobs.map((c) => mix(c, toward, Math.abs(t) * 0.3));
      const grey = [185, 185, 196], cloud = clamp(w.clouds / 100) * 0.45;
      bg = mix(bg, grey, cloud); blobs = blobs.map((c) => mix(c, grey, cloud));
    }
    return { bg, blobs };
  }
  function blobs(pal, t) {
    fx.globalAlpha = 1; fx.fillStyle = hex(pal.bg); fx.fillRect(0, 0, W, H);
    const speed = REDUCED ? 0 : 0.00012 + S.flow * 0.0006;
    pal.blobs.forEach((c, i) => {
      const a = t * speed * (1 + i * 0.23) + i * 1.7;
      const x = W * (0.5 + 0.38 * Math.sin(a) * Math.cos(a * 0.6 + i)), y = H * (0.5 + 0.4 * Math.cos(a * 0.8 + i * 0.9));
      const r = Math.max(W, H) * (0.27 + 0.07 * Math.sin(a * 1.3 + i));
      const g = fx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, hex(c) + "ee"); g.addColorStop(1, hex(c) + "00");
      fx.fillStyle = g; fx.fillRect(0, 0, W, H);
    });
  }
  function camera() {
    const v = S.video; if (!v || !v.videoWidth) return;
    const vr = v.videoWidth / v.videoHeight, fr = W / H;
    let sw = v.videoWidth, sh = v.videoHeight;
    if (vr > fr) sw = sh * fr; else sh = sw / fr;
    fx.globalAlpha = 0.02 + S.flow * 0.3;
    fx.drawImage(v, (v.videoWidth - sw) / 2, (v.videoHeight - sh) / 2, sw, sh, 0, 0, W, H);
    fx.globalAlpha = 1;
  }
  function measure() {
    const d = fx.getImageData(0, 0, W, H).data, px = [];
    for (let i = 0, k = 0; i < d.length; i += 4, k++) { const c = [d[i], d[i + 1], d[i + 2]]; px.push({ c, L: (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255 }); }
    px.sort((a, b) => a.L - b.L);
    const size = Math.ceil(px.length / 8), out = [];
    for (let g = 0; g < 8; g++) { const p = px.slice(g * size, (g + 1) * size); if (p.length) out.push(hex([0, 1, 2].map((j) => p.reduce((s, q) => s + q.c[j], 0) / p.length))); }
    const mean = px.reduce((s, p) => s + p.L, 0) / px.length, avg = [0, 1, 2].map((j) => px.reduce((s, p) => s + p.c[j], 0) / px.length);
    S.colours = out; S.mood = { brightness: +mean.toFixed(2), warmth: +clamp((avg[0] - avg[2]) / 220, -1, 1).toFixed(2) };
    S.listeners.forEach((f) => f(api.state()));
  }
  let last = 0;
  function frame(now) {
    if (S.mode === "camera") camera();
    else if (S.mode === "palette" && S.photo) blobs(S.photo, now);
    else blobs(S.mode === "intro" ? INTRO : ambient(), now);
    if (now - last > 500) { last = now; measure(); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  async function weather({ lat, lon }) {
    try {
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&current=temperature_2m,apparent_temperature,cloud_cover`);
      if (!r.ok) return null;
      const c = (await r.json()).current;
      return { temperature: c.temperature_2m, feels: c.apparent_temperature, clouds: c.cloud_cover };
    } catch { return null; }
  }
  function locate(ask) {
    return new Promise((ok) => {
      if (!navigator.geolocation) return ok(null);
      const go = () => navigator.geolocation.getCurrentPosition(
        (p) => ok({ lat: p.coords.latitude, lon: p.coords.longitude, label: "your location" }), () => ok(null), { timeout: 8000, maximumAge: 600000 });
      if (ask) return go();
      // without asking: only if the visitor already allowed it before
      navigator.permissions?.query({ name: "geolocation" }).then((s) => (s.state === "granted" ? go() : ok(null))).catch(() => ok(null)) ?? ok(null);
    });
  }
  async function refresh(ask = false) {
    S.place = (await locate(ask)) ?? (S.place !== HOME ? S.place : null) ?? S.near ?? HOME;
    S.sun = sunElevation(S.place.lat, S.place.lon);
    S.weather = (await weather(S.place)) ?? S.weather;
    S.listeners.forEach((f) => f(api.state()));
  }
  let timer = 0;

  const api = {
    intro() { api.stopCamera(); S.mode = "intro"; },
    // roughly where the visitor is (from the server, no permission): used instead of Barcelona when GPS is not allowed
    near(place) { if (!place) return; S.near = place; if (!S.place || S.place === HOME) refresh(); },
    async ambient(askLocation = false) { api.stopCamera(); S.mode = "ambient"; await refresh(askLocation); clearInterval(timer); timer = setInterval(refresh, 600000); },
    // facing: "environment" (back, the street) or "user" (front, yourself). The same <video> is reused,
    // so a page can show it on screen while the gradient keeps reading its colours.
    async camera(facing = "environment") {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1280 } }, audio: false });
      S.stream?.getTracks().forEach((t) => t.stop());
      const v = S.video ?? Object.assign(document.createElement("video"), { playsInline: true, muted: true, autoplay: true });
      v.setAttribute("playsinline", ""); v.srcObject = stream; await v.play();
      S.stream = stream; S.video = v; S.facing = facing; S.mode = "camera";
      if (!S.place) refresh();
      return v;
    },
    facing() { return S.facing ?? "environment"; },
    stopCamera() { S.stream?.getTracks().forEach((t) => t.stop()); S.stream = null; if (S.video) S.video.srcObject = null; },
    palette(colours) {                                   // a photo's gradient: drift its own colours
      const list = (colours || []).filter((c) => /^#[0-9a-f]{6}$/i.test(c)).map(rgb);
      if (!list.length) return;
      api.stopCamera(); S.mode = "palette";
      S.photo = { bg: list[Math.floor(list.length / 2)], blobs: [list[0], list.at(-1), list[Math.floor(list.length / 3)], list[Math.floor(2 * list.length / 3)], list[1] ?? list[0]] };
    },
    flow(v) { S.flow = clamp(v); },
    video() { return S.video; },
    onUpdate(f) { S.listeners.push(f); },
    state() {
      const ph = phase()[1], w = S.weather, time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      return { mode: S.mode, colours: S.colours, mood: S.mood, phase: ph, time, place: S.place, sun: S.sun, weather: w,
        caption: S.mode === "camera" ? `Camera · ${time} · ${ph}` : `${time} · ${ph}${w ? ` · ${Math.round(w.temperature)} °C` : ""}${S.place ? ` · ${S.place.label}` : ""}` };
    },
  };
  return api;
}
