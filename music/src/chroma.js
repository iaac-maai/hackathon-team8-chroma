import * as Tone from "tone";
import { scenes } from "./scenes.js";
import { buildScore } from "./chroma-map.js";

window.Tone = Tone;

// =============================================================================
// 1. TURN THE SCENE CARDS INTO SCORES (each one a ~10-second piece)
// =============================================================================
// chroma.html?scene=eixample_club_night plays that one piece alone, as the app
// will for one photo. Without ?scene: all pieces back to back.
const solo = new URLSearchParams(location.search).get("scene");
const chosen = scenes.filter((s) => s.name === solo);
const scores = (chosen.length ? chosen : scenes).map((s) => buildScore(s));

// Timeline: where each piece starts, in 16th steps and in seconds (tempos differ).
let accSteps = 0;
let accSec = 0;
const timeline = scores.map((sc) => {
  const t = { startStep: accSteps, startSec: accSec, steps: sc.bars * 16 };
  accSteps += t.steps;
  accSec += sc.seconds;
  return t;
});
const TOTAL_STEPS = accSteps;
const LENGTH = accSec;
const sceneAt = (t) => timeline.findLastIndex((x) => t >= x.startStep);
const barSec = (sc) => 240 / sc.bpm;
const stepSec = (sc) => 15 / sc.bpm;

const transport = Tone.getTransport();
transport.bpm.value = scores[0].bpm;
const hz = (midi) => Tone.Frequency(midi, "midi").toFrequency();

// =============================================================================
// 2. SOUNDS
// =============================================================================
// Shared effects. Reverb and delay are "sends": the scene sets how much goes in.
const limiter = new Tone.Limiter(-1).toDestination();
const master = new Tone.Volume(-4).connect(limiter);
const reverb = new Tone.Reverb({ decay: 6, wet: 1 }).connect(master);
const reverbSend = new Tone.Gain(0.3).connect(reverb);
const wet = (node) => { node.connect(master); node.connect(reverbSend); return node; };
const delay = wet(new Tone.PingPongDelay({ delayTime: "8n.", feedback: 0.35, wet: 1 }));
const delaySend = new Tone.Gain(0.3).connect(delay);

// --- Drum kit: one set of drums, re-tuned per genre (see KITS) ---------------
const kick = new Tone.MembraneSynth({
  pitchDecay: 0.04, octaves: 6,
  envelope: { attack: 0.001, decay: 0.45, sustain: 0 },
}).connect(master);

const clapFilter = wet(new Tone.Filter(1800, "bandpass"));
const clap = new Tone.NoiseSynth({
  noise: { type: "pink" },
  envelope: { attack: 0.001, decay: 0.18, sustain: 0 },
  volume: -10,
}).connect(clapFilter);

const hatFilter = new Tone.Filter(8000, "highpass").connect(master);
const hat = new Tone.NoiseSynth({
  noise: { type: "white" },
  envelope: { attack: 0.001, decay: 0.05, sustain: 0 },
  volume: -18,
}).connect(hatFilter);

const shaker = new Tone.NoiseSynth({
  noise: { type: "white" },
  envelope: { attack: 0.001, decay: 0.03, sustain: 0 },
  volume: -26,
}).connect(new Tone.Filter(9000, "highpass").connect(master));

const perc = new Tone.MembraneSynth({
  pitchDecay: 0.008, octaves: 1.5,
  envelope: { attack: 0.001, decay: 0.12, sustain: 0 },
  volume: -14,
});
perc.connect(master);
perc.connect(delaySend);

const ride = new Tone.MetalSynth({ // jazz ride cymbal
  envelope: { attack: 0.001, decay: 0.9, release: 0.3 },
  harmonicity: 5.1, modulationIndex: 24, resonance: 5000, octaves: 1.2,
  volume: -30,
}).connect(wet(new Tone.Filter(3000, "highpass")));

