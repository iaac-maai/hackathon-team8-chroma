// Walking sensors for walk mode: how fast you walk, when you turn, where you are.
//
//   const walk = startWalk({ onTurn: () => … });   // call from a button click (phones ask permission)
//   walk.state  → { cadence, speed, moving, heading, lat, lon, sources }
//   walk.stop()
//
// cadence  steps per minute, counted from the phone's motion sensor (each step is a bump)
// speed    metres per second from GPS (fallback when there is no motion sensor)
// moving   true while you are walking
// heading  compass direction; a turn of more than 60° calls onTurn (you turned a corner)
//
// kmh, band  fused speed and its band: still / walk / run / vehicle (from Akshat's Chroma Live):
//             steps → GPS → camera movement, whichever is there; bands have a little hysteresis
// On a laptop there are no sensors: with a video, the camera's movement stands in for speed.

const STEP_WINDOW_MS = 6000; // cadence = steps in the last 6 seconds
const MIN_STEP_GAP_MS = 280; // faster than this is not a walking step
const TURN_DEGREES = 60;

export const BANDS = ["still", "walk", "run", "vehicle"];
const EDGES = [0.5, 2.0, 6.0]; // m/s between the bands

export function startWalk({ onTurn = () => {}, video = null } = {}) {
  const state = { cadence: null, speed: null, moving: false, heading: null, lat: null, lon: null, sources: new Set(),
    fused: 0, kmh: 0, band: "still", source: "none", cam: 0 };
  let gpsAt = 0, lastFix = null, accuracy = null;
  const steps = [];
  let smooth = 9.8, lastStep = 0, above = false;
  let headingThen = null, headingThenAt = 0, lastTurn = 0;
  const off = [];

  // --- steps from the motion sensor ----------------------------------------------
  const onMotion = (e) => {
    const a = e.accelerationIncludingGravity;
    if (!a || a.x === null) return;
    state.sources.add("motion");
    const mag = Math.hypot(a.x, a.y, a.z);
    smooth = smooth * 0.9 + mag * 0.1; // the slow average (gravity)
    const bump = mag - smooth;
    const now = performance.now();
    if (!above && bump > 1.4 && now - lastStep > MIN_STEP_GAP_MS) { // a step: a bump above the average
      above = true;
      lastStep = now;
      steps.push(now);
    } else if (above && bump < 0.4) above = false;
    while (steps.length && now - steps[0] > STEP_WINDOW_MS) steps.shift();
    state.cadence = steps.length >= 3 ? Math.round(((steps.length - 1) / (steps[steps.length - 1] - steps[0])) * 60000) : 0;
    update();
  };

  // --- compass: turning a corner ---------------------------------------------------
  const onOrientation = (e) => {
    const h = e.webkitCompassHeading ?? (e.absolute && e.alpha !== null ? 360 - e.alpha : null);
    if (h === null || h === undefined) return;
    state.sources.add("compass");
    state.heading = Math.round(h);
    const now = performance.now();
    if (headingThen === null || now - headingThenAt > 3000) { headingThen = h; headingThenAt = now; return; }
    const diff = Math.abs(((h - headingThen + 540) % 360) - 180);
    if (diff > TURN_DEGREES && now - lastTurn > 5000) {
      lastTurn = now;
      headingThen = h;
      headingThenAt = now;
      onTurn(diff);
    }
  };

  // --- GPS: speed and location -------------------------------------------------------
  let watchId = null;
  if (navigator.geolocation) {
    watchId = navigator.geolocation.watchPosition((pos) => {
      state.sources.add("gps");
      state.lat = +pos.coords.latitude.toFixed(5);
      state.lon = +pos.coords.longitude.toFixed(5);
      const { latitude, longitude } = pos.coords;
      let v = Number.isFinite(pos.coords.speed) && pos.coords.speed >= 0 ? pos.coords.speed : null;
      if (v === null && lastFix && pos.coords.accuracy < 25) { // no speed from the phone: work it out from two fixes
        const dt = (pos.timestamp - lastFix.t) / 1000;
        const dy = (latitude - lastFix.lat) * 111320, dx = (longitude - lastFix.lon) * 111320 * Math.cos(latitude * Math.PI / 180);
        if (dt > 0.5) v = Math.hypot(dx, dy) / dt;
      }
      lastFix = { lat: latitude, lon: longitude, t: pos.timestamp };
      accuracy = pos.coords.accuracy;
      if (v !== null) { state.speed = +v.toFixed(2); gpsAt = performance.now(); }
      update();
    }, () => {}, { enableHighAccuracy: true, maximumAge: 2000 });
  }

  // --- camera movement: how much the picture changes (stands in for speed without sensors) ---
  const camCanvas = document.createElement("canvas");
  camCanvas.width = camCanvas.height = 32;
  const camCtx = camCanvas.getContext("2d", { willReadFrequently: true });
  let prevGrey = null;
  function cameraMotion() {
    if (!video?.videoWidth) return;
    const side = Math.min(video.videoWidth, video.videoHeight);
    camCtx.drawImage(video, (video.videoWidth - side) / 2, (video.videoHeight - side) / 2, side, side, 0, 0, 32, 32);
    const px = camCtx.getImageData(0, 0, 32, 32).data, grey = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) grey[i] = (px[i * 4] + px[i * 4 + 1] + px[i * 4 + 2]) / 765;
    if (prevGrey) {
      let d = 0;
      for (let i = 0; i < 1024; i++) d += Math.abs(grey[i] - prevGrey[i]);
      state.cam += (Math.min(1, (d / 1024) * 6) - state.cam) * 0.3;
    }
    prevGrey = grey;
  }

  // --- one speed from all sources, smoothed, in bands ---
  function fuse() {
    const gpsFresh = state.speed !== null && performance.now() - gpsAt < 6000;
    const spm = state.cadence ?? 0;
    const stepSpeed = spm ? (spm / 60) * (spm > 150 ? 1.1 : 0.72) : 0; // stride: ~0.7 m walking, ~1.1 m running
    let raw;
    if (gpsFresh && state.speed > 2.5 && state.speed > stepSpeed) { raw = state.speed; state.source = `GPS ±${Math.round(accuracy ?? 0)} m`; }
    else if (state.sources.has("motion")) { raw = stepSpeed; state.source = spm ? `steps ${spm}/min` : "motion sensor"; }
    else if (gpsFresh) { raw = state.speed; state.source = `GPS ±${Math.round(accuracy ?? 0)} m`; }
    else if (video) { raw = state.cam * 3; state.source = "camera movement"; }
    else { raw = 0; state.source = "none"; }
    state.fused += (raw - state.fused) * 0.25; // ~3 s smoothing at 4 updates a second
    state.kmh = +(state.fused * 3.6).toFixed(1);
    const i = BANDS.indexOf(state.band); // a little hysteresis, so the music does not flicker at a boundary
    if (i < 3 && state.fused > EDGES[i] + 0.15) state.band = BANDS[i + 1];
    else if (i > 0 && state.fused < EDGES[i - 1] - 0.15) state.band = BANDS[i - 1];
  }

  function update() {
    const recentStep = performance.now() - lastStep < 2000;
    state.moving = (state.cadence ?? 0) > 40 && recentStep ? true : (state.speed ?? 0) > 0.6 || state.band !== "still";
  }
  const tick = setInterval(update, 1000);
  const fast = setInterval(() => { cameraMotion(); fuse(); update(); }, 250);

  window.addEventListener("devicemotion", onMotion);
  window.addEventListener("deviceorientation", onOrientation);
  window.addEventListener("deviceorientationabsolute", onOrientation);
  off.push(() => window.removeEventListener("devicemotion", onMotion));
  off.push(() => window.removeEventListener("deviceorientation", onOrientation));
  off.push(() => window.removeEventListener("deviceorientationabsolute", onOrientation));

  return {
    state,
    stop() {
      off.forEach((f) => f());
      clearInterval(tick);
      clearInterval(fast);
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    },
  };
}

