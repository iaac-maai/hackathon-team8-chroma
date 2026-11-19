// The variation engine: every photo gets its own musical "DNA", so no two pieces sound alike.
// Pure data, no audio. Used by buildScore() in chroma-map.js.
//
// For each piece it picks (seeded by the photo, so the same photo gives the same piece,
// and "new version" gives another one):
//   SUB-GENRE   5–7 per place (38 in total), from calm to extreme: a park can be romantic piano … presto,
//               a club deep house … hardcore at 200+ bpm. Your speed picks among them in walk mode
//   RHYTHM      drum patterns built from rhythm "recipes" (fixed grooves + Euclidean rhythms),
//               rotated and mutated: thousands of different grooves
//   TEMPO       anywhere in the sub-genre's range, pushed by the photo's energy, ± a random nudge
//   HARMONY     the colours' own chords, or a classic progression of the sub-genre
//               (pop, jazz ii-V-I, minor loops, modal vamps), plus extra modes (phrygian, harmonic minor)
//   MELODY      one of six styles: phrases, sparse, busy, riff, arpeggio, pentatonic
//   SOUND       the instruments' sound is re-designed per piece: waveform, attack, length,
//               brightness, echo time. Same band, a different sound every time

export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const pick = (rand, list) => list[Math.floor(rand() * list.length) % list.length];
const between = (rand, [lo, hi]) => lo + (hi - lo) * rand();

// ---- rhythms -----------------------------------------------------------------------
// Euclidean rhythm: k hits spread as evenly as possible over 16 steps (used in music all over the world).
export function euclid(k, n = 16, rotate = 0) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(Math.floor(((i + rotate) * k) / n) !== Math.floor(((i + rotate - 1) * k) / n) ? "x" : ".");
  return out.join("");
}
// A pattern spec is a fixed "x..." string, a list of options, or { e: [minHits, maxHits] } for a Euclidean rhythm.
function pattern(spec, rand) {
  if (!spec) return undefined;
  if (typeof spec === "string") return spec;
  if (Array.isArray(spec)) return pattern(pick(rand, spec), rand);
  if (spec.e) {
    const k = Math.round(between(rand, spec.e));
    return euclid(k, 16, spec.rot ? Math.floor(rand() * 16) : 0);
  }
  return undefined;
}
// Small mutation: move or add one hit (never on the downbeat), so grooves drift between pieces.
function mutate(p, rand, amount) {
  if (!p || rand() > amount) return p;
  const a = p.split("");
  const i = 1 + Math.floor(rand() * 15);
  a[i] = a[i] === "x" ? "." : "x";
  return a.join("");
}

