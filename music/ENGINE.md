# The Chroma music engine

How a photo, or a walk through Barcelona, becomes music. This document covers Bo's part of Chroma, the music side,
from the scene card to the speaker. For how to run it, see [README.md](README.md). For a short version to use
during the talk, see [talk/MUSIC_PARAMETERS.md](talk/MUSIC_PARAMETERS.md).

---

## 1. In one picture

```
 camera / photo
      │
      ▼
 Akshat's model server ───────────► SCENE CARD (JSON)          no server? offline.js reads the
 (team8-chroma-model.onrender.com)  place, time, season,        colours on the phone (+ CLIP for
                                    colours, details, scans     the place) → same card format
      │
      ▼
 emotion.js      feel()            → pleasantness (valence) + energy (arousal)
 personality.js  listenerFor()     → listener type (Mellow … Intense), or none
 walk.js         energyNow()       → your speed band: still / walk / run / vehicle
      │
      ▼
 variety.js      styleDNA()        → the style: 1 of 38 sub-genres, groove, progression, melody style, sound design
 chroma-map.js   buildScore()      → key, mode, tempo, chords, surprise chord, room, extras
 compose.js      compose()/drumScore() → song shape, melody, counter-line, drums, human timing
      │                                   (all pure data: a "score" object, no audio yet)
      ▼
 chroma.js       playStep()        → Tone.js instruments, drum samples, effects, leveller → speaker
                 liveStep()        → walk mode: switches on the next bar, transitions between genres
 wav.js          makeRecorder()    → a WAV file of every single piece
```

The important split: **everything up to the score is pure data** (it can be tested in Node, with no sound).
Only `chroma.js` makes sound.

---

## 2. The files

