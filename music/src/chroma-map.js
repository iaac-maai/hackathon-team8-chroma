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
// Every piece lasts about 10 seconds: the number of bars follows the tempo.

export const BASE = 48;   // C3 (MIDI): key root = BASE + the main colour's pitch class
export const SECONDS = 10; // target length of one piece

const MODES = {
  lydian:     [0, 2, 4, 6, 7, 9, 11],
  ionian:     [0, 2, 4, 5, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  dorian:     [0, 2, 3, 5, 7, 9, 10],
  aeolian:    [0, 2, 3, 5, 7, 8, 10],
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
  return "aeolian";
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

export function buildScore(scene, seconds = SECONDS) {
  const { mood, place } = scene;
  const style = GENRES[place.label] ?? GENRES.street;

  // Energy and tempo: contrast drives both, inside the genre's own range.
  const energy = clamp((mood.contrast - 0.2) / 0.3, 0.25, 1);
  const [slow, fast] = style.tempo;
  const bpm = Math.round(slow + (fast - slow) * (energy - 0.25) / 0.75);
  const bars = Math.max(3, Math.round((seconds * bpm) / 240)); // 1 bar = 240 / bpm seconds

  // Key: the hue of the main colour (12 hues → 12 keys). Black, white and grey have
  // no real hue, so the key comes from the biggest *colourful* area (size × saturation).
  const stops = [...scene.stops].sort((a, b) => a[2] - b[2]);
  const dominant = stops.reduce((a, b) => (b[1] > a[1] ? b : a));
  const home = hexToHsl(dominant[0]);
  const colourful = (st) => { const c = hexToHsl(st[0]); return c.l > 0.1 && c.l < 0.9 ? c.s : 0; };
  const keyStop = stops.reduce((a, b) => (b[1] * colourful(b) > a[1] * colourful(a) ? b : a));
  const pc = colourful(keyStop) > 0.15 ? Math.round(hexToHsl(keyStop[0]).h * 12) % 12 : 2; // all grey → D
  const tonic = BASE + pc;
  const mode = modeFor(mood);
  const scale = MODES[mode];
  const deg = (d) => scale[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);

  // Chords: one per colour, read top → bottom of the image, in half-bar steps.
  const halves = bars * 2;
  const used = stops.length > halves
    ? [...stops].sort((a, b) => b[1] - a[1]).slice(0, halves).sort((a, b) => a[2] - b[2])
    : stops;
  const lengths = splitBars(used.map((s) => s[1]), halves);
  const voices = mood.n_colours > 4 || style.sevenths ? [0, 2, 4, 6] : [0, 2, 4];
  // Usable chords in this mode: skip the harsh diminished one.
  const good = [0, 1, 2, 3, 4, 5, 6].filter((d) => deg(d + 4) - deg(d) === 7);
  let prev = -1;
  let start = 0;
  const chords = used.map(([hex, weight], i) => {
    const { h, l } = hexToHsl(hex);
    let idx = hex === dominant[0] ? 0 : Math.floor((((h - home.h) + (l - home.l) * 0.5 + 2) % 1) * good.length);
    if (good[idx] === prev) idx = (idx + 2) % good.length; // same colour family twice → move on
    const degree = good[idx];
    prev = degree;
    const notes = voices.map((v) => tonic + deg(degree + v));
    const chord = {
      hex, weight, degree, notes,
      bass: tonic - 12 + deg(degree),
      name: chordName(notes),
      start: start * 8,
      steps: lengths[i] * 8,
    };
    start += lengths[i];
    return chord;
  });

  // Melody: a 2-bar rhythm motif (density from saturation) that follows the chords.
  const rand = seeded(scene.name);
  const density = 0.15 + mood.saturation * 0.45;
  const motif = Array.from({ length: 32 }, (_, i) =>
    rand() < (i % 2 === 0 ? density : density * 0.2) ? Math.floor(rand() * 3) : null,
  );
  const leadLift = mood.brightness > 0.45 ? 24 : 12;
  const chordAt = (step) => chords.findLast((c) => step >= c.start);
  const melody = Array.from({ length: bars * 16 }, (_, step) => {
    const m = motif[step % 32];
    return m === null ? null : tonic + deg(chordAt(step).degree + [0, 2, 4][m]) + leadLift;
  });

  return {
    name: scene.name,
    title: scene.name.replace(/_/g, " "),
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
    melody,
    cutoff: Math.round(clamp(400 * 2 ** (mood.brightness * 6), 600, 12000)),
    spread: Math.round(10 + mood.saturation * 60),
    leadOn: mood.saturation > 0.3,
    delayWet: +(style.echo + mood.saturation * 0.25).toFixed(2),
    reverbWet: +(style.space + (1 - place.confidence) * 0.3).toFixed(2),
    energy: +energy.toFixed(2),
  };
}
