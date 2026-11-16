import * as Tone from "tone";

window.Tone = Tone; // lets you poke at Tone from the browser console

// =============================================================================
// 1. SONG MATERIAL
// =============================================================================
const BPM = 128;

// F-minor house progression, one chord per bar: Fm – Db – Ab – Eb
const chords = [
  ["F3", "Ab3", "C4"],
  ["Db3", "F3", "Ab3"],
  ["Ab3", "C4", "Eb4"],
  ["Eb3", "G3", "Bb3"],
];
const roots = ["F2", "Db2", "Ab1", "Eb2"];

// Lead hook: one line per chord, 16 steps each ("." = rest)
const melody = [
  "C5 . . Ab4 . . F4 . Ab4 . C5 . Eb5 . C5 .",
  "Db5 . . C5 . . Ab4 . F4 . Ab4 . . . . .",
  "C5 . . Eb5 . . C5 . Ab4 . Eb5 . F5 . Eb5 .",
  "Bb4 . . G4 . . Eb4 . G4 . Bb4 . C5 . Bb4 .",
].map((line) => line.split(" "));

// Step patterns, 16 steps = 1 bar. x = hit, . = rest (bass: x = root, o = octave up).
// These are editable live in the page by clicking the cells.
const patterns = {
  kick:   "x...x...x...x...",
  clap:   "....x.......x...",
  hat:    "..x...x...x...x.",
  shaker: "xxxxxxxxxxxxxxxx",
  perc:   "...x..x....x.x..",
  bass:   "..x...o...x..xo.",
  stab:   "..x..x....x..x..",
};
const grid = Object.fromEntries(Object.entries(patterns).map(([k, v]) => [k, v.split("")]));

// Song structure. `filter` sweeps the chord filter [from, to] across the section (Hz).
const arrangement = [
  { name: "intro",     bars: 8, parts: ["kick", "hat", "pad"],                                       filter: [300, 2500] },
  { name: "build",     bars: 8, parts: ["kick", "hat", "clap", "bass", "arp", "pad"],                filter: [2500, 6000], riser: true },
  { name: "drop",      bars: 8, parts: ["kick", "clap", "hat", "shaker", "bass", "stab", "lead"],    filter: [6000, 6000], impact: true },
  { name: "breakdown", bars: 4, parts: ["pad", "arp", "lead"],                                       filter: [800, 4000],  riser: true },
  { name: "drop 2",    bars: 8, parts: ["kick", "clap", "hat", "shaker", "perc", "bass", "stab", "lead", "arp"], filter: [6000, 6000], impact: true },
  { name: "outro",     bars: 4, parts: ["kick", "hat", "pad"],                                       filter: [3000, 300],  fade: true },
];
let barCount = 0;
for (const section of arrangement) {
  section.start = barCount;
  barCount += section.bars;
}
const TOTAL_BARS = barCount; // 40 bars at 128 BPM ≈ 75 seconds

const transport = Tone.getTransport();
transport.bpm.value = BPM;
const BAR = Tone.Time("1m").toSeconds();
const STEP = Tone.Time("16n").toSeconds();

// =============================================================================
// 2. SOUNDS
// =============================================================================
const limiter = new Tone.Limiter(-1).toDestination();
const master = new Tone.Volume(-4).connect(limiter);
const reverb = new Tone.Reverb({ decay: 4, wet: 0.35 }).connect(master);
const delay = new Tone.PingPongDelay({ delayTime: "8n.", feedback: 0.3, wet: 0.35 }).connect(reverb);

// "Sidechain" pump: everything routed through here ducks on every kick.
const pump = new Tone.Gain(1).connect(master);
const chordFilter = new Tone.Filter(300, "lowpass").connect(pump);

const kick = new Tone.MembraneSynth({
  pitchDecay: 0.04,
  octaves: 6,
  envelope: { attack: 0.001, decay: 0.45, sustain: 0 },
}).connect(master);

const sub = new Tone.MembraneSynth({
  pitchDecay: 0.4,
  octaves: 4,
  envelope: { attack: 0.001, decay: 1.5, sustain: 0 },
  volume: -4,
}).connect(master);

const clap = new Tone.NoiseSynth({
  noise: { type: "pink" },
  envelope: { attack: 0.001, decay: 0.18, sustain: 0 },
  volume: -10,
}).connect(new Tone.Filter(1800, "bandpass").connect(reverb));

