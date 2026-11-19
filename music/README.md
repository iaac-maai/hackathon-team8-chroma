# music/: the Chroma music engine (Bo)

This folder turns a **scene card** (the place type and colours of a photo) into a short piece of music, played live in the browser with [Tone.js](https://tonejs.github.io/).
The whole engine, step by step: [ENGINE.md](ENGINE.md).

## Run it

```bash
cd music
npm install
npm run dev
```

Then open:

- **http://localhost:5173/chroma.html**: Chroma Barcelona. **Take or upload a photo**: it goes to
  Akshat's model server (`team8-chroma-model.onrender.com`), which recognises the place, time and season
  and measures the colours. That scene card becomes a ~10 s piece and plays straight away.
  The hand-made example scenes are still there under "Example scenes".
  - The free server sleeps: the first photo after a pause takes about a minute.
  - Another model server: `chroma.html?model=http://localhost:7860`, or `VITE_MODEL_URL` in `music/.env.local`.
  - The live camera works on `localhost` and `https` pages; elsewhere the button opens the phone's camera or file picker.
- **http://localhost:5173/**: a 40-bar house track with a live step grid (the first Tone.js test).

## Walk mode (the main goal)

Press **🚶 Walk mode**: the camera stays on and the music plays live while you walk.

- **What you see:** every 3.5 seconds while walking (10 when you stand still) a frame goes to the model server.
  The music switches on the next bar (the next half bar when the music is slow), so it changes within
  about 1–2 seconds of the model's answer and never stops:
  - **same place** → seamless: the beat keeps going; key, chords, colours and melody follow the view.
    The sub-genre and sound stay the same for that place during your walk (after ~8 views it moves on).
  - **new place** → a short transition (the filter closes, noise rises, a snare roll), then the new genre lands with a crash.
  The place changes when the model is fairly sure (50%+) or sees the new place twice in a row (an unsure new place is checked again after 1.5 s).
  The page fires a `chroma:view` event at the moment the music switches (genre, place, key, bpm).
- **How fast you walk:** the phone's motion sensor counts your steps. The tempo follows your steps,
  halved or doubled to fit the genre (120 steps/min → 60 bpm classical or 120 bpm techno).
  No motion sensor: GPS speed. Standing still: the slow end of the genre.
- **Layers:** walking adds a layer every few seconds: chords + bass → drums → melody → everything
  (counter-line, season pads, paving clicks, birds). Standing still for 8 seconds takes them away again.
- **Turning a corner** (compass turns more than 60°): a new view right away.
- **Where you are:** GPS location is shown; Barcelona city layers per location still need the model server to accept it.

### Try it on your phone

Phones only allow the camera and motion sensors on `https`:

```bash
cd music
npm run phone
```

Open the **Network** address it prints (`https://192.168…:5173/chroma.html`) on your phone, on the same Wi-Fi,
and accept the certificate warning once (it's your own laptop). iPhone asks for motion access when you press Walk mode.


### Merged in from Akshat's Chroma Live (`offline.js`, `walk.js`)

- **Speed in bands:** still / walk / run / vehicle, from steps, GPS (worked out from two fixes when the phone gives no speed)
  or, with no sensors (laptop), how much the camera picture moves. Shown as km/h + band + source.
- **Offline:** if the model server can't be reached, the view's colours are read on the phone and the place stays the
  same, so the music never stops. **🧠 Offline places** loads CLIP in the browser (~90 MB once) to recognise the place
  without the server (Akshat's prompts for the 7 places).
- **⬇ Walk log:** one row every 2 s and one per view (speed, band, place, source, genre, key, bpm, colours, location), as CSV.

## What's in here

| Path | What it does |
|---|---|
| `chroma.html`, `src/chroma.js` | The Chroma player page: camera/upload, gradient background, chords, timeline |
| `src/walk.js` | Walking sensors: steps per minute, GPS speed and location, turning corners; pace → tempo |
| `vite.config.js` | `npm run phone`: https on your Wi-Fi for phone testing |
| `src/variety.js` | The variation engine: 38 sub-genres (calm → extreme), grooves, progressions, melody styles, sound design |
| `src/personality.js` | The five listener types and how each shifts the music |
| `src/emotion.js` | Photo + place → pleasantness and energy (music psychology, see above) |
| `src/wav.js` | Records a piece while it plays and turns it into a WAV file |
| `src/compose.js` | The composer: song shape, voice leading, melody phrases, drum variations, fills, human feel |
| `src/model-client.js` | Sends a photo to the model server and returns its scene card |
| `src/chroma-map.js` | The rules: scene card → key, chords, rhythm, melody, sound |
| `src/scenes.js` | The example Barcelona scene cards (13 scenes) |
| `src/scene-card.js` | Checks that a scene card has the right fields |
| `scene-card/` | The scene card format (schema and example) shared with the image side |
| `rulebook/` | Python analyser: statistics from reference songs per genre (no audio is stored) |
| `index.html`, `src/main.js` | The house-track experiment |

## How colours become music

- **Place → genre:** green = classical, street = lo-fi, transit = techno, club = acid techno, market = rumba catalana, waterfront = ambient, square = night jazz.
- **Main colour → key**, **warmth and brightness → mode** (happy or moody).
- **Each palette colour → a chord**, and the biggest colour is the home chord.
- **Brightness → filter** (darker photos sound duller), **saturation → melody on/off**, **contrast → energy**, **confidence → reverb**.
- The same photo always gives the same song.

### Extra labels (scene card version 2, all optional)

- **Indoor/outdoor → room**: small dry room or big open space.
- **Time → sound colour**: night darker with more echo, golden hour warmer.
- **Season → extra layer**: spring and summer bells, summer shaker, autumn and winter pads.
- **Crowd + city noise → busy**: tempo, ghost hats, crowd murmur.
- **Nature vs built → acoustic or electronic**: birds and wood knocks, or a synth arpeggio.
- **Paving → drum sounds**: cobblestone clicks, sand brushes, woody knocks.
- **Gradient map → bass and melody**: the dark colours shape the bass, the light colours the melody.

The player page shows each label and what it did, or "not sent" when it's missing.
Full details in [`scene-card/README.md`](scene-card/README.md).

### Sound quality

- **Same loudness for every genre:** an automatic leveller listens to the mix and keeps every piece at the same level
  (measured: park, beach, market and club all within about 2 dB). It turns down fast and up slowly, and remembers the
  right level per genre, so a quiet intro never makes the drop too loud.
- **No crackle:** a gentle compressor, a limiter and a soft clipper. Measured: 0 clipped samples.
- **Never crowded:** at most two extras per piece (second voice, synth arpeggio, season sounds, birds, wood knocks,
  paving clicks); the photo decides which two.

### Saving the sound (WAV)

Every single piece (a photo, or one example) is recorded while it plays. At the end a **⬇ save sound** button
appears (`chroma_<name>.wav`, 16-bit stereo, about 10 s plus the last chord ringing out), and the page fires an event
that the app can use to store it, for example:

```js
window.addEventListener("chroma:wav", (e) => {
  const { blob, name, seconds, card, genre } = e.detail; // blob = the WAV file
  upload(name, blob);
});
```

Pressing stop halfway throws the recording away. Walk mode is not recorded.

### How the photo feels → the music (music psychology)

Based on Akshat's research note on music psychology (sources at the end of [ENGINE.md](ENGINE.md)). Nothing plays before Akshat's model
has read the photo (place, colours, time, details); only when the model server can't be reached are the colours read on
the phone. The scene card is turned into two numbers, **pleasantness** and **energy** (Russell 1980), in `src/emotion.js`:

| From | Rule | Source |
|---|---|---|
| colours | pleasantness = 0.69·brightness + 0.22·saturation; energy = −0.31·brightness + 0.60·saturation | Valdez & Mehrabian 1994 |
| colours | warm, yellow → more pleasant; cool blue-grey → less; high contrast → more energy | Palmer et al. 2013 |
| place | park and sea: pleasant and calm · station: eventful, less pleasant · club: very eventful (weighed by the model's confidence) | Axelsson et al. 2010, ISO 12913 |
| details | crowds, traffic, noise → more energy; night excites a club or street, calms a park; golden hour is pleasant | Axelsson et al. 2010 |

And then into the music:

| Feeling | Music | Source |
|---|---|---|
| energy | which style of the place (calm photo → calm style) and the tempo | Gabrielsson & Lindström 2010 |
| pleasantness | the mode: pleasant → major / lydian … unpleasant → minor / phrygian | Palmer et al. 2013 |
| — | one planned surprise chord (borrowed from the opposite mode) just before the ending, resolved by the home chord | Cheung et al. 2019 |

Examples: a calm beach morning → ambient; a Sunday-morning park → minimal piano; a busy market → flamenco;
a club at night → drum & bass. Chance only adds small differences (🎲 new version).
A photo alone reaches at most the second-fastest style: the most extreme ones (hardcore, bebop, presto) need real speed.
The player shows it in a **feeling** row, e.g. "pleasantness 39% → aeolian · energy 100% → drum & bass · one surprise chord".

### Listener personality (`src/personality.js`)

Five music-taste types from the MUSIC model (Rentfrow, Goldberg & Levitin 2011; Rentfrow & Gosling 2003).
**The photo still sets the music** (place → genre, colours → key and chords); the type only shifts it inside the
genre's range. Tested on all 13 example photos × 5 types: the genre and the key stay the same every time.

| Type | What changes |
|---|---|
| **Mellow** (calm, dreamy) | −12 bpm, drums at 70%, more reverb, softer attack, no surprise chords |
| **Unpretentious** (easy, warm, acoustic) | acoustic drum kit, round soft tones, plain I–IV–V–I chords (no 7ths), no surprise chords |
| **Sophisticated** (curious, complex) | 7th and 9th chords, two surprise chords instead of one, drums at 80% |
| **Intense** (loud, powerful) | +12 bpm, drums at 115%, one step towards minor, harder synths, more kick distortion in techno |
| **Contemporary** (rhythmic, danceable) | +4 bpm, a stronger syncopated beat, 808 / LinnDrum kit; drumless styles get a light electronic beat |

Tempo shifts never go more than 10% outside the genre's own range. Example, the Raval club photo (drum & bass):
Mellow 157 bpm · no type 169 · Intense 181 bpm in harmonic minor.

**How the type reaches the music** (first match wins):

1. the scene card (the app's server adds it):
   ```json
   "listener": { "type": "mellow" }
   ```
   `type` is one of `mellow`, `unpretentious`, `sophisticated`, `intense`, `contemporary`. Optional numbers override
   the type's defaults: `tempo` (bpm, e.g. −12), `reverb` (added, e.g. 0.15), `drums` (loudness factor, e.g. 0.7),
   `surprises` (0, 1 or 2). A plain string works too: `"listener": "mellow"`.
2. `?listener=mellow` in the page address (for testing);
3. a readable `persona` cookie (e.g. `persona=mellow; path=/`), so photos read on the phone follow it too.

No type → the music exactly as the photo says. The player shows it in the feeling row: "listening as Mellow · …".

### Speed picks the style (walk mode)

The place picks the family; **how fast you move picks the style inside it**, and the tempo follows your steps:

| You | Park | Club | Square | Street |
|---|---|---|---|---|
| standing still | romantic piano ~50 bpm | deep house | cool jazz ballad | lo-fi |
| walking | classical / folk | house / acid | blues shuffle | boom bap |
| running | neo-classical / allegro | drum & bass ~170 | night jazz / bossa | chillhop / UK garage |
| sprint, bike, vehicle | presto ~190 | hardcore 200–230 | bebop 200–260 | jungle ~175 |

A change of speed band rebuilds the music on the next bar (with the usual transition when the style changes), so it
reacts within about 2 seconds. No sensors (laptop, demo): the photo and chance pick the style, as before.
Classical plays on a real grand piano (Salamander samples, CC-BY 3.0, loaded in the background from tonejs.github.io;
the synth piano plays until it's loaded). Hard techno and hardcore get a distorted kick.

### Real drums

Every style plays a **recorded drum kit** instead of synthesised drums: LinnDrum for boom bap, an 808-style kit
(KPR-77) for house and dub techno, CR-78 for electro, Roland R-8 for jungle, an acoustic kit for jazz, bossa nova and
bebop, bongos and toms for the market styles, a techno kit for techno, trance and hardcore (through the distortion).
Kick, snare, hi-hat and three toms per kit; ride, crash and shaker stay synthesised and the market's palmas stay hand claps.
All kits (66 small files) load in the background when the first piece starts; until a kit is there the synth drums play,
so the music never waits. Measured: six styles between −18.6 and −22 dB, 0 clipped samples.
Samples: Tone.js (tonejs.github.io/audio/drum-samples).

### The variation engine (`src/variety.js`): every piece is different

Each photo gets its own musical "DNA" (seeded by the photo: the same photo gives the same piece,
**🎲 new version** gives another one, and in walk mode every view is new):

| Choice | Options |
|---|---|
| Sub-genre | 5–7 per place, 38 in total, from calm to extreme. Park: romantic piano (real grand piano), minimal piano, classical, folk, neo-classical pulse, allegro, presto. Street: lo-fi, jazzhop, boom bap, chillhop, UK garage, jungle. Station: dub techno, electro, minimal, techno, hard techno. Club: deep house, house, acid, drum & bass, hardcore (200+ bpm). Market: cumbia, rumba, afro groove, flamenco, bulerías. Beach: drone, ambient, downtempo, balearic house, trance. Square: cool jazz ballad, blues shuffle, night jazz, bossa nova, bebop (200+ bpm) |
| Groove | drum patterns from rhythm recipes (fixed grooves and Euclidean rhythms), rotated and mutated |
| Tempo | anywhere in the sub-genre's range: the photo's energy leads, chance adds the rest |
| Key and mode | the colours pick them; sometimes the second colour picks the key, or the mode moves one step brighter or darker. 7 modes, including phrygian and harmonic minor |
| Chords | the colours' own chords, or a classic progression (pop, jazz ii-V-I, minor loop, modal vamp) |
| Melody | phrases, sparse, busy, riff, arpeggio or pentatonic |
| Sound | the instruments are re-designed per piece: waveform, attack, length, brightness, echo time, guitar tone |

Measured on 1000 random photos: 28 sub-genres, 823 different drum grooves, about 100 tempos,
a different sound design for every piece, and 1000 different pieces.

### The composer (`src/compose.js`)

Every piece is composed, not looped:

- **Song shape:** a quiet intro that builds, the main bars, a drum fill, then an ending on the home chord.
  Longer pieces also get a "lift" bar where the drums drop out.
- **Harmony:** chords move smoothly (closest inversion); jazz, lo-fi and ambient add 9ths.
- **Melody:** phrases. A call, an answer that comes home, then the call again one step higher.
  Its shape follows the photo's brightness from left to right (`scan`); the middle band's detail sets how many notes.
- **Counter-line:** colourful photos get a second voice a third below the melody.
- **Drums:** every bar a bit different: ghost notes where the photo is busy (`scan.detail`),
  syncopated kicks, a fill, a crash at the end, and small human timing changes (loose in lo-fi and jazz, tight in techno).
- **Bass:** passing notes into the next chord; a bright ground lifts it an octave now and then.

Length: 10 s by default (the scene card contract). `chroma.html?length=20` gives longer pieces with more room for the song shape.

