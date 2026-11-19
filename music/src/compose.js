// The composer: turns the basic score (key, chords, genre) into a real little piece.
// Pure data, no audio. Used by buildScore() in chroma-map.js.
//
// What it adds, so two photos never sound like the same loop:
//   SONG SHAPE   intro (sparse, builds up) → main bars → a fill → an ending on the home chord
//                longer pieces also get a "lift": a bar where the drums drop out, then come back
//   HARMONY      chords move smoothly (closest inversion = voice leading), jazzy genres add 9ths,
//                the last bar always resolves to the home chord
//   MELODY       real phrases: a "call", then an "answer" that comes home, then the call again
//                one step higher; its shape follows the photo's brightness from left to right
//   COUNTER-LINE colourful photos get a second voice a third below the melody
//   DRUMS        every bar a little different: ghost notes from the photo's detail scan,
//                syncopated kicks, a drum fill before the ending, a crash on the last bar,
//                and small human timing and velocity changes
//   BASS         approach notes into the next chord; a bright ground lifts the bass an octave
//
// Photo layers from the model server (all optional, with fallbacks):
//   scan.brightness (16, left → right)  melody shape
//   scan.detail     (16, left → right)  the groove: busy strips get extra hits
//   layers.top      (sky)               pad brightness
//   layers.middle   (facades, people)   how many melody notes
//   layers.ground   (street, floor)     drum busyness and bass register

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// Per-bar plan. n = number of bars.
// live (walk mode): no intro or ending, the loop keeps going; a fill leads into the next round.
export function songShape(n, live = false) {
  const shape = Array(n).fill("main");
  if (live) {
    shape[n - 1] = "fill";
    if (n >= 6) shape[Math.floor(n / 2) - 1] = "lift";
    return shape;
  }
  shape[0] = "intro";
  shape[n - 1] = "end";
  if (n >= 4) shape[n - 2] = "fill";
  if (n >= 7) shape[Math.floor(n / 2)] = "lift";
  return shape;
}

// Closest inversion of `notes` to the previous chord, kept in a comfortable range.
export function voiceLead(chords, low, high) {
  let prev = null;
  for (const c of chords) {
    const options = [];
    for (let inv = 0; inv < c.play.length; inv++) {
      const v = c.play.map((n, i) => (i < inv ? n + 12 : n)).sort((a, b) => a - b);
      for (const shift of [-12, 0, 12]) {
        const w = v.map((n) => n + shift);
        if (w[0] >= low && w[w.length - 1] <= high) options.push(w);
      }
    }
    if (!options.length) options.push(c.play);
    const centre = (w) => w.reduce((a, b) => a + b, 0) / w.length;
    const cost = (w) => (prev ? Math.abs(centre(w) - centre(prev)) + Math.abs(w[0] - prev[0]) * 0.5 : Math.abs(centre(w) - (low + high) / 2));
    c.voicing = options.reduce((a, b) => (cost(b) < cost(a) ? b : a));
    prev = c.voicing;
  }
}

// A 16-value shape when the photo has no scan: a smooth seeded wave, so the examples vary too.
function fakeScan(rand) {
  const a = rand() * 6.28, f = 1 + rand() * 2, base = 0.35 + rand() * 0.3;
  return Array.from({ length: 16 }, (_, i) => clamp(base + 0.25 * Math.sin(a + (i / 16) * 6.28 * f) + (rand() - 0.5) * 0.15, 0, 1));
}