// How the kit is tuned per band: kick body, clap colour, hat length and brightness.
const KITS = {
  techno:    { note: "C1", kick: { pitchDecay: 0.05, octaves: 7, envelope: { decay: 0.55 } }, clap: 1800, hatDecay: 0.04, hatFreq: 8500 },
  lofi:      { note: "D1", kick: { pitchDecay: 0.03, octaves: 4, envelope: { decay: 0.3 } }, clap: 1100, hatDecay: 0.025, hatFreq: 4500 },
  rumba:     { note: "A1", kick: { pitchDecay: 0.012, octaves: 2, envelope: { decay: 0.15 } }, clap: 2800, hatDecay: 0.04, hatFreq: 9000 },
  jazz:      { note: "F1", kick: { pitchDecay: 0.02, octaves: 3, envelope: { decay: 0.25 } }, clap: 1500, hatDecay: 0.06, hatFreq: 6500 },
  classical: { note: "C1", kick: { pitchDecay: 0.08, octaves: 3, envelope: { decay: 0.8 } }, clap: 1500, hatDecay: 0.08, hatFreq: 9000 },
  ambient:   { note: "C1", kick: { pitchDecay: 0.08, octaves: 3, envelope: { decay: 0.8 } }, clap: 1500, hatDecay: 0.08, hatFreq: 9000 },
};

// --- Place signatures ---------------------------------------------------------
const birds = new Tone.Synth({
  oscillator: { type: "sine" }, portamento: 0.04,
  envelope: { attack: 0.005, decay: 0.05, sustain: 0.3, release: 0.05 },
  volume: -22,
});
birds.connect(master);
birds.connect(delaySend);

const gull = new Tone.Synth({ // seagull: a high note that slides down
  oscillator: { type: "triangle" }, portamento: 0.25,
  envelope: { attack: 0.03, decay: 0.1, sustain: 0.6, release: 0.15 },
  volume: -26,
});
gull.connect(wet(new Tone.Filter(2500, "bandpass")));

const waveFilter = wet(new Tone.Filter(300, "lowpass"));
const waves = new Tone.NoiseSynth({
  noise: { type: "pink" },
  envelope: { attack: 1.5, decay: 0.1, sustain: 1, release: 1.5 },
  volume: -12,
}).connect(waveFilter);

const crowd = new Tone.NoiseSynth({ // murmur of people (club, market)
  noise: { type: "brown" },
  envelope: { attack: 1, decay: 0.1, sustain: 1, release: 1 },
  volume: -28,
}).connect(wet(new Tone.Filter({ frequency: 900, type: "bandpass", Q: 0.8 })));

const glass = wet(new Tone.Synth({
  oscillator: { type: "sine" },
  envelope: { attack: 0.001, decay: 0.25, sustain: 0, release: 0.2 },
  volume: -26,
}));

const chime = wet(new Tone.PolySynth(Tone.Synth, {
  oscillator: { type: "sine" },
  envelope: { attack: 0.005, decay: 1.5, sustain: 0, release: 1 },
  volume: -12,
}));

// --- Bands: one set of instruments per genre ---------------------------------
// Every band has the same parts (keys, pad, bass, lead) so the sequencer can
// treat them alike. Only the active band is turned up; the others sit at 0.
//   out     → chords and melody (goes through reverb)
//   low     → bass (dry, so the low end stays clean)
//   bright  → tone filter, opened by the photo's brightness, capped by `toneMax`
function band(toneMax) {
  const out = wet(new Tone.Gain(0));
  const low = new Tone.Gain(0).connect(master);
  const bright = new Tone.Filter(2000, "lowpass").connect(out);
  return { out, low, bright, toneMax };
}
const withDelay = (synth, ...dest) => { dest.forEach((d) => synth.connect(d)); synth.connect(delaySend); return synth; };

