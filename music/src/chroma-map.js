// Turns one chroma scene card into a musical "score". Pure data, no audio here,
// so you can test it in Node:  node -e "import('./src/chroma-map.js').then(...)"
//
// The rules:
//   place label         → GENRE: tempo range, instruments, groove, room size, signature sounds
//   contrast            → energy: drum strength, and where the tempo sits in the genre's range
//   main colour (hue)   → the KEY (12 hues → 12 keys), so every picture lands somewhere else
//   warmth + brightness → mode (bright/warm = lydian/major … dark/cool = dorian/minor)
//   each palette colour → one chord (hue + lightness pick the scale degree),
//                         played top-to-bottom of the image, length ∝ colour weight
//   n_colours           → 5+ colours adds a 7th to every chord (jazzy genres always do)
//   brightness          → how open the band's tone filter is, and how high the melody sits
//   saturation          → colourful scenes get a melody + wide chorus + more echo
//   confidence          → less sure where we are = more reverb (blurrier)
//   scene name          → seeds the melody, so the same picture always gives the same piece
//
// Scene card version 2 adds optional labels (each one ignored below CONFIDENT):
//   indoor              → small dry room (indoors) or big open reverb (outdoors)
//   time                → night = darker tone + more echo, golden hour = warmer mode
//   season              → an extra layer: spring bells, summer bells + shaker,
//                         autumn warm pad, winter soft slow pad + gentler drums
//   details.crowd       → BUSY: tempo inside the genre's range, ghost hats, crowd murmur
//   details.nature      → acoustic (birds, wood knocks) vs electronic (synth arpeggio)
//   paving              → the drum sounds: clicky cobblestones … soft sand brushes
//   gradient (8 colours)→ dark colours shape the bass, light colours the melody notes
//   city layers         → noise + traffic add to busy, nightlife to electronic,
//                         trees to acoustic, near the sea to reverb
//
// Every piece lasts about 10 seconds: the number of bars follows the tempo.

import { songShape, voiceLead, compose, drumScore, humanTiming, fakeScan } from "./compose.js";
import { styleDNA, MELODY_STYLES } from "./variety.js";
import { energyNow } from "./walk.js";
import { feel, modeForFeel, MODE_ORDER } from "./emotion.js";
import { listenerFor, shapeStyle, shapeDrums } from "./personality.js";

export const BASE = 48;   // C3 (MIDI): key root = BASE + the main colour's pitch class
export const SECONDS = 10; // target length of one piece
export const CONFIDENT = 0.5; // labels the model is less sure about than this are ignored

// Akshat's place labels that map onto our seven.
export const PLACE_ALIASES = { beach: "waterfront", metro: "transit", airport: "transit", mountains: "green" };

// Paving → drum sounds (only heard in genres with drums).
//   hatDecay/hatFreq  hi-hat length and brightness   clap  clap colour (Hz)
//   shakerDecay       shaker length                   soft  drums play gentler
//   wood              adds woody knocks               click adds extra short clicks
export const PAVINGS = {
  cobblestones: { desc: "clicky, uneven knocks", hatDecay: 0.02, hatFreq: 7000, clap: 3200, click: "...x..x....x.x.." },
  asphalt:      { desc: "tight electronic hits", hatDecay: 0.022, hatFreq: 9500, clap: 1600 },
  tiles:        { desc: "bright, sharp clicks", hatDecay: 0.03, hatFreq: 10500, clap: 3800, click: ".......x.......x" },
  stone_slabs:  { desc: "hard mid-range knocks", hatDecay: 0.04, hatFreq: 6000, clap: 2200 },
  gravel:       { desc: "crunchy, long shaker", hatDecay: 0.06, hatFreq: 5000, clap: 2000, shakerDecay: 0.09 },
  sand:         { desc: "soft brushes", hatDecay: 0.13, hatFreq: 3000, clap: 900, soft: true },
  wood:         { desc: "woody knocks", hatDecay: 0.03, hatFreq: 5500, clap: 1300, wood: true },
  indoor_floor: { desc: "the genre's own kit" },
};

