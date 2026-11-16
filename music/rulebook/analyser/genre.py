"""Recognise the genre (and instruments) of a song with an existing open model.

Model: MIT's Audio Spectrogram Transformer fine-tuned on Google AudioSet
(github.com/YuanGongND/ast, huggingface.co/MIT/ast-finetuned-audioset-10-10-0.4593,
BSD-3-Clause). It knows ~527 sound labels, including music genres and instruments.
We don't train it; we map its labels onto the six Chroma genres.

The model weights (~350 MB) download from Hugging Face the first time this runs.
"""
import numpy as np
import librosa

MODEL_ID = "MIT/ast-finetuned-audioset-10-10-0.4593"
SR = 16000      # the model expects 16 kHz audio
WINDOW_S = 10   # and ~10 s per look
N_WINDOWS = 6   # looks spread over the song, averaged

# AudioSet label → Chroma genre. A genre's score is its best matching label.
GENRE_LABELS = {
    "classical": ["Classical music", "Opera", "Orchestra"],
    "jazz":      ["Jazz", "Swing music", "Blues"],
    "techno":    ["Techno", "House music", "Electronic dance music", "Trance music", "Drum and bass",
                  "Dubstep", "Electronic music", "Electronica"],
    "lofi":      ["Hip hop music", "Rhythm and blues", "Soul music", "Funk"],
    "rumba":     ["Flamenco", "Music of Latin America", "Salsa music"],
    "ambient":   ["Ambient music", "New-age music"],
}
INSTRUMENTS = [
    "Piano", "Electric piano", "Keyboard (musical)", "Organ", "Synthesizer", "Guitar", "Acoustic guitar",
    "Electric guitar", "Bass guitar", "Double bass", "Violin, fiddle", "Cello", "String section",
    "Bowed string instrument", "Plucked string instrument", "Saxophone", "Trumpet", "Flute", "Clarinet", "Harp", "Drum kit",
    "Drum machine", "Snare drum", "Cymbal", "Hi-hat", "Percussion", "Clapping",
    "Vibraphone", "Marimba, xylophone", "Bell", "Choir", "Singing", "Vocal music",
]

_model = None


def _load():
    global _model
    if _model is None:
        import torch  # noqa: F401  (imported here so the breakdown works without it)
        from transformers import ASTFeatureExtractor, ASTForAudioClassification
        _model = (ASTFeatureExtractor.from_pretrained(MODEL_ID),
                  ASTForAudioClassification.from_pretrained(MODEL_ID).eval())
    return _model


def label_scores(path):
    """Average AudioSet scores (0–1 each, several can be high) over N_WINDOWS slices of the song."""
    import torch
    extractor, model = _load()
    y, _ = librosa.load(path, sr=SR, mono=True, duration=420)
    win = SR * WINDOW_S
    if len(y) <= win:
        starts = [0]
    else:
        starts = np.linspace(0, len(y) - win, N_WINDOWS).astype(int)
    chunks = [y[s:s + win] for s in starts]
    inputs = extractor(chunks, sampling_rate=SR, return_tensors="pt")
    with torch.no_grad():
        probs = torch.sigmoid(model(**inputs).logits).mean(dim=0).numpy()
    return {model.config.id2label[i]: float(p) for i, p in enumerate(probs)}


def recognise(path, breakdown=None):
    scores = label_scores(path)
    genres = {g: max((scores.get(l, 0.0) for l in labels), default=0.0) for g, labels in GENRE_LABELS.items()}
    # AudioSet has no "lo-fi": hip hop that is slow and swung counts as lo-fi.
    if breakdown and genres["lofi"] > 0 and (breakdown["tempo_bpm"] > 105 and breakdown["swing_ratio"] < 0.55):
        genres["lofi"] *= 0.7
    best = max(genres, key=genres.get)
    top_labels = sorted(scores.items(), key=lambda kv: -kv[1])[:8]
    instruments = sorted(((i, scores[i]) for i in INSTRUMENTS if i in scores), key=lambda kv: -kv[1])
    return {
        "genre": best if genres[best] >= 0.1 else "unknown",
        "genre_scores": {g: round(s, 3) for g, s in sorted(genres.items(), key=lambda kv: -kv[1])},
        "instruments": {i: round(s, 3) for i, s in instruments[:6] if s >= 0.05},
        "top_labels": {l: round(s, 3) for l, s in top_labels},
        "model": MODEL_ID,
    }
