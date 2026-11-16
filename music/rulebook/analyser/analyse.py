"""Analyse reference songs: recognise the genre and break the song down.

    python -m analyser.analyse references/audio/own/some_song.mp3
    python -m analyser.analyse references/audio/          # every audio file in a folder
    python -m analyser.analyse song.mp3 --genre jazz      # you say the genre, skip the model
    python -m analyser.analyse song.mp3 --no-model        # breakdown only, no download

Run from the rulebook/ folder. Writes one JSON per song to breakdowns/.
Song details (title, artist, licence) come from references/references.csv if listed there.
"""
import argparse
import csv
import json
import re
from pathlib import Path

from .breakdown import breakdown

ROOT = Path(__file__).resolve().parent.parent
AUDIO = {".mp3", ".wav", ".flac", ".ogg", ".m4a", ".aiff"}
GENRES = ["classical", "lofi", "techno", "rumba", "ambient", "jazz"]


def slug(text):
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")


def references():
    path = ROOT / "references" / "references.csv"
    if not path.exists():
        return {}
    with open(path, newline="") as f:
        return {row["file"]: row for row in csv.DictReader(f) if row.get("file")}


def summary(name, result):
    b = result["breakdown"]
    d = b["drums"]["grids"]
    grid = lambda k: "".join("x" if p >= 0.5 else "·" for p in d.get(k, [])) or "-"
    g = result.get("recognition", {})
    lines = [
        f"\n== {name}",
        f"genre      {result['genre']}  ({result['genre_from']})"
        + (f"   scores {g.get('genre_scores')}" if g else ""),
        f"instrum.   {', '.join(g.get('instruments', {})) or '-'}",
        f"tempo      {b['tempo_bpm']} bpm, swing {b['swing_ratio']} (0.5 straight · 0.67 swung)",
        f"key        {b['key']['tonic']} {b['key']['mode']} (confidence {b['key']['confidence']})",
        f"chords     {' '.join(b['harmony']['sequence'][:16])}   changes/bar {b['harmony']['change_rate']}"
        f"   7ths {b['harmony']['seventh_ratio']}",
        f"kick       {grid('kick')}",
        f"snare      {grid('snare')}",
        f"hat        {grid('hat')}",
        f"sound      brightness {b['sound']['brightness_hz']} Hz · percussive {b['sound']['percussive_share']}"
        f" · {b['sound']['onsets_per_s']} onsets/s",
        f"build-up   {' → '.join(s['energy'] for s in b['build_up']['sections'])}",
    ]
    print("\n".join(lines))


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("paths", nargs="+", type=Path)
    p.add_argument("--genre", choices=GENRES, help="say the genre yourself instead of asking the model")
    p.add_argument("--no-model", action="store_true", help="skip genre recognition (no model download)")
    args = p.parse_args()

    files = []
    for path in args.paths:
        files += sorted(f for f in path.rglob("*") if f.suffix.lower() in AUDIO) if path.is_dir() else [path]
    refs = references()
    out_dir = ROOT / "breakdowns"
    out_dir.mkdir(exist_ok=True)

    for f in files:
        ref = refs.get(f.name, {})
        result = {
            "file": f.name,  # file name only, never the audio
            "title": ref.get("title") or f.stem,
            "artist": ref.get("artist", ""),
            "source": ref.get("source", "own"),
            "licence": ref.get("licence", ""),
            "url": ref.get("url", ""),
            "breakdown": breakdown(str(f)),
        }
        hint = args.genre or ref.get("genre")
        if not args.no_model:
            from .genre import recognise
            result["recognition"] = recognise(str(f), result["breakdown"])
        if hint:
            result["genre"], result["genre_from"] = hint, "you"
        elif "recognition" in result:
            result["genre"], result["genre_from"] = result["recognition"]["genre"], "model"
        else:
            result["genre"], result["genre_from"] = "unknown", "nobody"

        (out_dir / f"{slug(result['title'])}.json").write_text(json.dumps(result, indent=1))
        summary(result["title"], result)
    print(f"\n{len(files)} song(s) → {out_dir}/")


if __name__ == "__main__":
    main()
