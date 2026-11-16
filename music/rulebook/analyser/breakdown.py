"""Break a song down into numbers: tempo, groove, harmony, sound and build-up.

Nothing here keeps audio or melodies. The output is only statistics, such as
"kick on step 0 in 92% of bars" or "goes from chord i to chord VI 30% of the time".
That is what makes the rule book safe to share: you cannot rebuild a song from it.
"""
import numpy as np
import librosa

SR = 22050
HOP = 512
MAX_SECONDS = 420  # analyse at most 7 minutes

NOTE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
# Krumhansl-Schmuckler key profiles
MAJOR_PROFILE = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MINOR_PROFILE = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11]
MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10]
ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"]


def load(path):
    y, _ = librosa.load(path, sr=SR, mono=True, duration=MAX_SECONDS)
    if len(y) < SR * 10:
        raise ValueError(f"{path}: shorter than 10 seconds, too short to analyse")
    return y


# --------------------------------------------------------------------------- key
def find_key(chroma):
    profile = chroma.mean(axis=1)
    best = None
    for mode, ref in (("major", MAJOR_PROFILE), ("minor", MINOR_PROFILE)):
        for tonic in range(12):
            r = np.corrcoef(profile, np.roll(ref, tonic))[0, 1]
            if best is None or r > best[0]:
                best = (r, tonic, mode)
    r, tonic, mode = best
    return {"tonic": NOTE[tonic], "tonic_pc": tonic, "mode": mode, "confidence": round(float(r), 3)}


# ------------------------------------------------------------------------ chords
def _templates():
    out = []
    for root in range(12):
        for quality, iv in (("maj", (0, 4, 7)), ("min", (0, 3, 7))):
            t = np.zeros(12)
            t[[(root + i) % 12 for i in iv]] = 1
            out.append((root, quality, t / np.linalg.norm(t)))
    return out


TEMPLATES = _templates()


def chords_per_bar(bar_chroma, key):
    """Best-matching triad per bar, written as a scale degree of the key."""
    scale = MAJOR_SCALE if key["mode"] == "major" else MINOR_SCALE
    seq, sevenths = [], []
    for c in bar_chroma.T:
        if c.sum() < 1e-6:
            continue
        v = c / (np.linalg.norm(c) + 1e-9)
        root, quality, _ = max(TEMPLATES, key=lambda t: float(v @ t[2]))
        interval = (root - key["tonic_pc"]) % 12
        # snap to the nearest note of the scale (chromatic chords become their neighbour)
        degree = int(np.argmin([min(abs(interval - s), 12 - abs(interval - s)) for s in scale]))
        seq.append(degree)
        triad = [(root + i) % 12 for i in ((0, 4, 7) if quality == "maj" else (0, 3, 7))]
        seventh = max(c[(root + 10) % 12], c[(root + 11) % 12])
        sevenths.append(float(seventh / (c[triad].mean() + 1e-9)))
    if not seq:
        return {"sequence": [], "change_rate": 0.0, "transitions": np.zeros((7, 7)).tolist(), "seventh_ratio": 0.0}

    trans = np.zeros((7, 7))
    changes = 0
    for a, b in zip(seq, seq[1:]):
        if a != b:
            trans[a, b] += 1
            changes += 1
    return {
        "sequence": [ROMAN[d] for d in seq[:64]],  # degrees only, no notes or rhythm of the song
        "change_rate": round(changes / max(1, len(seq) - 1), 3),  # chord changes per bar
        "transitions": trans.tolist(),
        "degree_use": np.bincount(seq, minlength=7).tolist(),
        "seventh_ratio": round(float(np.median(sevenths)), 3),
    }


# ------------------------------------------------------------------------ groove
def band_envelope(S, freqs, lo, hi):
    # rise in loudness inside the band (linear, so a quiet hat can't look like a loud snare)
    sub = S[(freqs >= lo) & (freqs < hi)]
    env = np.concatenate([[0], np.maximum(0, np.diff(sub, axis=1)).sum(axis=0)])
    return env / (env.max() + 1e-9)


