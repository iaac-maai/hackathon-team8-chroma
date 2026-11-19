import * as Tone from "tone";
import { scenes } from "./scenes.js";
import { buildScore } from "./chroma-map.js";
import { MELODY_STYLES } from "./variety.js";
import { makeRecorder } from "./wav.js";
import { photoToCard, MODEL_URL } from "./model-client.js";
import { validateSceneCard } from "./scene-card.js";
import { startWalk, askSensorPermission, walkTempo, energyNow, walkNow } from "./walk.js";
import { offlineCard, offlinePlaces, walkLog } from "./offline.js"; // from Akshat's Chroma Live

window.Tone = Tone;

// =============================================================================
// 1. TURN THE SCENE CARDS INTO SCORES (each one a ~10-second piece)
// =============================================================================
// Main use: take or upload a photo → Akshat's model server recognises it → its
// scene card plays (section 5). The hand-made example scenes stay as a demo:
// chroma.html?scene=eixample_club_night plays one; without ?scene, play runs them all.
const params = new URLSearchParams(location.search);
const solo = params.get("scene");
// chroma.html?length=20 makes longer pieces (more bars = more room for the song shape)
const LENGTH_SEC = Math.min(60, Math.max(6, Number(params.get("length")) || 10));
const chosen = scenes.filter((s) => s.name === solo);
let version = 0;    // 🎲 new version: same photo(s), another composition
let cards = chosen.length ? chosen : scenes; // what's loaded now: the examples, or your photo's card
let scores = cards.map((s) => buildScore(s, LENGTH_SEC, { version }));

// Timeline: where each piece starts, in 16th steps and in seconds (tempos differ).
let timeline, TOTAL_STEPS, LENGTH;
function makeTimeline() {
  let accSteps = 0;
  let accSec = 0;
  timeline = scores.map((sc) => {
    const t = { startStep: accSteps, startSec: accSec, steps: sc.bars * 16 };
    accSteps += t.steps;
    accSec += sc.seconds;
    return t;
  });
  TOTAL_STEPS = accSteps;
  LENGTH = accSec;
}
makeTimeline();
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
// Output chain: everything → master → leveller (auto volume) → glue (gentle compressor) → fader
//               → limiter → soft clip.
// The leveller keeps every genre equally loud: a quiet park and a busy market come out at the same level.
// The soft clip rounds off the few drum peaks the limiter is too slow for, so nothing crackles.
const softClip = new Tone.WaveShaper((x) => Math.tanh(x * 1.1) / Math.tanh(1.1), 4096).toDestination();
const limiter = new Tone.Limiter(-4).connect(softClip);
const fader = new Tone.Volume(0).connect(limiter);   // fade-outs at the end of a piece
// Records a single piece while it plays → WAV (see wav.js and finishRecording below).
const recorder = makeRecorder(Tone.getContext(), softClip);
const glue = new Tone.Compressor({ threshold: -24, ratio: 4, attack: 0.005, release: 0.2 }).connect(fader);
const leveller = new Tone.Gain(1).connect(glue);
const master = new Tone.Volume(-4).connect(leveller);
const levelMeter = new Tone.Meter({ smoothing: 0.5 });
master.connect(levelMeter);
const TARGET_DB = -22; // how loud every piece should sit (average, before the compressor)
let levelAvg = TARGET_DB;
let levelDb = 0;
let levelBand = null;              // the band now playing (set in enterScene)
const levelMemory = {};            // the right level per band, learned while playing
setInterval(() => { // every 200 ms: listen to the mix and nudge the volume towards the target
  if (Tone.getTransport().state !== "started") return;
  const rms = levelMeter.getValue();
  if (!Number.isFinite(rms) || rms < -55) return; // (near) silence: hold, don't pump it up
  // loudness: follows a loud moment fast, a quiet moment (an intro, a break) slowly
  levelAvg = rms > levelAvg ? levelAvg * 0.5 + rms * 0.5 : levelAvg * 0.95 + rms * 0.05;
  const want = Math.max(-12, Math.min(6, TARGET_DB - levelAvg));
  levelDb += (want - levelDb) * (want < levelDb ? 0.5 : 0.05); // turn down fast, turn up slowly
  leveller.gain.rampTo(Tone.dbToGain(levelDb), 0.1);
  if (levelBand) levelMemory[levelBand] = levelDb;
}, 200);
// A new piece starts at the level its band needed last time (no loud surprise at the start).
function levelFor(band) {
  levelBand = band;
  if (levelMemory[band] !== undefined) {
    levelDb = levelMemory[band];
    leveller.gain.rampTo(Tone.dbToGain(levelDb), 0.05);
  }
}
const reverb = new Tone.Reverb({ decay: 6, wet: 1 }).connect(master);
const reverbSend = new Tone.Gain(0.3).connect(reverb);
const room = new Tone.Reverb({ decay: 0.9, preDelay: 0.005, wet: 1 }).connect(master); // small dry room (indoors)
const roomSend = new Tone.Gain(0).connect(room);
const wet = (node) => { node.connect(master); node.connect(reverbSend); node.connect(roomSend); return node; };
const delay = wet(new Tone.PingPongDelay({ delayTime: "8n.", feedback: 0.35, wet: 1 }));
const delaySend = new Tone.Gain(0.3).connect(delay);

// --- Drum kit: one set of drums, re-tuned per genre (see KITS) ---------------
// kickDrive: the sub-genre's distortion on the kick (hard techno, gabber); 0 = clean
const kickDrive = new Tone.Distortion({ distortion: 0.9, oversample: "2x", wet: 0 }).connect(master);
const kick = new Tone.MembraneSynth({
  pitchDecay: 0.04, octaves: 6,
  envelope: { attack: 0.001, decay: 0.45, sustain: 0 },
}).connect(kickDrive);

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

// --- Real drum samples -------------------------------------------------------------
// Recorded kits (LinnDrum, 808-style, CR-78, acoustic, techno, bongos …) from the Tone.js audio collection
// (originally from Chris Wilson's web-audio-samples). Each style has its own kit (`drumKit` in variety.js,
// else the band's default). They load in the background; until a kit is there the synth drums play.
// Ride, crash and shaker stay synthesised; the market's palmas stay hand claps.
const DRUM_URL = "https://tonejs.github.io/audio/drum-samples/";
const DRUM_KITS = { techno: "Techno", lofi: "LINN", jazz: "acoustic-kit", rumba: "Bongos", ambient: "4OP-FM", classical: "acoustic-kit" };
const ALL_KITS = ["Techno", "LINN", "acoustic-kit", "Bongos", "4OP-FM", "KPR77", "CR78", "Stark", "Kit3", "Kit8", "R8"];
const DRUM_PARTS = ["kick", "snare", "hihat", "tom1", "tom2", "tom3"];
const kitBuffers = {};  // kit name → { kick, snare, … } once loaded, "loading" or "failed"
let drumKit = null;     // the kit of the piece now playing
function loadKit(name) {
  if (!name || kitBuffers[name]) return;
  kitBuffers[name] = "loading";
  const ctx = Tone.getContext().rawContext;
  Promise.all(DRUM_PARTS.map(async (part) => {
    const r = await fetch(`${DRUM_URL}${name}/${part}.mp3`);
    if (!r.ok) throw new Error(`${name}/${part}: ${r.status}`);
    return [part, new Tone.ToneAudioBuffer(await ctx.decodeAudioData(await r.arrayBuffer()))];
  })).then((parts) => { kitBuffers[name] = Object.fromEntries(parts); })
    .catch((e) => { kitBuffers[name] = "failed"; console.warn("drum kit not loaded, synth drums play:", e.message); });
}
const kickBus = new Tone.Gain(1).connect(kickDrive);     // through the kick's distortion (hard techno, gabber)
const snareBus = wet(new Tone.Gain(0.6));
const hatBus = new Tone.Gain(0.35).connect(new Tone.Filter(350, "highpass").connect(master));
const tomBus = new Tone.Gain(0.5);
tomBus.connect(master);
tomBus.connect(delaySend);
const SAMPLE_BUS = { kick: kickBus, snare: snareBus, hihat: hatBus, tom1: tomBus, tom2: tomBus, tom3: tomBus };
// Plays one recorded hit; false when the kit isn't loaded yet (the caller then plays the synth drum).
function sampleHit(part, time, vel, length = null) {
  const kit = kitBuffers[drumKit];
  const buffer = typeof kit === "object" ? kit[part] : null;
  if (!buffer) return false;
  const src = new Tone.ToneBufferSource({ url: buffer, fadeOut: 0.015 }).connect(SAMPLE_BUS[part]);
  src.onended = () => src.dispose();
  src.start(time, 0, length ?? buffer.duration, Math.min(1, vel));
  return true;
}

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