| File | Lines | Job |
|---|---|---|
| `src/model-client.js` | 52 | Shrinks a photo to a small JPEG and sends it to Akshat's Gradio server (`/gradio_api/call/predict`); returns the scene card |
| `src/scene-card.js` | 89 | Checks that a card has the right fields (place labels, time, season, paving…) |
| `src/offline.js` | 186 | No server: reads a frame's colours on the phone, the time of day from the clock, the place with CLIP in the browser (~90 MB once); the walk log CSV |
| `src/emotion.js` | 60 | Photo + place → pleasantness and energy (music psychology) and the mode for that pleasantness |
| `src/personality.js` | 95 | The five MUSIC-model listener types and how each one shifts the style |
| `src/walk.js` | 202 | Steps per minute (motion sensor), GPS speed and location, compass turns, camera movement; speed band → energy; steps → tempo |
| `src/variety.js` | 210 | The variation engine: 38 sub-genres, rhythm recipes (Euclidean rhythms), progressions, melody styles, sound design per piece |
| `src/chroma-map.js` | 486 | `buildScore()`: the rules from scene card to score |
| `src/compose.js` | 214 | The composer: song shape, voice leading, melody phrases, counter-line, drum variations, fills, human timing |
| `src/chroma.js` | 1483 | The player: instruments, drum samples, piano, effects, levelling, the photo flow, walk mode, the screen |
| `src/wav.js` | 75 | An AudioWorklet tap that records the output and writes a 16-bit stereo WAV |
| `src/scenes.js` | 155 | 13 hand-made Barcelona example cards (a day's walk: park → street → station → market → beach → club) |
| `scene-card/` | | The card format shared with Akshat: `README.md`, `scene-card.schema.json`, `example.json` |
| `rulebook/` | | Python analyser: statistics from reference songs per genre (no audio is stored) |

---

## 3. The input: the scene card

Akshat's model sends one JSON card per photo. Only `mood` and `stops` are required. Every other field is optional,
and a missing field falls back to a default.

| Field | What it is | Used for |
|---|---|---|
| `place` `{label, confidence}` | green, street, transit, club, market, waterfront, square (aliases: beach, metro, airport, mountains) | the genre family |
| `mood` | brightness, saturation, contrast, warmth (0–1), n_colours | feelings, tempo, filter, melody on/off, chord richness |
| `stops` | palette colours `[hex, weight, y]` (y = 0 top … 1 bottom of the image) | key, chords and their lengths |
| `time` | day, golden_hour, night | tone colour, echo, feelings |
| `season` | spring, summer, autumn, winter | an extra layer (bells, shaker, pads) |
| `indoor` | true / false | small dry room or a big open reverb |
| `paving` | cobblestones, asphalt, tiles, sand, wood… | drum sounds (clicks, brushes, knocks) |
| `details` / `city` | crowd, traffic, noise, nightlife, trees, sea, nature vs built | busy, acoustic vs electronic, extras |
| `gradient` | 8 colours, shadows → highlights | bass tone (dark end), melody notes (light end) |
| `scan` | brightness and detail in 16 strips, left → right | the melody's shape, extra drum hits |
| `layers` | top (sky), middle (facades), ground (street) | pad brightness, number of melody notes, drum busyness, bass register |
| `listener` | `"mellow"` or `{type, tempo, reverb, drums, surprises}` | personality |

Labels the model is less than 50% sure about (`CONFIDENT = 0.5`) are ignored.

---

## 4. Step 1: feelings (`emotion.js`)

The card is turned into two numbers, using Russell's circumplex (1980): **pleasantness** (valence) and
**energy** (arousal), both 0–1. This shared space is what links colours, places and music.

**From the colours.** Valdez & Mehrabian 1994, rescaled to 0–1:

```
pleasantness = 0.69·brightness + 0.22·saturation          (+ (warmth − 0.5)·0.3, Palmer et al. 2013)
energy       = −0.31·brightness + 0.60·saturation          (then 70% of that + 30% contrast)
```

**From the place.** Axelsson, Nilsson & Berglund 2010 (the soundscape circumplex, ISO 12913). The place's value is
weighted by how sure the model is: at 60% confidence or more it counts for 55%, and when the model is unsure the
colours decide.

| Place | Pleasantness | Energy |
|---|---|---|
| green (park) | 0.80 | 0.20 |
| waterfront | 0.80 | 0.30 |
| square | 0.65 | 0.50 |
| street | 0.50 | 0.50 |
| market | 0.65 | 0.70 |
| transit | 0.35 | 0.70 |
| club | 0.60 | 0.90 |

**From the details:**
- A crowd, traffic or noise adds up to ±0.15 energy.
- Night adds 0.1 energy in a club, street, square or station, and takes 0.1 away in other places.
- Golden hour adds 0.08 pleasantness.

**Pleasantness → mode.** Palmer et al. 2013: the scale runs from bright to dark,
`lydian → ionian → mixolydian → dorian → aeolian → harmonic minor → phrygian`.

---

## 5. Step 2: the style (`variety.js` + `personality.js` + `walk.js`)

### 5.1 Place → genre family (fixed)

| Place | Family (band) | Instruments |
|---|---|---|
| green | classical | real grand piano (Salamander samples), strings, cello, flute, birds |
| street | lo-fi / hip-hop | wobbly FM e-piano, soft bass, tape hiss, LinnDrum |
| transit | techno | pumping synth stabs, station chime, techno kit |
| club | house / techno | acid bass, stabs, crowd and glasses, 808 kit |
| market | rumba / flamenco | plucked guitar strings, palmas, cajón, bongos |
| waterfront | ambient | wide pads, glassy FM bells, deep sine bass, waves and gulls |
| square | jazz | Rhodes comping, walking upright bass, swung ride, breathy horn |

**Only the place changes the genre.** The light changes the key, the mode and the colour of the sound,
but a park stays classical at noon and at night. This was verified: 7 out of 7 places kept their genre under every light.

### 5.2 Energy → the style inside the family (38 styles)

Each place has 5–7 sub-genres, ordered from calm to extreme by their tempo:

| Place | calm … extreme |
|---|---|
| green | romantic piano (52–64) · minimal piano · classical · folk · neo-classical pulse · allegro (132–150) · presto (168–188) |
| street | lo-fi · jazzhop · boom bap · chillhop · UK garage (130–136) · jungle (162–176) |
| transit | dub techno · electro · minimal techno · techno · hard techno (146–158, distorted kick) |
| club | deep house · house · acid techno · drum & bass (164–176) · hardcore (192–214, distorted kick) |
| market | cumbia · rumba catalana · afro groove · flamenco (phrygian) · bulerías (176–200) |
| waterfront | drone (48–58) · ambient · downtempo · balearic house · trance (136–142) |
| square | cool jazz ballad (60–76) · blues shuffle · night jazz · bossa nova · bebop (200–250) |

Which style plays is set by the **style energy**:

```
photo only:   styleEnergy = min(0.8, energy)            → a still photo never reaches the most extreme style
walk mode:    styleEnergy = max(speed, 0.6 · energy)    → speed: still 0 · walk 0.4 · run 0.75 · sprint/vehicle 1
```

The speed comes from `walk.js`. It fuses steps (motion sensor), GPS speed and, on a laptop, camera movement into
one speed band, with a little hysteresis so the band doesn't flicker. Running faster than 4.5 m/s counts as the top band.

A style carries everything that makes it that style: tempo range, swing, drum patterns, drum kit, keys pattern,
bass type, melody styles, progression family, extras and kick distortion.

### 5.3 The piece's DNA (seeded)

Inside the style, `styleDNA()` picks the details with a random generator **seeded by the photo**. The same photo
always gives the same piece, **🎲 new version** gives another one, and every view in walk mode is new.

- **Groove:** drum patterns built from rhythm recipes (fixed grooves plus Euclidean rhythms, i.e. k hits spread
  evenly over 16 steps), then rotated and mutated.
- **Progression:** the colours' own chords, or a classic progression of the style (pop, jazz ii–V–I, minor loop,
  modal vamp, classical I–IV–V–I).
