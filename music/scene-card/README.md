# Scene card: the contract between image, app and music

The **scene card** is the small JSON the image side makes from one photo. The app stores it
and passes it to the music generator, which turns it into a unique ~10-second piece.

```
photo ──▶ model server (Akshat) ──▶ scene card ──▶ app (Bhavini) ──▶ music (Chroma) ──▶ 10 s WAV
                                                    stores it in D1    plays + saves to R2
```

Agreed by Akshat, Bhavini and the music side on Monday 16 November 2026. Version `1`.
Change it only together, and bump `version`.

## Example

```json
{
  "version": 1,
  "name": "photo_8f3a2c",
  "place": { "label": "waterfront", "confidence": 0.86 },
  "time_of_day": "morning",
  "mood": { "brightness": 0.72, "warmth": 0.1, "saturation": 0.34, "contrast": 0.22, "n_colours": 4 },
  "stops": [
    ["#cfe3f2", 0.35, 0.1],
    ["#f4c9a8", 0.12, 0.3],
    ["#5f9cc4", 0.28, 0.55],
    ["#e6d6bc", 0.25, 0.88]
  ]
}
```

## Fields

| Field | Type | Range | Meaning | Made by | Used for in the music |
|---|---|---|---|---|---|
| `version` | integer | `1` | Version of this contract | app | check |
| `name` | string | letters, digits, `_` | **Unique id of the photo** (e.g. the D1 row id or a hash of the image) | app | seeds the melody: same photo → same piece, other photo → other piece |
| `place.label` | string | one of the 7 labels below | What kind of place it is | model | picks the **genre** |
| `place.confidence` | number | 0–1 | How sure the model is | model | less sure → more reverb (blurrier) |
| `time_of_day` | string | free text, e.g. `morning`, `afternoon`, `evening`, `night`, `golden_hour` | When it was taken (estimated) | model | shown on screen; not used for sound yet |
| `mood.brightness` | number | 0 (black) – 1 (white) | Average lightness | model | tone filter, melody height, mode |
| `mood.warmth` | number | −1 (blue) – 1 (orange) | Warm vs cool colours | model | mode (warm → major/lydian, cool → minor/dorian) |
| `mood.saturation` | number | 0 (grey) – 1 (vivid) | How colourful | model | melody on/off (> 0.3), chorus width, echo |
| `mood.contrast` | number | 0 (flat) – 1 (harsh) | Spread between dark and light | model | energy: drum strength and **tempo** within the genre's range |
| `mood.n_colours` | integer | 1–8 | How many palette colours were found | model | 5 or more → 7th chords |
| `stops` | array of `[hex, weight, y]` | 1–8 items | The palette as a gradient | model | one chord per colour |
| `stops[i][0]` | string | `#rrggbb` | Colour | model | chord choice; strongest colour picks the **key** |
| `stops[i][1]` | number | 0–1, all add up to ≈ 1 | Share of the image | model | how long that chord lasts |
| `stops[i][2]` | number | 0 (top) – 1 (bottom) | Where in the image the colour sits | model | chord order, top of image to bottom |

## Place labels → genres

| `place.label` | Typical photo | Genre |
|---|---|---|
| `green` | park, garden, trees | classical |
| `street` | street, facades, traffic | lo-fi hip-hop |
| `transit` | train / metro station, platform | techno |
| `club` | club, bar or café at night, neon interior | acid techno |
| `market` | market, stalls, food | rumba catalana |
| `waterfront` | beach, sea, harbour | ambient |
| `square` | plaza, old town at night | night jazz |

An unknown label falls back to `street`. If the model cannot tell (very low confidence),
send its best guess anyway; low confidence already makes the music blurrier.

## Rules

- Numbers are plain JSON numbers (no strings), rounded to 2–4 decimals.
- `stops` weights should add up to about 1 (0.9–1.1 is fine).
- `name` must be unique per photo, or two photos get the same melody.
- Check a card with `validateSceneCard(card)` from [`../src/scene-card.js`](../src/scene-card.js)
  before sending it to the music, or against [`scene-card.schema.json`](scene-card.schema.json)
  in Python (`jsonschema`).

## Still to agree

- [ ] Akshat: the exact formulas for brightness, warmth, saturation and contrast (meaning and range above).
- [ ] Akshat: can the model output all 7 labels, including `club` and `market`?
- [ ] Bhavini: which id becomes `name` (D1 row id is simplest).
