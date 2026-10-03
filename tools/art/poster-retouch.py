"""Retouch the login poster: new tagline, no flying cars (#71, 03.10.2026).

Run: uv run --with pillow --with opencv-python-headless --with numpy python tools/art/poster-retouch.py

The poster (`packages/client/public/art/login-poster.webp`, commit 9578d02)
had the line „ALWAYS A ANOTHER STORY" printed under „NIGHT CITY" and three
flying cars over the skyline. MG asked for „NEVER FADE AWAY" and no cars.

Each patch is covered with clean paper borrowed from right next to it, shifted
in tone to meet its surroundings and feathered at the edge. Inpainting was
tried first and left grey smears wherever a box touched ink (the arrow over the
tagline, the tower beside the right-hand car).
Re-running on the retouched file is harmless — the same areas are erased and
the same line is printed again.
"""

from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[2]
POSTER = ROOT / "packages/client/public/art/login-poster.webp"
FONT = Path("C:/Windows/Fonts/consolab.ttf")

TAGLINE = "NEVER FADE AWAY"
# Where the old line sat (poster pixels, 1672 × 941): left edge, cap top, pitch
# of one letter cell and cap height — measured off the original print.
TAG_X, TAG_TOP, TAG_PITCH, TAG_CAP = 746, 52, 8.25, 7
INK = (38, 33, 30)

# Rectangles to erase: (left, top, right, bottom), the offset to a clean
# stretch of paper to borrow, and whether the top edge may fade.
PATCHES = [
    # the old tagline; the arrow over „STORY" runs at y 48, so the box starts
    # just under it with a hard top edge. The donor lies just below the line
    # and carries the paper crease through „STORY" along.
    ((740, 50, 934, 68), (0, 18), False),
    # car over the right skyline, with its red light trail up to the tower;
    # the donor sits left of the red frame's corner
    ((1203, 143, 1312, 183), (-200, 0), True),
    # car over the bridge
    ((917, 632, 995, 667), (0, -48), True),
    # car over the left towers
    ((631, 677, 715, 714), (90, -40), True),
]


def ring_mean(
    img: np.ndarray, box: tuple[int, int, int, int], width: int = 4
) -> np.ndarray:
    """Mean colour of a thin frame just outside `box` — the tone a patch must meet."""
    left, top, right, bottom = box
    outer = img[top - width : bottom + width, left - width : right + width].astype(
        np.float32
    )
    mask = np.ones(outer.shape[:2], bool)
    mask[width:-width, width:-width] = False
    return outer[mask].mean(axis=0)


def erase(
    img: np.ndarray,
    box: tuple[int, int, int, int],
    donor: tuple[int, int],
    soft_top: bool,
) -> None:
    """Covers `box` with clean paper from `box + donor`, matched in tone, feathered."""
    left, top, right, bottom = box
    dx, dy = donor
    source = (left + dx, top + dy, right + dx, bottom + dy)
    patch = img[source[1] : source[3], source[0] : source[2]].astype(np.float32)
    patch += ring_mean(img, box) - ring_mean(img, source)
    alpha = np.zeros((bottom - top, right - left), np.float32)
    alpha[3:-3, 3:-3] = 1
    if not soft_top:
        alpha[:3, 3:-3] = 1
    alpha = cv2.GaussianBlur(alpha, (0, 0), 1.6)
    if not soft_top:
        # Box hugging a printed line above it: no fade there, or the old ink
        # just under the edge shows through as a ghost.
        alpha[:3] = np.maximum(alpha[:3], alpha[3])
    alpha = alpha[..., None]
    original = img[top:bottom, left:right].astype(np.float32)
    blended = patch * alpha + original * (1 - alpha)
    img[top:bottom, left:right] = np.clip(blended, 0, 255).astype(np.uint8)


def print_tagline(image: Image.Image) -> Image.Image:
    # Drawn 4× larger and scaled down: at 7 px of cap height the font hinting
    # would otherwise snap every letter to a different width.
    scale = 4
    font = ImageFont.truetype(str(FONT), int(TAG_CAP * scale / 0.72))
    width = int((len(TAGLINE) + 1) * TAG_PITCH * scale)
    height = int(TAG_CAP * scale * 2.2)
    layer = Image.new("L", (width, height), 0)
    draw = ImageDraw.Draw(layer)
    cap_top = font.getbbox("N")[1]
    for index, char in enumerate(TAGLINE):
        draw.text(
            (index * TAG_PITCH * scale, -cap_top + scale), char, font=font, fill=255
        )
    layer = layer.resize((width // scale, height // scale), Image.LANCZOS)
    # A touch of softness: the rest of the poster is worn print, not vector type.
    layer = layer.filter(ImageFilter.GaussianBlur(0.35))
    ink = Image.new("RGB", layer.size, INK)
    image.paste(ink, (TAG_X, TAG_TOP - 1), layer)
    return image


def main() -> None:
    image = Image.open(POSTER).convert("RGB")
    pixels = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
    for box, donor, soft_top in PATCHES:
        erase(pixels, box, donor, soft_top)
    image = Image.fromarray(cv2.cvtColor(pixels, cv2.COLOR_BGR2RGB))
    image = print_tagline(image)
    # Lossless, like the original: the paper grain is half of this poster.
    image.save(POSTER, "WEBP", lossless=True, method=6)
    print(f"zapisano {POSTER.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