- **Melody style:** phrases, sparse, busy, riff, arpeggio or pentatonic.
- **Sound design:** the instruments are re-designed for every piece: waveform, attack, length, brightness,
  pad spread, echo time.

Measured on 1,000 random photos: 823 different drum grooves, about 100 different tempos, and 1,000 different pieces.

### 5.4 The listener's personality

Five music-taste types from the MUSIC model (Rentfrow, Goldberg & Levitin 2011). The type comes, first match wins,
from the card's `listener` field, `?listener=` in the page address, or the `persona` cookie set by the login page.
`shapeStyle()` uses **no chance**, so the photo's own key, mode and chords stay exactly the same.

| Type | Tempo | Drums | Other |
|---|---|---|---|
| Mellow | −12 bpm | 70% | more reverb, softer attack, no surprise chord |
| Unpretentious | 0 | 90% | acoustic kit, round soft tones, plain I–IV–V–I, no surprise chord |
| Sophisticated | 0 | 80% | 7th and 9th chords, two surprise chords |
| Intense | +12 bpm | 115% | one step darker mode, harder synths, more kick distortion |
| Contemporary | +4 bpm | 105% | stronger syncopated beat, 808 / LinnDrum; drumless styles get a light beat |

A tempo shift never goes more than 10% outside the style's range. Tested: 13 photos × 5 types = 65 combinations,
and every one kept the same genre and key.

---

## 6. Step 3: the score (`chroma-map.js` → `buildScore()`)

`buildScore(card, seconds, { live, version, dnaSeed, speed })` makes the score in this order:

1. **Place**: aliases are resolved (beach → waterfront), and a card with no place gets street at 30%.
2. **Feelings**: `feel()`. **Listener**: `listenerFor()`. **Style**: `styleDNA()` then `shapeStyle()`.
3. **Tempo** inside the style's range:
   ```
   tempoPos = 0.45 · energy(feel) + 0.35 · photo energy (contrast, busy) + 0.2 · chance
   bpm      = slow + (fast − slow) · tempoPos
   ```
   In walk mode the tempo then follows your steps instead (step 8).
4. **Length**: bars = seconds × bpm / 240 (at least 3). A photo piece lasts about 10 s, and `?length=20` makes it longer.
5. **Key**: the hue of the biggest *colourful* area (size × saturation) gives 12 hues → 12 keys. Black, white and
   grey have no hue, so an all-grey photo is in D. Sometimes (30%) the second colour picks the key instead.
6. **Mode**: from pleasantness (`modeForFeel`), unless the style has its own (flamenco is always phrygian).
   An Intense listener goes one step darker. Now and then (20%) the mode moves one step brighter or darker, so versions differ.
7. **Chords**: one per palette colour, read from the top of the image (sky) to the bottom (ground), in half-bar steps.
   A bigger colour gets a longer chord. The degree comes from the colour's hue and lightness relative to the main colour,
   or from the style's progression. Harsh diminished chords are skipped. Five or more colours, or a jazzy style,
   adds 7ths, and jazz, lo-fi and ambient add 9ths.
8. **Surprise chord** (Cheung et al. 2019: a surprise after a predictable passage is the most pleasing): the last
   chord before the ending is borrowed from the opposite mode. A bright piece gets the dark ♭VI, a dark piece a bright
   major IV, and the home chord resolves it. Sophisticated listeners get two, Mellow and Unpretentious none.
9. **Ending**: the whole last bar is the home chord, and every chord is voice-led (closest inversion).
10. **Gradient map**: the dark colours shape the bass. Colourful shadows make it growlier, and mixed shadow hues
    make it also play the fifth. The light colours become the scale steps the melody can move to.
11. **Melody and drums**: handed to the composer (section 7).
12. **Room**:
    - The reverb amount is the style's space plus how unsure the model is.
    - Indoors: a small dry room. Outdoors: a bigger hall. Near the sea: bigger still.
    - Night: darker and more echo.