// Melody: phrases of 2 bars. Returns notes, lengths (in steps) and a counter-line.
export function compose({ bars, shape, chords, chordAt, deg, tonic, lift, rand, scan, density, staccato, counter, homeDegree, melodyStyle = {} }) {
  const ms = { offbeat: 0.22, range: 9, ...melodyStyle };
  const steps = bars * 16;
  const notes = Array(steps).fill(null);
  const lengths = Array(steps).fill(0);
  const harmony = Array(steps).fill(null);
  const contour = scan.brightness;

  // Phrase A: rhythm on 8th notes (some 16th pickups), pitch follows the photo's brightness.
  const rhythm = [];
  for (let k = 0; k < 32; k++) {
    const strong = k % 8 === 0 ? 1.5 : k % 4 === 0 ? 1.15 : k % 2 === 0 ? 0.8 : ms.offbeat;
    if (ms.riff && k >= 16) break; // a riff is one bar, repeated below
    if (rand() < density * strong) rhythm.push(k);
  }
  if (!rhythm.includes(0)) rhythm.unshift(0);
  // degree above the chord root: bright strip → higher note
  const target = (k) => Math.round(contour[Math.floor(k / 2) % 16] * ms.range) - 1;
  const chordTones = [0, 2, 4, 7, 9];
  const snap = (d) => chordTones.reduce((a, b) => (Math.abs(b - d) < Math.abs(a - d) ? b : a));
  const phraseA = [];
  let last = 2;
  for (const k of rhythm) {
    let d = target(k);
    d = clamp(d, last - 3, last + 3);   // no wild leaps
    if (k % 4 === 0 || ms.chordOnly) d = snap(d); // on the beat (or always, for arpeggios): a chord note
    phraseA.push([k, d]);
    last = d;
  }
  if (ms.riff) { // the hook again in bar 2, moved up a step
    for (const [k, d] of [...phraseA]) phraseA.push([k + 16, d + 2]);
  }
  // Answer (B): the first bar echoes the call, the second bar walks home to the chord root
  // and then holds it (fewer, longer notes: the phrase "breathes").
  const second = phraseA.filter(([k]) => k >= 16 && k < 26);
  const phraseB = [
    ...phraseA.filter(([k]) => k < 16),
    ...second.map(([k, d], i) => [k, Math.max(0, Math.min(d, second.length - i + 1))]),
    [second.length ? Math.max(24, second[second.length - 1][0] + 2) : 24, 0],
  ];
  // The call again, one step higher, with a 16th pickup into it.
  const phraseA2 = [...phraseA.map(([k, d]) => [k, d + 1])];
  if (!rhythm.includes(31)) phraseA2.push([31, phraseA[0][1] + 2]);

  const order = [phraseA, phraseB, phraseA2, phraseB];
  for (let p = 0; p * 32 < steps; p++) {
    const phrase = order[p % order.length];
    for (const [k, d] of phrase) {
      const s = p * 32 + k;
      if (s >= steps) continue;
      const sec = shape[Math.floor(s / 16)];
      if ((sec === "intro" && s % 16 < 8) || sec === "end") continue; // enter halfway the intro; ending done below
      let abs = chordAt(s).degree + d;
      if (ms.avoid?.includes(((abs % 7) + 7) % 7)) abs += 1; // pentatonic: skip the 4th and 7th
      notes[s] = tonic + deg(abs) + lift;
    }
  }
  // Ending: one long note on the home chord (not in a live loop).
  if (shape[bars - 1] === "end") notes[(bars - 1) * 16] = tonic + deg(homeDegree) + lift;

  // Lengths: until the next note (max 1 bar); techno plays short.
  let next = steps;
  for (let s = steps - 1; s >= 0; s--) {
    if (notes[s] === null) continue;
    lengths[s] = Math.min(next - s, 16);
    if (staccato) lengths[s] = Math.min(lengths[s], 2);
    next = s;
  }
  // Counter-line: a third below, on the beat only.
  if (counter) {
    for (let s = 0; s < steps; s++) {
      if (notes[s] === null || s % 4) continue;
      const c = chordAt(s);
      // find this note's degree back, then go two scale steps down
      for (let d = -7; d < 21; d++) {
        if (tonic + deg(c.degree + d) + lift === notes[s]) { harmony[s] = tonic + deg(c.degree + d - 2) + lift; break; }
      }
    }
  }
  return { notes, lengths, harmony };
}