// ---- sub-genres ----------------------------------------------------------------------
// Each overrides the place's base genre (GENRES in chroma-map.js). `band` must be one of the
// six bands in chroma.js: classical, lofi, techno, rumba, ambient, jazz.
const FOUR = "x...x...x...x...";
const BACK = "....x.......x...";
export const SUBGENRES = {
  green: [
    { variant: "classical", desc: "piano arpeggios, strings, cello and flute, birdsong" },
    { variant: "minimal piano", desc: "slow broken chords on a soft piano, lots of space", band: "classical", tempo: [58, 72], pad: false, keys: "arpeggio", melody: ["sparse", "pentatonic"] },
    { variant: "neo-classical pulse", desc: "repeated pulsing chords, strings swelling underneath", band: "classical", tempo: [88, 108], keys: "stab", keysPattern: ["x.x.x.x.x.x.x.x.", "x..x..x.x..x..x.", { e: [5, 7], rot: true }], pad: true },
    { variant: "romantic piano", desc: "a real grand piano alone: Alberti bass, rubato, a singing tune (think Chopin, Satie)", band: "classical", tempo: [52, 64], keys: "alberti", pad: false, bass: "long", melody: ["phrases", "sparse"], progression: "classical", space: 0.5 },
    { variant: "allegro", desc: "fast classical: running piano and strings in sixteenths, like a Vivaldi storm", band: "classical", tempo: [132, 150], keys: "alberti", pad: true, bass: "pattern", patterns: { bass: ["x...x...x...x...", "x.x.x.x.x.x.x.x."] }, melody: ["busy", "arpeggio"], progression: "classical" },
    { variant: "presto", desc: "classical at full speed: furious piano runs over driving strings", band: "classical", tempo: [168, 188], keys: "alberti", pad: true, bass: "pattern", patterns: { bass: "x.x.x.x.x.x.x.x." }, melody: ["busy"], progression: "classical" },
    { variant: "folk", desc: "a strummed guitar, a shaker and a simple tune, like a picnic", band: "rumba", tempo: [84, 100], keys: "strum", keysPattern: ["x...x.x.x...x.x.", "x..x..x.x..x..x."], kickVel: 0, patterns: { shaker: ["x.x.x.x.x.x.x.x.", { e: [5, 8], rot: true }] }, space: 0.25, melody: ["phrases", "pentatonic"] },
  ],
  street: [
    { variant: "lo-fi hip-hop", desc: "lazy swung boom-bap, dusty wobbly e-piano, tape hiss" },
    { variant: "boom bap", drumKit: "LINN", desc: "hard swung drums, chopped piano chords, deep bass", band: "lofi", tempo: [86, 96], swing: 0.3, kickVel: 1, keysPattern: ["x.....x...x.....", "x.......x.x....."], patterns: { kick: ["x.....x...x.....", "x......x.x......", "x.x.....x.x....."], clap: BACK, hat: ["x.x.x.x.x.x.x.x.", "xxx.xxx.xxx.xxx."], bass: ["x.....x...x.....", "x......x.x......"] } },
    { variant: "jazzhop", drumKit: "acoustic-kit", desc: "jazzy chords, walking bass, brushed drums", band: "jazz", tempo: [78, 92], swing: 0.5, swingSub: "16n", kickVel: 0.7, bass: "walking", keys: "comp", keysPattern: ["x.....x.........", "x..x......x....."], patterns: { kick: ["x.......x.x.....", "x......x..x....."], clap: BACK, ride: ["x.x.x.x.x.x.x.x.", "x...x.x.x...x.x."] }, sevenths: true },
    { variant: "uk garage", drumKit: "Kit3", desc: "skippy 2-step drums, chopped chords, a bouncing sub bass", band: "lofi", tempo: [130, 136], swing: 0.25, swingSub: "16n", kickVel: 1, keys: "stab", keysPattern: ["..x..x....x..x..", ".x..x...x..x...."], patterns: { kick: ["x.........x.....", "x......x..x....."], clap: BACK, hat: ["..x...x...x...x.", "x.xxx.xxx.xxx.xx"], bass: ["x..x......x.x...", "x.....x..x..x..."] } },
    { variant: "jungle", drumKit: "R8", desc: "chopped breakbeats at 170, a booming sub bass, dub chords", band: "lofi", tempo: [162, 176], kickVel: 1, bass: "long", keys: "stab", keysPattern: ["x...............", "x.......x......."], patterns: { kick: ["x.........x.....", "x.x.......x..x..", "x.........xx...."], clap: ["....x..x.x..x...", "....x.....x.x..x", "....x.......x.x."], hat: ["x.xxx.xxx.xxx.xx", "xxxxxxxxxxxxxxxx"], perc: [{ e: [3, 5], rot: true }] } },
    { variant: "chillhop", drumKit: "Kit3", desc: "bouncy straight beat, bright keys, plucky bass", band: "lofi", tempo: [90, 102], swing: 0.12, patterns: { kick: [{ e: [3, 5], rot: false }, "x..x....x.x....."], clap: BACK, hat: ["x.xxx.xxx.xxx.xx", "xxxxxxxxxxxxxxxx"], bass: [{ e: [4, 6] }, "x..x..x...x....."] } },
  ],
  transit: [
    { variant: "techno", desc: "driving four-on-the-floor, pumping synth stabs, station chime" },
    { variant: "minimal techno", drumKit: "Stark", desc: "dry clicks, a hypnotic little loop, lots of space", band: "techno", tempo: [120, 126], keys: "stab", keysPattern: [{ e: [3, 5], rot: true }], patterns: { kick: FOUR, hat: "..x...x...x...x.", perc: [{ e: [5, 7], rot: true }, { e: [3, 5], rot: true }], bass: [{ e: [3, 5], rot: true }] }, pad: false, echo: 0.35 },
    { variant: "electro", drumKit: "CR78", desc: "broken robotic beat, squelchy bass, sharp claps", band: "techno", tempo: [110, 126], bass: "acid", acidPattern: ["x..x..x...x.x...", { e: [6, 9], rot: true }], keys: "none", patterns: { kick: ["x.....x...x.....", "x..x......x..x.."], clap: BACK, hat: ["x.x.x.x.x.x.x.x.", "x.xxx.x.x.xxx.x."] } },
    { variant: "hard techno", drumKit: "Techno", desc: "a distorted pounding kick at 150, rumbling bass, metallic hats", band: "techno", tempo: [146, 158], kickDrive: 0.75, kick: { pitchDecay: 0.06, octaves: 8, envelope: { decay: 0.4 } }, bass: "pattern", keys: "stab", keysPattern: [{ e: [2, 4], rot: true }], pad: false, patterns: { kick: FOUR, clap: ["....x.......x...", "................"], hat: ["xxxxxxxxxxxxxxxx", "x.xxx.xxx.xxx.xx"], perc: [{ e: [5, 7], rot: true }], bass: ".xxx.xxx.xxx.xxx" } },
    { variant: "dub techno", drumKit: "KPR77", desc: "deep chords drowning in echo, soft steady kick", band: "techno", tempo: [112, 122], keys: "stab", keysPattern: ["...x.......x....", "..x.....x.....x.", "...x..x....x...."], echo: 0.6, space: 0.35, patterns: { kick: FOUR, hat: ["..x...x...x...x.", "..x.x.x...x.x.x."], bass: "x.......x......." } },
  ],
  club: [
    { variant: "acid techno", desc: "pounding kick, squelchy acid bassline, off-beat hats, crowd and glasses" },
    { variant: "house", drumKit: "KPR77", desc: "four-on-the-floor, piano chord stabs, off-beat open hats", band: "techno", tempo: [120, 126], swing: 0.12, swingSub: "16n", bass: "pattern", keys: "comp", keysPattern: ["..x...x...x..x..", "x..x..x...x..x..", "..x..x....x..x.."], patterns: { kick: FOUR, clap: BACK, hat: "..x...x...x...x.", shaker: "xxxxxxxxxxxxxxxx", bass: ["..x...x...x...x.", "x..x..x...x..x.."] } },
    { variant: "deep house", drumKit: "KPR77", desc: "warm jazzy chords, rolling bass, soft shuffled drums", band: "techno", tempo: [116, 122], swing: 0.22, swingSub: "16n", bass: "pattern", keys: "comp", keysPattern: ["x.....x.........", "...x......x....."], sevenths: true, patterns: { kick: FOUR, clap: BACK, hat: ["..x...x...x...x.", ".xx..xx..xx..xx."], bass: ["x..x..x.x..x..x.", "x.....xx..x....."] } },
    { variant: "hardcore", drumKit: "Techno", desc: "gabber: a distorted kick on every beat at 200+, hoover stabs, rave chaos", band: "techno", tempo: [192, 214], kickDrive: 1, kick: { pitchDecay: 0.07, octaves: 9, envelope: { decay: 0.32 } }, bass: "pattern", keys: "stab", keysPattern: ["x.....x.....x...", "x..x..x..x..x..."], pad: true, patterns: { kick: ["x...x...x...x...", "x...x...x...x.x."], clap: ["....x.......x...", "........x......."], hat: "..x...x...x...x.", bass: "..x...x...x...x." }, melody: ["riff", "busy"] },
    { variant: "drum & bass", drumKit: "Kit8", desc: "fast broken drums at double speed, deep rolling bass", band: "techno", tempo: [164, 176], bass: "long", keys: "stab", keysPattern: ["x...............", "x.......x......."], patterns: { kick: ["x.........x.....", "x.......x.x....."], clap: BACK, hat: ["x.x.x.x.x.x.x.x.", "xxxxxxxxxxxxxxxx"], perc: [{ e: [3, 5], rot: true }] } },
  ],
  market: [
    { variant: "rumba catalana", desc: "fast strummed guitar, palmas, cajón, market chatter" },
    { variant: "cumbia", desc: "a lilting guitar, scraping güiro, steady bass on one and three", band: "rumba", tempo: [90, 104], keysPattern: ["..x...x...x...x.", "..xx..xx..xx..xx"], patterns: { kick: "x.......x.......", shaker: "xxxxxxxxxxxxxxxx", perc: ["..x...x...x...x.", "..x..xx...x..xx."], bass: ["x...x...x...x...", "x.....x.x.....x."] } },
    { variant: "flamenco", desc: "Spanish phrygian guitar, sharp palmas, fiery strums", band: "rumba", tempo: [110, 128], mode: "phrygian", keysPattern: ["x..x..x...x.x...", "x.xx.x..x.xx.x.."], patterns: { clap: ["..x..x..x.x.x...", "x..x..x...x.x..."], kick: "x...........x...", perc: [{ e: [5, 7], rot: true }], bass: "x.....x...x....." } },
    { variant: "bulerías", desc: "the fastest flamenco: furious palmas, a racing phrygian guitar", band: "rumba", tempo: [176, 200], mode: "phrygian", keysPattern: ["x.xx.xx.x.xx.xx.", "xxx.xx.xxx.xx.x."], patterns: { clap: ["x..x..x.x.x.x..x", "..x..x..x.x.x..."], kick: "x.....x.........", shaker: "xxxxxxxxxxxxxxxx", perc: [{ e: [7, 9], rot: true }], bass: "x.....x...x....." }, melody: ["busy", "riff"] },
    { variant: "afro groove", desc: "interlocking guitar, busy percussion, a bouncing bass", band: "rumba", tempo: [104, 118], keysPattern: [{ e: [7, 9], rot: true }], patterns: { kick: ["x.....x.x.......", "x..x....x..x...."], clap: BACK, shaker: "x.xxx.xxx.xxx.xx", perc: [{ e: [7, 7], rot: true }, { e: [5, 5], rot: true }], bass: [{ e: [5, 7], rot: true }] } },
  ],
  waterfront: [
    { variant: "ambient", desc: "very slow, no drums: wide pads, glassy bells, deep bass, waves and gulls" },
    { variant: "downtempo", drumKit: "Kit3", desc: "a slow, heavy beat under dreamy chords, like a sunset", band: "lofi", tempo: [70, 84], swing: 0.2, kickVel: 0.8, pad: true, patterns: { kick: ["x.......x.x.....", "x......x..x....."], clap: BACK, hat: ["x.x.x.x.x.x.x.x.", "..x...x...x...x."], bass: "x.......x.x....." }, extras: ["waves"] },
    { variant: "balearic house", drumKit: "KPR77", desc: "a soft four-on-the-floor, bright bells and warm pads by the sea", band: "ambient", tempo: [108, 118], kickVel: 0.7, patterns: { kick: FOUR, hat: "..x...x...x...x.", shaker: ["x.x.x.x.x.x.x.x.", "xxxxxxxxxxxxxxxx"] }, extras: ["gulls"] },
    { variant: "trance", drumKit: "Techno", desc: "euphoric 140: rolling off-beat bass, a big arpeggio, wide pads by the sea", band: "ambient", tempo: [136, 142], kickVel: 1, keys: "arpeggio", bass: "pattern", pad: true, patterns: { kick: FOUR, clap: BACK, hat: "..x...x...x...x.", bass: ".xxx.xxx.xxx.xxx" }, melody: ["phrases", "riff"] },
    { variant: "drone", desc: "almost still: long tones and slow bells, the sea breathing", band: "ambient", tempo: [48, 58], keys: "bell", melody: ["sparse"], extras: ["waves"] },
  ],
  square: [
    { variant: "night jazz", desc: "swung ride, Rhodes comping, walking upright bass, breathy horn" },
    { variant: "bossa nova", desc: "a gentle Brazilian rhythm, soft jazzy chords, rim clicks", band: "jazz", tempo: [118, 138], swing: 0, bass: "pattern", keysPattern: ["x..x..x...x..x..", "x..x...x..x..x.."], patterns: { kick: "x..x....x..x....", perc: ["x..x..x...x..x..", "..x..x....x..x.."], hat: "x.x.x.x.x.x.x.x.", bass: "x..x....x..x...." }, sevenths: true },
    { variant: "blues shuffle", desc: "a lazy shuffle, bluesy chords, walking bass", band: "jazz", tempo: [78, 98], swing: 0.66, swingSub: "8n", mode: "mixolydian", kickVel: 0.6, patterns: { kick: "x.......x.......", clap: BACK, ride: "x.x.x.x.x.x.x.x." } },
    { variant: "bebop", desc: "jazz at breakneck speed: racing ride, fast walking bass, a horn full of notes", band: "jazz", tempo: [200, 250], swing: 0.55, swingSub: "8n", bass: "walking", keysPattern: ["x.....x...x.....", "...x......x..x.."], patterns: { ride: ["x.xxx.xxx.xxx.xx", "x...x.xxx...x.xx"], hat: "....x.......x...", kick: "..........x....." }, kickVel: 0.4, melody: ["busy"], sevenths: true },
    { variant: "cool jazz ballad", desc: "slow brushes, soft piano chords, a lonely horn", band: "jazz", tempo: [60, 76], swing: 0.5, keysPattern: ["x...............", "x.......x......."], patterns: { ride: ["x...x...x...x...", "x..x..x...x..x.."] }, melody: ["sparse", "phrases"] },
  ],
};