// iPhones ask permission for motion and compass; this must run inside a button click.
export async function askSensorPermission() {
  const asks = [globalThis.DeviceMotionEvent, globalThis.DeviceOrientationEvent]
    .filter((E) => typeof E?.requestPermission === "function")
    .map((E) => E.requestPermission().catch(() => "denied"));
  const answers = await Promise.all(asks);
  return answers.every((a) => a === "granted");
}

// Speed → energy (0 … 1): which sub-genre of the place plays. Standing still picks the calmest
// (minimal piano, drone, cool jazz ballad), walking the middle ones, running the fast ones,
// a sprint or a vehicle the most extreme (hardcore 200+ bpm, bebop, presto strings).
// null = no sensors at all: the photo and chance pick the sub-genre, as before.
const BAND_ENERGY = { still: 0, walk: 0.4, run: 0.75, vehicle: 1 };
let lastWalk = null, lastEnergy = null;
export function walkEnergy(walk) {
  if (!walk) return null;
  const sources = walk.sources?.size ?? walk.sources?.length ?? 0;
  const sensed = BAND_ENERGY[walk.band] !== undefined && (sources > 0 || (walk.source && walk.source !== "none"));
  if (!sensed) return null;
  let e = BAND_ENERGY[walk.band];
  // running fast (≥ 4.5 m/s: a sprint or a bike) already counts as the top; a little hysteresis so it doesn't flicker
  if (walk.band === "run" && (walk.fused ?? 0) > (lastEnergy === 1 ? 4.2 : 4.5)) e = 1;
  return e;
}
// The last walk the music saw (walkTempo gets it every few seconds), so a new score can follow
// your speed even when the caller doesn't pass it.
export const walkNow = () => lastWalk;
export const energyNow = () => lastEnergy;

// Walking pace → tempo. The music follows your steps: your pace, half of it, 1.5× or double,
// whichever fits the genre best (110 steps/min → 110 bpm lo-fi, 55 bpm drone, 165 bpm drum & bass).
// Flat out (sprint, bike, vehicle): the top of the range. Standing still: the slow end.
export function walkTempo([slow, fast], walk, fallback) {
  const lo = slow * 0.9, hi = fast * 1.1;
  if (walk) { lastWalk = walk; lastEnergy = walkEnergy(walk); }
  if (lastEnergy === 1 && walk) return Math.round(hi * 0.97);
  if (walk?.moving && walk.cadence) {
    const outside = (b) => (b < lo ? lo - b : b > hi ? b - hi : 0); // how far from the genre's range
    const options = [1, 2, 0.5, 1.5].map((f) => walk.cadence * f);  // in order of preference on a tie
    const best = options.reduce((a, b) => (outside(b) < outside(a) ? b : a));
    return Math.round(Math.min(hi, Math.max(lo, best)));
  }
  if (walk?.speed !== null && walk?.speed !== undefined && walk.sources.has("gps")) {
    return Math.round(lo + (hi - lo) * Math.min(1, walk.speed / 2)); // 0 m/s slow … 2 m/s (brisk walk) fast
  }
  if (walk?.source === "camera movement" && walk.band !== "still") { // laptop or no sensors: the picture's movement
    return Math.round(lo + (hi - lo) * Math.min(1, walk.fused / 2));
  }
  if (walk && walk.sources.size && !walk.moving) return Math.round(lo);
  return fallback;
}