// --- Layers from the version 2 labels (season, nature, paving) ----------------
const sparkle = wet(new Tone.PolySynth(Tone.FMSynth, { // season: small glassy bells
  harmonicity: 4.01, modulationIndex: 6,
  envelope: { attack: 0.001, decay: 0.9, sustain: 0, release: 0.8 },
  modulationEnvelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.3 },
  volume: -26,
}));
sparkle.connect(delaySend);

const seasonFilter = wet(new Tone.Filter(1200, "lowpass"));
const seasonPad = new Tone.PolySynth(Tone.Synth, { // season: autumn warm / winter soft pad
  oscillator: { type: "triangle" },
  envelope: { attack: 1.2, decay: 0.5, sustain: 0.8, release: 2 },
  volume: -24,
}).connect(seasonFilter);

const arpFilter = wet(new Tone.Filter({ frequency: 2500, type: "lowpass", Q: 4 }));
const elecArp = new Tone.Synth({ // nature low / nightlife high: a synth arpeggio on 16ths
  oscillator: { type: "sawtooth" },
  envelope: { attack: 0.002, decay: 0.12, sustain: 0, release: 0.05 },
  volume: -28,
}).connect(arpFilter);
elecArp.connect(delaySend);

const wood = wet(new Tone.MembraneSynth({ // nature high / wooden paving: woodblock knocks
  pitchDecay: 0.002, octaves: 0.6,
  envelope: { attack: 0.001, decay: 0.07, sustain: 0 },
  volume: -18,
}));

// Transition between two genres in walk mode: a rising noise sweep.
const riserFilter = wet(new Tone.Filter(400, "highpass"));
const riser = new Tone.NoiseSynth({
  noise: { type: "white" },
  envelope: { attack: 0.4, decay: 0, sustain: 1, release: 0.15 },
  volume: -26,
}).connect(riserFilter);

const counter = wet(new Tone.Synth({ // counter-line: a soft second voice under the melody
  oscillator: { type: "triangle" },
  envelope: { attack: 0.02, decay: 0.3, sustain: 0.5, release: 0.4 },
  volume: -21,
}));
counter.connect(delaySend);

const click = new Tone.NoiseSynth({ // cobblestones / tiles: very short clicks
  noise: { type: "white" },
  envelope: { attack: 0.001, decay: 0.012, sustain: 0 },
  volume: -22,
}).connect(wet(new Tone.Filter(4000, "bandpass")));

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

// Each band's own bass filter, so the gradient's shadows can open or close it.
const bassBase = Object.fromEntries(Object.entries(bands).map(([name, b]) => [name, {
  bass: b.bass?.filterEnvelope.baseFrequency,
  acid: b.acid?.filterEnvelope.baseFrequency,
}]));

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

// A real grand piano for classical (Salamander Grand Piano samples, CC-BY 3.0, hosted by Tone.js).
// Loaded in the background the first time classical plays; until then the synth piano plays.
// Fetched by hand (not through Tone's loader) so a slow or missing download never blocks the music.
const PIANO_URL = "https://tonejs.github.io/audio/salamander/";
const PIANO_NOTES = ["A1", "C2", "Ds2", "Fs2", "A2", "C3", "Ds3", "Fs3", "A3", "C4", "Ds4", "Fs4", "A4", "C5", "Ds5", "Fs5", "A5", "C6", "Ds6", "Fs6", "A6"];
let pianoLoading = null;
function loadPiano() {
  if (pianoLoading) return pianoLoading;
  pianoLoading = (async () => {
    const ctx = Tone.getContext().rawContext;
    const urls = {};
    await Promise.all(PIANO_NOTES.map(async (n) => {
      const data = await fetch(`${PIANO_URL}${n}.mp3`).then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); });
      urls[n.replace("s", "#")] = new Tone.ToneAudioBuffer(await ctx.decodeAudioData(data));
    }));
    const piano = new Tone.Sampler({ urls, release: 1.4, volume: -6 }).connect(bands.classical.bright);
    bands.classical.keys = piano;
    bands.classical.piano = true;
  })().catch((e) => console.warn("grand piano not loaded, the synth piano plays:", e.message));
  return pianoLoading;
}

// The piece's own sound (variety.js → soundDesign): waveform, attack, length, echo time.
// Some instruments can't take every setting (plucked strings have no waveform): those are skipped.
function applySound(b, t, time) {
  if (!t) return;
  const tryIt = (f) => { try { f(); } catch { /* this instrument doesn't have that setting */ } };
  if (b.piano) return applyEcho(t, time, tryIt); // a real piano keeps its own sound
  if (b.keys && t.keysOsc) tryIt(() => b.keys.set({ oscillator: { type: t.keysOsc }, detune: t.detune }));
  if (b.keys) tryIt(() => b.keys.set({ envelope: { attack: t.keysAttack, decay: t.keysDecay } }));
  if (b.lead?.oscillator && t.leadOsc) tryIt(() => b.lead.set({ oscillator: { type: t.leadOsc } }));
  if (b.lead?.envelope) tryIt(() => b.lead.set({ envelope: { attack: t.leadAttack } }));
  b.guitar?.forEach((g) => tryIt(() => g.set({ dampening: t.damp, resonance: t.ring })));
  if (b.lead && !b.lead.oscillator) tryIt(() => b.lead.set({ dampening: t.damp * 1.3, resonance: Math.min(0.99, t.ring + 0.01) }));
  applyEcho(t, time, tryIt);
}
function applyEcho(t, time, tryIt) {
  tryIt(() => delay.delayTime.setValueAtTime(Tone.Time(t.delayTime).toSeconds(), time));
  tryIt(() => delay.feedback.setValueAtTime(t.feedback, time));
}