13. **Tone**: the filter cutoff is `400 · 2^(brightness·6)` Hz (600–12,000), times the time of day, the sky's
    brightness and the style's brightness. Saturation sets the stereo spread and the delay amount, and a melody
    plays only when saturation is above 0.3.
14. **Extras, at most two**: the candidates are counter-line, synth arpeggio, season layer, birds, wood knocks and
    paving clicks. The two with the strongest reason in the photo win.

The result is one plain object: bpm, bars, key, mode, chords, melody, harmony, drums, timing, shape, style, feel,
listener, extras, room and tone values, plus the original card. Walk mode uses that card to rebuild the piece when
your speed changes.

---

## 7. Step 4: the composer (`compose.js`)

Every piece is composed rather than looped.

- **Song shape** (`songShape`): a sparse intro that builds, the main bars, a drum fill, then the ending.
  Longer pieces get a "lift" bar where the drums drop out.
- **Melody** (`compose`): real phrases.
  - A call, then an answer that comes home, then the call again one step higher.
  - Its shape follows the photo's brightness from left to right (`scan.brightness`).
  - The facades' detail (`layers.middle`) sets how many notes it plays.
- **Counter-line**: on colourful photos (saturation above 0.5), a second voice a third below the melody.
- **Drums** (`drumScore`):
  - Every bar is a little different: ghost notes where the photo is busy (`scan.detail`) and syncopated kicks.
  - A fill comes before the ending and a crash on the last bar.
  - Soft paving (sand) and winter make the drums gentler.
- **Human feel** (`humanTiming`): small timing and velocity changes. They are loose in lo-fi and jazz, and tight in techno.
- **Bass**: passing notes into the next chord. A bright ground lifts it an octave now and then.

---

## 8. Step 5: the sound (`chroma.js`)

### 8.1 Instruments

There is one band of Tone.js instruments per family (classical, lofi, techno, rumba, ambient, jazz): keys, pad,
bass and lead. Each band is re-tuned per piece by the sound design. On top of the bands:

- **Real piano**: the Salamander grand piano samples (CC-BY 3.0, from tonejs.github.io). They load in the
  background as soon as a classical piece starts, and the synth piano plays until they're ready.
  The keys can play in several ways: arpeggio, comp, stab, strum, bell and Alberti bass.
- **Real drums**: 11 recorded kits from the Tone.js drum-samples collection (kick, snare, hi-hat and three toms each):
  LinnDrum, KPR-77 (808-style), CR-78, R-8, Kit3, Kit8, Stark, Techno, acoustic kit, Bongos and 4OP-FM.
  Each style has its own kit. All 66 files load in the background, and the synth drums play until a kit is there,
  so the music never waits. Ride, crash and shaker are synthesised, and the market's palmas stay hand claps.
- **Kick distortion**: hard techno and hardcore send the kick through a `Distortion` (`kickDrive`).
- **Signature sounds**: birds, gulls, waves, crowd murmur, glasses, station chime, season pads and bells,
  paving clicks, a synth arpeggio, and a riser for transitions.

### 8.2 Effects and output chain

```
instruments ──► master (−4 dB) ──► leveller (auto gain) ──► glue compressor ──► fader ──► limiter (−4 dB) ──► soft clip ──► speaker
     │                                                       (−24 dB, 4:1)                                       │
     └─ sends: hall reverb (6 s) · small room reverb (0.9 s) · ping-pong delay (dotted 8th)                      └─► WAV recorder
```

- **Leveller**: every 200 ms it measures the mix and nudges it towards −22 dB. It turns down fast and up slowly,
  and it remembers the right level for each band, so a quiet intro never makes the drop too loud.
  The park, beach, market and club all land within about 2 dB of each other.
- **No crackle**: a compressor, a limiter and a `tanh` soft clipper. The measured result: six styles between −18.6 and −22 dB, with 0 clipped samples.
- **Timing guard** (`after()`): a drum voice can't play two hits at the same instant (Tone.js throws an error), so
  each hit on a voice goes at least 2 ms after the last one. This matters when a snare roll, a crash and the score's
  own hits meet.

### 8.3 Saving (`wav.js`)

Every single piece (a photo or an example) is recorded while it plays. At the end the player shows a **⬇ save sound**
button (a 16-bit stereo WAV) and fires a `chroma:wav` event with `{ blob, name, seconds, card, genre }`, which
Bhavini's app can use to store the file. Pressing stop throws the recording away. Walk mode is not recorded.

---

## 9. Walk mode: the live engine

Walk mode is the main goal: the camera stays on, and the music follows the walk without ever stopping.

