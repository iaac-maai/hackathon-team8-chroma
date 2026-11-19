// Photo + place → how the music should feel, on the two axes from music psychology
// (Akshat's research note on music psychology; sources in music/ENGINE.md):
//
//   pleasantness (valence) 0 … 1   unpleasant → pleasant
//   energy       (arousal) 0 … 1   calm → excited
//
// Russell 1980 (circumplex): every feeling is a point in this 2D space, and music, colour and places can all be
// placed in it. That shared space is what links Akshat's scene card to the music.
//
// Then (in chroma-map.js):
//   energy       → which sub-genre of the place (calm … extreme) and the tempo   (Gabrielsson & Lindström 2010)
//   pleasantness → the mode: pleasant → major/lydian, unpleasant → minor/phrygian (Palmer et al. 2013)
//   one planned surprise chord near the end, resolved by the home chord          (Cheung et al. 2019)
import { clamp } from "./variety.js";

// Places on the soundscape circumplex: pleasant × eventful (Axelsson, Nilsson & Berglund 2010; ISO 12913).
// Parks and the sea are pleasant and calm, stations eventful and less pleasant, clubs very eventful.
export const PLACE_FEEL = {
  green:      { valence: 0.8,  arousal: 0.2 },
  waterfront: { valence: 0.8,  arousal: 0.3 },
  square:     { valence: 0.65, arousal: 0.5 },
  street:     { valence: 0.5,  arousal: 0.5 },
  market:     { valence: 0.65, arousal: 0.7 },
  transit:    { valence: 0.35, arousal: 0.7 },
  club:       { valence: 0.6,  arousal: 0.9 },
};

// mood: { brightness, saturation, contrast, warmth } from the scene card (0 … 1)
// place: { label, confidence }   L: readLabels() (busy, time)
export function feel(mood, place, L = {}) {
  const B = mood.brightness ?? 0.5, S = mood.saturation ?? 0.4, C = mood.contrast ?? 0.4, W = mood.warmth ?? 0.5;
  // Colour → feeling. Valdez & Mehrabian 1994: pleasure = .69·brightness + .22·saturation,
  // arousal = −.31·brightness + .60·saturation (rescaled here to 0 … 1).
  let colourV = (0.69 * B + 0.22 * S) / 0.91;
  let colourA = (-0.31 * B + 0.6 * S + 0.31) / 0.91;
  // Palmer et al. 2013: warm, yellow colours go with happy music, cool blue-grey with sad music.
  colourV += (W - 0.5) * 0.3;
  // A hard-edged, high-contrast picture is more energetic (busy light, sharp shadows, neon).
  colourA = 0.7 * colourA + 0.3 * C;

  // Place → feeling, weighed by how sure the model is (not sure → the colours decide).
  const p = PLACE_FEEL[place?.label];
  const w = p ? 0.55 * clamp((place.confidence ?? 0.5) / 0.6, 0, 1) : 0;
  let valence = (1 - w) * colourV + w * (p?.valence ?? 0.5);
  let arousal = (1 - w) * colourA + w * (p?.arousal ?? 0.5);

  // Scene details: crowds, traffic and noise make a place more eventful (Axelsson 2010).
  if (L.busy !== null && L.busy !== undefined) arousal += (L.busy - 0.5) * 0.3;
  // Time of day: night excites a club, street or square and calms a park; golden hour feels pleasant.
  if (L.time === "night") arousal += ["club", "street", "square", "transit"].includes(place?.label) ? 0.1 : -0.1;
  if (L.time === "golden_hour") valence += 0.08;

  return { valence: +clamp(valence, 0, 1).toFixed(2), arousal: +clamp(arousal, 0, 1).toFixed(2) };
}

// Pleasantness → mode, brightest to darkest (Palmer et al. 2013: major ↔ light and happy, minor ↔ dark and sad).
export const MODE_ORDER = ["lydian", "ionian", "mixolydian", "dorian", "aeolian", "harmonic", "phrygian"];
export function modeForFeel(valence) {
  return MODE_ORDER[clamp(Math.round((1 - valence) * 1.25 * (MODE_ORDER.length - 1) - 0.6), 0, MODE_ORDER.length - 1)];
}