// New piece: set its tempo, crossfade to its band, re-tune the kit, set the room.
function enterScene(sc, time, { quiet = false, sweepBars = 2 } = {}) {
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
  if (!quiet) levelFor(st.band);
  // start muffled and open up over 2 bars: a short build-up at the start of every piece
  b.bright.frequency.cancelScheduledValues(time);
  if (quiet) b.bright.frequency.setValueAtTime(toneHz(sc), time); // walk mode, same view again: no new build-up
  else {
    b.bright.frequency.setValueAtTime(250, time);
    b.bright.frequency.exponentialRampToValueAtTime(toneHz(sc), time + Math.min(sweepBars, sc.bars - 1) * BAR);
  }
  reverbSend.gain.rampTo(sc.reverbWet, 0.3, time);
  roomSend.gain.rampTo(sc.roomWet, 0.3, time);
  delaySend.gain.rampTo(sc.delayWet, 0.3, time);
  b.pad?.set({ oscillator: { spread: sc.spread } });
  applySound(b, st.timbre, time);

  // Drum kit: the genre's tuning, then the paving's surface on top.
  const kit = KITS[st.band];
  const pv = sc.paving ?? {};
  kick.set(st.kick ? { ...kit.kick, ...st.kick, envelope: { ...kit.kick.envelope, ...st.kick.envelope } } : kit.kick);
  kickDrive.wet.setValueAtTime(st.kickDrive ?? 0, time);
  ALL_KITS.forEach(loadKit); // first piece: fetch every kit in the background (small files)
  drumKit = st.drumKit ?? DRUM_KITS[st.band];
  if (st.band === "classical") loadPiano();
  hat.set({ envelope: { decay: pv.hatDecay ?? kit.hatDecay } });
  shaker.set({ envelope: { decay: pv.shakerDecay ?? 0.03 } });
  clapFilter.frequency.setValueAtTime(pv.clap ?? kit.clap, time);
  hatFilter.frequency.setValueAtTime(pv.hatFreq ?? kit.hatFreq, time);

  // Gradient shadows: open or close the bass filter.
  const base = bassBase[st.band];
  if (b.bass) b.bass.filterEnvelope.baseFrequency = base.bass * sc.bassTone;
  if (b.acid) b.acid.filterEnvelope.baseFrequency = base.acid * sc.bassTone;

  // Season pad: autumn warm and dark, winter soft and slow.
  const padKind = sc.season?.pad;
  if (padKind) {
    seasonPad.set(padKind === "warm"
      ? { oscillator: { type: "triangle" }, envelope: { attack: 0.8, release: 2 } }
      : { oscillator: { type: "sine" }, envelope: { attack: 2, release: 3 } });
    seasonFilter.frequency.setValueAtTime(padKind === "warm" ? 900 : 2200, time);
  }
  arpFilter.frequency.setValueAtTime(Math.min(toneHz(sc), 5000), time);

  if (has(st, "chime") && !quiet) { // three-note station announcement chime from the first chord
    sc.chords[0].notes.forEach((n, i) => chime.triggerAttackRelease(hz(n + 24), "2n", time + i * 0.35));
  }
  // Crowd murmur: the genre's own (club, market), or any place that is busy.
  if (has(st, "crowd") || (sc.busy ?? 0) > 0.5) {
    crowd.volume.setValueAtTime(-34 + (sc.busy ?? 0.6) * 10, time);
    crowd.triggerAttackRelease(sc.seconds - 0.5, time);
  }
}

// How the chord instrument plays, per genre. Chords use `voicing` (smooth inversions,
// 9ths in jazzy genres). The last bar ("end") is one long chord that rings out.
function playKeys(b, st, sc, chord, s, step, time, v, sec) {
  const vel = 0.5 + 0.4 * v;
  const voicing = chord.voicing ?? chord.notes;
  if (sec === "end") {
    if (step !== 0) return;
    if (st.keys === "strum") voicing.slice(0, 5).forEach((n, i) => b.guitar[i].triggerAttack(hz(n), time + i * 0.03));
    else if (b.keys) b.keys.triggerAttackRelease(voicing.map(hz), barSec(sc) * 0.9, time, vel * 0.8);
    return;
  }
  if (sec === "intro" && step < 8 && st.keys !== "arpeggio" && st.keys !== "bell") return; // let the intro breathe
  switch (st.keys) {
    case "arpeggio": { // broken chords on 8th notes, up and down (a 16th turn every other bar)
      const turn = Math.floor(s / 16) % 2 === 1 && step % 4 === 3;
      if (step % 2 && !turn) break;
      const arp = [...voicing, voicing[0] + 12];
      const order = [0, 1, 2, 3, 2, 1, 2, 3];
      b.keys.triggerAttackRelease(hz(arp[order[Math.floor(s / 2) % order.length] % arp.length] + 12), "4n", time, vel * (turn ? 0.5 : 0.8));
      break;
    }
    case "alberti": { // classical left hand: low – high – middle – high in 16ths (Mozart, Beethoven); the tune sings on top
      const [a, m, h] = [voicing[0], voicing[1] ?? voicing[0] + 4, voicing[2] ?? voicing[0] + 7];
      const n = [a, h, m, h][step % 4];
      const accent = step % 4 === 0 ? (step === 0 ? 0.95 : 0.8) : 0.55;
      b.keys.triggerAttackRelease(hz(n), "8n", time, vel * accent);
      if (step === 0) b.keys.triggerAttackRelease(hz(chord.bass), "2n", time, vel * 0.7); // a low root under each bar
      break;
    }
    case "comp": // jazz / lo-fi chord hits; in the second half of a bar sometimes an anticipation
      if (hit(st.keysPattern, step)) b.keys.triggerAttackRelease(voicing.map(hz), "4n", time, vel);
      else if (step === 14 && Math.floor(s / 16) % 2 === 1) b.keys.triggerAttackRelease(voicing.map(hz), "8n", time, vel * 0.6);
      break;
    case "stab": // short techno stabs
      if (hit(st.keysPattern, step)) b.keys.triggerAttackRelease(voicing.map(hz), "16n", time, vel);
      break;
    case "strum": { // guitar: down-strum on the beat, up-strum in between
      if (!hit(st.keysPattern, step)) break;
      const strings = [chord.bass + 12, ...voicing].slice(0, 5);
      const order = step % 4 === 0 ? strings : [...strings].reverse();
      order.forEach((n, i) => b.guitar[i].triggerAttack(hz(n), time + i * 0.012));
      break;
    }
    case "bell": // slow bell notes walking through the chord
      if (step === 0 || step === 10 || (step === 6 && Math.floor(s / 16) % 2)) {
        const i = (Math.floor(s / 16) + step) % voicing.length;
        b.keys.triggerAttackRelease(hz(voicing[i] + 12), "2n", time, 0.6);
      }
      break;
  }
}

// How the bass plays, per genre. Approach notes lead into the next chord;
// a bright ground in the photo lets the bass jump up an octave now and then.
function playBass(b, st, sc, chord, s, step, time, sec) {
  if (sec === "end") {
    if (step === 0) (b.acid ?? b.bass)?.triggerAttackRelease(hz(chord.bass), barSec(sc) * 0.8, time);
    return;
  }
  if (sec === "intro" && step < 8) return;
  const next = chordAt(sc, Math.min(s + 2, sc.bars * 16 - 1));
  const changing = next !== chord && step >= 14;
  switch (st.bass) {
    case "pattern": { // second half of the bar on the fifth when the shadows mix hues
      const fifth = sc.bassFifth && step >= 8 ? chord.notes[2] - chord.notes[0] : 0;
      const up = sc.bassUp && step % 8 === 6 ? 12 : 0;
      if (changing && step === 15) b.bass.triggerAttackRelease(hz(next.bass + (next.bass > chord.bass ? -1 : 2)), "16n", time, 0.7);
      else if (hit(st.patterns.bass, step)) b.bass.triggerAttackRelease(hz(chord.bass + fifth + up), "8n", time);
      break;
    }
    case "long": // one held note per bar (cello, sub bass), or root + fifth, with a passing note before a change
      if (sc.bassFifth) {
        if (step === 0) b.bass.triggerAttackRelease(hz(chord.bass), "2n", time);
        if (step === 8) b.bass.triggerAttackRelease(hz(chord.bass + chord.notes[2] - chord.notes[0]), "4n", time);
      } else if (step === 0 || s === chord.start) b.bass.triggerAttackRelease(hz(chord.bass), barSec(sc) * 0.9, time);
      if (changing && step === 14) b.bass.triggerAttackRelease(hz(next.bass + (next.bass > chord.bass ? -2 : 2)), "8n", time, 0.6);
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
    case "acid": { // 16th line jumping between root, octave and the chord's top note; it mutates every bar
      if (!hit(st.acidPattern, step)) break;
      const bar = Math.floor(s / 16);
      const jumps = [0, 12, 0, chord.notes[2] - chord.notes[0], 0, 12, chord.notes[1] - chord.notes[0], 0];
      const accent = step % 4 === 2 || (bar % 2 && step % 8 === 5);
      b.acid.triggerAttackRelease(hz(chord.bass + jumps[(step + bar * 3) % 8]), "16n", time, accent ? 1 : 0.6);
      break;
    }
  }
}

