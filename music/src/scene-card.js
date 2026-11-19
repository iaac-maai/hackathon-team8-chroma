// Checks a scene card (see scene-card/README.md) before the music uses it.
// Returns a list of problems; an empty list means the card is fine.
//
//   import { validateSceneCard } from "./scene-card.js";
//   const problems = validateSceneCard(card);
//   if (problems.length) console.warn(problems);
//
// Version 1 cards are still valid. Version 2 adds optional labels; leave out
// any label the image side cannot make and the music uses its default.

export const PLACE_LABELS = ["green", "street", "transit", "club", "market", "waterfront", "square"];
// Akshat's model labels that map onto ours (the music does this mapping too).
export const PLACE_ALIASES = { beach: "waterfront", metro: "transit", airport: "transit", mountains: "green" };
export const TIME_LABELS = ["day", "golden_hour", "night"];
export const SEASON_LABELS = ["spring", "summer", "autumn", "winter"];
export const PAVING_LABELS = ["cobblestones", "asphalt", "tiles", "stone_slabs", "gravel", "sand", "wood", "indoor_floor"];
export const CITY_LAYERS = ["noise", "traffic", "nightlife", "trees", "sea"];

const isNum = (x) => typeof x === "number" && Number.isFinite(x);
const inRange = (x, lo, hi) => isNum(x) && x >= lo && x <= hi;
const HEX = /^#[0-9a-fA-F]{6}$/;

export function validateSceneCard(card) {
  const problems = [];
  const need = (ok, msg) => { if (!ok) problems.push(msg); };

  if (!card || typeof card !== "object") return ["card is not an object"];
  need(card.version === 1 || card.version === 2, "version must be 1 or 2");
  need(typeof card.name === "string" && /^[A-Za-z0-9_]{1,80}$/.test(card.name),
    "name must be letters, digits or _ (unique per photo)");

  const p = card.place ?? {};
  need(PLACE_LABELS.includes(p.label) || p.label in PLACE_ALIASES,
    `place.label must be one of ${PLACE_LABELS.join(", ")} (or ${Object.keys(PLACE_ALIASES).join(", ")})`);
  need(inRange(p.confidence, 0, 1), "place.confidence must be a number 0–1");
  if (card.time_of_day !== undefined) need(typeof card.time_of_day === "string", "time_of_day must be text");

  const m = card.mood ?? {};
  for (const k of ["brightness", "saturation", "contrast"]) need(inRange(m[k], 0, 1), `mood.${k} must be a number 0–1`);
  need(inRange(m.warmth, -1, 1), "mood.warmth must be a number −1–1");
  need(Number.isInteger(m.n_colours) && m.n_colours >= 1 && m.n_colours <= 8, "mood.n_colours must be a whole number 1–8");

  const stops = card.stops;
  if (!Array.isArray(stops) || stops.length < 1 || stops.length > 8) {
    problems.push("stops must be a list of 1–8 [hex, weight, y] items");
  } else {
    stops.forEach((s, i) => {
      need(Array.isArray(s) && s.length === 3, `stops[${i}] must be [hex, weight, y]`);
      if (!Array.isArray(s)) return;
      need(typeof s[0] === "string" && HEX.test(s[0]), `stops[${i}] colour must look like #a1b2c3`);
      need(inRange(s[1], 0, 1), `stops[${i}] weight must be 0–1`);
      need(inRange(s[2], 0, 1), `stops[${i}] y must be 0 (top) – 1 (bottom)`);
    });
    const total = stops.reduce((a, s) => a + (isNum(s?.[1]) ? s[1] : 0), 0);
    need(total >= 0.9 && total <= 1.1, `stops weights add up to ${total.toFixed(2)}, should be about 1`);
  }

  // ---- version 2: optional labels -------------------------------------------
  const labelled = (key, allowed) => {
    const x = card[key];
    if (x === undefined) return;
    need(x && allowed.includes(x.label), `${key}.label must be one of ${allowed.join(", ")}`);
    need(inRange(x?.confidence, 0, 1), `${key}.confidence must be a number 0–1`);
  };
  labelled("time", TIME_LABELS);
  labelled("season", SEASON_LABELS);
  labelled("paving", PAVING_LABELS);

  if (card.indoor !== undefined) {
    need(typeof card.indoor?.value === "boolean", "indoor.value must be true or false");
    need(inRange(card.indoor?.confidence, 0, 1), "indoor.confidence must be a number 0–1");
  }
  if (card.details !== undefined) {
    for (const k of ["crowd", "nature"]) {
      if (card.details?.[k] !== undefined) need(inRange(card.details[k], 0, 1), `details.${k} must be a number 0–1`);
    }
  }
  if (card.gradient !== undefined) {
    need(Array.isArray(card.gradient) && card.gradient.length === 8 && card.gradient.every((h) => typeof h === "string" && HEX.test(h)),
      "gradient must be a list of 8 colours like #a1b2c3, from shadows to highlights");
  }
  if (card.city !== undefined) {
    for (const k of Object.keys(card.city ?? {})) {
      need(CITY_LAYERS.includes(k), `city.${k} is unknown (use ${CITY_LAYERS.join(", ")})`);
      need(inRange(card.city[k], 0, 1), `city.${k} must be a number 0–1`);
    }
  }
  return problems;
}
