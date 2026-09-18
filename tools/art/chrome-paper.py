"""Old-paper skin of the application chrome (panels, windows, bars).

Builds `packages/client/public/art/chrome/paper-day.webp` and `paper-night.webp`
from the same free sources the character sheet uses, downloaded on first run
into the cache directory next to this script (ignored by git):

  * ageing — "Old paper6.jpg", Wikimedia Commons, public domain (PD-author,
    The Digital Yard Sale): https://commons.wikimedia.org/wiki/File:Old_paper6.jpg
    Broad yellowed / bleached patches and pale scratches.
  * fibre  — ambientCG "Paper 004" displacement map, CC0 1.0:
    https://ambientcg.com/view?id=Paper004
    The fine laid-paper grain that makes a flat colour read as a sheet.
  * creases — ambientCG "Paper 005" displacement map, CC0 1.0:
    https://ambientcg.com/view?id=Paper005
    Ridges of a sheet that was folded and smoothed out again.

Each output is a *grey* tile centred on mid grey (128 = "leave the colour
alone"). The CSS lays it over the surface colour with
`background-blend-mode: soft-light` (`theme.css`, `--paper-*`), so one file
serves every surface token — panel, window, inset — and the colour still comes
from the theme. Values above 128 lighten, below darken. Everything the scan
contributes only LIGHTENS — worn patches, pale scratches, crease ridges —
because the owner ruled out stains and specks twice ("no dirt", 16.09 and
18.09; "cracks, creases, wear are fine"). The only thing that dips below 128
is the fibre grain, a symmetric noise finer than a letter stroke.

Run (needs `uv`):
    uv run --with pillow --with numpy python tools/art/chrome-paper.py
"""

from __future__ import annotations

import io
import urllib.request
import zipfile
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "packages" / "client" / "public" / "art" / "chrome"
CACHE = Path(__file__).resolve().parent / ".cache"
USER_AGENT = "VTT-sheet-paper/1.0 (private tabletop project)"


# The three helpers below are the same as in `sheet-paper.py` (its name has
# a hyphen, so it cannot be imported); keep them in step.
def fetch(url: str) -> bytes:
    CACHE.mkdir(exist_ok=True)
    target = CACHE / url.rsplit("/", 1)[-1].replace("get?file=", "")
    if not target.exists():
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(request) as response:
            target.write_bytes(response.read())
    return target.read_bytes()


def blur(a: np.ndarray, sigma: float) -> np.ndarray:
    """Gaussian blur in the frequency domain — wraps around, keeps tiles tileable."""
    h, w = a.shape
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.fftfreq(w)[None, :]
    kernel = np.exp(-2 * np.pi**2 * sigma**2 * (fx**2 + fy**2))
    return np.real(np.fft.ifft2(np.fft.fft2(a) * kernel))


def periodic(u: np.ndarray) -> np.ndarray:
    """Moisan's periodic component: tiles without a seam, only a smooth field is removed."""
    h, w = u.shape
    v = np.zeros_like(u)
    v[0, :] += u[-1, :] - u[0, :]
    v[-1, :] += u[0, :] - u[-1, :]
    v[:, 0] += u[:, -1] - u[:, 0]
    v[:, -1] += u[:, 0] - u[:, -1]
    q = np.arange(h)[:, None]
    r = np.arange(w)[None, :]
    den = 2 * np.cos(2 * np.pi * q / h) + 2 * np.cos(2 * np.pi * r / w) - 4
    den[0, 0] = 1
    s = np.fft.fft2(v) / den
    s[0, 0] = 0
    return u - np.real(np.fft.ifft2(s))


PAPER_URL = "https://upload.wikimedia.org/wikipedia/commons/e/e8/Old_paper6.jpg"
FIBRE_URL = "https://ambientcg.com/get?file=Paper004_1K-JPG.zip"
FIBRE_MEMBER = "Paper004_1K-JPG_Displacement.jpg"
CREASE_URL = "https://ambientcg.com/get?file=Paper005_1K-JPG.zip"
CREASE_MEMBER = "Paper005_1K-JPG_Displacement.jpg"

# Same crop as the sheet: the middle of the scan, clear of vignette and torn edge.
PAPER_CROP = 1760
# Output tile edge. Smaller than the crop to keep the file light; the
# periodic component keeps it seamless after resampling.
TILE = 1400
FLATTEN_SIGMA = 400
SPECK_SIGMA = 45
# Worn (bleached) patches live above this scale; pale scratches below SCRATCH_SIGMA.
WEAR_SIGMA = 40
SCRATCH_SIGMA = 45
SCRATCH_FLOOR = 0.06
# Creases: ridges of the crumpled sheet wider than a fibre, narrower than a patch.
CREASE_SIGMA = 6
CREASE_FLOOR = 0.35