const hat = new Tone.NoiseSynth({
  noise: { type: "white" },
  envelope: { attack: 0.001, decay: 0.08, sustain: 0 },
  volume: -16,
}).connect(new Tone.Filter(7000, "highpass").connect(master));

const shaker = new Tone.NoiseSynth({
  noise: { type: "white" },
  envelope: { attack: 0.001, decay: 0.03, sustain: 0 },
  volume: -26,
}).connect(new Tone.Filter(9000, "highpass").connect(master));

const perc = new Tone.MembraneSynth({
  pitchDecay: 0.01,
  octaves: 2,
  envelope: { attack: 0.001, decay: 0.1, sustain: 0 },
  volume: -16,
}).connect(delay);

const bass = new Tone.MonoSynth({
  oscillator: { type: "sawtooth" },
  filter: { Q: 6, type: "lowpass" },
  envelope: { attack: 0.003, decay: 0.15, sustain: 0.3, release: 0.08 },
  filterEnvelope: { attack: 0.003, decay: 0.12, sustain: 0.2, baseFrequency: 100, octaves: 3.5 },
  volume: -8,
}).connect(pump);

const pad = new Tone.PolySynth(Tone.Synth, {
  oscillator: { type: "fatsawtooth", count: 3, spread: 30 },
  envelope: { attack: 0.5, decay: 0.3, sustain: 0.7, release: 2 },
  volume: -20,
}).connect(chordFilter);

const stab = new Tone.PolySynth(Tone.Synth, {
  oscillator: { type: "fatsawtooth", count: 3, spread: 20 },
  envelope: { attack: 0.005, decay: 0.2, sustain: 0, release: 0.1 },
  volume: -14,
}).connect(chordFilter);

const arp = new Tone.Synth({
  oscillator: { type: "triangle" },
  envelope: { attack: 0.002, decay: 0.08, sustain: 0.1, release: 0.05 },
  volume: -16,
}).connect(delay);

const lead = new Tone.Synth({
  oscillator: { type: "fatsquare", count: 2, spread: 15 },
  envelope: { attack: 0.005, decay: 0.15, sustain: 0.3, release: 0.15 },
  volume: -18,
}).connect(delay);

const riserFilter = new Tone.Filter(300, "bandpass").connect(reverb);
const riser = new Tone.NoiseSynth({
  noise: { type: "white" },
  envelope: { attack: 3, decay: 0.1, sustain: 1, release: 0.2 },
  volume: -14,
}).connect(riserFilter);

const crash = new Tone.NoiseSynth({
  noise: { type: "white" },
  envelope: { attack: 0.001, decay: 1.8, sustain: 0 },
  volume: -14,
}).connect(new Tone.Filter(4000, "highpass").connect(reverb));

// =============================================================================
// 3. SEQUENCER — one callback every 16th note decides what plays
// =============================================================================
const sectionAt = (bar) => arrangement.findLast((s) => bar >= s.start);
const isHit = (name, step) => grid[name][step] !== ".";
const octaveUp = (note) => Tone.Frequency(note).transpose(12).toNote();

function duck(time) {
  pump.gain.cancelScheduledValues(time);
  pump.gain.setValueAtTime(0.3, time);
  pump.gain.linearRampToValueAtTime(1, time + 0.22);
}

// Things that happen once at the start of a bar: filter sweeps, risers, impacts, fades.
function onBar(time, section, barInSection) {
  if (barInSection === 0) {
    const [from, to] = section.filter;
    const f = chordFilter.frequency;
    f.cancelScheduledValues(time);
    f.setValueAtTime(from, time);
    if (to !== from) f.exponentialRampToValueAtTime(to, time + section.bars * BAR);

    if (section.impact) {
      crash.triggerAttackRelease("1n", time);
      sub.triggerAttackRelease("F1", "2n", time);
    }
    if (section.fade) master.volume.rampTo(-50, section.bars * BAR, time);
  }

  // Noise riser over the last 2 bars of a build-up section
  if (section.riser && barInSection === section.bars - 2) {
    riser.triggerAttack(time);
    riserFilter.frequency.cancelScheduledValues(time);
    riserFilter.frequency.setValueAtTime(300, time);
    riserFilter.frequency.exponentialRampToValueAtTime(9000, time + 2 * BAR);
    riser.triggerRelease(time + 2 * BAR - 0.01);
  }
}