// ---- harmony -------------------------------------------------------------------------
export const PROGRESSIONS = {
  pop: [[0, 4, 5, 3], [0, 5, 3, 4], [5, 3, 0, 4], [0, 3, 4, 3]],
  jazz: [[1, 4, 0, 0], [0, 5, 1, 4], [2, 5, 1, 4], [0, 3, 2, 5]],
  minor: [[0, 5, 2, 6], [0, 3, 4, 0], [0, 6, 5, 6], [0, 5, 3, 4]],
  vamp: [[0, 6], [0, 3], [0, 1], [0, 4]],
  classical: [[0, 3, 4, 0], [0, 5, 1, 4], [0, 1, 4, 0], [0, 3, 1, 4], [5, 1, 4, 0]], // I-IV-V-I, I-vi-ii-V …
};
const PROG_FOR = { classical: ["classical", "classical", "pop", "minor"], lofi: ["jazz", "minor", "vamp"], techno: ["vamp", "minor"], rumba: ["minor", "pop", "vamp"], ambient: ["vamp", "pop"], jazz: ["jazz", "pop"] };

// ---- sound design ----------------------------------------------------------------------
// Re-designs the band's instruments for this piece (applied with .set() in chroma.js).
const OSC = {
  classical: ["triangle", "sine", "fattriangle", "square4"],
  lofi: ["sine", "triangle", "square8", "fatsine"],
  techno: ["fatsawtooth", "fatsquare", "sawtooth", "pulse", "fmsquare"],
  rumba: [null],
  ambient: ["fattriangle", "fatsine", "sine", "amtriangle"],
  jazz: ["sine", "triangle", "fmsine"],
};
const LEAD = {
  classical: ["sine", "triangle", "square4"],
  lofi: ["square", "triangle", "sine", "pulse"],
  techno: ["fatsquare", "sawtooth", "fmsquare", "square"],
  rumba: [null],
  ambient: ["sine", "triangle", "amsine"],
  jazz: ["sawtooth", "square", "triangle"],
};

