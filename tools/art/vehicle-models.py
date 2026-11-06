"""Car models the players can buy (etap 67, MG 06.11.2026) — the MG's own
top-down car art turned into the built-in vehicle sprites.

Sources (the MG's images, ~700 x 330 each, nose to the LEFT, not in the
repo — pass their directory as the first argument, default
`C:/AI/materialy/auta`). Seven of the twelve have the transparency
checkerboard *painted into the pixels* (an export from a tool that flattened
its preview), the other five carry a real alpha channel.

What the script does:

  1. Painted checkerboard: flood-fills from the image border over light,
     colourless pixels (the two checker greys and white) — the thick black
     outline of every car stops the fill, so a white ambulance keeps its
     roof. The fill becomes alpha 0, with a one-pixel soft edge.
  2. Turns the car nose-up (`ChaseLayer` draws sprites nose-up and rotates
     them to the direction of travel).
  3. Crops to the visible car and scales the long side to `LONG_SIDE` px.
  4. Writes `packages/client/public/art/vehicles/<slug>.webp`.

Run from the repo root:

    uv run --with pillow --with numpy python tools/art/vehicle-models.py [source-dir] [out-dir]
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image

# Source file prefix -> output slug (the slugs are the ids in
# `data/public/cpred/vehicle-models.json` and in `VEHICLE_ART`).
MODELS: dict[str, str] = {
    "auto1": "kagero",
    "auto11": "widmo",
    "auto2": "rajdowka-77",
    "auto4": "nocny-neon",
    "auto12": "bastion",
    "auto5": "ranczer",
    "auto9": "rdzawiec",
    "auto10": "wloczega",
    "auto6": "taksowka",
    "auto8": "radiowoz",
    "auto7": "karetka",
    "auto3": "militech-furgon",
    # 06.11, druga dostawa MG: furgony i motocykle (prawdziwa przezroczystość).
    "furgon1": "graty",
    "furgon2": "nomada",
    "motocykl1": "zadlo",
    "motocykl2": "osa",
}

LONG_SIDE = 384
# A checker pixel: bright and without colour. The two greys of the painted
# checkerboard sit around 204 and 234-255.
BG_MIN_LUMA = 180
BG_MAX_CHROMA = 22


def source_for(directory: Path, prefix: str) -> Path:
    # `auto1` must not match `auto10`: the prefix is followed by `.` or `_`.
    for path in sorted(directory.glob(f"{prefix}*.png")):
        rest = path.stem[len(prefix) :]
        if rest == "" or rest.startswith("_"):
            return path
    raise FileNotFoundError(f"no source for {prefix} in {directory}")


def flood_background(rgb: np.ndarray) -> np.ndarray:
    """Pixels connected to the border through checker-like pixels."""
    rgb = rgb.astype(np.int16)
    luma = rgb.mean(axis=2)
    chroma = rgb.max(axis=2) - rgb.min(axis=2)
    candidate = (luma >= BG_MIN_LUMA) & (chroma <= BG_MAX_CHROMA)

    filled = np.zeros_like(candidate)
    filled[0, :] = candidate[0, :]
    filled[-1, :] = candidate[-1, :]
    filled[:, 0] = candidate[:, 0]
    filled[:, -1] = candidate[:, -1]
    while True:
        grown = filled.copy()
        grown[1:, :] |= filled[:-1, :]
        grown[:-1, :] |= filled[1:, :]
        grown[:, 1:] |= filled[:, :-1]
        grown[:, :-1] |= filled[:, 1:]
        grown &= candidate
        if np.array_equal(grown, filled):
            return filled
        filled = grown


def soft_edge(background: np.ndarray) -> np.ndarray:
    """Alpha 0 on the background, 50% on the car pixels touching it, else 255."""
    alpha = np.where(background, 0, 255).astype(np.uint8)
    ring = np.zeros_like(background)
    ring[1:, :] |= background[:-1, :]
    ring[:-1, :] |= background[1:, :]
    ring[:, 1:] |= background[:, :-1]
    ring[:, :-1] |= background[:, 1:]
    ring &= ~background
    alpha[ring] = 128
    return alpha


def process(source: Path) -> Image.Image:
    image = Image.open(source).convert("RGBA")
    pixels = np.array(image)
    corner_alpha = [pixels[0, 0, 3], pixels[0, -1, 3], pixels[-1, 0, 3], pixels[-1, -1, 3]]
    if min(corner_alpha) == 255:
        # Painted checkerboard instead of transparency.
        background = flood_background(pixels[:, :, :3])
        pixels[:, :, 3] = np.minimum(pixels[:, :, 3], soft_edge(background))
        image = Image.fromarray(pixels, "RGBA")

    # Nose left -> nose up: a quarter turn clockwise.
    image = image.transpose(Image.Transpose.ROTATE_270)
    alpha = np.array(image)[:, :, 3]
    ys, xs = np.nonzero(alpha > 8)
    image = image.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    scale = LONG_SIDE / max(image.size)
    size = (round(image.width * scale), round(image.height * scale))
    return image.resize(size, Image.Resampling.LANCZOS)


def main() -> None:
    source_dir = Path(sys.argv[1] if len(sys.argv) > 1 else "C:/AI/materialy/auta")
    out_dir = Path(sys.argv[2] if len(sys.argv) > 2 else "packages/client/public/art/vehicles")
    out_dir.mkdir(parents=True, exist_ok=True)
    for prefix, slug in MODELS.items():
        source = source_for(source_dir, prefix)
        result = process(source)
        target = out_dir / f"{slug}.webp"
        result.save(target, "WEBP", quality=88, method=6)
        print(f"{source.name} -> {target.name} {result.size} {target.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