const bands = {
  // Park → classical: piano-ish arpeggios, string section, cello, flute
  classical: (() => {
    const b = band(8000);
    const flute = new Tone.Vibrato(5, 0.06).connect(b.bright);
    return {
      ...b,
      keys: new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "triangle" },
        envelope: { attack: 0.002, decay: 1.8, sustain: 0.04, release: 1.4 },
        volume: -9,
      }).connect(b.bright),
      pad: new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "fatsawtooth", count: 3, spread: 20 },
        envelope: { attack: 1.4, decay: 0.4, sustain: 0.8, release: 2.5 },
        volume: -25,
      }).connect(new Tone.Filter(1600, "lowpass").connect(b.bright)),
      bass: new Tone.MonoSynth({
        oscillator: { type: "sawtooth" },
        filter: { Q: 1, type: "lowpass" },
        envelope: { attack: 0.25, decay: 0.4, sustain: 0.8, release: 0.8 },
        filterEnvelope: { attack: 0.3, decay: 0.6, sustain: 0.5, baseFrequency: 120, octaves: 2 },
        volume: -16,
      }).connect(b.low),
      lead: withDelay(new Tone.Synth({
        oscillator: { type: "sine" },
        envelope: { attack: 0.08, decay: 0.2, sustain: 0.6, release: 0.6 },
        volume: -14,
      }), flute),
    };
  })(),

  // Street → lo-fi hip-hop: wobbly FM e-piano, soft bass, tape hiss, dull top end
  lofi: (() => {
    const b = band(3200);
    const wow = new Tone.Vibrato(0.6, 0.06).connect(b.bright); // tape wobble
    return {
      ...b,
      keys: new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 2, modulationIndex: 1.8,
        oscillator: { type: "sine" }, modulation: { type: "sine" },
        envelope: { attack: 0.005, decay: 1.4, sustain: 0.25, release: 0.9 },
        modulationEnvelope: { attack: 0.005, decay: 0.4, sustain: 0.1, release: 0.4 },
        volume: -8,
      }).connect(wow),
      bass: new Tone.MonoSynth({
        oscillator: { type: "triangle" },
        filter: { Q: 1, type: "lowpass" },
        envelope: { attack: 0.01, decay: 0.5, sustain: 0.4, release: 0.2 },
        filterEnvelope: { attack: 0.01, decay: 0.3, sustain: 0.3, baseFrequency: 180, octaves: 2 },
        volume: -5,
      }).connect(b.low),
      lead: withDelay(new Tone.Synth({
        oscillator: { type: "square" },
        envelope: { attack: 0.01, decay: 0.25, sustain: 0.2, release: 0.3 },
        volume: -24,
      }), wow),
      hiss: new Tone.Noise({ type: "pink", volume: -36 }).connect(new Tone.Filter(2500, "highpass").connect(b.out)),
    };
  })(),

  // Station / club → techno: pumping synths; the club adds a distorted acid bass
  techno: (() => {
    const b = band(12000);
    const pump = new Tone.Gain(1).connect(b.bright);
    const pumpLow = new Tone.Gain(1).connect(b.low);
    const grit = new Tone.Distortion(0.5).connect(pumpLow);
    return {
      ...b, pump, pumpLow,
      pad: new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "fatsawtooth", count: 3, spread: 30 },
        envelope: { attack: 0.8, decay: 0.5, sustain: 0.7, release: 2 },
        volume: -21,
      }).connect(pump),
      keys: new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "fatsawtooth", count: 3, spread: 20 },
        envelope: { attack: 0.005, decay: 0.2, sustain: 0, release: 0.1 },
        volume: -16,
      }).connect(pump),
      bass: new Tone.MonoSynth({
        oscillator: { type: "sawtooth" },
        filter: { Q: 3, type: "lowpass" },
        envelope: { attack: 0.005, decay: 0.2, sustain: 0.5, release: 0.1 },
        filterEnvelope: { attack: 0.005, decay: 0.2, sustain: 0.3, baseFrequency: 90, octaves: 3 },
        volume: -9,
      }).connect(pumpLow),
      acid: new Tone.MonoSynth({ // squelchy 303-style line: sharp resonant filter + slides
        oscillator: { type: "sawtooth" },
        filter: { Q: 14, type: "lowpass", rolloff: -24 },
        envelope: { attack: 0.002, decay: 0.2, sustain: 0.2, release: 0.05 },
        filterEnvelope: { attack: 0.002, decay: 0.16, sustain: 0.1, baseFrequency: 160, octaves: 4.4 },
        portamento: 0.04,
        volume: -16,
      }).connect(grit),
      lead: withDelay(new Tone.Synth({
        oscillator: { type: "fatsquare", count: 2, spread: 15 },
        envelope: { attack: 0.005, decay: 0.15, sustain: 0.3, release: 0.15 },
        volume: -20,
      }), b.bright),
    };
  })(),

  // Market → rumba catalana: plucked "guitar" strings, round bass, very dry
  rumba: (() => {
    const b = band(12000);
    return {
      ...b,
      guitar: Array.from({ length: 5 }, () =>
        new Tone.PluckSynth({ attackNoise: 2, dampening: 3800, resonance: 0.95, volume: -2 }).connect(b.bright)),
      bass: new Tone.MonoSynth({
        oscillator: { type: "sine" },
        filter: { Q: 1, type: "lowpass" },
        envelope: { attack: 0.005, decay: 0.3, sustain: 0.2, release: 0.1 },
        filterEnvelope: { attack: 0.005, decay: 0.2, sustain: 0.3, baseFrequency: 200, octaves: 2 },
        volume: -4,
      }).connect(b.low),
      lead: withDelay(new Tone.PluckSynth({ attackNoise: 1, dampening: 5000, resonance: 0.97, volume: -2 }), b.bright),
    };
  })(),

  // Beach → ambient: wide slow pad, glassy FM bells, deep sine bass
  ambient: (() => {
    const b = band(6000);
    return {
      ...b,
      pad: new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "fattriangle", count: 3, spread: 40 },
        envelope: { attack: 2.5, decay: 0.5, sustain: 0.8, release: 4 },
        volume: -14,
      }).connect(b.bright),
      keys: withDelay(new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 3.01, modulationIndex: 10,
        envelope: { attack: 0.001, decay: 2.5, sustain: 0, release: 2 },
        modulationEnvelope: { attack: 0.001, decay: 0.8, sustain: 0, release: 0.5 },
        volume: -20,
      }), b.bright),
      bass: new Tone.MonoSynth({
        oscillator: { type: "sine" },
        filter: { Q: 0, type: "lowpass" },
        envelope: { attack: 0.8, decay: 0.5, sustain: 0.9, release: 2 },
        filterEnvelope: { baseFrequency: 300, octaves: 0 },
        volume: -12,
      }).connect(b.low),
      lead: withDelay(new Tone.Synth({
        oscillator: { type: "sine" },
        envelope: { attack: 0.2, decay: 0.3, sustain: 0.5, release: 1.5 },
        volume: -18,
      }), b.bright),
    };
  })(),

  // Square / bar at night → jazz: Rhodes-style FM piano, upright bass, breathy horn
  jazz: (() => {
    const b = band(5000);
    const sax = new Tone.Vibrato(4.5, 0.05).connect(b.bright);
    return {
      ...b,
      keys: new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 1, modulationIndex: 3.5,
        oscillator: { type: "sine" }, modulation: { type: "sine" },
        envelope: { attack: 0.003, decay: 2, sustain: 0.15, release: 1.2 },
        modulationEnvelope: { attack: 0.002, decay: 0.3, sustain: 0.05, release: 0.3 },
        volume: -9,
      }).connect(b.bright),
      bass: new Tone.MonoSynth({
        oscillator: { type: "triangle" },
        filter: { Q: 2, type: "lowpass" },
        envelope: { attack: 0.004, decay: 0.5, sustain: 0.1, release: 0.2 },
        filterEnvelope: { attack: 0.004, decay: 0.15, sustain: 0.2, baseFrequency: 150, octaves: 2.5 },
        volume: -3,
      }).connect(b.low),
      lead: withDelay(new Tone.MonoSynth({
        oscillator: { type: "sawtooth" },
        filter: { Q: 1, type: "lowpass" },
        envelope: { attack: 0.04, decay: 0.2, sustain: 0.6, release: 0.3 },
        filterEnvelope: { attack: 0.05, decay: 0.3, sustain: 0.5, baseFrequency: 600, octaves: 1.5 },
        volume: -19,
      }), sax),
    };
  })(),
};