# Amplitudes in 8-bit steps above 128 (fibre: around it). Night cardboard is
# near black, so only lightening is visible at all and the tile may push a bit
# harder to read as worn.
DAY = dict(wear=30.0, scratch=60.0, crease=34.0, fibre=16.0)
NIGHT = dict(wear=34.0, scratch=50.0, crease=30.0, fibre=14.0)


def ageing() -> tuple[np.ndarray, np.ndarray]:
    """(worn patches, scratches) from the scan — both >= 0, i.e. lighten only."""
    image = Image.open(io.BytesIO(fetch(PAPER_URL))).convert("RGB")
    w, h = image.size
    left, top = (w - PAPER_CROP) // 2, (h - PAPER_CROP) // 2
    rgb = (
        np.asarray(image.crop((left, top, left + PAPER_CROP, top + PAPER_CROP)), dtype=np.float64)
        / 255
    )
    lum = np.log(
        np.clip(0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2], 1e-3, 1)
    )
    flat = periodic(lum - blur(lum, FLATTEN_SIGMA))
    # Specks: anything darker than its neighbourhood is lifted to it.
    neighbourhood = blur(flat, SPECK_SIGMA)
    lifted = np.maximum(flat, neighbourhood)
    slow = blur(lifted, WEAR_SIGMA)
    wear = np.clip(slow - slow.mean(), 0, None)
    fine = lifted - blur(lifted, SCRATCH_SIGMA)
    scratch = np.clip(fine - SCRATCH_FLOOR, 0, None)
    return wear, scratch


def fibre() -> np.ndarray:
    """Zero-mean fine grain from the laid-paper height map, resampled to the tile."""
    archive = zipfile.ZipFile(io.BytesIO(fetch(FIBRE_URL)))
    image = Image.open(io.BytesIO(archive.read(FIBRE_MEMBER))).convert("L")
    height = np.asarray(image, dtype=np.float64) / 255
    grain = height - blur(height, 2.5)
    grain /= grain.std()
    tile = Image.fromarray(np.clip(grain * 40 + 128, 0, 255).astype(np.uint8), "L").resize(
        (TILE, TILE), Image.Resampling.LANCZOS
    )
    return (np.asarray(tile, dtype=np.float64) - 128) / 40


def creases() -> np.ndarray:
    """Light ridges of the crumpled sheet, >= 0, resampled to the tile."""
    archive = zipfile.ZipFile(io.BytesIO(fetch(CREASE_URL)))
    image = Image.open(io.BytesIO(archive.read(CREASE_MEMBER))).convert("L")
    height = np.asarray(image, dtype=np.float64) / 255
    ridge = height - blur(height, CREASE_SIGMA)
    ridge /= ridge.std()
    lit = np.clip(ridge - CREASE_FLOOR, 0, None)
    return resample(lit / (np.percentile(lit, 99.5) or 1.0), TILE)


def resample(field: np.ndarray, size: int) -> np.ndarray:
    lo, hi = field.min(), field.max()
    span = (hi - lo) or 1.0
    image = Image.fromarray(((field - lo) / span * 255).astype(np.uint8), "L")
    out = np.asarray(image.resize((size, size), Image.Resampling.LANCZOS), dtype=np.float64) / 255
    return out * span + lo


def build(
    name: str,
    amp: dict[str, float],
    wear: np.ndarray,
    scratch: np.ndarray,
    crease: np.ndarray,
    grain: np.ndarray,
) -> None:
    wear_n = wear / (wear.max() or 1.0)
    scratch_n = np.clip(scratch / (np.percentile(scratch, 99.9) or 1.0), 0, 1)
    values = (
        128
        + amp["wear"] * resample(wear_n, TILE)
        + amp["scratch"] * resample(scratch_n, TILE)
        + amp["crease"] * np.clip(crease, 0, 1)
        + amp["fibre"] * grain
    )
    image = Image.fromarray(np.clip(values, 0, 255).round().astype(np.uint8), "L")
    OUT.mkdir(parents=True, exist_ok=True)
    target = OUT / name
    image.save(target, "WEBP", quality=82, method=6)
    p1, p99 = np.percentile(values, 1), np.percentile(values, 99)
    stats = f"mean {values.mean():.1f}, p1 {p1:.0f}, p99 {p99:.0f}"
    print(f"{name}: {target.stat().st_size // 1024} kB, {stats}")


def main() -> None:
    wear, scratch = ageing()
    grain = fibre()
    crease = creases()
    build("paper-day.webp", DAY, wear, scratch, crease, grain)
    build("paper-night.webp", NIGHT, wear, scratch, crease, grain)


if __name__ == "__main__":
    main()
