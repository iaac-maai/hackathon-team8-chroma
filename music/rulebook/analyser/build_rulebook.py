"""Merge all song breakdowns into one rule file per genre.

    python -m analyser.build_rulebook

Reads breakdowns/*.json, groups them by genre and writes genres/<genre>.json.
A rule file is what the music generator reads: typical tempo range, swing, how
often each drum step is hit, which chord moves are common, how bright it sounds
and how the energy builds up. Ranges, not copies: each new picture picks its own
values inside them.
"""
import json
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"]


def spread(values):
    v = np.array(values, dtype=float)
    return {"min": round(float(np.percentile(v, 10)), 2), "typical": round(float(np.median(v)), 2),
            "max": round(float(np.percentile(v, 90)), 2)}


def rule(genre, songs):
    bs = [s["breakdown"] for s in songs]

    # chord moves: add up all songs, then turn each row into probabilities
    trans = sum(np.array(b["harmony"]["transitions"]) for b in bs) + 0.05  # small floor: nothing impossible
    np.fill_diagonal(trans, 0)
    trans = trans / trans.sum(axis=1, keepdims=True)
    use = sum(np.array(b["harmony"].get("degree_use", [0] * 7), dtype=float) for b in bs) + 0.01

    grids = defaultdict(list)
    for b in bs:
        for name, g in b["drums"]["grids"].items():
            grids[name].append(g)

    instruments = defaultdict(list)
    for s in songs:
        for name, score in s.get("recognition", {}).get("instruments", {}).items():
            instruments[name].append(score)

    section_runs = Counter(" → ".join(p["energy"] for p in b["build_up"]["sections"][:5]) for b in bs)

    return {
        "genre": genre,
        "n_references": len(songs),
        "references": [{k: s.get(k, "") for k in ("title", "artist", "source", "licence")} for s in songs],
        "tempo_bpm": spread([b["tempo_bpm"] for b in bs]),
        "swing_ratio": spread([b["swing_ratio"] for b in bs]),
        "mode": {m: round(sum(b["key"]["mode"] == m for b in bs) / len(bs), 2) for m in ("major", "minor")},
        "harmony": {
            "change_rate": spread([b["harmony"]["change_rate"] for b in bs]),
            "seventh_ratio": spread([b["harmony"]["seventh_ratio"] for b in bs]),
            "degree_use": {ROMAN[i]: round(float(x), 3) for i, x in enumerate(use / use.sum())},
            "transitions": {ROMAN[i]: {ROMAN[j]: round(float(trans[i, j]), 3) for j in range(7)} for i in range(7)},
        },
        "drums": {
            "presence": spread([b["sound"]["percussive_share"] for b in bs]),
            "grids": {name: [round(float(x), 2) for x in np.mean(g, axis=0)] for name, g in grids.items()},
        },
        "sound": {k: spread([b["sound"][k] for b in bs])
                  for k in ("brightness_hz", "bass_share", "onsets_per_s", "dynamic_range_db")},
        "build_up": {
            "energy_shape": [round(float(x), 2) for x in np.mean([b["build_up"]["energy_shape"] for b in bs], axis=0)],
            "common_section_runs": dict(section_runs.most_common(3)),
        },
        "instruments": {k: round(float(np.mean(v)), 3)
                        for k, v in sorted(instruments.items(), key=lambda kv: -np.mean(kv[1]))[:6]},
    }


def main():
    groups = defaultdict(list)
    for f in sorted((ROOT / "breakdowns").glob("*.json")):
        song = json.loads(f.read_text())
        if song.get("genre", "unknown") != "unknown":
            groups[song["genre"]].append(song)

    out = ROOT / "genres"
    out.mkdir(exist_ok=True)
    index = {}
    for genre, songs in sorted(groups.items()):
        r = rule(genre, songs)
        (out / f"{genre}.json").write_text(json.dumps(r, indent=1))
        index[genre] = r["n_references"]
        t = r["tempo_bpm"]
        print(f"{genre:10s} {len(songs):3d} songs   tempo {t['min']}–{t['max']} bpm   "
              f"minor {r['mode']['minor']:.0%}   swing {r['swing_ratio']['typical']}")
    (out / "index.json").write_text(json.dumps(index, indent=1))
    print(f"→ {out}/")


if __name__ == "__main__":
    main()