// =============================================================================
// 3. SEQUENCER — one callback every 16th note decides what plays
// =============================================================================
const hit = (pattern, step) => pattern?.[step] === "x";
const has = (st, extra) => st.extras.includes(extra);
const chordAt = (sc, s) => sc.chords.findLast((c) => s >= c.start);
const toneHz = (sc) => Math.min(sc.cutoff, bands[sc.style.band].toneMax);

function duck(b, time, depth) {
  for (const g of [b.pump, b.pumpLow]) {
    g.gain.cancelScheduledValues(time);
    g.gain.setValueAtTime(1 - 0.65 * depth, time);
    g.gain.linearRampToValueAtTime(1, time + 0.22);
  }
}

// New piece: set its tempo, crossfade to its band, re-tune the kit, set the room.
function enterScene(sc, time) {
  const st = sc.style;
  const BAR = barSec(sc);
  transport.bpm.setValueAtTime(sc.bpm, time);
  transport.swing = st.swing;
  transport.swingSubdivision = st.swingSub ?? "8n";

  for (const [name, b] of Object.entries(bands)) {
    for (const node of [b.out, b.low]) {
      node.gain.cancelScheduledValues(time);
      node.gain.rampTo(name === st.band ? 1 : 0, 0.3, time);
    }
  }
  const b = bands[st.band];
  // start muffled and open up over 2 bars: a short build-up at the start of every piece
  b.bright.frequency.cancelScheduledValues(time);
  b.bright.frequency.setValueAtTime(250, time);
  b.bright.frequency.exponentialRampToValueAtTime(toneHz(sc), time + Math.min(2, sc.bars - 1) * BAR);
  reverbSend.gain.rampTo(sc.reverbWet, 0.3, time);
  delaySend.gain.rampTo(sc.delayWet, 0.3, time);
  b.pad?.set({ oscillator: { spread: sc.spread } });

  const kit = KITS[st.band];
  kick.set(kit.kick);
  hat.set({ envelope: { decay: kit.hatDecay } });
  clapFilter.frequency.setValueAtTime(kit.clap, time);
  hatFilter.frequency.setValueAtTime(kit.hatFreq, time);

  if (has(st, "chime")) { // three-note station announcement chime from the first chord
    sc.chords[0].notes.forEach((n, i) => chime.triggerAttackRelease(hz(n + 24), "2n", time + i * 0.35));
  }
  if (has(st, "crowd")) crowd.triggerAttackRelease(sc.seconds - 0.5, time);
}