// Season → an extra layer on top of the genre.
export const SEASONS = {
  spring: { desc: "light bells, two per bar", sparkle: 2 },
  summer: { desc: "bright bells and a shaker", sparkle: 4, shaker: true },
  autumn: { desc: "a warm, dark pad under the chords", pad: "warm" },
  winter: { desc: "a soft, slow pad and gentler drums", pad: "soft", soft: true },
};

const MODES = {
  lydian:     [0, 2, 4, 6, 7, 9, 11],
  ionian:     [0, 2, 4, 5, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  dorian:     [0, 2, 3, 5, 7, 9, 10],
  aeolian:    [0, 2, 3, 5, 7, 8, 10],
  phrygian:   [0, 1, 3, 5, 7, 8, 10],
  harmonic:   [0, 2, 3, 5, 7, 8, 11], // harmonic minor
};

// One genre per place. Each genre says:
//   band     which set of instruments plays (built in chroma.js), also picks the drum kit
//   tempo    [slowest, fastest] bpm; the picture's energy picks a value in between
//   space    base reverb (room size): dry market … huge beach
//   echo     base delay amount
//   keys     how the chord instrument plays: arpeggio | comp | stab | strum | bell | none
//   bass     how the bass plays: pattern | long (one note per bar) | walking | acid (16th squelch)
//   pad      held chords underneath (true/false)
//   sevenths always use 4-note chords (jazz, lo-fi)
//   swing    0 = straight … 0.5 = heavy swing, on swingSub notes
//   kickVel  how hard the kick hits (0 = no kick)
//   patterns 16 steps per bar, x = hit, . = rest
//   extras   signature sounds of the place
export const GENRES = {
  green: {
    genre: "classical", desc: "slow piano arpeggios, strings, cello and flute, birdsong; no drums",
    band: "classical", tempo: [66, 84], space: 0.4, echo: 0.12,
    keys: "arpeggio", bass: "long", pad: true, sevenths: false,
    swing: 0, kickVel: 0, patterns: {}, extras: ["birds"],
  },
  street: {
    genre: "lo-fi hip-hop", desc: "lazy swung boom-bap, dusty wobbly e-piano, tape hiss",
    band: "lofi", tempo: [72, 88], space: 0.12, echo: 0.2,
    keys: "comp", keysPattern: "x.......x.....x.", bass: "pattern", pad: false, sevenths: true,
    swing: 0.45, swingSub: "16n", kickVel: 0.8,
    patterns: { kick: "x......x..x.....", clap: "....x.......x...", hat: "x.x.x.x.x.x.x.x.", bass: "x......x..x....." },
    extras: [],
  },
  transit: {
    genre: "techno", desc: "driving four-on-the-floor, pumping synth stabs, station chime",
    band: "techno", tempo: [124, 132], space: 0.2, echo: 0.25,
    keys: "stab", keysPattern: "..x..x....x..x..", bass: "pattern", pad: true, sevenths: false,
    swing: 0, kickVel: 1,
    patterns: { kick: "x...x...x...x...", clap: "....x.......x...", hat: "xxxxxxxxxxxxxxxx", bass: "x.xxx.xxx.xxx.xx" },
    extras: ["chime"],
  },
  club: {
    genre: "acid techno", desc: "pounding kick, squelchy acid bassline, off-beat hats, crowd and glasses",
    band: "techno", tempo: [128, 136], space: 0.22, echo: 0.3,
    keys: "none", bass: "acid", acidPattern: "x.xxx.xx.xx.x.xx", pad: true, sevenths: false,
    swing: 0, kickVel: 1,
    patterns: { kick: "x...x...x...x...", clap: "....x.......x...", hat: "..x...x...x...x.", shaker: "xxxxxxxxxxxxxxxx", perc: "......x.......x." },
    extras: ["crowd", "glass"],
  },
  market: {
    genre: "rumba catalana", desc: "fast strummed guitar, palmas, cajón, market chatter; a dry, bright room",
    band: "rumba", tempo: [100, 116], space: 0.06, echo: 0.08,
    keys: "strum", keysPattern: "x.xx.xx.x.xx.xx.", bass: "pattern", pad: false, sevenths: false,
    swing: 0.1, swingSub: "16n", kickVel: 0.7,
    patterns: { kick: "x.......x.......", clap: "..x...x...x...x.", shaker: "xxxxxxxxxxxxxxxx", perc: "...x..x....x.x..", bass: "x..x..x...x.x..." },
    extras: ["crowd"],
  },
  waterfront: {
    genre: "ambient", desc: "very slow, no drums: wide pads, glassy bells, deep bass, waves and gulls",
    band: "ambient", tempo: [60, 72], space: 0.6, echo: 0.45,
    keys: "bell", bass: "long", pad: true, sevenths: false,
    swing: 0, kickVel: 0, patterns: {}, extras: ["waves", "gulls"],
  },
  square: {
    genre: "night jazz", desc: "swung ride, Rhodes comping, walking upright bass, breathy horn",
    band: "jazz", tempo: [96, 124], space: 0.3, echo: 0.1,
    keys: "comp", keysPattern: "x.....x.........", bass: "walking", pad: false, sevenths: true,
    swing: 0.6, swingSub: "8n", kickVel: 0,
    patterns: { ride: "x...x.x.x...x.x.", hat: "....x.......x..." },
    extras: [],
  },
};

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

export function modeFor({ warmth, brightness }) {
  const score = warmth * 2 + (brightness - 0.5);
  if (score > 0.6) return "lydian";
  if (score > 0.35) return "ionian";
  if (score > 0.1) return "mixolydian";
  if (score > -0.05) return "dorian";
  if (score > -0.4) return "aeolian";
  return score > -0.7 ? "harmonic" : "phrygian";
}

export function hexToHsl(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h / 6, s, l };
}

