"""Bake the sheet wear mask into transparent chrome backgrounds.

Run: uv run --with pillow python tools/art/chrome-paper.py
No new artwork: source and licence are documented in assety-karta-postaci.md.
Colours, opacity and the mask of each skin come directly from theme.css (the
day skin has its own mask since 24.09). Regenerate after changing sheet wear
tokens or a paper-wear mask. Backgrounds stay below text and work in
scrolling panels without introducing overlay stacking contexts.
"""

from pathlib import Path
import re
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / "packages/client/public/art"
THEME = ROOT / "packages/client/src/theme.css"


def main():
    theme = THEME.read_text(encoding="utf-8")
    colours = re.findall(r"--cp-wear: (#[0-9a-f]+);", theme)
    strengths = re.findall(r"--cp-wear-alpha: ([0-9.]+);", theme)
    masks = re.findall(r"--cp-wear-mask: url\('/art/([^']+)'\);", theme)
    for mode, colour, strength, source in zip(
        ("night", "day"), colours, strengths, masks, strict=True
    ):
        mask = Image.open(ART / source).convert("L")
        tile = Image.new("RGBA", mask.size, colour)
        tile.putalpha(mask.point(lambda value: round(value * float(strength))))
        target = ART / "chrome" / f"paper-{mode}.webp"
        tile.save(target, lossless=True)
        print(f"{target.name}: {tile.size}, {target.stat().st_size} bytes")


if __name__ == "__main__":
    main()