// How the chord instrument plays, per genre.
function playKeys(b, st, sc, chord, s, step, time, v) {
  const vel = 0.5 + 0.4 * v;
  switch (st.keys) {
    case "arpeggio": { // broken chords on 8th notes, up and down
      if (step % 2) break;
      const arp = [...chord.notes, chord.notes[0] + 12];
      const order = [0, 1, 2, 3, 2, 1];
      b.keys.triggerAttackRelease(hz(arp[order[(s / 2) % order.length]] + 12), "4n", time, vel * 0.8);
      break;
    }
    case "comp": // jazz / lo-fi chord hits
      if (hit(st.keysPattern, step)) b.keys.triggerAttackRelease(chord.notes.map(hz), "4n", time, vel);
      break;
    case "stab": // short techno stabs
      if (hit(st.keysPattern, step)) b.keys.triggerAttackRelease(chord.notes.map(hz), "16n", time, vel);
      break;
    case "strum": { // guitar: down-strum on the beat, up-strum in between
      if (!hit(st.keysPattern, step)) break;
      const strings = [chord.bass + 12, ...chord.notes];
      const order = step % 4 === 0 ? strings : [...strings].reverse();
      order.forEach((n, i) => b.guitar[i].triggerAttack(hz(n), time + i * 0.012));
      break;
    }
    case "bell": // two slow bell notes per bar, walking through the chord
      if (step === 0 || step === 10) {
        const i = (Math.floor(s / 16) + (step ? 2 : 0)) % chord.notes.length;
        b.keys.triggerAttackRelease(hz(chord.notes[i] + 24), "2n", time, 0.6);
      }
      break;
  }
}