// Snare roll that speeds up through the last bar before a drop
function roll(time, step) {
  const every = step < 8 ? 4 : step < 12 ? 2 : 1;
  if (step % every === 0) clap.triggerAttackRelease("32n", time, 0.3 + (step / 15) * 0.7);
}

new Tone.Loop((time) => {
  const tick = Math.round(transport.getTicksAtTime(time) / (transport.PPQ / 4));
  const bar = Math.floor(tick / 16);
  const step = tick % 16;
  if (bar >= TOTAL_BARS) return;

  const section = sectionAt(bar);
  const barInSection = bar - section.start;
  const tensionBar = section.riser && barInSection === section.bars - 1; // bar before a drop
  const on = (part) => section.parts.includes(part);
  const c = bar % 4; // which chord we're on

  if (step === 0) onBar(time, section, barInSection);

  if (on("kick") && !tensionBar && isHit("kick", step)) {
    kick.triggerAttackRelease("C1", "8n", time);
    duck(time);
  }
  if (tensionBar) roll(time, step);
  else if (on("clap") && isHit("clap", step)) clap.triggerAttackRelease("16n", time);

  if (on("hat") && isHit("hat", step)) hat.triggerAttackRelease("16n", time);
  if (on("shaker") && isHit("shaker", step)) shaker.triggerAttackRelease("32n", time, step % 2 ? 0.5 : 1);
  if (on("perc") && isHit("perc", step)) perc.triggerAttackRelease("G4", "32n", time);

  if (on("bass") && isHit("bass", step)) {
    const note = grid.bass[step] === "o" ? octaveUp(roots[c]) : roots[c];
    bass.triggerAttackRelease(note, "16n", time);
  }
  if (on("stab") && isHit("stab", step)) stab.triggerAttackRelease(chords[c], "16n", time);
  if (on("pad") && step === 0) pad.triggerAttackRelease(chords[c], "1m", time);

  if (on("arp")) {
    const tones = chords[c].map(octaveUp);
    arp.triggerAttackRelease(tones[[0, 1, 2, 1][step % 4]], "32n", time);
  }
  if (on("lead") && melody[c][step] !== ".") lead.triggerAttackRelease(melody[c][step], "16n", time);

  Tone.getDraw().schedule(() => draw(bar, step, section, tensionBar), time);
}, "16n").start(0);

// End of the song: stop the audio at exactly bar 40, then update the page.
transport.schedule((time) => {
  transport.stop(time);
  Tone.getDraw().schedule(() => stopSong("finished ✓"), time);
}, `${TOTAL_BARS}m`);

// =============================================================================
// 4. PAGE — live-coding style step grid you can edit while it plays
// =============================================================================
const ROWS = ["kick", "clap", "hat", "shaker", "perc", "bass", "stab", "pad", "arp", "lead"];
const ROW_TEXT = { pad: "Fm · Db · Ab · Eb  (held chords)", arp: "16th arpeggio ↑", lead: "melody hook" };
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const LENGTH = TOTAL_BARS * BAR;