let tick = 0; // counted, not read from the clock, so tempo and swing changes can't shift it

// Walk mode state: one piece loops while you walk; a new view replaces it on a 2-bar boundary.
//   level = how many layers play: 1 chords + bass, 2 + drums, 3 + melody, 4 + everything
const live = { on: false, score: null, pending: null, step: 0, level: 1, bpm: null, started: false };

new Tone.Loop((time) => {
  if (live.on) { liveStep(time); return; }
  const t = tick++;
  if (t === TOTAL_STEPS) {
    transport.stop(time + 2); // let the last chord ring
    setTimeout(() => { finishRecording(); stopSong("finished ✓"); }, Math.max(0, (time + 2 - Tone.now()) * 1000));
    return;
  }
  if (t > TOTAL_STEPS) return;

  const i = sceneAt(t);
  const tl = timeline[i];
  const sc = scores[i];
  const s = t - tl.startStep; // step within the piece
  if (s === 0) enterScene(sc, time);
  if (i === scores.length - 1 && s === tl.steps - 16) {
    fader.volume.rampTo(-40, barSec(sc) * 1.5, time + barSec(sc) * 0.4); // let the ending ring, then fade
  }
  const chord = playStep(sc, s, time, 4);
  Tone.getDraw().schedule(() => draw(i, s, chord), time);
}, "16n").start(0);

// Walk mode, one 16th step. A new view switches on the next bar:
//   same genre    → seamless: the beat keeps going, chords, colours and melody change
//   other genre   → a short transition first (filter closes, noise rises, a snare roll), then it drops in
function liveStep(time) {
  let sc = live.score;
  if (!sc) return; // waiting for the first view
  const loopEnd = sc.bars * 16;
  // switch on the next bar, or on the next half bar when the music is slow (a bar longer than 2.5 s)
  const unit = barSec(sc) > 2.5 ? 8 : 16;
  const step = live.step % unit;
  // your speed moved into another band (still → walk → run → flat out): the same view, rebuilt for that speed,
  // so moving faster brings a faster sub-genre (and slowing down a calmer one) without waiting for a new view
  const speed = energyNow();
  const base = live.pending ?? sc; // a waiting view made before the speed changed is rebuilt too
  if (speed !== null && base.card && speed !== base.speed && !live.transition) {
    const n = buildScore(base.card, LIVE_SECONDS, { live: true, dnaSeed: base.dnaSeed, speed });
    n.ownBpm = n.bpm;
    n.bpm = live.bpm = walkTempo(n.style.tempo, walkNow(), n.bpm);
    live.pending = n;
  }
  const next = live.pending;
  const bigChange = next && (next.style.genre !== sc.style.genre || next.style.band !== sc.style.band);

  // start a transition on the next beat, so it has at least one beat before the switch
  if (bigChange && !live.transition && step % 4 === 0 && step >= 4) {
    const stepsLeft = unit - step;
    const dur = stepsLeft * stepSec(sc);
    live.transition = { from: step, steps: stepsLeft };
    const b = bands[sc.style.band];
    b.bright.frequency.cancelScheduledValues(time);
    b.bright.frequency.setValueAtTime(toneHz(sc), time);
    b.bright.frequency.exponentialRampToValueAtTime(320, time + dur);
    riserFilter.frequency.cancelScheduledValues(time);
    riserFilter.frequency.setValueAtTime(400, time);
    riserFilter.frequency.exponentialRampToValueAtTime(9000, time + dur);
    riser.triggerAttackRelease(dur, time);
  }
  const switchNow = next && step === 0 && (!bigChange || live.transition) && live.step > 0;
  if (switchNow || (next && live.step >= loopEnd && !bigChange)) {
    sc = live.score = next;
    live.pending = null;
    live.transition = null;
    live.step = 0;
    if (live.bpm) sc.bpm = live.bpm;
    enterScene(sc, time, bigChange ? { sweepBars: 1 } : { quiet: true });
    if (bigChange) ride.triggerAttackRelease(420, "1n", after(ride, time + 0.006), 0.7); // land the new genre with a crash
    // tell the page (and Bhavini's app) the moment the music changes, e.g. to animate the screen
    const detail = { genre: sc.style.genre, place: sc.place.label, key: sc.key, bpm: sc.bpm, transition: bigChange };
    setTimeout(() => window.dispatchEvent(new CustomEvent("chroma:view", { detail })), Math.max(0, (time - Tone.now()) * 1000));
  } else if (live.step >= loopEnd) { // same view: go round again (a big change waits for its transition)
    live.step = 0;
    enterScene(sc, time, { quiet: true });
  } else if (!live.started) {
    live.started = true;
    enterScene(sc, time);
  }
  const s = live.step++;
  if (live.transition && s % 2 === 0) { // snare roll that gets louder into the new genre
    const progress = (s % unit - live.transition.from) / live.transition.steps;
    clap.triggerAttackRelease("32n", after(clap, time + 0.004), 0.15 + progress * 0.6); // a hair after the beat: never on top of a drum hit
  }
  const chord = playStep(sc, s, time, live.level);
  Tone.getDraw().schedule(() => drawLive(sc, s, chord), time);
}

// One drum voice can't play two hits at the same moment or out of order (Tone.js throws). The transition's snare roll,
// the crash that lands a new genre and the score's own hits can fall on the same instant, so each hit goes a hair later.
const lastHit = new Map();
function after(inst, t) {
  const safe = Math.max(t, (lastHit.get(inst) ?? 0) + 0.002);
  lastHit.set(inst, safe);
  return safe;
}

const pv = (sc) => sc.paving ?? {};