// Drums: one velocity (0 = rest) per instrument per step, every bar a little different.
export function drumScore({ bars, shape, style, energy, busy, rand, scan, groundDetail, soft }) {
  const steps = bars * 16;
  const parts = ["kick", "clap", "hat", "ride", "shaker", "perc", "crash"];
  const out = Object.fromEntries(parts.map((p) => [p, new Array(steps).fill(0)]));
  const p = style.patterns;
  const hasDrums = style.kickVel > 0 || Object.keys(p).length > 0;
  if (!hasDrums) return out;
  const hit = (pat, step) => pat?.[step] === "x";
  const v = 0.5 + 0.5 * energy;
  const human = () => 0.88 + rand() * 0.24;
  const ghostAt = (step) => scan.detail[step] > 0.35 + (1 - groundDetail) * 0.35; // busy strip → extra hit

  for (let b = 0; b < bars; b++) {
    const sec = shape[b];
    const variant = b % 2 === 1 && rand() < 0.4 + energy * 0.4; // every other bar: a small twist
    for (let step = 0; step < 16; step++) {
      const s = b * 16 + step;
      const set = (part, vel) => { out[part][s] = clamp(vel * human() * soft, 0, 1); };
      if (sec === "end") {
        if (step === 0) { if (style.kickVel > 0) set("kick", v * style.kickVel); set("crash", 0.8); }
        continue;
      }
      const introQuiet = sec === "intro" && step < 8;
      const lift = sec === "lift";
      const fillZone = sec === "fill" && step >= 12;

      // kick
      if (style.kickVel > 0 && !introQuiet && !lift && !fillZone) {
        if (hit(p.kick, step)) set("kick", v * style.kickVel);
        else if (variant && (step === 14 || step === 10) && rand() < 0.6) set("kick", v * style.kickVel * 0.7);
      }
      // clap / snare
      if (!introQuiet && !lift && hit(p.clap, step) && !fillZone) set("clap", 0.4 + 0.6 * energy);
      // hats: genre pattern + ghost notes from the photo's detail scan; quiet places thin out
      if (p.hat && !fillZone) {
        const thin = busy !== null && busy < 0.25 && step % 4 !== 2;
        if (hit(p.hat, step) && !thin) set("hat", (0.3 + 0.7 * energy) * (step % 4 === 2 ? 1 : 0.55) * (introQuiet ? 0.5 : 1));
        else if (!hit(p.hat, step) && step % 2 && (ghostAt(step) || (busy ?? 0) > 0.6)) set("hat", 0.2);
      }
      if (hit(p.ride, step) && !introQuiet) set("ride", (0.5 + 0.5 * energy) * (step % 4 === 0 ? 1 : 0.7));
      if (hit(p.shaker, step)) set("shaker", step % 2 ? 0.5 : 1);
      // percussion: genre pattern + the groove of the photo
      if (!introQuiet && !fillZone) {
        if (hit(p.perc, step)) set("perc", 0.8);
        else if (p.perc && ghostAt(step) && rand() < 0.5) set("perc", 0.4);
      }
      // fill: a roll that gets louder into the ending
      if (fillZone) {
        set(style.band === "jazz" ? "ride" : "perc", 0.5 + (step - 12) * 0.15);
        if (step % 2 === 0 || energy > 0.6) set("clap", 0.35 + (step - 12) * 0.15);
      }
    }
  }
  return out;
}

// Small timing offsets (seconds) per step: loose for lo-fi and jazz, tight for techno.
export function humanTiming(steps, band, rand) {
  const ms = { lofi: 14, jazz: 10, rumba: 6, classical: 8, ambient: 0, techno: 1.5 }[band] ?? 4;
  return Array.from({ length: steps }, () => ((rand() - 0.5) * 2 * ms) / 1000);
}

export { fakeScan };