def step_grid(beats, n_frames):
    """Frame index of every 16th step: 4 steps between each pair of beats."""
    steps = []
    for a, b in zip(beats, beats[1:]):
        steps.extend(int(round(a + k * (b - a) / 4)) for k in range(4))
    return np.clip(np.array(steps, dtype=int), 0, n_frames - 1)


def hits(env, steps, rel=0.5):
    v = np.array([env[max(0, s - 2): s + 3].max() for s in steps])
    # a hit = at least `rel` times as strong as the loud hits of this band
    return v >= rel * np.percentile(v, 95)


def drum_grids(y_perc, beats, beat_chroma=None):
    """Probability (0–1) that each of the 16 steps in a bar has a kick / snare / hat."""
    S = np.abs(librosa.stft(y_perc, n_fft=2048, hop_length=HOP))
    freqs = librosa.fft_frequencies(sr=SR, n_fft=2048)
    steps = step_grid(beats, S.shape[1])
    # (low Hz, high Hz, threshold). Hats are quiet next to the snare's noise, so a lower threshold.
    bands = {"kick": (20, 150, 0.5), "snare": (300, 4000, 0.5), "hat": (5000, 11000, 0.2)}
    h = {name: hits(band_envelope(S, freqs, lo, hi), steps, rel) for name, (lo, hi, rel) in bands.items()}

    # Where does the bar start? Try the 4 beat offsets and keep the one with
    # the most "kick on 1, snare on 2 and 4" (true for most music in 4/4)
    # plus the most chord changes on beat 1.
    change = np.zeros(4)
    if beat_chroma is not None and beat_chroma.shape[1] > 8:
        diff = np.linalg.norm(np.diff(beat_chroma, axis=1), axis=0)  # diff[i] = change into beat i+1
        for p in range(4):
            change[p] = diff[(np.arange(len(diff)) + 1) % 4 == p].mean()
        change = change / (change.max() + 1e-9)
    best = None
    for phase in (0, 4, 8, 12):
        n_bars = (len(steps) - phase) // 16
        if n_bars < 2:
            continue
        g = {k: v[phase: phase + n_bars * 16].reshape(n_bars, 16).mean(axis=0) for k, v in h.items()}
        score = g["kick"][0] + 0.5 * g["kick"][8] + g["snare"][4] + g["snare"][12] - g["snare"][0] + 2 * change[phase // 4]
        if best is None or score > best[0]:
            best = (score, phase, g, n_bars)
    if best is None:
        return {"phase": 0, "bars": 0, "grids": {}}
    _, phase, g, n_bars = best
    return {"phase": phase, "bars": n_bars, "grids": {k: [round(float(x), 2) for x in v] for k, v in g.items()}}


def swing_ratio(onset_env, beats):
    """Where the off-beat 8th note lands between two beats: 0.5 = straight, 0.67 = triplet swing."""
    pos = []
    for a, b in zip(beats, beats[1:]):
        if b - a < 8:
            continue
        lo, hi = a + int(0.35 * (b - a)), a + int(0.8 * (b - a))
        window = onset_env[lo:hi]
        if window.size and window.max() > 0.3 * onset_env[a:b].max():
            pos.append((lo + int(np.argmax(window)) - a) / (b - a))
    return round(float(np.median(pos)), 3) if pos else 0.5


# ----------------------------------------------------------------------- build-up
def energy_shape(rms, points=32):
    """The song's loudness curve, squeezed to 32 points between 0 and 1."""
    db = librosa.amplitude_to_db(rms, ref=np.max)
    smooth = np.convolve(db, np.ones(43) / 43, mode="same")  # ~1 s smoothing
    shape = np.interp(np.linspace(0, len(smooth) - 1, points), np.arange(len(smooth)), smooth)
    shape = (shape - shape.min()) / (shape.max() - shape.min() + 1e-9)
    return [round(float(x), 2) for x in shape]


def sections(y_harm, rms, beats, duration):
    """Split the song into parts that sound alike and tag each one low / mid / high energy."""
    k = int(np.clip(round(duration / 25), 3, 10))
    mfcc = librosa.feature.mfcc(y=y_harm, sr=SR, hop_length=HOP, n_mfcc=13)
    feats = librosa.util.sync(mfcc, beats, aggregate=np.mean)
    if feats.shape[1] <= k:
        return []
    bounds = librosa.segment.agglomerative(feats, k)
    bound_frames = list(librosa.util.fix_frames(beats[np.minimum(bounds, len(beats) - 1)], x_max=len(rms)))
    db = librosa.amplitude_to_db(rms, ref=np.max)
    parts = []
    for a, b in zip(bound_frames, bound_frames[1:]):
        if b - a < 10:
            continue
        parts.append({
            "start": round(float(librosa.frames_to_time(a, sr=SR, hop_length=HOP)), 1),
            "end": round(float(librosa.frames_to_time(b, sr=SR, hop_length=HOP)), 1),
            "db": float(db[a:b].mean()),
        })
    if not parts:
        return []
    levels = np.array([p["db"] for p in parts])
    lo, hi = np.percentile(levels, 33), np.percentile(levels, 66)
    flat = levels.max() - levels.min() < 3  # less than 3 dB between parts = no build-up
    for p in parts:
        p["energy"] = "mid" if flat else "low" if p["db"] <= lo else "high" if p["db"] >= hi else "mid"
        p["db"] = round(p["db"], 1)
    return parts


# --------------------------------------------------------------------------- main
def breakdown(path):
    y = load(path)
    duration = len(y) / SR
    y_harm, y_perc = librosa.effects.hpss(y)

    onset_env = librosa.onset.onset_strength(y=y_perc, sr=SR, hop_length=HOP)
    tempo, beats = librosa.beat.beat_track(onset_envelope=onset_env, sr=SR, hop_length=HOP)
    if len(beats) > 8:  # measure tempo from the beat spacing (finer than the estimate)
        bt = librosa.frames_to_time(beats, sr=SR, hop_length=HOP)
        tempo = 60 * (len(bt) - 1) / (bt[-1] - bt[0])
    tempo = float(np.atleast_1d(tempo)[0])
    onset_norm = onset_env / (onset_env.max() + 1e-9)

    # start at C2 so the kick drum does not leak into the notes
    chroma = librosa.feature.chroma_cqt(y=y_harm, sr=SR, hop_length=HOP, fmin=librosa.note_to_hz("C2"), n_octaves=6)
    key = find_key(chroma)
    beat_chroma = librosa.util.sync(chroma, beats, aggregate=np.median)
    drums = drum_grids(y_perc, beats, beat_chroma)
    bar_beats = beats[drums["phase"] // 4::4]
    bar_chroma = librosa.util.sync(chroma, bar_beats, aggregate=np.median) if len(bar_beats) > 2 else chroma[:, :0]
    harmony = chords_per_bar(bar_chroma, key)

    rms = librosa.feature.rms(y=y, hop_length=HOP)[0]
    centroid = librosa.feature.spectral_centroid(y=y, sr=SR, hop_length=HOP)[0]
    S = np.abs(librosa.stft(y, n_fft=2048, hop_length=HOP)) ** 2
    freqs = librosa.fft_frequencies(sr=SR, n_fft=2048)
    onsets = librosa.onset.onset_detect(onset_envelope=onset_env, sr=SR, hop_length=HOP)
    db = librosa.amplitude_to_db(rms, ref=np.max)

    return {
        "duration_s": round(duration, 1),
        "tempo_bpm": round(tempo, 1),
        "swing_ratio": swing_ratio(onset_norm, beats),
        "key": key,
        "harmony": harmony,
        "drums": drums,
        "sound": {
            "brightness_hz": round(float(np.median(centroid)), 0),
            "bass_share": round(float(S[freqs < 150].sum() / (S.sum() + 1e-9)), 3),
            "percussive_share": round(float(np.sum(y_perc ** 2) / (np.sum(y ** 2) + 1e-9)), 3),
            "onsets_per_s": round(len(onsets) / duration, 2),
            "dynamic_range_db": round(float(np.percentile(db, 95) - np.percentile(db, 10)), 1),
        },
        "build_up": {
            "energy_shape": energy_shape(rms),
            "sections": sections(y_harm, rms, beats, duration),
        },
    }