function chordName(notes) {
  const third = notes[1] - notes[0];
  const fifth = notes[2] - notes[0];
  let q = third === 4 ? (fifth === 8 ? "aug" : "") : fifth === 6 ? "dim" : "m";
  if (notes[3] !== undefined) q += notes[3] - notes[0] === 11 ? (q === "" ? "maj7" : "(maj7)") : "7";
  return NOTE_NAMES[notes[0] % 12] + q;
}

// Share `total` bars between colours by weight; every colour gets at least 1 bar.
function splitBars(weights, total) {
  const sum = weights.reduce((a, b) => a + b, 0);
  const exact = weights.map((w) => (w / sum) * total);
  const out = exact.map((e) => Math.max(1, Math.round(e)));
  let diff = out.reduce((a, b) => a + b, 0) - total;
  while (diff !== 0) {
    const dir = Math.sign(diff);
    let best = -1, bestErr = -Infinity;
    out.forEach((o, i) => {
      const err = (o - exact[i]) * dir;
      if ((dir < 0 || o > 1) && err > bestErr) { bestErr = err; best = i; }
    });
    out[best] -= dir;
    diff -= dir;
  }
  return out;
}

// Small seeded random generator, so each scene always gets the same melody.
function seeded(str) {
  let a = [...str].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sure = (x) => (x && (x.confidence === undefined || x.confidence >= CONFIDENT) ? x : null);
const mean = (xs) => { const v = xs.filter((x) => x !== undefined && x !== null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };

// Version 1 cards only have free-text time_of_day ("morning", "golden_hour" …).
function timeFromText(text = "") {
  const t = text.toLowerCase();
  if (t.includes("night")) return "night";
  if (/golden|evening|sunset|dusk/.test(t)) return "golden_hour";
  if (/morning|day|noon|afternoon/.test(t)) return "day";
  return null;
}

// Every optional label as one tidy object: null = not sent, or not sure enough.
export function readLabels(scene) {
  const city = scene.city ?? {};
  const crowd = scene.details?.crowd ?? null;
  const nature = scene.details?.nature ?? null;
  const cityBusy = mean([city.noise, city.traffic]);
  // how busy the photo looks (Akshat's detail: beach 0.30 … market 0.58) → 0–1
  const detailBusy = typeof scene.detail === "number" ? clamp((scene.detail - 0.3) / 0.3, 0, 1) : null;
  const parts = [[crowd, 0.6], [cityBusy, 0.4], [detailBusy, 0.4]].filter(([x]) => x !== null);
  const busy = parts.length ? parts.reduce((a, [x, w]) => a + x * w, 0) / parts.reduce((a, [, w]) => a + w, 0) : null;
  const acoustic = nature !== null && city.trees !== undefined ? 0.7 * nature + 0.3 * city.trees : nature ?? city.trees ?? null;
  const nightlife = city.nightlife ?? null;
  const electronic = acoustic !== null
    ? clamp((1 - acoustic) * (nightlife !== null ? 0.7 : 1) + (nightlife ?? 0) * 0.3, 0, 1)
    : nightlife;
  const paving = sure(scene.paving)?.label?.replace(/ /g, "_") ?? null;
  return {
    indoor: sure(scene.indoor)?.value ?? null,
    time: sure(scene.time)?.label ?? timeFromText(scene.time_of_day),
    season: sure(scene.season)?.label ?? null,
    paving: paving in PAVINGS ? paving : null,
    crowd, nature, busy, acoustic, electronic,
    sea: city.sea ?? null,
    gradient: Array.isArray(scene.gradient) && scene.gradient.length >= 2 ? scene.gradient : null,
    city: scene.city ?? null,
    detail: typeof scene.detail === "number" ? scene.detail : null,
    layers: scene.layers ?? null,
    scan: Array.isArray(scene.scan?.brightness) && scene.scan.brightness.length === 16 ? scene.scan : null,
  };
}

// `speed` (0 … 1, walk mode): how fast you move picks the sub-genre, from the calmest to the most extreme.
// In live mode it defaults to the speed walk.js saw last, so callers that don't pass it still follow you.
export function buildScore(scene, seconds = SECONDS, { live = false, version = 0, dnaSeed = null, speed } = {}) {
  if (speed === undefined) speed = live ? energyNow() : null;
  const { mood } = scene;
  const given = scene.place ?? { label: "street", confidence: 0.3 }; // no place sent → default genre
  const place = { ...given, label: PLACE_ALIASES[given.label] ?? given.label };
  // The piece's DNA: sub-genre, groove, progression, melody style and sound (variety.js).
  // Seeded by the photo, so the same photo gives the same piece; `version` gives another one.
  const dnaRand = seeded(dnaSeed ?? `${scene.name}#${version}`);
  const L = readLabels(scene);
  // How the photo and the place feel (emotion.js): pleasantness and energy, from Akshat's scene card.
  // Energy picks the style inside the place (a calm photo → a calm style); in walk mode your speed can push it up.
  const f = feel(mood, place, L);
  // A photo alone goes up to 0.8: the most extreme style of each place (hardcore, bebop, presto) needs real speed.
  const styleEnergy = speed === null || speed === undefined ? Math.min(0.8, f.arousal) : Math.max(speed, 0.6 * f.arousal);
  // The listener's personality (personality.js) shifts that style inside the genre: tempo, chords, drums, sound.
  const who = listenerFor(scene);
  const style = shapeStyle(styleDNA(GENRES[place.label] ? place.label : "street", GENRES[place.label] ?? GENRES.street, dnaRand, mood, styleEnergy), who);

  // Energy and tempo: contrast drives both, inside the genre's own range.
  // A busy scene (crowd, city noise) pushes the tempo up too.
  const energy = clamp((mood.contrast - 0.2) / 0.3, 0.25, 1);
  const [slow, fast] = style.tempo;
  const energyPos = (energy - 0.25) / 0.75;
  const photoPos = L.busy === null ? energyPos : 0.5 * energyPos + 0.5 * L.busy;
  const tempoPos = 0.45 * f.arousal + 0.35 * photoPos + 0.2 * dnaRand(); // the photo's energy leads, chance adds a little
  const bpm = Math.round(slow + (fast - slow) * tempoPos);
  const bars = Math.max(3, Math.round((seconds * bpm) / 240)); // 1 bar = 240 / bpm seconds

  // Key: the hue of the main colour (12 hues → 12 keys). Black, white and grey have
  // no real hue, so the key comes from the biggest *colourful* area (size × saturation).
  const stops = [...scene.stops].sort((a, b) => a[2] - b[2]);
  const dominant = stops.reduce((a, b) => (b[1] > a[1] ? b : a));
  const home = hexToHsl(dominant[0]);
  const colourful = (st) => { const c = hexToHsl(st[0]); return c.l > 0.1 && c.l < 0.9 ? c.s : 0; };
  const byColour = [...stops].sort((a, b) => b[1] * colourful(b) - a[1] * colourful(a));
  // usually the most colourful area picks the key; sometimes the second one does
  const keyStop = byColour.length > 1 && colourful(byColour[1]) > 0.15 && dnaRand() < 0.3 ? byColour[1] : byColour[0];
  const pc = colourful(keyStop) > 0.15 ? Math.round(hexToHsl(keyStop[0]).h * 12) % 12 : 2; // all grey → D
  const tonic = BASE + pc;
  // Mode from pleasantness (Palmer et al. 2013): pleasant → major / lydian, unpleasant → minor / phrygian.
  const nudge = (dnaRand() - 0.5) * 0.1;
  let mode = style.mode ?? modeForFeel(f.valence + nudge);
  if (!style.mode && who?.darker) mode = MODE_ORDER[Math.min(MODE_ORDER.length - 2, MODE_ORDER.indexOf(mode) + who.darker)]; // Intense leans minor
  if (!style.mode && dnaRand() < 0.2) { // now and then one step brighter or darker, so versions differ
    const at = MODE_ORDER.indexOf(mode) + (dnaRand() < 0.5 ? -1 : 1);
    mode = MODE_ORDER[Math.min(MODE_ORDER.length - 1, Math.max(0, at))];
  }
  const scale = MODES[mode];
  const deg = (d) => scale[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);

  // Chords: one per colour, read top → bottom of the image, in half-bar steps.
  // The last bar is kept free: the piece ends on the home chord.
  const shape = songShape(bars, live);
  const halves = (bars - 1) * 2;
  const used = stops.length > halves
    ? [...stops].sort((a, b) => b[1] - a[1]).slice(0, halves).sort((a, b) => a[2] - b[2])
    : stops;
  const lengths = splitBars(used.map((s) => s[1]), halves);
  const voices = mood.n_colours > 4 || style.sevenths ? [0, 2, 4, 6] : [0, 2, 4];
  const rich = who?.chords === "rich" || (who?.chords !== "simple" && ["jazz", "lofi", "ambient"].includes(style.band) && (mood.saturation > 0.35 || mood.n_colours > 4));
  // Usable chords in this mode: skip the harsh diminished one.
  const good = [0, 1, 2, 3, 4, 5, 6].filter((d) => deg(d + 4) - deg(d) === 7);
  let prev = -1;
  let start = 0;
  const chords = used.map(([hex, weight], i) => {
    const { h, l } = hexToHsl(hex);
    let degree;
    if (style.progression) { // a classic progression of the sub-genre; the colours set how long each chord lasts
      const want = style.progression[i % style.progression.length];
      degree = good.includes(want) ? want : good.reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a));
    } else {
      let idx = hex === dominant[0] ? 0 : Math.floor((((h - home.h) + (l - home.l) * 0.5 + 2) % 1) * good.length);
      if (good[idx] === prev) idx = (idx + 2) % good.length; // same colour family twice → move on
      degree = good[idx];
    }
    prev = degree;
    const notes = voices.map((v) => tonic + deg(degree + v));
    // what the chord instruments play: jazzy genres and colourful photos add the 9th
    const play = rich ? [...notes, tonic + deg(degree + 8)] : notes;
    const chord = {
      hex, weight, degree, notes, play,
      bass: tonic - 12 + deg(degree),
      name: chordName(notes),
      start: start * 8,
      steps: lengths[i] * 8,
    };
    start += lengths[i];
    return chord;
  });
  // One planned surprise (Cheung et al. 2019: a surprise after a predictable passage is the most pleasing):
  // once the loop has settled, the last chord before the ending is borrowed from the opposite mode
  // (bright pieces get the dark ♭VI, dark pieces a bright major IV), and the home chord resolves it.
  const surprises = who ? who.surprises : 1; // Mellow and Unpretentious: none; Sophisticated: two
  const surpriseAt = surprises >= 2 && chords.length >= 5 ? [Math.floor(chords.length / 2), chords.length - 1] : [chords.length - 1];
  if (surprises > 0 && bars >= 4 && chords.length >= 3) for (const at of surpriseAt) {
    const c = chords[at];
    const bright = MODE_ORDER.indexOf(mode) <= 2;
    const other = MODES[bright ? "aeolian" : "dorian"];
    const od = (d) => other[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);
    const d = bright ? 5 : 3;
    const notes = voices.map((v) => tonic + od(d + v));
    Object.assign(c, { degree: d, notes, play: rich ? [...notes, tonic + od(d + 8)] : notes, bass: tonic - 12 + od(d), name: chordName(notes), surprise: true });
  }
  // Ending: the home chord for the whole last bar.
  {
    const homeDeg = good[0];
    const notes = voices.map((v) => tonic + deg(homeDeg + v));
    chords.push({
      hex: dominant[0], weight: 0, degree: homeDeg, notes, play: rich ? [...notes, tonic + deg(homeDeg + 8)] : notes,
      bass: tonic - 12 + deg(homeDeg), name: chordName(notes), start: (bars - 1) * 16, steps: 16, ending: true,
    });
  }
  voiceLead(chords, tonic - 5, tonic + 21); // smooth movement between chords

  // Gradient map (shadows → highlights): the dark end shapes the bass, the light end the melody.
  const grad = L.gradient?.map(hexToHsl) ?? null;
  const shadows = grad?.slice(0, 3);
  const highlights = grad?.slice(-3);
  // colourful shadows → brighter, growlier bass; a mix of shadow hues → the bass also plays the fifth
  const bassTone = shadows ? +(0.7 + mean(shadows.map((c) => c.s)) * 1.4).toFixed(2) : 1;
  const hueSpread = shadows ? Math.max(...shadows.map((c) => c.h)) - Math.min(...shadows.map((c) => c.h)) : 0;
  const bassFifth = !!shadows && hueSpread > 0.08 && hueSpread < 0.92;
  // each highlight hue becomes a scale step the melody can move to between chord notes
  // (hue measured from the main colour; near-grey highlights use their lightness; no repeats)
  const colourSteps = [];
  for (const c of highlights ?? []) {
    let st = c.s > 0.15 ? Math.floor((((c.h - home.h) % 1 + 1) % 1) * 7) : Math.round(c.l * 6);
    while (colourSteps.includes(st)) st = (st + 2) % 7;
    colourSteps.push(st);
  }
  if (!highlights) colourSteps.push(0, 2, 4);

  const season = L.season ? SEASONS[L.season] : null;
  const paving = L.paving ? PAVINGS[L.paving] : null;

  // Melody, counter-line and drums: the composer (compose.js).
  const rand = seeded(scene.name);
  const scan = L.scan ?? { brightness: fakeScan(rand), detail: fakeScan(rand) };
  const lay = L.layers ?? {};
  const density = lay.middle?.detail !== undefined ? 0.2 + lay.middle.detail * 0.55 : 0.15 + mood.saturation * 0.45;
  const lightness = highlights ? mean(highlights.map((c) => c.l)) : mood.brightness;
  const leadLift = lightness > (highlights ? 0.7 : 0.45) ? 24 : 12;
  const chordAt = (step) => chords.findLast((c) => step >= c.start);
  const melodyStyle = MELODY_STYLES[style.melodyStyle] ?? MELODY_STYLES.phrases;
  const tune = compose({
    bars, shape, chords, chordAt, deg, tonic, lift: leadLift, rand, scan, density: density * melodyStyle.density, melodyStyle,
    staccato: style.band === "techno", counter: mood.saturation > 0.5, homeDegree: good[0],
  });
  const groundDetail = lay.ground?.detail ?? 0.4;
  const softDrums = (paving?.soft ? 0.6 : 1) * (season?.soft ? 0.8 : 1);
  const drums = shapeDrums(drumScore({ bars, shape, style, energy, busy: L.busy, rand, scan, groundDetail, soft: softDrums }), who);
  const timing = humanTiming(bars * 16, style.band, rand);
  const bassUp = (lay.ground?.brightness ?? 0) > 0.6; // bright ground → bass jumps up an octave now and then
  const skyTone = lay.top?.brightness !== undefined ? 0.8 + lay.top.brightness * 0.4 : 1;

  // Room: indoors = small dry room, outdoors = big open space, near the sea = even bigger.
  const space = style.space + (1 - place.confidence) * 0.3;
  let hallWet = space;
  let roomWet = 0;
  if (L.indoor === true) { roomWet = clamp(space * 1.2, 0.15, 0.6); hallWet = space * 0.15; }
  if (L.indoor === false) hallWet = space + 0.08;
  if (L.sea !== null) hallWet += L.sea * 0.12;

  // Time of day: night = darker tone and more echo.
  const timeTone = L.time === "night" ? 0.7 : L.time === "golden_hour" ? 0.9 : 1;
  const timeEcho = L.time === "night" ? 0.08 : 0;


  // Extras: at most two per piece, so the mix never gets crowded. The photo decides which:
  // the strongest reasons win (very colourful → second voice, very built-up → synth arpeggio …).
  const acousticNow = L.acoustic ?? 0;
  const electronicNow = L.electronic ?? 0;
  const candidates = [
    ["counter", tune.harmony.some((n) => n !== null), mood.saturation],
    ["arp", electronicNow > 0.6 && ["techno", "lofi", "ambient"].includes(style.band), electronicNow],
    ["season", !!season, 0.55],
    ["birds", acousticNow > 0.55 && !style.extras.includes("birds"), acousticNow],
    ["wood", acousticNow > 0.4 && !paving?.wood, acousticNow * 0.8],
    ["paving", !!(paving?.click || paving?.wood), 0.5],
  ].filter(([, ok]) => ok).map(([name, , why]) => [name, why + rand() * 0.15]); // a little chance breaks ties
  const extras = new Set(candidates.sort((a, b) => b[1] - a[1]).slice(0, 2).map(([name]) => name));

  return {
    name: scene.name,
    card: scene,       // kept so walk mode can rebuild the piece when your speed changes
    feel: f,           // pleasantness and energy (emotion.js)
    listener: who ? { type: who.type, label: who.label } : null,
    dnaSeed,
    speed,
    title: scene.name.replace(/_/g, " "),
    extras,
    place,
    timeOfDay: scene.time_of_day,
    mood,
    stops,
    style,
    bpm,
    bars,
    seconds: +((bars * 240) / bpm).toFixed(2),
    tonic,
    keyHex: keyStop[0],
    key: `${NOTE_NAMES[pc]} ${mode}`,
    mode,
    chords,
    melody: tune.notes,
    melodyLen: tune.lengths,
    harmony: tune.harmony,
    drums,
    timing,
    shape,
    bassUp,
    cutoff: Math.round(clamp(400 * 2 ** (mood.brightness * 6), 600, 12000) * timeTone * skyTone * style.timbre.brightness),
    spread: Math.round((10 + mood.saturation * 60 + style.timbre.padSpread) / 2),
    version,
    variant: style.genre,
    melodyStyle: style.melodyStyle,
    progFamily: style.progFamily,
    leadOn: mood.saturation > 0.3,
    delayWet: +(style.echo + mood.saturation * 0.25 + timeEcho).toFixed(2),
    reverbWet: +clamp(hallWet + (who?.reverb ?? 0), 0, 0.9).toFixed(2), // big open reverb (Mellow: more)
    roomWet: +roomWet.toFixed(2),                   // small room reverb (indoors)
    energy: +energy.toFixed(2),
    // version 2 labels
    labels: L,
    busy: L.busy === null ? null : +L.busy.toFixed(2),
    acoustic: L.acoustic === null ? null : +L.acoustic.toFixed(2),
    electronic: L.electronic === null ? null : +L.electronic.toFixed(2),
    season,
    paving,
    bassTone,
    bassFifth,
    colourSteps,
  };
}
