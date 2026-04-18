from __future__ import annotations
"""PyTorch CNN for seismic magnitude estimation."""

import logging
import time
from pathlib import Path

import numpy as np

try:
    import torch
    import torch.nn as nn
    _TORCH_AVAILABLE = True
except ImportError:
    torch = None  # type: ignore[assignment]
    nn = None     # type: ignore[assignment]
    _TORCH_AVAILABLE = False

from backend.services.benchmark_logger import log_benchmark

logger = logging.getLogger(__name__)

if _TORCH_AVAILABLE:
    DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    logger.info("CNN device: %s", DEVICE)
else:
    DEVICE = None
    logger.warning("torch not installed — seismic CNN inference disabled")

_WEIGHTS_PATH = Path(__file__).parent / "seismic_cnn.pth"
_INPUT_CHANNELS = 3
_INPUT_LENGTH = 500
_POOL_SIZE = 50
_INFERENCE_TIMEOUT_MS = 500.0
_FALLBACK_MAGNITUDE = 4.0

_model: "SeismicCNN | None" = None


class SeismicCNN(nn.Module):
    """3-component seismic waveform -> scalar magnitude estimate."""

    def __init__(self) -> None:
        super().__init__()
        self.features = nn.Sequential(
            nn.Conv1d(_INPUT_CHANNELS, 32, kernel_size=11, padding=5),
            nn.BatchNorm1d(32),
            nn.ReLU(),
            nn.Conv1d(32, 64, kernel_size=7, padding=3),
            nn.BatchNorm1d(64),
            nn.ReLU(),
            nn.AdaptiveAvgPool1d(_POOL_SIZE),
            nn.Flatten(),
        )
        self.classifier = nn.Sequential(
            nn.Linear(64 * _POOL_SIZE, 128),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(128, 1),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.classifier(self.features(x))


def load_model() -> SeismicCNN:
    """Load or initialise the CNN and cache it as a module-level singleton."""
    global _model  # noqa: PLW0603
    if _model is not None:
        return _model

    model = SeismicCNN()

    if _WEIGHTS_PATH.exists():
        state = torch.load(_WEIGHTS_PATH, map_location="cpu", weights_only=True)
        model.load_state_dict(state)
        logger.info("Loaded weights from %s", _WEIGHTS_PATH)
    else:
        logger.warning(
            "WARNING: using random weights — inference magnitude will be "
            "imprecise but pipeline will function"
        )

    model = model.to(DEVICE)
    model.eval()
    _model = model
    return model


def _normalise_waveform(waveform: np.ndarray) -> np.ndarray:
    """Pad/truncate waveform to (3, 500)."""
    if waveform.ndim == 1:
        waveform = np.stack([waveform, waveform, waveform])

    channels, length = waveform.shape[0], waveform.shape[1]

    if channels < _INPUT_CHANNELS:
        waveform = np.vstack([waveform, np.zeros((_INPUT_CHANNELS - channels, length))])
    elif channels > _INPUT_CHANNELS:
        waveform = waveform[:_INPUT_CHANNELS]

    if length < _INPUT_LENGTH:
        waveform = np.pad(waveform, ((0, 0), (0, _INPUT_LENGTH - length)))
    elif length > _INPUT_LENGTH:
        waveform = waveform[:, :_INPUT_LENGTH]

    return waveform


def run_inference(waveform: np.ndarray) -> float:
    """Run CNN inference on 3-component seismic waveform.

    Args:
        waveform: numpy array shape (3, 500) or broadcast to this shape.

    Returns:
        Magnitude estimate (float). Falls back to 4.0 if inference > 500ms.
    """
    model = load_model()
    waveform = _normalise_waveform(waveform)

    tensor = torch.from_numpy(waveform).float().unsqueeze(0).to(DEVICE)

    t0 = time.time()
    used_device = str(DEVICE)
    try:
        with torch.no_grad():
            output = model(tensor)
    except RuntimeError as exc:
        logger.warning("GPU inference failed (%s), retrying on CPU", exc)
        used_device = "cpu"
        cpu_tensor = tensor.to("cpu")
        cpu_model = model.to("cpu")
        with torch.no_grad():
            output = cpu_model(cpu_tensor)

    elapsed_ms = (time.time() - t0) * 1000
    magnitude = output.item()

    logger.info("[AEGIS] CNN inference: %.1fms", elapsed_ms)
    print(f"[AEGIS] CNN inference: {elapsed_ms:.1f}ms")  # noqa: T201

    if elapsed_ms > _INFERENCE_TIMEOUT_MS:
        logger.warning(
            "Inference took %.1fms (>%dms), falling back to magnitude %.1f",
            elapsed_ms, _INFERENCE_TIMEOUT_MS, _FALLBACK_MAGNITUDE,
        )
        magnitude = _FALLBACK_MAGNITUDE

    log_benchmark({
        "pipeline": "seismic_cnn",
        "elapsed_ms": round(elapsed_ms, 2),
        "magnitude": round(magnitude, 3),
        "device": used_device,
    })

    return magnitude
