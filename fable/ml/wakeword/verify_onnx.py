"""Parity check: keras full model vs (keras mel layer -> ONNX classifier).

Run from ml/:  ./.venv/bin/python wakeword/verify_onnx.py
Asserts max |Δscore| < 1e-4 across all 360 training clips.
"""

import os
from pathlib import Path

os.environ["CUDA_VISIBLE_DEVICES"] = "-1"

import numpy as np
import librosa
import onnxruntime as ort
import tensorflow as tf
from tensorflow import keras

HERE = Path(__file__).resolve().parent
SRC = HERE / "src"
ONNX = HERE.parent.parent / "public" / "models" / "wakeword-clf.onnx"


def main():
    model = keras.models.load_model(SRC / "training_best_model.keras")
    seq = next(l for l in model.layers if isinstance(l, keras.Sequential))
    mel_layer = seq.layers[0]

    data = np.load(SRC / "training_data_eee4773.npy").T
    x16 = np.array([librosa.resample(x, orig_sr=48000, target_sr=16000) for x in data])

    # batch 1 everywhere: the mel layer's top_db clamp is batch-global, and the
    # browser always runs single clips (see export_wakeword.py)
    keras_scores = model.predict(x16, batch_size=1, verbose=0).ravel()
    mel = np.concatenate(
        [mel_layer(tf.constant(x16[i : i + 1], dtype=tf.float32)).numpy() for i in range(len(x16))]
    ).astype(np.float32)

    sess = ort.InferenceSession(str(ONNX), providers=["CPUExecutionProvider"])
    iname = sess.get_inputs()[0].name
    onnx_scores = np.concatenate(
        [sess.run(None, {iname: mel[i : i + 32]})[0].ravel() for i in range(0, len(mel), 32)]
    )

    dmax = float(np.max(np.abs(keras_scores - onnx_scores)))
    print(f"max |Δscore| over {len(mel)} clips: {dmax:.2e}")
    assert dmax < 1e-4, "ONNX does not match keras"
    print("PASS")


if __name__ == "__main__":
    main()