document.querySelector("#app").innerHTML = `
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; background: #0a0a12; color: #e6e6f0; font-family: ui-monospace, "SF Mono", Menlo, monospace; }
    #app { max-width: 760px; margin: 0 auto; padding: 24px 16px; }
    header { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
    h1 { font-size: 22px; margin: 0; }
    h1 span { color: #ff4fd8; }
    button { font: inherit; }
    .controls button { background: #1b1b2b; color: #e6e6f0; border: 1px solid #33334d; border-radius: 6px; padding: 8px 14px; cursor: pointer; }
    .controls button:hover { border-color: #ff4fd8; }
    .info { display: flex; gap: 16px; margin: 16px 0 6px; font-size: 13px; color: #9a9ab5; flex-wrap: wrap; }
    #section { color: #4ff0ff; text-transform: uppercase; letter-spacing: .08em; }
    .progress { height: 3px; background: #1b1b2b; border-radius: 2px; overflow: hidden; margin-bottom: 16px; }
    #progress { height: 100%; width: 0; background: linear-gradient(90deg, #4ff0ff, #ff4fd8); }
    .row { display: grid; grid-template-columns: 56px 1fr; align-items: center; gap: 8px; margin: 4px 0; opacity: .3; transition: opacity .2s; }
    .row.on { opacity: 1; }
    .label { font-size: 13px; color: #ff4fd8; }
    .cells { display: grid; grid-template-columns: repeat(16, 1fr); gap: 3px; }
    .cell { aspect-ratio: 1; min-width: 0; padding: 0; background: #14141f; color: #55557a; border: 1px solid #23233a; border-radius: 4px; cursor: pointer; font-size: 12px; }
    .cell:nth-child(4n+1) { border-color: #3a3a58; }
    .cell.hit { background: #2a1838; color: #ff4fd8; }
    .cell.now { outline: 1px solid #4ff0ff; }
    .row.on .cell.hit.now { background: #ff4fd8; color: #0a0a12; }
    .text { font-size: 13px; color: #9a9ab5; }
    .hint { font-size: 12px; color: #66668a; margin-top: 16px; line-height: 1.5; }
  </style>
  <header>
    <h1>tone<span>.live</span></h1>
    <div class="controls">
      <button id="play" type="button">▶ play</button>
      <button id="stop" type="button">■ stop</button>
    </div>
  </header>
  <div class="info">
    <span id="section">ready</span>
    <span id="bar">bar 0 / ${TOTAL_BARS}</span>
    <span id="clock">0:00 / ${fmt(LENGTH)}</span>
    <span>${BPM} bpm · F minor</span>
  </div>
  <div class="progress"><div id="progress"></div></div>
  <div id="rows"></div>
  <p class="hint">Click cells to edit patterns while it plays. Bass cells cycle · → x (root) → o (octave up).</p>
`;

const $ = (sel) => document.querySelector(sel);
const rowEls = {};
const columns = Array.from({ length: 16 }, () => []);

for (const name of ROWS) {
  const row = document.createElement("div");
  row.className = "row";
  row.innerHTML = `<span class="label">${name}</span>`;

  if (grid[name]) {
    const cells = document.createElement("div");
    cells.className = "cells";
    grid[name].forEach((_, i) => {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cell";
      const render = () => {
        cell.textContent = grid[name][i] === "." ? "·" : grid[name][i];
        cell.classList.toggle("hit", grid[name][i] !== ".");
      };
      cell.addEventListener("click", () => {
        const cycle = name === "bass" ? [".", "x", "o"] : [".", "x"];
        grid[name][i] = cycle[(cycle.indexOf(grid[name][i]) + 1) % cycle.length];
        render();
      });
      render();
      cells.append(cell);
      columns[i].push(cell);
    });
    row.append(cells);
  } else {
    row.insertAdjacentHTML("beforeend", `<span class="text">${ROW_TEXT[name]}</span>`);
  }
  $("#rows").append(row);
  rowEls[name] = row;
}

let lastStep = 0;
function draw(bar, step, section, tensionBar) {
  columns[lastStep].forEach((c) => c.classList.remove("now"));
  columns[step].forEach((c) => c.classList.add("now"));
  lastStep = step;

  if (step === 0) {
    $("#section").textContent = tensionBar ? `${section.name} → drop!` : section.name;
    $("#bar").textContent = `bar ${bar + 1} / ${TOTAL_BARS}`;
    for (const name of ROWS) {
      const active = section.parts.includes(name) && !(tensionBar && name === "kick");
      rowEls[name].classList.toggle("on", active || (tensionBar && name === "clap"));
    }
  }
  const elapsed = bar * BAR + step * STEP;
  $("#clock").textContent = `${fmt(elapsed)} / ${fmt(LENGTH)}`;
  $("#progress").style.width = `${(elapsed / LENGTH) * 100}%`;
}

function stopSong(message = "stopped") {
  transport.stop();
  const now = Tone.now();
  pad.releaseAll(now);
  stab.releaseAll(now);
  riser.triggerRelease(now);
  columns[lastStep].forEach((c) => c.classList.remove("now"));
  Object.values(rowEls).forEach((r) => r.classList.remove("on"));
  $("#section").textContent = message;
}

$("#play").addEventListener("click", async () => {
  await Tone.start();
  await Tone.loaded(); // wait for the reverb to be ready
  stopSong("starting…");
  master.volume.cancelScheduledValues(Tone.now());
  master.volume.value = -4;
  transport.position = 0;
  transport.start("+0.1");
});

$("#stop").addEventListener("click", () => stopSong());