// How the bass plays, per genre.
function playBass(b, st, sc, chord, s, step, time) {
  switch (st.bass) {
    case "pattern":
      if (hit(st.patterns.bass, step)) b.bass.triggerAttackRelease(hz(chord.bass), "8n", time);
      break;
    case "long": // one held note per bar (cello, sub bass)
      if (step === 0) b.bass.triggerAttackRelease(hz(chord.bass), "1m", time);
      break;
    case "walking": { // root, third, fifth, then a half step below the next chord
      if (step % 4) break;
      const beat = step / 4;
      const note = beat === 3
        ? chordAt(sc, Math.min(s + 4, sc.bars * 16 - 1)).bass - 1
        : chord.bass + [0, chord.notes[1] - chord.notes[0], chord.notes[2] - chord.notes[0]][beat];
      b.bass.triggerAttackRelease(hz(note), "4n", time, beat === 0 ? 0.9 : 0.7);
      break;
    }
    case "acid": { // 16th line jumping between root, octave and the chord's top note
      if (!hit(st.acidPattern, step)) break;
      const jumps = [0, 12, 0, chord.notes[2] - chord.notes[0], 0, 12, chord.notes[1] - chord.notes[0], 0];
      const accent = step % 4 === 2;
      b.acid.triggerAttackRelease(hz(chord.bass + jumps[step % 8]), "16n", time, accent ? 1 : 0.6);
      break;
    }
  }
}

let tick = 0; // counted, not read from the clock, so tempo and swing changes can't shift it

new Tone.Loop((time) => {
  const t = tick++;
  if (t === TOTAL_STEPS) {
    transport.stop(time);
    setTimeout(() => stopSong("finished ✓"), Math.max(0, (time - Tone.now()) * 1000));
    return;
  }
  if (t > TOTAL_STEPS) return;

  const i = sceneAt(t);
  const tl = timeline[i];
  const sc = scores[i];
  const s = t - tl.startStep; // step within the piece
  const step = s % 16;        // step within the bar
  const st = sc.style;
  const p = st.patterns;
  const b = bands[st.band];
  const kit = KITS[st.band];
  const chord = chordAt(sc, s);
  const v = sc.energy;

  if (s === 0) enterScene(sc, time);
  if (i === scores.length - 1 && s === tl.steps - 16) {
    master.volume.rampTo(-50, barSec(sc), time); // fade out over the last bar
  }

  // drums
  if (hit(p.kick, step) && st.kickVel > 0) {
    kick.triggerAttackRelease(kit.note, "8n", time, (0.5 + 0.5 * v) * st.kickVel);
    if (b.pump) duck(b, time, v);
  }
  if (hit(p.clap, step)) clap.triggerAttackRelease("16n", time, 0.4 + 0.6 * v);
  if (hit(p.hat, step)) hat.triggerAttackRelease("32n", time, (0.3 + 0.7 * v) * (step % 4 === 2 ? 1 : 0.55));
  if (hit(p.ride, step)) ride.triggerAttackRelease(300, "8n", time, (0.5 + 0.5 * v) * (step % 4 === 0 ? 1 : 0.7));
  if (hit(p.shaker, step)) shaker.triggerAttackRelease("32n", time, step % 2 ? 0.5 : 1);
  if (hit(p.perc, step)) perc.triggerAttackRelease(hz(chord.notes[step % chord.notes.length] + 12), "32n", time);

  // harmony
  playKeys(b, st, sc, chord, s, step, time, v);
  playBass(b, st, sc, chord, s, step, time);
  if (st.pad && b.pad && s === chord.start) b.pad.triggerAttackRelease(chord.notes.map(hz), chord.steps * stepSec(sc), time);
  if (sc.leadOn && sc.melody[s] !== null) b.lead.triggerAttackRelease(hz(sc.melody[s]), "8n", time);

  // place signatures
  if (has(st, "birds") && (s % 32 === 6 || s % 32 === 23)) {
    const top = chord.notes[chord.notes.length - 1] + 36;
    [0, 0.07, 0.14].forEach((dt, k) => birds.triggerAttackRelease(hz(top + [0, 4, 2][k]), "64n", time + dt));
  }
  if (has(st, "gulls") && (s % 32 === 9 || s % 32 === 12)) {
    gull.triggerAttack(hz(91), time);
    gull.setNote(hz(84), time + 0.12);
    gull.triggerRelease(time + 0.35);
  }
  if (has(st, "waves") && s % 16 === 0) {
    const BAR = barSec(sc);
    waves.triggerAttackRelease(BAR - 0.5, time);
    waveFilter.frequency.cancelScheduledValues(time);
    waveFilter.frequency.setValueAtTime(250, time);
    waveFilter.frequency.exponentialRampToValueAtTime(1400, time + BAR / 2);
    waveFilter.frequency.exponentialRampToValueAtTime(250, time + BAR);
  }
  if (has(st, "glass") && (s % 64 === 27 || s % 64 === 50)) {
    glass.triggerAttackRelease(hz(chord.notes[0] + 48), "32n", time);
  }

  Tone.getDraw().schedule(() => draw(i, s, chord), time);
}, "16n").start(0);