// Plays one 16th step of a score. `level` 1–4 = how many layers (walk mode builds them up).
function playStep(sc, s, time, level) {
  const step = s % 16;        // step within the bar
  const sec = sc.shape[Math.floor(s / 16)]; // intro | main | lift | fill | end
  const st = sc.style;
  const b = bands[st.band];
  const kit = KITS[st.band];
  const chord = chordAt(sc, s);
  const v = sc.energy;
  const at = time + Math.max(0, sc.timing[s]); // human feel: a few ms early or late

  // drums (layer 2+): the composer wrote every hit (velocity 0 = rest), see compose.js
  const d = sc.drums;
  const drums = level >= 2 && (st.kickVel > 0 || Object.keys(st.patterns).length > 0);
  if (level >= 2) {
    if (d.kick[s]) {
      if (!sampleHit("kick", time, d.kick[s])) kick.triggerAttackRelease(kit.note, "8n", time, d.kick[s]);
      if (b.pump) duck(b, time, v);
    }
    if (d.clap[s] && (st.band === "rumba" || !sampleHit("snare", at, d.clap[s]))) clap.triggerAttackRelease("16n", after(clap, at), d.clap[s]); // rumba: palmas
    if (d.hat[s] && !sampleHit("hihat", at, d.hat[s] * 0.9, (pv(sc).hatDecay ?? kit.hatDecay) * 3)) hat.triggerAttackRelease("32n", at, d.hat[s]);
    if (d.ride[s]) ride.triggerAttackRelease(300, "8n", after(ride, at), d.ride[s]);
    if (d.crash[s]) ride.triggerAttackRelease(420, "1n", after(ride, time), d.crash[s]);
    const summerShaker = sc.extras.has("season") && sc.season?.shaker && drums && !st.patterns.shaker && step % 2 === 0 && sec !== "end";
    if (d.shaker[s] || summerShaker) shaker.triggerAttackRelease("32n", at, d.shaker[s] || (step % 4 ? 0.5 : 1));
    if (d.perc[s] && !sampleHit(["tom1", "tom2", "tom3"][(step + Math.floor(s / 16)) % 3], at, d.perc[s] * 0.8)) {
      perc.triggerAttackRelease(hz(chord.notes[step % chord.notes.length] + 12), "32n", at, d.perc[s]);
    }
  }
  if (level >= 4 && sc.extras.has("paving") && drums && sec !== "end" && hit(sc.paving?.click, step)) click.triggerAttackRelease("64n", at, 0.8);
  if (level >= 4 && sc.extras.has("paving") && drums && sec !== "end" && sc.paving?.wood && (step === 3 || step === 11)) wood.triggerAttackRelease(hz(chord.notes[0] + 24), "32n", at, 0.6);

  // harmony (always)
  playKeys(b, st, sc, chord, s, step, at, v, sec);
  playBass(b, st, sc, chord, s, step, time, sec);
  if (st.pad && b.pad && s === chord.start) b.pad.triggerAttackRelease((chord.voicing ?? chord.notes).map(hz), chord.steps * stepSec(sc) * (chord.ending ? 1.3 : 1), time);
  // melody (layer 3+): real phrases with their own note lengths; counter-line (layer 4)
  if (level >= 3 && sc.leadOn && sc.melody[s] !== null) {
    const len = Math.max(1, sc.melodyLen[s]) * stepSec(sc) * 0.92;
    b.lead.triggerAttackRelease(hz(sc.melody[s]), len, at, s % 4 === 0 ? 0.9 : 0.7);
    if (level >= 4 && sc.extras.has("counter") && sc.harmony[s] !== null) counter.triggerAttackRelease(hz(sc.harmony[s]), len, at, 0.5);
  }

  // season layer (bells 3+, pad 4)
  const sp = sc.season?.sparkle;
  if (level >= 3 && sc.extras.has("season") && sp && step % (16 / sp) === (sp === 4 ? 2 : 6)) {
    const n = chord.notes[(s / (16 / sp)) % chord.notes.length | 0];
    sparkle.triggerAttackRelease(hz(n + 24), "8n", time, 0.6);
  }
  if (level >= 4 && sc.extras.has("season") && sc.season?.pad && s === chord.start) seasonPad.triggerAttackRelease(chord.notes.map((n) => hz(n - 12)), chord.steps * stepSec(sc), time, 0.6);

  // nature vs built: electronic arpeggio (3+) for concrete / nightlife, birds and wood (4) for green
  if (level >= 3 && sc.extras.has("arp")) { // not in acoustic genres
    const arp = [chord.notes[0], chord.notes[1], chord.notes[2], chord.notes[1] + 12];
    elecArp.triggerAttackRelease(hz(arp[step % 4] + 12), "32n", time, (sc.electronic - 0.5) * (step % 4 === 0 ? 1.4 : 0.9));
  }
  const acoustic = sc.acoustic ?? 0;
  if (level >= 4 && sc.extras.has("birds") && (s % 32 === 6 || s % 32 === 23)) {
    const top = chord.notes[chord.notes.length - 1] + 36;
    [0, 0.07, 0.14].forEach((dt, k) => birds.triggerAttackRelease(hz(top + [0, 4, 2][k]), "64n", time + dt));
  }
  if (level >= 4 && sc.extras.has("wood") && (step === 6 || step === 14) && s % 32 < 16) {
    wood.triggerAttackRelease(hz(chord.notes[step === 6 ? 0 : 2] + 24), "32n", time, 0.35 + acoustic * 0.3);
  }

  // place signatures (always: they tell you where you are)
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
  return chord;
}

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
    button:hover, .btn:hover { background: rgba(255,255,255,.22); }
    .btn { display: inline-block; font-size: 14px; color: #fff; text-decoration: none; background: rgba(255,255,255,.12); border: 1px solid rgba(255,255,255,.25); border-radius: 999px; padding: 8px 16px; }
    .btn[hidden] { display: none; }
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
    .camera { margin-top: 20px; padding: 16px; border-radius: 12px; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.12); }
    .camera .row { display: flex; flex-wrap: wrap; gap: 8px; }
    .camera .big { background: #fff; color: #111; font-weight: 600; }
    .camera .big:hover { background: #e8e8e8; }
    .camera video, .camera img { display: block; width: 100%; max-height: 360px; object-fit: cover; border-radius: 10px; margin-bottom: 12px; background: #000; }
    .camera [hidden] { display: none; }
    #recog { margin: 12px 0 0; font-size: 14px; line-height: 1.5; }
    #recog .err { color: #ffb4a8; }
    #recog small { opacity: .6; }
    #walkinfo { margin: 8px 0 0; font-size: 13px; opacity: .85; font-variant-numeric: tabular-nums; }
    .layers { display: inline-flex; gap: 3px; vertical-align: middle; }
    .layers i { width: 10px; height: 10px; border-radius: 2px; background: rgba(255,255,255,.2); }
    .layers i.on { background: #fff; }
    details { margin-top: 16px; font-size: 14px; }
    summary { cursor: pointer; opacity: .75; }
  </style>
  <div id="bgs"></div>
  <main>
    <div class="panel">
      <header>
        <h1>chroma · barcelona</h1>
        <div><button id="play" type="button">▶ play</button> <button id="again" type="button" title="Same photo, a new composition">🎲 new version</button> <button id="stop" type="button">■ stop</button> <a id="save" class="btn" hidden>⬇ save sound</a></div>
      </header>
      <section class="camera">
        <video id="video" autoplay playsinline muted hidden></video>
        <img id="shot" alt="your photo" hidden>
        <div class="row">
          <button id="walk" class="big" type="button">🚶 Walk mode</button>
          <button id="walkstop" class="big" type="button" hidden>■ Stop walking</button>
          <button id="offline" type="button" hidden title="CLIP in the browser: recognises the place without the model server">🧠 Offline places (~90 MB)</button>
          <button id="walklog" type="button" hidden>⬇ Walk log (0)</button>
          <button id="cam" type="button">📷 Take a photo</button>
          <button id="snap" class="big" type="button" hidden>● Snap</button>
          <button id="camclose" type="button" hidden>✕ Close camera</button>
          <button id="upload" type="button">⤒ Upload a photo</button>
          <input id="file" type="file" accept="image/*" hidden>
        </div>
        <p id="recog"><b>Walk mode</b>: keep the camera on and walk. Every few seconds the model looks at what you see and the music follows: your steps set the tempo, turning a corner brings a new view, and the longer you walk the more layers join. Or take or upload one photo for a 10-second piece.</p>
        <p id="walkinfo" hidden></p>
      </section>
      <details ${chosen.length ? "open" : ""}>
        <summary>Example scenes (no photo needed)</summary>
        <nav>
          <a href="?" class="${chosen.length ? "" : "on"}">all</a>
          ${scenes.map((s) => `<a href="?scene=${s.name}" class="${s.name === solo ? "on" : ""}">${label(s.name)}</a>`).join("")}
        </nav>
      </details>
      <div id="scene"></div>
    </div>
  </main>
  <div class="timeline">
    <div class="track" id="track"></div>
    <div class="times"><span id="clock">0:00</span><span id="status">ready</span><span id="length"></span></div>
  </div>
`;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// Backgrounds and the timeline bar follow whatever is in `scores` (examples or your photo).
function renderTrack() {
  $("#bgs").innerHTML = scores.map((sc, i) => `<div class="bg" data-i="${i}" style="background:${gradientCss(sc.stops)}"></div>`).join("");
  $("#track").innerHTML = scores.map((sc, i) =>
    `<div class="seg" data-i="${i}" title="${sc.title}" style="flex:${sc.seconds};background:${gradientCss(sc.stops, "90deg")}"></div>`).join("")
    + `<div class="head" id="head"></div>`;
  $("#length").textContent = fmt(LENGTH);
}
renderTrack();

// The version 2 labels: what each one did, or "not sent" so the team sees what's missing.
function labelRows(sc) {
  const L = sc.labels;
  const pct = (x) => `${Math.round(x * 100)}%`;
  const no = `<span style="opacity:.5">not sent</span>`;
  const rows = [
    ["indoor", L.indoor === null ? no
      : L.indoor ? `indoors → small dry room (${pct(sc.roomWet)})` : `outdoors → open space (${pct(sc.reverbWet)})`],
    ["time", L.time === null ? no
      : L.time === "night" ? "night → darker tone, more echo" : L.time === "golden_hour" ? "golden hour → warmer mode, softer tone" : "day → as is"],
    ["season", sc.season ? `${L.season} → ${sc.season.desc}` : no],
    ["busy", sc.busy === null ? no
      : `${L.crowd !== null ? `crowd ${L.crowd}` : ""}${L.city?.noise !== undefined || L.city?.traffic !== undefined ? " + city noise" : ""} → ${pct(sc.busy)} → tempo, ${sc.busy > 0.6 ? "ghost hats" : sc.busy < 0.25 ? "fewer hats" : "normal hats"}${sc.busy > 0.5 ? ", crowd murmur" : ""}`],
    ["nature", sc.acoustic === null && sc.electronic === null ? no
      : `${sc.acoustic !== null ? `acoustic ${pct(sc.acoustic)}` : ""}${sc.electronic !== null ? ` · electronic ${pct(sc.electronic)}` : ""} → ${
        (sc.acoustic ?? 0) > 0.55 ? "birds + wood knocks" : (sc.acoustic ?? 0) > 0.4 ? "wood knocks" : (sc.electronic ?? 0) > 0.6 ? "synth arpeggio" : "balanced"}`],
    ["paving", sc.paving ? `${label(L.paving)} → ${sc.paving.desc}` : no],
    ["gradient", L.gradient
      ? `<span style="display:inline-block;width:80px;height:10px;border-radius:3px;vertical-align:middle;background:linear-gradient(90deg,${L.gradient.join(",")})"></span> shadows → bass ${sc.bassTone > 1.1 ? "brighter" : sc.bassTone < 0.9 ? "darker" : "as is"}${sc.bassFifth ? " + fifth" : ""}, highlights → melody steps ${sc.colourSteps.join(" ")}`
      : no],
    ["city", L.city ? Object.entries(L.city).map(([k, x]) => `${k} ${x}`).join(" · ") : no],
  ];
  return rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
}

function renderScene(i) {
  const sc = scores[i];
  const m = sc.mood;
  const st = sc.style;
  $("#scene").innerHTML = `
    <h2>${sc.title}</h2>
    <p class="sub">${sc.place.label} · ${label(sc.timeOfDay ?? sc.labels.time ?? "time unknown")} · ${st.genre} · ${sc.seconds.toFixed(1)} s</p>
    <dl>
      <dt>genre</dt><dd>${sc.place.label} → <b>${st.genre}</b>: ${st.desc}</dd>
      <dt>feeling</dt><dd>${sc.listener ? `listening as <b>${sc.listener.label}</b> · ` : ""}${sc.feel ? `pleasantness ${Math.round(sc.feel.valence * 100)}% → ${sc.mode} · energy ${Math.round(sc.feel.arousal * 100)}% → ${st.genre}${sc.chords.some((c) => c.surprise) ? ` · one surprise chord (${sc.chords.find((c) => c.surprise).name}) before the end` : ""}` : "–"}</dd>
      <dt>variation</dt><dd>${sc.progFamily === "colours" ? "chords from the colours" : `a ${sc.progFamily} progression`} · melody ${MELODY_STYLES[sc.melodyStyle]?.desc ?? sc.melodyStyle} · sound: ${st.timbre.keysOsc ? `${st.timbre.keysOsc} keys, ${st.timbre.leadOsc} lead` : `guitar ${st.timbre.damp < 3500 ? "dull" : st.timbre.damp > 5000 ? "bright" : "warm"}, ${st.timbre.ring > 0.94 ? "long" : "short"} ringing`}, echo ${st.timbre.delayTime}${sc.version ? ` · version ${sc.version + 1}` : ""}</dd>
      <dt>tempo</dt><dd>contrast ${m.contrast} → energy ${Math.round(sc.energy * 100)}% → ${sc.bpm} bpm (genre range ${st.tempo[0]}–${st.tempo[1]}), ${sc.bars} bars</dd>
      <dt>key</dt><dd><span class="swatch" style="display:inline-block;vertical-align:middle;background:${sc.keyHex}"></span> main colour → ${sc.key} (warmth ${m.warmth}, brightness ${m.brightness} pick the mode)</dd>
      <dt>tone</dt><dd>brightness ${m.brightness} → filter opens to ${toneHz(sc)} Hz</dd>
      <dt>colour</dt><dd>saturation ${m.saturation} → ${sc.leadOn ? "melody on" : "no melody (grey scene)"}, echo ${Math.round(sc.delayWet * 100)}%</dd>
      <dt>space</dt><dd>${st.genre} room + confidence ${sc.place.confidence} → reverb ${Math.round(sc.reverbWet * 100)}%${sc.roomWet ? `, room ${Math.round(sc.roomWet * 100)}%` : ""}</dd>
      <dt>chords</dt><dd>${m.n_colours} colours → ${sc.chords.length} chords${sc.chords[0].notes.length > 3 ? " with 7ths" : ""}, top of image to bottom</dd>
      ${labelRows(sc)}
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
  recorder.cancel(); // stopped halfway: no sound file
  transport.stop();
  transport.swing = 0;
  for (const b of Object.values(bands)) {
    b.pad?.releaseAll();
    b.keys?.releaseAll?.();
  }
  seasonPad.releaseAll();
  sparkle.releaseAll();
  waves.triggerRelease();
  crowd.triggerRelease();
  if (bands.lofi.hiss.state === "started") bands.lofi.hiss.stop();
  $("#status").textContent = message;
  $$(".chip").forEach((el) => el.classList.remove("now"));
  shownChord = null;
}

async function play() {
  await Tone.start();
  await Tone.loaded();
  stopSong("starting…");
  fader.volume.cancelScheduledValues(Tone.now());
  fader.volume.value = 0;
  shownScene = -1;
  tick = 0;
  transport.bpm.value = scores[0].bpm;
  if (bands.lofi.hiss.state !== "started") bands.lofi.hiss.start();
  transport.position = 0;
  $("#save").hidden = true;
  if (scores.length === 1) recorder.start(); // one piece = one sound file (the examples back to back are not saved)
  transport.start("+0.1");
}

// The piece is done: make the WAV, offer it as a download, and hand it to the app.
// Bhavini's app can listen:  window.addEventListener("chroma:wav", (e) => upload(e.detail.blob, e.detail.name))
let savedUrl = null;
function finishRecording() {
  if (!recorder.recording) return;
  const blob = recorder.stop();
  if (!blob || blob.size < 1000) return;
  const sc = scores[0];
  const name = `chroma_${sc.name}${sc.version ? `_v${sc.version + 1}` : ""}.wav`;
  if (savedUrl) URL.revokeObjectURL(savedUrl);
  savedUrl = URL.createObjectURL(blob);
  $("#save").href = savedUrl;
  $("#save").download = name;
  $("#save").hidden = false;
  const seconds = +((blob.size - 44) / 4 / Tone.getContext().sampleRate).toFixed(2);
  window.dispatchEvent(new CustomEvent("chroma:wav", { detail: { blob, name, seconds, card: cards[0], genre: sc.style.genre } }));
}

$("#play").addEventListener("click", play);
$("#again").addEventListener("click", () => {
  if (live.on) return; // walk mode makes a new piece from every view anyway
  version += 1;
  const photo = cards.length === 1 && !scenes.includes(cards[0]);
  scores = cards.map((c) => {
    const sc = buildScore(c, LENGTH_SEC, { version });
    if (photo) sc.title = `your ${sc.place.label} photo`;
    return sc;
  });
  makeTimeline();
  renderTrack();
  renderScene(0);
  shownScene = 0;
  play();
});
$("#stop").addEventListener("click", () => { stopWalk(); stopSong(); });

renderScene(0);
shownScene = 0;

// =============================================================================
// 5. PHOTO → MODEL SERVER → SCENE CARD → MUSIC
// =============================================================================
// The photo goes to Akshat's model server, which recognises the place, time and
// season and measures the colours. Its scene card becomes the piece, and it plays.
const pct = (x) => `${Math.round(x * 100)}%`;
const say = (html) => { $("#recog").innerHTML = html; };
let busyRecognising = false;

async function usePhoto(photo, previewUrl) {
  if (busyRecognising) return;
  busyRecognising = true;
  Tone.start(); // unlock audio while we still have the user's click
  stopSong("recognising…");
  $("#shot").src = previewUrl;
  $("#shot").hidden = false;
  for (const b of ["#cam", "#upload"]) $(b).disabled = true;
  try {
    let card;
    try {
      card = await photoToCard(photo, "", (msg) => say(msg));
    } catch (err) {
      // no model server: read the colours on this device (place: CLIP if loaded, else street)
      const img = photo instanceof Blob ? await createImageBitmap(photo).catch(() => null) : photo; // file, or a canvas from the camera
      card = img && await offlineCard(img, null);
      if (!card) throw err;
    }
    if (!card.place) card.place = { label: "street", confidence: 0.3 }; // model unsure: default genre
    const problems = validateSceneCard(card);
    version = 0;
    cards = [card];
    const sc = buildScore(card, LENGTH_SEC);
    sc.title = `your ${sc.place.label} photo`;
    scores = [sc];
    makeTimeline();
    renderTrack();
    renderScene(0);
    shownScene = 0;
    $$("nav a").forEach((a) => a.classList.remove("on"));
    const L = sc.labels;
    say(`Recognised: <b>${sc.place.label}</b> ${pct(sc.place.confidence)}`
      + (card.time ? ` · <b>${label(card.time.label)}</b> ${pct(card.time.confidence)}` : "")
      + (card.season ? ` · <b>${card.season.label}</b> ${pct(card.season.confidence)}` : "")
      + ` → <b>${sc.style.genre}</b> in ${sc.key}, ${sc.bpm} bpm`
      + (L.time === null && card.time ? ` <small>(time below 50% sure: not used)</small>` : "")
      + (L.season === null && card.season ? ` <small>(season below 50% sure: not used)</small>` : "")
      + (problems.length ? `<br><small>card warnings: ${problems.join("; ")}</small>` : "")
      + (card.offline ? `<br><small>offline: the model server could not be reached, so the colours were read on this device${offlinePlaces.ready ? " and CLIP guessed the place" : " (place: street)"}</small>` : ""));
    await play();
  } catch (err) {
    say(`<span class="err">Could not recognise the photo: ${err.message}.</span> <small>Model server: ${MODEL_URL}</small>`);
    $("#status").textContent = "ready";
  } finally {
    busyRecognising = false;
    for (const b of ["#cam", "#upload"]) $(b).disabled = false;
  }
}

// Upload (on a phone this also offers the camera)
$("#upload").addEventListener("click", () => { Tone.start(); $("#file").click(); });
$("#file").addEventListener("change", () => {
  const file = $("#file").files[0];
  if (file) usePhoto(file, URL.createObjectURL(file));
  $("#file").value = "";
});

// Live camera: preview, then snap one frame
let stream = null;
function closeCamera() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  $("#video").hidden = true;
  $("#snap").hidden = true;
  $("#camclose").hidden = true;
  $("#cam").hidden = false;
}
$("#cam").addEventListener("click", async () => {
  Tone.start(); // unlock audio on this click
  if (!navigator.mediaDevices?.getUserMedia) { // no camera access (e.g. not https): use the file picker
    $("#file").setAttribute("capture", "environment");
    $("#file").click();
    return;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
  } catch (err) {
    say(`<span class="err">No camera: ${err.message}.</span> Use “Upload a photo” instead.`);
    return;
  }
  $("#video").srcObject = stream;
  $("#video").hidden = false;
  $("#shot").hidden = true;
  $("#snap").hidden = false;
  $("#camclose").hidden = false;
  $("#cam").hidden = true;
});
$("#camclose").addEventListener("click", closeCamera);
$("#snap").addEventListener("click", () => {
  const v = $("#video");
  const canvas = document.createElement("canvas");
  canvas.width = v.videoWidth;
  canvas.height = v.videoHeight;
  canvas.getContext("2d").drawImage(v, 0, 0);
  closeCamera();
  usePhoto(canvas, canvas.toDataURL("image/jpeg", 0.85));
});

// =============================================================================
// 6. WALK MODE: camera on, music follows what you see and how you walk
// =============================================================================
//   every few seconds  a frame from the camera → model server → new scene card → next loop
//   your steps         → tempo (the music walks with you); standing still slows it down
//   walking on         → layers build up: chords + bass → drums → melody → everything
//   standing still     → layers fall back to chords + bass
//   turning a corner   → a new view right away
//   no sensors (laptop) → the layers build up over time anyway, tempo from the photo
const LIVE_SECONDS = 16;   // one loop of music per view
const LAYER_NAMES = ["chords + bass", "+ drums", "+ melody", "+ everything"];
let walker = null;
let snapTimer = null;
let layerTimer = null;
let views = 0;
let inFlight = false;
let placeNow = null;   // the place we're in (changes only when the model is sure, or sees it twice)
let placeMaybe = null;
let stillSince = null;
let walkId = 0;       // new for every walk, so every walk sounds different
let sc0Place = null;
let viewsHere = 0;

function frameFromVideo() {
  const v = $("#video");
  if (!v.videoWidth) return null;
  const canvas = document.createElement("canvas");
  canvas.width = v.videoWidth;
  canvas.height = v.videoHeight;
  canvas.getContext("2d").drawImage(v, 0, 0);
  return canvas;
}

async function captureView(reason = "timer") {
  if (!live.on || inFlight) return;
  const frame = frameFromVideo();
  if (!frame) return;
  inFlight = true;
  try {
    let card;
    try {
      card = await photoToCard(frame, "", (msg) => { if (!live.score) say(msg); });
    } catch (err) {
      // no model server (offline, asleep, blocked): read the colours on the phone, the place with CLIP if loaded
      card = await offlineCard(frame, placeNow);
      if (!card) throw err;
      live.offline = err.message;
    }
    if (!card.offline) live.offline = null;
    if (!live.on) return;
    if (!card.place) card.place = placeNow ?? { label: "street", confidence: 0.3 };
    // Don't jump genre on one unsure guess: switch when fairly sure (50%+) or seen twice in a row
    // (an unsure new place is checked again within 1.5 s, so a real change still lands quickly).
    const seen = card.place;
    if (placeNow && seen.label !== placeNow.label && seen.confidence < 0.5 && seen.label !== placeMaybe) {
      placeMaybe = seen.label;
      card.place = placeNow;
    } else {
      placeNow = seen;
      placeMaybe = null;
    }
    // same place → same sub-genre and sound for the whole walk (only colours, chords and melody follow the view);
    // a new place → a new sub-genre. After about 8 views in one place the style moves on, so it never gets stale.
    viewsHere = sc0Place === card.place.label ? viewsHere + 1 : 0;
    sc0Place = card.place.label;
    const sc = buildScore(card, LIVE_SECONDS, { live: true, dnaSeed: `${walkId}:${card.place.label}:${Math.floor(viewsHere / 8)}` });
    sc.title = `view ${++views}: ${sc.place.label}`;
    sc.ownBpm = sc.bpm;
    const target = walker ? walkTempo(sc.style.tempo, walker.state, sc.bpm) : sc.bpm;
    sc.bpm = target;
    live.bpm = target;
    if (!live.score) { live.score = sc; transport.bpm.value = target; } else live.pending = sc;
    say(`Now: <b>${sc.place.label}</b> ${pct(sc.place.confidence)}`
      + (card.time ? ` · ${label(card.time.label)}` : "") + (card.season ? ` · ${card.season.label}` : "")
      + ` → <b>${sc.style.genre}</b> in ${sc.key}`
      + (reason === "turn" ? " <small>(you turned a corner)</small>" : "")
      + (placeMaybe ? ` <small>(maybe ${placeMaybe}? checking again)</small>` : "")
      + (card.offline ? ` <small>(offline: colours read on the phone${offlinePlaces.ready ? ", place by CLIP" : ", place kept"})</small>` : ""));
    walkLog.add({ event: reason === "turn" ? "turn" : "view", place: sc.place.label, place_conf: sc.place.confidence,
      source: card.offline ? (offlinePlaces.ready ? "phone + CLIP" : "phone") : "model server", genre: sc.style.genre, key: sc.key, bpm: sc.bpm,
      brightness: card.mood.brightness, warmth: card.mood.warmth, saturation: card.mood.saturation, contrast: card.mood.contrast,
      colours: card.stops.map((x) => x[0]).join(" "), lat: walker?.state.lat, lon: walker?.state.lon, kmh: walker?.state.kmh, band: walker?.state.band });
  } catch (err) {
    say(`<span class="err">Could not read this view: ${err.message}.</span> <small>Trying again…</small>`);
  } finally {
    inFlight = false;
  }
}

function scheduleSnaps() {
  clearTimeout(snapTimer);
  const s = walker?.state;
  const wait = placeMaybe ? 1500 : !s?.sources.size ? 6000 : s.moving ? 3500 : 10000; // walking: a new view every 3.5 s
  snapTimer = setTimeout(async () => { await captureView(); if (live.on) scheduleSnaps(); }, live.score ? wait : 1500);
}

// Every 2 seconds: follow your pace, build the layers up or down, show what's happening.
function followWalk() {
  if (!walker) return;
  const s = walker.state;
  const sc = live.score;
  const sensors = s.sources.size > 0;
  if (sensors && !s.moving) stillSince ??= performance.now(); else stillSince = null;
  const stillLong = stillSince && performance.now() - stillSince > 8000;
  if (sc) {
    if (!sensors || s.moving) {
      live.climb += 1;
      if (live.climb >= 2) { live.level = Math.min(4, live.level + 1); live.climb = 0; } // one layer more every ~4 s
    } else if (stillLong) live.level = Math.max(1, live.level - 1);
    const target = walkTempo(sc.style.tempo, s, sc.ownBpm);
    if (Math.abs(target - transport.bpm.value) > 2) {
      transport.bpm.rampTo(target, 2);
      sc.bpm = target;
      live.bpm = target;
    }
  }
  const bits = [];
  if (s.cadence) bits.push(`👣 ${s.cadence} steps/min`);
  if (s.source !== "none") bits.push(`${s.kmh} km/h · <b>${s.band}</b> <small>(${s.source})</small>`);
  if (!sensors && s.source === "none") bits.push("no motion sensor (laptop): layers build up over time");
  else bits.push(s.moving ? "walking" : stillLong ? "standing still" : "slowing down");
  if (sc) bits.push(`♩ ${Math.round(transport.bpm.value)} bpm`);
  bits.push(`<span class="layers">${[1, 2, 3, 4].map((n) => `<i class="${n <= live.level ? "on" : ""}"></i>`).join("")}</span> ${LAYER_NAMES[live.level - 1]}`);
  if (s.lat !== null) bits.push(`📍 ${s.lat}, ${s.lon}`);
  if (live.offline) bits.push(`<small>offline (${live.offline})</small>`);
  $("#walkinfo").innerHTML = bits.join(" · ");
  walkLog.add({ event: "tick", kmh: s.kmh, band: s.band, speed_source: s.source, cadence: s.cadence ?? "", bpm: Math.round(transport.bpm.value),
    layers: live.level, place: placeNow?.label ?? "", genre: sc?.style.genre ?? "", lat: s.lat ?? "", lon: s.lon ?? "" });
  $("#walklog").textContent = `⬇ Walk log (${walkLog.rows.length})`;
}

let shownLive = null;
function drawLive(sc, s, chord) {
  if (!live.on) return;
  if (sc !== shownLive) {
    scores = [sc];
    makeTimeline();
    renderTrack();
    renderScene(0);
    shownLive = sc;
    shownChord = null;
  }
  if (chord !== shownChord) {
    const j = sc.chords.indexOf(chord);
    $$(".chip").forEach((el) => el.classList.toggle("now", +el.dataset.j === j));
    shownChord = chord;
  }
  const elapsed = s * stepSec(sc);
  $("#head").style.left = `${(elapsed / LENGTH) * 100}%`;
  $("#clock").textContent = fmt(elapsed);
  $("#status").textContent = "walk mode · live";
}

$("#walk").addEventListener("click", async () => {
  Tone.start();                            // unlock audio on this click
  const sensorsOk = askSensorPermission(); // iPhone asks for motion + compass here
  closeCamera();
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
  } catch (err) {
    say(`<span class="err">Walk mode needs the camera: ${err.message}.</span> On a phone, open the https address from <code>npm run phone</code>.`);
    return;
  }
  await sensorsOk;
  $("#video").srcObject = stream;
  $("#video").hidden = false;
  $("#shot").hidden = true;
  for (const id of ["#walk", "#cam", "#upload"]) $(id).hidden = true;
  $("#walkstop").hidden = false;
  $("#walkinfo").hidden = false;

  stopSong("walk mode");
  Object.assign(live, { on: true, score: null, pending: null, transition: null, step: 0, level: 1, bpm: null, started: false, climb: 0 });
  views = 0; placeNow = null; placeMaybe = null; shownLive = null; stillSince = null;
  walkId = Date.now(); sc0Place = null; viewsHere = 0;
  walker = startWalk({ onTurn: () => captureView("turn"), video: $("#video") });
  walkLog.clear();
  live.offline = null;
  $("#offline").hidden = offlinePlaces.ready;
  $("#walklog").hidden = false;
  layerTimer = setInterval(followWalk, 2000);
  followWalk();
  say("Looking around…");
  await Tone.loaded();
  fader.volume.cancelScheduledValues(Tone.now());
  fader.volume.value = 0;
  if (bands.lofi.hiss.state !== "started") bands.lofi.hiss.start();
  transport.position = 0;
  transport.start("+0.1");
  scheduleSnaps();
});

function stopWalk() {
  if (!live.on) return;
  live.on = false;
  clearTimeout(snapTimer);
  clearInterval(layerTimer);
  walker?.stop();
  walker = null;
  closeCamera();
  for (const id of ["#walk", "#cam", "#upload"]) $(id).hidden = false;
  $("#walkstop").hidden = true;
  $("#walkinfo").hidden = true;
  $("#offline").hidden = true;
}
$("#walklog").addEventListener("click", () => walkLog.download());
$("#offline").addEventListener("click", async () => {
  const b = $("#offline");
  b.disabled = true;
  try {
    await offlinePlaces.load((f) => { b.textContent = `🧠 Loading ${Math.round(f * 100)}%`; });
    b.hidden = true;
    say("Offline places on: if the model server can't be reached, CLIP on the phone recognises the place.");
  } catch (err) {
    b.disabled = false;
    b.textContent = "🧠 Retry offline places";
    say(`<span class="err">The offline model could not load: ${err.message ?? err}.</span>`);
  }
});
$("#walkstop").addEventListener("click", () => {
  stopWalk();
  stopSong("walk stopped");
  say(`You walked through ${views} view${views === 1 ? "" : "s"}.`);
});