export function soundDesign(band, rand) {
  return {
    keysOsc: pick(rand, OSC[band] ?? [null]),
    keysAttack: +(0.002 + rand() ** 3 * 0.25).toFixed(3),   // mostly plucky, sometimes soft
    keysDecay: +between(rand, [0.4, 2.4]).toFixed(2),
    leadOsc: pick(rand, LEAD[band] ?? [null]),
    leadAttack: +(0.005 + rand() ** 2 * 0.2).toFixed(3),
    padSpread: Math.round(between(rand, [10, 60])),
    brightness: +between(rand, [0.6, 1.5]).toFixed(2),       // multiplies the tone filter
    delayTime: pick(rand, ["8n.", "8n", "4n", "16n.", "4n."]),
    feedback: +between(rand, [0.2, 0.55]).toFixed(2),
    detune: Math.round(between(rand, [-12, 12])),
    // plucked strings (rumba band): how dull or bright, how long they ring
    damp: Math.round(between(rand, [1800, 6500])),
    ring: +between(rand, [0.85, 0.98]).toFixed(3),
  };
}

// ---- melody styles -----------------------------------------------------------------------
//   density ×, chance of off-beat 16ths, contour range, rhythm grid, notes allowed
export const MELODY_STYLES = {
  phrases:    { desc: "phrases: a call and an answer", density: 1, offbeat: 0.22, range: 9 },
  sparse:     { desc: "sparse: a few long notes", density: 0.45, offbeat: 0.05, range: 7 },
  busy:       { desc: "busy: quick runs of notes", density: 1.6, offbeat: 0.7, range: 11 },
  riff:       { desc: "riff: a short hook, repeated and moved", density: 1.2, offbeat: 0.4, range: 6, riff: true },
  arpeggio:   { desc: "arpeggio: walking up and down the chord", density: 1.4, offbeat: 0.1, range: 9, chordOnly: true },
  pentatonic: { desc: "pentatonic: five-note folk scale", density: 0.9, offbeat: 0.2, range: 9, avoid: [3, 6] },
};