// =============================================================================
// 4. PAGE
// =============================================================================
const gradientCss = (stops, dir = "180deg") =>
  `linear-gradient(${dir}, ${stops.map(([hex, , y]) => `${hex} ${Math.round(y * 100)}%`).join(", ")})`;
const fmt = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
const label = (str) => str.replace(/_/g, " ");

document.querySelector("#app").innerHTML = `
  <style>
    body { margin: 0; min-height: 100vh; background: #111; color: #fff; font-family: ui-sans-serif, system-ui, sans-serif; }
    .bg { position: fixed; inset: 0; opacity: 0; transition: opacity 2s ease; }
    .bg.on { opacity: 1; }
    main { position: relative; max-width: 640px; margin: 0 auto; padding: 32px 16px 120px; }
    .panel { background: rgba(10, 10, 18, .62); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); border-radius: 16px; padding: 24px; }
    header { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
    h1 { font-size: 15px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; margin: 0; opacity: .8; }
    button { font: inherit; background: rgba(255,255,255,.12); color: #fff; border: 1px solid rgba(255,255,255,.25); border-radius: 999px; padding: 8px 16px; cursor: pointer; }
    button:hover { background: rgba(255,255,255,.22); }
    nav { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 16px; }
    nav a { font-size: 12px; color: #fff; text-decoration: none; padding: 4px 10px; border-radius: 999px; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.15); }
    nav a.on { background: rgba(255,255,255,.3); }
    h2 { font-size: 32px; margin: 24px 0 4px; text-transform: capitalize; line-height: 1.1; }
    .sub { opacity: .75; margin: 0 0 20px; }
    dl { display: grid; grid-template-columns: max-content 1fr; gap: 8px 16px; margin: 0 0 20px; font-size: 14px; }
    dt { opacity: .6; }
    dd { margin: 0; }
    .chords { display: flex; flex-wrap: wrap; gap: 8px; }
    .chip { display: flex; align-items: center; gap: 8px; padding: 6px 12px 6px 6px; border-radius: 999px; background: rgba(255,255,255,.08); border: 1px solid transparent; font-size: 14px; transition: all .15s; }
    .chip.now { background: rgba(255,255,255,.25); border-color: rgba(255,255,255,.6); }
    .swatch { width: 18px; height: 18px; border-radius: 50%; border: 1px solid rgba(255,255,255,.4); flex: none; }
    .timeline { position: fixed; left: 0; right: 0; bottom: 0; padding: 12px 16px 16px; background: rgba(10,10,18,.7); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }
    .track { position: relative; display: flex; gap: 3px; height: 28px; max-width: 640px; margin: 0 auto; }
    .seg { border-radius: 4px; opacity: .55; transition: opacity .3s; }
    .seg.on { opacity: 1; }
    .head { position: absolute; top: -4px; bottom: -4px; width: 2px; background: #fff; left: 0; border-radius: 1px; }
    .times { display: flex; justify-content: space-between; max-width: 640px; margin: 6px auto 0; font-size: 12px; opacity: .7; }
  </style>
  ${scores.map((sc, i) => `<div class="bg" data-i="${i}" style="background:${gradientCss(sc.stops)}"></div>`).join("")}
  <main>
    <div class="panel">
      <header>
        <h1>chroma · barcelona</h1>
        <div><button id="play" type="button">▶ play</button> <button id="stop" type="button">■ stop</button></div>
      </header>
      <nav>
        <a href="?" class="${chosen.length ? "" : "on"}">all</a>
        ${scenes.map((s) => `<a href="?scene=${s.name}" class="${s.name === solo ? "on" : ""}">${label(s.name)}</a>`).join("")}
      </nav>
      <div id="scene"></div>
    </div>
  </main>
  <div class="timeline">
    <div class="track">
      ${scores.map((sc, i) => `<div class="seg" data-i="${i}" title="${sc.title}" style="flex:${sc.seconds};background:${gradientCss(sc.stops, "90deg")}"></div>`).join("")}
      <div class="head" id="head"></div>
    </div>
    <div class="times"><span id="clock">0:00</span><span id="status">ready</span><span>${fmt(LENGTH)}</span></div>
  </div>
`;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function renderScene(i) {
  const sc = scores[i];
  const m = sc.mood;
  const st = sc.style;
  $("#scene").innerHTML = `
    <h2>${sc.title}</h2>
    <p class="sub">${sc.place.label} · ${label(sc.timeOfDay)} · ${st.genre} · ${sc.seconds.toFixed(1)} s</p>
    <dl>
      <dt>genre</dt><dd>${sc.place.label} → ${st.genre}: ${st.desc}</dd>
      <dt>tempo</dt><dd>contrast ${m.contrast} → energy ${Math.round(sc.energy * 100)}% → ${sc.bpm} bpm (genre range ${st.tempo[0]}–${st.tempo[1]}), ${sc.bars} bars</dd>
      <dt>key</dt><dd><span class="swatch" style="display:inline-block;vertical-align:middle;background:${sc.keyHex}"></span> main colour → ${sc.key} (warmth ${m.warmth}, brightness ${m.brightness} pick the mode)</dd>
      <dt>tone</dt><dd>brightness ${m.brightness} → filter opens to ${toneHz(sc)} Hz</dd>
      <dt>colour</dt><dd>saturation ${m.saturation} → ${sc.leadOn ? "melody on" : "no melody (grey scene)"}, echo ${Math.round(sc.delayWet * 100)}%</dd>
      <dt>space</dt><dd>${st.genre} room + confidence ${sc.place.confidence} → reverb ${Math.round(sc.reverbWet * 100)}%</dd>
      <dt>chords</dt><dd>${m.n_colours} colours → ${sc.chords.length} chords${sc.chords[0].notes.length > 3 ? " with 7ths" : ""}, top of image to bottom</dd>
    </dl>
    <div class="chords">
      ${sc.chords.map((c, j) => `<span class="chip" data-j="${j}"><span class="swatch" style="background:${c.hex}"></span>${c.name} <small style="opacity:.6">${c.steps / 16} bar</small></span>`).join("")}
    </div>`;
  $$(".bg").forEach((el) => el.classList.toggle("on", +el.dataset.i === i));
  $$(".seg").forEach((el) => el.classList.toggle("on", +el.dataset.i === i));
}

