"""Old-paper skin of the character sheet and creator (naprawa kreatora, 2c).

Builds every file in `packages/client/public/art/sheet/` from free sources,
downloaded on first run into a cache directory next to this script (ignored
by git):

  * paper — "Old paper6.jpg", Wikimedia Commons, public domain (PD-author,
    The Digital Yard Sale):
    https://commons.wikimedia.org/wiki/File:Old_paper6.jpg
  * cracks — ambientCG "Asphalt 011" height map, CC0 1.0:
    https://ambientcg.com/view?id=Asphalt011

Outputs:

  paper-wear.jpg        luminance mask, white = worn: bleached patches and
                        pale scratches (nothing darker than the paper — MG,
                        16.09: dark specks and stains "look like dirt")
  ink-cracks-day.webp   transparent cracks in the day paper colour
  ink-cracks-night.webp transparent cracks in the night paper colour

The CSS paints a solid light colour through the mask (`theme.css`,
`--cp-wear-*`): for a grey texture that is exactly "screen" over any colour
underneath, without blend modes. Crack files carry the paper colour itself, so changing
`--cp-paper` in `theme.css` means updating PAPER_DAY / PAPER_NIGHT here and
running the script again.

Run (needs `uv`):
    uv run --with pillow --with numpy python tools/art/sheet-paper.py
"""

from __future__ import annotations

import io
import urllib.request
import zipfile
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "packages" / "client" / "public" / "art" / "sheet"
CACHE = Path(__file__).resolve().parent / ".cache"

PAPER_URL = "https://upload.wikimedia.org/wikipedia/commons/e/e8/Old_paper6.jpg"
CRACKS_URL = "https://ambientcg.com/get?file=Asphalt011_2K-JPG.zip"
CRACKS_MEMBER = "Asphalt011_2K-JPG_Displacement.jpg"
USER_AGENT = "VTT-sheet-paper/1.0 (private tabletop project)"

# Must match `--cp-paper` in theme.css (night :root and :root[data-theme='day']).
PAPER_NIGHT = "#171514"
PAPER_DAY = "#f6eddb"

# The middle of the 2401 x 3500 scan: edges carry vignette and a torn border
# that would show up as a stripe in every tile.
PAPER_CROP = 1760
# Scanner light fall-off lives below this scale (px); stains live above it.
FLATTEN_SIGMA = 400
# Wear only lightens (MG, 16.09: no dark specks, then no dark stains either —
# "I prefer cracks or worn spots"). Dark specks are lifted to their
# SPECK_SIGMA neighbourhood first, so they cannot leave pale halos, and the
# paper's slow variation above STAIN_SIGMA gives the bleached patches.
SPECK_SIGMA = 45
STAIN_SIGMA = 32
BLEACH_GAIN = 7.0
# Pale scratches are the one fine detail kept: thin light lines, not dots.
# SCRATCH_FLOOR drops the scan's pale noise so only real scratches remain.
SCRATCH_SIGMA = 45
SCRATCH_FLOOR = 0.06
SCRATCH_GAIN = 22.0

# Cracks: valleys of the height map deeper than LO start to show, HI is solid.
CRACK_LO, CRACK_HI = 0.05, 0.13
# Share of the tile covered by crack patches (the rest stays intact print).
CRACK_KEEP = 0.45
CRACK_SEED = 7
CRACK_ALPHA_DAY = 0.9
CRACK_ALPHA_NIGHT = 0.85


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


def save_mask(values: np.ndarray, name: str) -> None:
    image = Image.fromarray((np.clip(values, 0, 1) * 255).round().astype(np.uint8), "L")
    image.save(OUT / name, quality=88, optimize=True)
    print(f"{name}: mean {values.mean():.3f}, p99 {np.percentile(values, 99):.3f}")


def paper_masks() -> None:
    scan = Image.open(io.BytesIO(fetch(PAPER_URL))).convert("RGB")
    w, h = scan.size
    half = PAPER_CROP // 2
    scan = scan.crop((w // 2 - half, h // 2 - half, w // 2 + half, h // 2 + half))
    rgb = np.asarray(scan).astype(np.float64) / 255.0
    lum = np.log(np.clip(rgb @ np.array([0.2126, 0.7152, 0.0722]), 1e-3, 1))
    lum = lum - blur(lum, FLATTEN_SIGMA)
    lum = periodic(lum)
    lum -= lum.mean()
    lighter = np.maximum(lum - blur(lum, SCRATCH_SIGMA) - SCRATCH_FLOOR, 0)
    scratches = blur(lighter, 0.8) * SCRATCH_GAIN
    lum = np.maximum(lum, blur(lum, SPECK_SIGMA))
    bleached = blur(lum, STAIN_SIGMA)
    bleached -= bleached.mean()
    save_mask(np.maximum(bleached * BLEACH_GAIN, scratches), "paper-wear.jpg")


def cracks() -> None:
    archive = zipfile.ZipFile(io.BytesIO(fetch(CRACKS_URL)))
    height = np.asarray(Image.open(io.BytesIO(archive.read(CRACKS_MEMBER))).convert("L"))
    height = height.astype(np.float64) / 255.0
    valley = blur(height, 6) - height
    lines = np.clip((valley - CRACK_LO) / (CRACK_HI - CRACK_LO), 0, 1)
    field = blur(np.random.default_rng(CRACK_SEED).standard_normal(height.shape), 90)
    field = (field - field.mean()) / field.std()
    patches = np.clip((field - (1 - 2 * CRACK_KEEP)) * 1.5, 0, 1)
    mask = lines * patches
    for name, colour, alpha in (
        ("ink-cracks-day.webp", PAPER_DAY, CRACK_ALPHA_DAY),
        ("ink-cracks-night.webp", PAPER_NIGHT, CRACK_ALPHA_NIGHT),
    ):
        rgba = np.zeros(mask.shape + (4,), np.uint8)
        rgba[..., :3] = [int(colour[i : i + 2], 16) for i in (1, 3, 5)]
        rgba[..., 3] = (np.clip(mask * alpha, 0, 1) * 255).round().astype(np.uint8)
        Image.fromarray(rgba, "RGBA").save(OUT / name, "WEBP", lossless=True, method=6)
        print(f"{name}: crack coverage {(mask > 0.5).mean():.3f}")


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    paper_masks()
    cracks()
