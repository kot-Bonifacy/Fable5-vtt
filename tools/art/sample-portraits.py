"""Sample portraits (MG 21.11.2026) — the MG's own avatars turned into the
portrait set every campaign gets in its pool (`src/sample-portraits.ts`).

Sources: the MG's images, not in the repo — pass their directory as the first
argument, default `C:/AI/materialy/avatary`. Every image in it becomes one
portrait; the MG asked for plain numbers instead of the file names, so the
order below decides the number: the numbered `avatarN` files by N, then the
rest alphabetically.

What the script does:

  1. Scales the long side down to `LONG_SIDE` px (smaller images stay as they
     are) — the map shows a portrait as a small disc, the sheet and the chat
     as a card, so 1024 px is plenty.
  2. Writes `packages/server/assets/sample-portraits/NN.webp` (lossy WebP,
     the same quality as an uploaded portrait) and `manifest.json` with the
     name, size and the GM-only flag of each.

`assets/` sits outside `data/public/` on purpose: that directory is served
to anyone as `/public/`, and the GM-only faces must reach a player only
through the campaign's upload guard.

Run from the repo root:

    uv run --with pillow python tools/art/sample-portraits.py [source-dir] [out-dir]
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from PIL import Image

LONG_SIDE = 1024
# `PORTRAIT_WEBP_QUALITY` in `packages/shared/src/uploads.ts`.
QUALITY = 85

# Source file stems the players never see (MG 21.11.2026).
GM_ONLY: set[str] = {
    "Nocny posiłek strażnika",
    "strażniczka w deszczu",
    "avatar35",
    "avatar34",
    "avatar33",
    "avatar28",
    "avatar27",
    "avatar20",
    "avatar1",
}

NUMBERED = re.compile(r"^avatar(\d+)")


def order_key(path: Path) -> tuple[int, int, str]:
    match = NUMBERED.match(path.stem)
    if match:
        return (0, int(match.group(1)), path.stem)
    return (1, 0, path.stem.casefold())


def main() -> None:
    root = Path(__file__).resolve().parents[2]
    source = Path(sys.argv[1] if len(sys.argv) > 1 else "C:/AI/materialy/avatary")
    out = Path(
        sys.argv[2] if len(sys.argv) > 2 else root / "packages/server/assets/sample-portraits"
    )
    files = sorted(
        (p for p in source.iterdir() if p.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}),
        key=order_key,
    )
    missing = GM_ONLY - {p.stem for p in files}
    if missing:
        raise SystemExit(f"GM-only sources not found: {sorted(missing)}")

    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob("*.webp"):
        old.unlink()

    digits = max(2, len(str(len(files))))
    portraits = []
    total = 0
    for index, path in enumerate(files, start=1):
        number = str(index).zfill(digits)
        image = Image.open(path)
        image = image.convert("RGBA" if image.mode in ("RGBA", "LA", "P") else "RGB")
        image.thumbnail((LONG_SIDE, LONG_SIDE), Image.Resampling.LANCZOS)
        if image.mode == "RGBA" and image.getextrema()[3][0] == 255:
            image = image.convert("RGB")  # an opaque alpha channel only costs bytes
        target = out / f"{number}.webp"
        image.save(target, "WEBP", quality=QUALITY, method=6)
        size = target.stat().st_size
        total += size
        gm_only = path.stem in GM_ONLY
        portraits.append(
            {
                "file": target.name,
                "name": f"Avatar {number}",
                "gmOnly": gm_only,
                "width": image.width,
                "height": image.height,
            }
        )
        flag = " (MG)" if gm_only else ""
        print(f"{path.name} -> {target.name}{flag} {image.size} {size // 1024} KB")

    manifest = {
        "schemaVersion": 1,
        "source": "Przykładowe portrety MG (21.11.2026): tools/art/sample-portraits.py.",
        "portraits": portraits,
    }
    with open(out / "manifest.json", "w", encoding="utf-8", newline="") as handle:
        handle.write(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(f"{len(portraits)} portraits, {total / 1024 / 1024:.1f} MB")


if __name__ == "__main__":
    main()