let shownScene = -1;
let shownChord = null;
function draw(i, s, chord) {
  if (transport.state !== "started") return; // a late frame must not overwrite "finished"
  if (i !== shownScene) {
    renderScene(i);
    shownScene = i;
    shownChord = null;
  }
  if (chord !== shownChord) {
    const j = scores[i].chords.indexOf(chord);
    $$(".chip").forEach((el) => el.classList.toggle("now", +el.dataset.j === j));
    shownChord = chord;
  }
  const elapsed = timeline[i].startSec + s * stepSec(scores[i]);
  $("#head").style.left = `${(elapsed / LENGTH) * 100}%`;
  $("#clock").textContent = fmt(elapsed);
  $("#status").textContent = "playing";
}

function stopSong(message = "stopped") {
  transport.stop();
  transport.swing = 0;
  for (const b of Object.values(bands)) {
    b.pad?.releaseAll();
    b.keys?.releaseAll?.();
  }
  waves.triggerRelease();
  crowd.triggerRelease();
  if (bands.lofi.hiss.state === "started") bands.lofi.hiss.stop();
  $("#status").textContent = message;
  $$(".chip").forEach((el) => el.classList.remove("now"));
  shownChord = null;
}

$("#play").addEventListener("click", async () => {
  await Tone.start();
  await Tone.loaded();
  stopSong("starting…");
  master.volume.cancelScheduledValues(Tone.now());
  master.volume.value = -4;
  shownScene = -1;
  tick = 0;
  transport.bpm.value = scores[0].bpm;
  if (bands.lofi.hiss.state !== "started") bands.lofi.hiss.start();
  transport.position = 0;
  transport.start("+0.1");
});

$("#stop").addEventListener("click", () => stopSong());

renderScene(0);
shownScene = 0;
