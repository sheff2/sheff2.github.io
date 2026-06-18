"""Export real wake-word model artifacts for the portfolio site.

Reads the trained EEE4773 model + training data and produces:
  public/data/wakeword-clips.json          real demo clips (mel, waveform, score)
  public/data/wakeword-downsampling.json   Fig. 01b data (48 kHz vs 16 kHz)
  public/audio/wakeword/<id>.wav           playable 16 kHz demo audio
  ml/wakeword/golden/clip-*.json           golden vectors for validating the JS mel front-end
  ml/wakeword/exports/clf_savedmodel/      classifier sub-model (mel-dB input) for tf2onnx
  ml/wakeword/exports/audition/*.wav       ranked shortlist for manual clip curation

Run from ml/:  ./.venv/bin/python wakeword/export_wakeword.py [--ids wake-clear=NN ...]
Then convert:  ./.venv/bin/python -m tf2onnx.convert --saved-model wakeword/exports/clf_savedmodel \
                 --output ../public/models/wakeword-clf.onnx --opset 17
"""

import argparse
import json
import os
from pathlib import Path

os.environ["CUDA_VISIBLE_DEVICES"] = "-1"

import numpy as np
import librosa
import soundfile as sf
import tensorflow as tf
from tensorflow import keras

HERE = Path(__file__).resolve().parent
SRC = HERE / "src"
PUBLIC = HERE.parent.parent / "public"
EXPORTS = HERE / "exports"
GOLDEN = HERE / "golden"

SR_ORIG = 48000
SR = 16000
N_SAMPLES = 48000  # 3 s @ 16 kHz
THRESHOLD = 0.5


def load_model_parts():
    model = keras.models.load_model(SRC / "training_best_model.keras")
    seq = next(l for l in model.layers if isinstance(l, keras.Sequential))
    mel_layer = seq.layers[0]  # MelSpectrogram
    post_mel = seq.layers[1:]  # Reshape + conv/pool stack
    head = model.layers[model.layers.index(seq) + 1 :]  # Flatten ... Dense(1)

    inp = keras.Input(shape=(80, 301), name="mel_db")
    x = inp
    for l in list(post_mel) + list(head):
        x = l(x)
    clf = keras.Model(inp, x, name="wakeword_clf")
    return model, mel_layer, clf


def envelope(x, n):
    """Signed per-bucket peak, normalized to -1..1."""
    idx = np.linspace(0, len(x), n + 1).astype(int)
    peak = float(np.max(np.abs(x))) or 1.0
    out = np.zeros(n, dtype=np.float64)
    for i in range(n):
        seg = x[idx[i] : idx[i + 1]]
        if seg.size:
            out[i] = seg[np.argmax(np.abs(seg))] / peak
    return [round(float(v), 3) for v in out]


def log_spectrum(x, sr, n_points=256):
    """Mean log-magnitude spectrum (dB, top-80 clamped), 0..nyquist."""
    f, t, S = None, None, None
    frames = librosa.util.frame(x, frame_length=1024, hop_length=512)
    win = np.hanning(1024)
    mag = np.abs(np.fft.rfft(frames * win[:, None], axis=0))
    mean_mag = mag.mean(axis=1)
    db = 20 * np.log10(np.maximum(mean_mag, 1e-10))
    db = np.maximum(db, db.max() - 80)
    # resample to n_points
    pos = np.linspace(0, len(db) - 1, n_points)
    db_r = np.interp(pos, np.arange(len(db)), db)
    lo, hi = float(db_r.min()), float(db_r.max())
    norm = (db_r - lo) / (hi - lo) if hi > lo else db_r * 0
    return [round(float(v), 3) for v in norm], [round(lo, 1), round(hi, 1)]


def mel_display(mel_db, subsample=2):
    """(80, 301) raw dB -> frames x 80 list, 0..1, frame-subsampled."""
    m = np.asarray(mel_db, dtype=np.float64).T[::subsample]  # frames x 80
    lo, hi = float(m.min()), float(m.max())
    norm = (m - lo) / (hi - lo) if hi > lo else m * 0
    return [[round(float(v), 3) for v in row] for row in norm], [round(lo, 1), round(hi, 1)]


