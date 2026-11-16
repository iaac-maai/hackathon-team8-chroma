# Chroma music rule book

The rule book tells the app **how to build a 10-second piece of music** for a picture.
The image side (Akshat) says what kind of place it is; the place picks a genre; the
rule book says what that genre is made of; the generator makes a new piece inside
those rules, different for every picture.

```
reference songs ──▶ analyser ──▶ breakdowns/*.json ──▶ build_rulebook ──▶ genres/<genre>.json
 (local audio,       recognise genre      one file per song        merge per genre          read by the
  never in git)      + break song down    numbers only                                      music generator
```

## Genres

| Place (from the image) | Genre | Rule file |
|---|---|---|
| green (park) | classical | `genres/classical.json` |
| street | lo-fi hip-hop | `genres/lofi.json` |
| transit (station) | techno | `genres/techno.json` |
| market | rumba catalana | `genres/rumba.json` |
| waterfront (beach) | ambient chill | `genres/ambient.json` |
| square (night) | night jazz | `genres/jazz.json` |

## What a song breakdown contains

| Part | Measured | Used by the generator for |
|---|---|---|
| Tempo | bpm from the beat spacing | tempo range of the genre |
| Swing | where the off-beat lands (0.5 straight, 0.67 swung) | groove feel |
| Key | tonic and major/minor (Krumhansl profiles) | major vs minor chance |
| Harmony | one chord per bar as a scale degree (I–VII), change rate, how much 7th | chord moves as probabilities |
| Drums | for each of 16 steps in a bar: how often kick / snare / hat hits | drum patterns as probabilities |
| Sound | brightness, bass share, how percussive, notes per second, loudness range | mix and density |
| Build-up | energy curve (32 points) and sections tagged low / mid / high | shape of the 10 seconds |

**No audio, melody or lyrics are kept.** Only statistics such as "kick on step 0 in 92% of
bars" or "chord VI goes to IV 40% of the time". You cannot rebuild a song from them.
Audio files stay in `references/audio/`, which git ignores.

## Add reference songs

1. Put audio files in `references/audio/own/` (songs you own) or `references/audio/cc/`
   (Creative Commons tracks).
2. Add a row per file to `references/references.csv`:
   `file,genre,title,artist,source,licence,url`. Leave `genre` empty to let the model decide.
   For CC tracks, fill in the licence and URL.
3. Analyse and rebuild:

```bash
cd rulebook
.venv/bin/python -m analyser.analyse references/audio/
.venv/bin/python -m analyser.build_rulebook
```

Useful flags: `--genre jazz` (you say the genre), `--no-model` (breakdown only, no download).

## Genre recognition

We don't train a genre model. We use MIT's **Audio Spectrogram Transformer** trained on
Google AudioSet ([GitHub](https://github.com/YuanGongND/ast),
[Hugging Face](https://huggingface.co/MIT/ast-finetuned-audioset-10-10-0.4593), BSD-3-Clause).
It scores ~527 sound labels; `analyser/genre.py` maps the music labels onto our six genres
and also reports instruments (piano, guitar, saxophone…). AudioSet has no "lo-fi", so slow,
swung hip hop counts as lo-fi.

## Setup

```bash
cd rulebook
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python -r requirements.txt
```

The genre model (~350 MB) downloads on the first run without `--no-model` and is cached in
`~/.cache/huggingface/`. Analysing one song takes about 10–60 seconds on a laptop.

## Limits

- The drum grid splits the sound into three frequency bands (kick < 150 Hz, snare 300–4000 Hz,
  hat > 5 kHz). Busy mixes blur them: a guitar strum can look like a snare.
- Bar starts are guessed from "kick on 1, snare on 2 and 4" and chord changes. Music that is
  not in 4/4, or has no drums (classical, ambient), gets less reliable drum grids and chords.
- Relative keys (C major / A minor) share the same notes and are easy to mix up.
- Checked so far on one synthetic test track with known tempo, chords and drums: all correct.
  Not yet checked on real songs.
