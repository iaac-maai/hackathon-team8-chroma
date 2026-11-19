// Listener personality: the same place, heard by five kinds of listener.
//
// The five music-taste types of the MUSIC model (Rentfrow, Goldberg & Levitin 2011, J. Pers. Soc. Psych.;
// grown out of Rentfrow & Gosling 2003, "The Do Re Mi's of Everyday Life"). Openness goes with Sophisticated,
// Extraversion with Contemporary and Unpretentious.
//
// Rule: the photo sets the music (place → genre, colours → key and chords). The personality only shifts it
// inside the genre's own range: a Mellow beach and an Intense beach are both still a beach.
//
// Where the type comes from, first match wins:
//   1. the scene card:  "listener": { "type": "mellow", "tempo": -12, "reverb": 0.3 }   (set by the app's server)
//   2. ?listener=mellow in the page address
//   3. the `persona` cookie the login page sets (readable, not secret)
// Numbers in the card override the type's defaults below.

export const TYPES = {
  mellow: {
    label: "Mellow", desc: "calm, dreamy",
    tempo: -12, drums: 0.7, reverb: 0.15, surprises: 0, chords: "smooth",
  },
  unpretentious: {
    label: "Unpretentious", desc: "easy, warm, acoustic",
    tempo: 0, drums: 0.9, reverb: 0, surprises: 0, chords: "simple", acoustic: true,
  },
  sophisticated: {
    label: "Sophisticated", desc: "curious, complex",
    tempo: 0, drums: 0.8, reverb: 0.05, surprises: 2, chords: "rich",
  },
  intense: {
    label: "Intense", desc: "loud, powerful",
    tempo: 12, drums: 1.15, reverb: -0.08, surprises: 1, chords: "plain", darker: 1, hard: true,
  },
  contemporary: {
    label: "Contemporary", desc: "rhythmic, danceable",
    tempo: 4, drums: 1.05, reverb: -0.05, surprises: 1, chords: "plain", beat: true,
  },
};

function fromPage() {
  try {
    const q = new URLSearchParams(globalThis.location?.search ?? "").get("listener");
    if (q) return q;
    const m = (globalThis.document?.cookie ?? "").match(/(?:^|;\s*)persona=([a-z]+)/i);
    return m ? decodeURIComponent(m[1]) : null;
  } catch { return null; }
}

// → the full settings for this card, or null (no personality: the music as the photo says)
export function listenerFor(card) {
  const given = card?.listener;
  const type = String((typeof given === "string" ? given : given?.type) ?? fromPage() ?? "").toLowerCase();
  if (!TYPES[type]) return null;
  const extra = typeof given === "object" && given ? given : {};
  const pick = (k) => (typeof extra[k] === "number" ? extra[k] : TYPES[type][k]);
  return { ...TYPES[type], type, tempo: pick("tempo"), drums: pick("drums"), reverb: pick("reverb"), surprises: pick("surprises") };
}

// Shift the style chosen from the photo (variety.js) for this listener. Tempo moves the genre's range,
// but never more than 10% outside it.
// (Uses no chance, so the photo's own key, mode and chords stay exactly the same underneath.)
export function shapeStyle(style, who) {
  if (!who) return style;
  const s = { ...style, patterns: { ...style.patterns } };
  const [lo, hi] = style.tempo;
  const shift = (t, ref) => Math.round(Math.min(ref * 1.1, Math.max(ref * 0.9, t + who.tempo)));
  s.tempo = [shift(lo, lo), shift(hi, hi)];
  if (who.chords === "rich") s.sevenths = true;
  if (who.chords === "simple") { s.sevenths = false; if (!s.progression) s.progression = [0, 3, 4, 0]; } // plain I–IV–V–I
  if (who.acoustic) { // real instruments: acoustic drums, round soft tones instead of buzzy synths
    s.drumKit = s.band === "techno" ? "LINN" : "acoustic-kit";
    if (s.timbre) s.timbre = { ...s.timbre, keysOsc: s.timbre.keysOsc && "triangle", leadOsc: s.timbre.leadOsc && "sine", brightness: s.timbre.brightness * 0.85 };
  }
  if (who.hard) { // harder synths, a punchier kick
    if (s.timbre) s.timbre = { ...s.timbre, keysOsc: s.timbre.keysOsc && "fatsawtooth", leadOsc: s.timbre.leadOsc && "sawtooth", brightness: s.timbre.brightness * 1.15 };
    if (s.band === "techno") s.kickDrive = Math.min(1, (s.kickDrive ?? 0) + 0.3);
  }
  if (who.chords === "smooth" && s.timbre) s.timbre = { ...s.timbre, keysAttack: Math.max(s.timbre.keysAttack ?? 0, 0.06), brightness: s.timbre.brightness * 0.85 };
  if (who.beat) { // a strong, syncopated beat; drumless styles get a light electronic one
    if (!(s.kickVel > 0)) { s.kickVel = 0.55; s.patterns.kick = "x.....x...x....."; s.patterns.hat = "..x...x...x...x."; s.drumKit = "KPR77"; }
    else {
      s.kickVel = Math.max(s.kickVel, 0.9);
      if (s.patterns.kick) s.patterns.kick = s.patterns.kick.slice(0, 10) + "x" + s.patterns.kick.slice(11); // a push on the "and"
      if (s.patterns.hat) s.patterns.hat = s.patterns.hat.replace(/\.(?=x)/g, (m, i) => (i % 4 === 3 ? "x" : m)); // 16th pick-ups
      if (s.band !== "techno" && s.band !== "jazz") s.drumKit = s.band === "lofi" ? "LINN" : "KPR77";
    }
  }
  return s;
}

// Drum loudness for this listener (softer, lighter or punchier), applied to the composed drum score.
export function shapeDrums(drums, who) {
  if (!who || who.drums === 1) return drums;
  for (const part of Object.keys(drums)) drums[part] = drums[part].map((v) => Math.min(1, v * who.drums));
  return drums;
}