def write_wav(path, x, sr):
    peak = float(np.max(np.abs(x)))
    y = x / peak * 0.95 if peak > 1.0 else x
    sf.write(path, y.astype(np.float32), sr, subtype="PCM_16")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ids", nargs="*", default=[], help="override clip picks, e.g. wake-clear=42")
    args = ap.parse_args()

    print("loading model + data …")
    model, mel_layer, clf = load_model_parts()
    data = np.load(SRC / "training_data_eee4773.npy").T  # (360, 144000) @ 48 kHz
    labels = np.load(SRC / "training_labels_eee4773.npy").astype(int)

    print("resampling 48 kHz -> 16 kHz (librosa, same as training) …")
    x16 = np.array([librosa.resample(x, orig_sr=SR_ORIG, target_sr=SR) for x in data])
    assert x16.shape[1] == N_SAMPLES, x16.shape

    # NOTE: keras MelSpectrogram's top_db clamp uses the BATCH-global max, so
    # scores depend slightly on batch composition. The browser always runs
    # batch-1, so everything here is scored per clip (batch_size=1) to match.
    print("scoring all clips with the full keras model (batch 1, deployment-realistic) …")
    scores = model.predict(x16, batch_size=1, verbose=0).ravel()
    pred = (scores > THRESHOLD).astype(int)
    acc = float((pred == labels).mean())
    tp = int(((pred == 1) & (labels == 1)).sum())
    tn = int(((pred == 0) & (labels == 0)).sum())
    fp = int(((pred == 1) & (labels == 0)).sum())
    fn = int(((pred == 0) & (labels == 1)).sum())
    f1 = 2 * tp / (2 * tp + fp + fn)
    print(f"  full-set accuracy {acc:.4f} · F1 {f1:.4f} · tp {tp} tn {tn} fp {fp} fn {fn}")

    # split-model parity check (mel layer -> classifier sub-model), per clip
    mel_all = np.concatenate(
        [mel_layer(tf.constant(x16[i : i + 1], dtype=tf.float32)).numpy() for i in range(len(x16))]
    )  # (360, 80, 301)
    scores_split = clf.predict(mel_all, batch_size=32, verbose=0).ravel()
    dmax = float(np.max(np.abs(scores - scores_split)))
    print(f"  split-model parity: max |Δscore| = {dmax:.2e}")
    assert dmax < 1e-4

    # ---- demo clip selection -------------------------------------------------
    pos = np.where(labels == 1)[0]
    neg = np.where(labels == 0)[0]
    pos_above = pos[scores[pos] > THRESHOLD]
    neg_below = neg[scores[neg] <= THRESHOLD]
    neg_above = neg[scores[neg] > THRESHOLD]  # real false positives
    picks = {
        "wake-clear": int(pos[np.argmax(scores[pos])]),
        "wake-hard": int(pos_above[np.argmin(scores[pos_above] - THRESHOLD)]),
        "neg-near": int(neg_below[np.argmax(scores[neg_below])]),
        "neg-easy": int(neg[np.argmin(scores[neg])]),
    }
    if neg_above.size:
        picks["false-alarm"] = int(neg_above[np.argmax(scores[neg_above])])
    for ov in args.ids:
        k, v = ov.split("=")
        picks[k] = int(v)

    print("\nranked shortlist (idx · label · score):")
    order = np.argsort(-scores)
    for name, sel in [("top positives", pos[np.argsort(-scores[pos])][:6]),
                      ("borderline positives", pos_above[np.argsort(scores[pos_above])][:6]),
                      ("hardest negatives", neg[np.argsort(-scores[neg])][:6]),
                      ("easiest negatives", neg[np.argsort(scores[neg])][:6])]:
        print(f"  {name}: " + ", ".join(f"#{i}({scores[i]:.3f})" for i in sel))
    print(f"picks: {picks}\n")

    EXPORTS.mkdir(exist_ok=True)
    (EXPORTS / "audition").mkdir(exist_ok=True)
    for name, sel in [("pos", pos[np.argsort(-scores[pos])][:8]), ("neg", neg[np.argsort(-scores[neg])][:8])]:
        for i in sel:
            write_wav(EXPORTS / "audition" / f"{name}-{i}-score{scores[i]:.2f}.wav", x16[i], SR)

    # ---- demo clips JSON + WAVs ---------------------------------------------
    audio_dir = PUBLIC / "audio" / "wakeword"
    audio_dir.mkdir(parents=True, exist_ok=True)
    clip_meta = {
        "wake-clear": ("“Go Gators” — clear", "wake"),
        "wake-hard": ("“Go Gators” — near threshold", "wake"),
        "neg-near": ("Other audio — near miss", "speech"),
        "neg-easy": ("Background noise", "noise"),
        "false-alarm": ("Other audio — real false positive", "speech"),
    }
    clips = []
    for cid, idx in picks.items():
        label, category = clip_meta[cid]
        mel_disp, db_range = mel_display(mel_all[idx])
        write_wav(audio_dir / f"{cid}.wav", x16[idx], SR)
        clips.append({
            "id": cid,
            "label": label,
            "category": category,
            "sourceIndex": idx,
            "trueLabel": int(labels[idx]),
            "score": round(float(scores[idx]), 4),
            "detected": bool(scores[idx] > THRESHOLD),
            "durationSec": 3.0,
            "audioUrl": f"/audio/wakeword/{cid}.wav",
            "melSpectrogram": mel_disp,
            "melDbRange": db_range,
            "waveform": envelope(x16[idx], 480),
        })

    clips_json = {
        "$schema": "schemas/wakeword-clips.schema.json",
        "model": "transfer-learned CNN classifier · 1,649,217 params (EEE4773 final project)",
        "wakeWord": "Go Gators",
        "threshold": THRESHOLD,
        "thresholdRule": "sigmoid score above 0.5 → wake word",
        "sampleRate": SR,
        "nMels": 80,
        "hopMs": 10,
        "fftLength": 512,
        "metrics": {
            "trainAccuracy": round(acc, 4),
            "trainF1": round(f1, 4),
            "heldOutTestF1": 0.899,
            "confusion": {"tn": tn, "fp": fp, "fn": fn, "tp": tp},
        },
        "clips": clips,
    }
    out = PUBLIC / "data" / "wakeword-clips.json"
    out.write_text(json.dumps(clips_json, separators=(",", ":")))
    print(f"wrote {out} ({out.stat().st_size/1024:.0f} KB)")

    # ---- downsampling sub-figure data ---------------------------------------
    di = picks["wake-clear"]
    spec48, spec48_db = log_spectrum(data[di], SR_ORIG)
    spec16, spec16_db = log_spectrum(x16[di], SR)
    ds_json = {
        "$schema": "schemas/wakeword-downsampling.schema.json",
        "clipId": "wake-clear",
        "note": "Same recording of “Go Gators”: as captured at 48 kHz, and downsampled to 16 kHz to match the Google Speech Commands pretraining domain.",
        "original": {"sampleRate": SR_ORIG, "nyquistHz": SR_ORIG // 2,
                     "waveform": envelope(data[di], 600), "spectrum": spec48, "spectrumDbRange": spec48_db},
        "downsampled": {"sampleRate": SR, "nyquistHz": SR // 2,
                        "waveform": envelope(x16[di], 600), "spectrum": spec16, "spectrumDbRange": spec16_db},
        "experiments": [
            {"approach": "Upsample Speech Commands to 48 kHz", "valF1": 0.60, "approx": True,
             "outcome": "overfit — rejected"},
            {"approach": "Downsample wake-word data to 16 kHz", "valF1": 0.769, "testF1": 0.899,
             "outcome": "kept — generalized"},
            {"approach": "Final model (full training data)", "accuracy": round(acc, 4), "f1": round(f1, 4),
             "outcome": "submitted model"},
        ],
    }
    out = PUBLIC / "data" / "wakeword-downsampling.json"
    out.write_text(json.dumps(ds_json, separators=(",", ":")))
    print(f"wrote {out} ({out.stat().st_size/1024:.0f} KB)")

    # ---- golden vectors for JS mel validation --------------------------------
    GOLDEN.mkdir(exist_ok=True)
    for cid in ["wake-clear", "neg-easy", "wake-hard"]:
        idx = picks[cid]
        g = {
            "id": cid,
            "sampleRate": SR,
            "pcm": [round(float(v), 5) for v in x16[idx]],
            "melDb": [[round(float(v), 4) for v in row] for row in mel_all[idx]],  # 80 x 301
            "score": float(scores[idx]),
        }
        p = GOLDEN / f"clip-{cid}.json"
        p.write_text(json.dumps(g, separators=(",", ":")))
        print(f"wrote {p} ({p.stat().st_size/1024:.0f} KB)")

    # ---- classifier SavedModel for tf2onnx -----------------------------------
    sm = EXPORTS / "clf_savedmodel"
    clf.export(str(sm))
    print(f"exported SavedModel -> {sm}")
    print("\nnext: python -m tf2onnx.convert --saved-model wakeword/exports/clf_savedmodel "
          "--output ../public/models/wakeword-clf.onnx --opset 17")


if __name__ == "__main__":
    main()