// ---- the DNA -------------------------------------------------------------------------------
// base = the place's genre from GENRES. Returns a full style plus the choices made.
// `energy` (0 … 1, from your speed, see walk.js): the place's sub-genres are ranked from slowest
// to fastest and the speed picks among them (still → the calmest, flat out → the most extreme).
// Without it, the photo leans and chance decides.
export function styleDNA(place, base, rand, mood, energy = null) {
  const options = SUBGENRES[place] ?? [{}];
  let sub;
  if (energy !== null && energy !== undefined) {
    const mid = (o) => { const [a, b] = o.tempo ?? base.tempo; return (a + b) / 2; };
    const ranked = [...options].sort((a, b) => mid(a) - mid(b));
    const target = clamp(energy, 0, 1) * (ranked.length - 1);
    const near = ranked.filter((o, i) => Math.abs(i - target) <= 0.75);
    sub = near[Math.floor(rand() * near.length) % near.length];
  } else {
    // brighter / higher-energy photos lean to the later (livelier) options, but chance decides
    const lean = clamp((mood.contrast + mood.saturation) / 2, 0, 1);
    const i = Math.floor(clamp(rand() * 0.75 + lean * 0.25, 0, 0.999) * options.length);
    sub = options[i];
  }
  const style = { ...base, ...sub, genre: sub.variant ?? base.genre, desc: sub.desc ?? base.desc };
  // rhythm: build each part from its recipe, then mutate a little
  const recipe = { ...base.patterns, ...(sub.patterns ?? {}) };
  style.patterns = {};
  for (const [part, spec] of Object.entries(recipe)) {
    style.patterns[part] = mutate(pattern(spec, rand), rand, part === "kick" ? 0.25 : 0.5);
  }
  if (sub.keysPattern) style.keysPattern = mutate(pattern(sub.keysPattern, rand), rand, 0.4);
  else if (base.keysPattern) style.keysPattern = mutate(base.keysPattern, rand, 0.5);
  if (sub.acidPattern) style.acidPattern = pattern(sub.acidPattern, rand);
  else if (base.acidPattern) style.acidPattern = mutate(base.acidPattern, rand, 0.6);
  // tempo range of the sub-genre, nudged ±4%
  const nudge = 1 + (rand() - 0.5) * 0.08;
  style.tempo = (sub.tempo ?? base.tempo).map((t) => Math.round(t * nudge));
  // harmony and melody choices
  const progFamily = sub.progression ?? pick(rand, PROG_FOR[style.band] ?? ["pop"]);
  const colours = rand() < (sub.progression ? 0.15 : 0.45); // real classical mostly keeps real cadences
  style.progression = colours ? null : pick(rand, PROGRESSIONS[progFamily]); // null = the colours decide
  style.progFamily = style.progression ? progFamily : "colours";
  style.melodyStyle = pick(rand, sub.melody ?? Object.keys(MELODY_STYLES));
  style.timbre = soundDesign(style.band, rand);
  style.space = clamp((style.space ?? 0.2) + (rand() - 0.5) * 0.15, 0.02, 0.8);
  style.echo = clamp((style.echo ?? 0.15) + (rand() - 0.5) * 0.15, 0, 0.7);
  return style;
}
