// Checks a scene card (see scene-card/README.md) before the music uses it.
// Returns a list of problems; an empty list means the card is fine.
//
//   import { validateSceneCard } from "./scene-card.js";
//   const problems = validateSceneCard(card);
//   if (problems.length) console.warn(problems);

export const PLACE_LABELS = ["green", "street", "transit", "club", "market", "waterfront", "square"];

const isNum = (x) => typeof x === "number" && Number.isFinite(x);
const inRange = (x, lo, hi) => isNum(x) && x >= lo && x <= hi;

export function validateSceneCard(card) {
  const problems = [];
  const need = (ok, msg) => { if (!ok) problems.push(msg); };

  if (!card || typeof card !== "object") return ["card is not an object"];
  need(card.version === 1, "version must be 1");
  need(typeof card.name === "string" && /^[A-Za-z0-9_]{1,80}$/.test(card.name),
    "name must be letters, digits or _ (unique per photo)");

  const p = card.place ?? {};
  need(PLACE_LABELS.includes(p.label), `place.label must be one of ${PLACE_LABELS.join(", ")}`);
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
      need(typeof s[0] === "string" && /^#[0-9a-fA-F]{6}$/.test(s[0]), `stops[${i}] colour must look like #a1b2c3`);
      need(inRange(s[1], 0, 1), `stops[${i}] weight must be 0–1`);
      need(inRange(s[2], 0, 1), `stops[${i}] y must be 0 (top) – 1 (bottom)`);
    });
    const total = stops.reduce((a, s) => a + (isNum(s?.[1]) ? s[1] : 0), 0);
    need(total >= 0.9 && total <= 1.1, `stops weights add up to ${total.toFixed(2)}, should be about 1`);
  }
  return problems;
}
