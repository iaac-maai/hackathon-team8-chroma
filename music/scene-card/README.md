# Scene card: the contract between image, app and music

The **scene card** is the small JSON the image side makes from one photo. The app stores it
and passes it to the music generator, which turns it into a unique ~10-second piece.

```
photo ──▶ model server (Akshat) ──▶ scene card ──▶ app (Bhavini) ──▶ music (Chroma) ──▶ 10 s WAV
                                                    stores it in D1    plays + saves to R2
```

Version `1` agreed by Akshat, Bhavini and the music side on Monday 16 November 2026.
Version `2` (extra labels, all optional) agreed on Tuesday 17 November 2026.
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
| `version` | integer | `1` or `2` | Version of this contract | app | check |
| `name` | string | letters, digits, `_` | **Unique id of the photo** (e.g. the D1 row id or a hash of the image) | app | seeds the melody: same photo → same piece, other photo → other piece |
| `place.label` | string | one of the 7 labels below | What kind of place it is | model | picks the **genre** |
| `place.confidence` | number | 0–1 | How sure the model is | model | less sure → more reverb (blurrier) |
| `time_of_day` | string | free text, e.g. `morning`, `afternoon`, `evening`, `night`, `golden_hour` | When it was taken (estimated) | model | shown on screen; used as `time` when a version 2 `time` is missing |
| `mood.brightness` | number | 0 (black) – 1 (white) | Average lightness | model | tone filter, melody height, mode |
| `mood.warmth` | number | −1 (blue) – 1 (orange) | Warm vs cool colours | model | mode (warm → major/lydian, cool → minor/dorian) |
| `mood.saturation` | number | 0 (grey) – 1 (vivid) | How colourful | model | melody on/off (> 0.3), chorus width, echo |
| `mood.contrast` | number | 0 (flat) – 1 (harsh) | Spread between dark and light | model | energy: drum strength and **tempo** within the genre's range |
| `mood.n_colours` | integer | 1–8 | How many palette colours were found | model | 5 or more → 7th chords |
| `stops` | array of `[hex, weight, y]` | 1–8 items | The palette as a gradient | model | one chord per colour |
| `stops[i][0]` | string | `#rrggbb` | Colour | model | chord choice; strongest colour picks the **key** |
| `stops[i][1]` | number | 0–1, all add up to ≈ 1 | Share of the image | model | how long that chord lasts |
| `stops[i][2]` | number | 0 (top) – 1 (bottom) | Where in the image the colour sits | model | chord order, top of image to bottom |

## Version 2: extra labels (all optional)

Leave out any label you can't make; the music then uses its default. Every AI guess
carries a `confidence`, and **labels below 0.5 are ignored**.

```json
"indoor":   { "value": false, "confidence": 0.97 },
"time":     { "label": "day", "confidence": 0.9 },
"season":   { "label": "summer", "confidence": 0.74 },
"paving":   { "label": "sand", "confidence": 0.88 },
"details":  { "crowd": 0.2, "nature": 0.75 },
"gradient": ["#2f5f80", "#4a7fa6", "#5f9cc4", "#8db8d6", "#b9d2e6", "#cfe3f2", "#e6d6bc", "#f4c9a8"],
"city":     { "noise": 0.3, "traffic": 0.2, "nightlife": 0.3, "trees": 0.1, "sea": 1 }
```

| Field | Values | Made by | Used for in the music |
|---|---|---|---|
| `indoor` | `value` true / false + confidence | CLIP | indoors → small dry room reverb; outdoors → bigger open reverb |
| `time` | `day`, `golden_hour`, `night` + confidence | CLIP | night → darker tone, more echo; golden hour → warmer mode, softer tone |
| `season` | `spring`, `summer`, `autumn`, `winter` + confidence | CLIP | extra layer: spring bells, summer bells + shaker, autumn warm pad, winter soft pad + gentler drums |
| `paving` | `cobblestones`, `asphalt`, `tiles`, `stone_slabs`, `gravel`, `sand`, `wood`, `indoor_floor` + confidence | CLIP | the drum sounds: clicks, tight hits, brushes, woody knocks (genres with drums only) |
| `details.crowd` | 0 (empty) – 1 (packed) | segmentation: share of people + vehicles, suggested `min(1, share × 4)` | **busy**: tempo inside the genre's range, ghost hats (> 0.6), fewer hats (< 0.25), crowd murmur (> 0.5) |
| `details.nature` | 0 (all built) – 1 (all nature) | segmentation: share of trees, plants, water and sky | acoustic (> 0.4 wood knocks, > 0.55 birds) vs electronic (synth arpeggio in techno, lo-fi and ambient) |
| `gradient` | exactly 8 `#rrggbb`, shadows → highlights | gradient map | 3 darkest → bass tone (colourful = brighter) and a fifth when their hues differ; 3 lightest → the notes the melody moves to between chord notes |
| `city.noise`, `city.traffic` | 0–1 | Barcelona open data (photos with a location) | add to **busy** |
| `city.nightlife` | 0–1 | open data | pushes towards electronic |
| `city.trees` | 0–1 | open data | adds to acoustic |
| `city.sea` | 0 (far) – 1 (at the sea) | open data, distance to the sea | more open reverb |

**Place labels from the image model:** `beach`, `metro`, `airport` and `mountains` are accepted
and mapped: beach → `waterfront`, metro and airport → `transit`, mountains → `green`.

## Listener (optional, added by the app's server)

```json
"listener": { "type": "mellow", "tempo": -12, "reverb": 0.15, "drums": 0.7, "surprises": 0 }
```

`type`: `mellow`, `unpretentious`, `sophisticated`, `intense` or `contemporary` (or just the string, `"listener": "mellow"`).
The numbers are optional and override the type's defaults. The photo still sets the genre and key; the listener only
shifts tempo, chords, drums and sound inside it. Details: `music/README.md`, "Listener personality".

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

- [x] Akshat: all 7 place labels, including `club` and `square` (done 17 November).
- [ ] Akshat: scale `crowd`, `nature` and the city layers to 0–1 as above.

- [ ] Akshat: the exact formulas for brightness, warmth, saturation and contrast (meaning and range above).
- [x] Akshat: the model outputs all 7 labels.
- [ ] Bhavini: which id becomes `name` (D1 row id is simplest).
