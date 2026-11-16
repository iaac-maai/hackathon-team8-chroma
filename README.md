# Chroma

### Take a photo of Barcelona. Hear what it sounds like.

**Group 08 · AI Methods hackathon · IAAC MaAI, Barcelona · 16–20 November 2026**

Chroma turns a photo of a place in Barcelona into a short piece of music made just for that photo.
A beach at sunrise sounds calm and airy, a busy market sounds warm and rhythmic, a club at
night sounds dark and driving. The same photo always gives the same piece; a different photo
gives a different one.

This project was made in one week for the **AI Methods hackathon** of the MaAI programme at
**IAAC** (Institute for Advanced Architecture of Catalonia).

---

## How it works

```
  📷 photo  ──▶  🔍 read the image  ──▶  🗂 scene card  ──▶  🎵 music generator  ──▶  🔊 ~10 s of music
                 what place is it?        a small JSON        picks a genre, key,
                 which colours?           with the results    chords and melody
                 how bright / warm?
```

1. **Read the image.** AI recognises what kind of place it is (park, street, station, market,
   beach, square, club). The photo's colours are measured: its main colours, and how bright,
   warm, colourful and contrasted it is.
2. **Scene card.** Everything is packed into one small JSON file: the agreed format between
   the image side, the app and the music
   ([format](music/scene-card/README.md)).
3. **Make the music.** The music is generated live in the browser. Every sound is synthesised,
   with no recordings or samples.

### Place → genre

| The photo shows… | Genre |
|---|---|
| a park or garden | classical |
| a street | lo-fi hip-hop |
| a train or metro station | techno |
| a club or bar at night | acid techno |
| a market | rumba catalana |
| a beach or the sea | ambient |
| a square or the old town at night | night jazz |

### Colours → music

| In the photo | In the music |
|---|---|
| main colour | the key |
| warm and bright / cool and dark | happy, open scales / darker, minor scales |
| each main colour, top to bottom | one chord each, in that order |
| how much of the image a colour fills | how long its chord lasts |
| colourful / grey | a melody plays / no melody |
| hard contrast | stronger drums and faster tempo |
| brightness | brighter or more muffled sound |

---

## What's in this repository

| Folder | What it is |
|---|---|
| [`01_autoencoder/`](01_autoencoder/) | Image side: preparing the photo data (Places365, our own photos, Wikimedia Commons), recognising the place, measuring colours and gradient maps, plus a gradient map prototype |
| [`music/`](music/) | Music side: the scene card format, the scene card → music generator and player, and a tool that learns genre rules from reference songs |
| [`impulse/`](impulse/) | Our impulse talk |

## Try it

**Hear the music** (needs [Node.js](https://nodejs.org/)):

```bash
cd music
npm install
npm run dev
```

Open http://localhost:5173/chroma.html and click **play**.

**See a photo's gradient map:** open
[`01_autoencoder/prototype/gradient_map.html`](01_autoencoder/prototype/gradient_map.html)
in a browser and drop in a photo.

To rebuild the photo data, follow [`01_autoencoder/data_prep/README.md`](01_autoencoder/data_prep/README.md).

---

## The week

| Day | Folder | Status |
|---|---|---|
| Mon | [`01_autoencoder/`](01_autoencoder/) · [`music/`](music/) | in progress |
| Tue | `02_model_server/` | |
| Wed | `03_app/` | |
| Thu | `04_final/` | |

## Team

| Name | Role |
|---|---|
| Akshat | image side: data, place recognition, colours, model server |
| Bhavini | app |
| _to fill in_ | music generator |

## Links

| Part | Link |
|---|---|
| Model (Hugging Face) | `iaac-maai/hackathon-team8-chroma-ae` (coming) |
| Model server (Render) | coming |
| App (Cloudflare Pages) | coming |

## Data and licences

| Data / tool | Used for | Licence |
|---|---|---|
| Places365 (six scene categories) | testing the photo → place step | non-commercial research and teaching; images belong to their owners; not redistributed |
| Wikimedia Commons (Barcelona) | Barcelona test photos and demo images | per file (CC0 / CC BY / CC BY-SA); credits in `credits.csv` |
| Barcelona open data (noise map, trees, parks) | gradient map of the city | CC BY 4.0 |
| OpenStreetMap coastline | distance to the sea | ODbL |
| Audio Spectrogram Transformer (MIT) | recognising the genre of reference songs | BSD-3-Clause |
| Tone.js | making the sound in the browser | MIT |

Photos and reference songs are **not** stored in this repository. The music rule book keeps only
statistics, such as "kick on step 1 in 92 % of bars", never audio.

## AI usage disclosure

| | |
|---|---|
| **Tools** | Claude Code (agent) |
| **Why** | _to fill in_ |
| **Where** | Monday: ... Tuesday: ... Wednesday: ... Thursday: ... |
| **How** | _to fill in_ |

**Lessons learned:** _to fill in at the end of the week_

## Licence

Code: [MIT](LICENSE) © 2026 Group 08 (IAAC MaAI hackathon).