**Views.** A frame goes to the model server:
- every 3.5 s while walking
- every 10 s when standing still
- every 6 s with no sensors
- right away when you turn a corner (a compass turn of more than 60°)

When the server can't be reached, `offline.js` reads the colours on the phone and keeps the last place,
or uses CLIP if it has been loaded.

**Place switching, with no jumps on one guess:**
- The genre changes when the model is at least 50% sure, or when it sees the new place twice in a row.
- An unsure new place is checked again after 1.5 s, so a real change still lands quickly.
- In the same place, the style and sound stay for the walk. Only the key, chords, colours and melody follow the view.
- After about 8 views in one place, the style moves on so it never gets stale.

**Switching on the beat** (`liveStep`, once per 16th note):
- A new view lands on the next bar, or on the next half bar when the music is slow (a bar longer than 2.5 s).
- **Same genre**: the switch is seamless and the beat keeps going.
- **New genre**: a short transition.
  1. The band's filter closes.
  2. A noise riser opens.
  3. A snare roll builds.
  4. The new genre lands with a crash.
- At the switch the page fires a `chroma:view` event with `{ genre, place, key, bpm, transition }`.

**Speed changes the music between views.** When `energyNow()` moves into another band (still → walk → run → sprint),
the same view is rebuilt for that speed, so moving faster brings a faster style without waiting for the next photo.
A view that is waiting to play is rebuilt too.

**Tempo follows your steps** (`walkTempo`):
- **Steps:** the tempo is your step rate, or ½×, 1.5× or 2× of it, whichever fits the style's range.
  At 110 steps/min, that gives a 110 bpm lo-fi, a 55 bpm drone or a 165 bpm drum & bass.
- **No steps:** GPS speed maps 0–2 m/s onto the range. With no sensors at all, the camera's movement does.
- **Flat out:** the top of the range.
- **Standing still:** the slow end.

**Layers** (every 2 s, `followWalk`):
1. Walking builds the music up: chords and bass → drums → melody → everything (counter-line, season, paving, birds).
2. After 8 seconds standing still, the layers drop away again.

**Walk log**: a row every 2 s and one per view (speed, band, place, source, genre, key, bpm, colours, location),
downloadable as a CSV.

---

## 10. How the other apps use the engine

- **Bo's player page:** `chroma.html`, with `npm run dev`. On a phone, `npm run phone` serves it over https on the Wi-Fi.
- **Bhavini's app:** `npm run build:music` in her folder builds Bo's player. It runs through `scripts/music-bridge.js`,
  which gives the app `chromaLive.start/view/follow/now/stop`, `chromaPlayCard` and `chromaDescribe`.
- **Akshat's app:** Bo's player is built into `public/live` with
  `VITE_MODEL_URL="" npx vite build --base ./ --outDir "../Akshat - Image processing/03_app/public/live"`.
- **Events to listen for:** `chroma:view` (the music switched) and `chroma:wav` (a piece was recorded).
- **Page options:**
  - `?scene=<name>`: one example scene
  - `?length=20`: longer pieces
  - `?model=<url>`: another model server
  - `?listener=<type>`: a listener type

---

## 11. Design choices, and what's next

- **Rules instead of a neural network for the music**: every choice can be explained and has a source, it runs in
  real time on a phone, and it needs no training data with copyright problems. A music model (e.g. Magenta) is a possible next step.
- **Pure data before sound**: the score can be built and tested without audio, which is how the place-vs-light check,
  the 1,000-photo variety test and the 65 personality combinations were run.
- **Never silent**: the synth drums and piano stand in until the samples load, the colours are read on the phone
  when the server is down, and a view is retried when one fails.
- **Known limits:**
  - The model is less sure indoors and in clubs, and an unsure place makes the genre hesitate.
  - A thermal or infrared video confuses the model, which was trained on normal photos, so that idea was dropped.
  - The colour-to-key rule can make the key jump between views of the same place.

## Sources

Russell 1980 (the circumplex of feeling) · Valdez & Mehrabian 1994 (colour → feeling) · Palmer et al. 2013, PNAS
(colour ↔ music through emotion) · Axelsson, Nilsson & Berglund 2010 (soundscapes: pleasant × eventful; ISO 12913) ·
Gabrielsson & Lindström 2010 (emotion → tempo, mode, loudness) · Cheung et al. 2019 (surprise and musical pleasure) ·
Rentfrow & Gosling 2003; Rentfrow, Goldberg & Levitin 2011 (the MUSIC model) · Toussaint 2005 (Euclidean rhythms).
Sound: [Tone.js](https://tonejs.github.io/) and its audio collection (drum samples; the Salamander piano, CC-BY 3.0).
