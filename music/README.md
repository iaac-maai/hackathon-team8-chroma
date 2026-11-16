# Chroma music

Turns a **scene card** (what the image side reads from a photo) into a short piece of music,
generated live in the browser with [Tone.js](https://tonejs.github.io/). No audio files or samples:
every sound is synthesized.

| Folder / file | What it is |
|---|---|
| [`scene-card/`](scene-card/) | The contract between image, app and music: fields, ranges, JSON schema, example |
| [`src/chroma-map.js`](src/chroma-map.js) | The rules: scene card → genre, key, mode, chords, melody, mix (pure data, no audio) |
| [`src/chroma.js`](src/chroma.js) + [`chroma.html`](chroma.html) | The player: sounds, sequencer and the page that shows each scene's gradient |
| [`src/scenes.js`](src/scenes.js) | Example scene cards (Barcelona places) |
| [`src/scene-card.js`](src/scene-card.js) | `validateSceneCard(card)`: checks a card before the music uses it |
| [`rulebook/`](rulebook/) | Python analyser that turns reference songs into per-genre rules (numbers only, no audio in git) |
| [`src/main.js`](src/main.js) + [`index.html`](index.html) | Early Tone.js test: a live-coding style house track with an editable step grid |

## Run it

```bash
cd music
npm install
npm run dev
```

Then open http://localhost:5173/chroma.html (scene cards → music) or http://localhost:5173/ (test track).
Click **play**: browsers only start audio after a click.
