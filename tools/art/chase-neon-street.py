"""The "Neonowa ulica" chase road: three street maps of the MG stitched into one
long loop (MG, 05.11.2026).

Sources (the MG's own images, 2172 x 724 each, not in the repo — pass their
directory as the first argument, default `C:/AI/materialy/mapy`):

  * "Neonowa mapa cyberpunkowej autostrady.png"        (segment A)
  * "Neonowa ulica cyberpunkowa z lotu ptaka.png"      (segment B, the crossing cut off)
  * "Neonowo-noir_ futurystyczna ulica z góry.png"     (segment C)

What the script does:

  1. Warps B and C onto the geometry of A: a uniform scale that matches the
     width of the carriageway, then a piecewise-linear vertical map that puts
     the barriers and the edge lines on A's rows.
  2. Erases the painted lane dashes (each image has its own rhythm) and paints
     new ones with one period that divides the loop, tinted by the neon light
     underneath.
  3. Joins A → B → C → A: the carriageway and the barriers cross-fade over the
     whole overlap, the sidewalks and buildings meet along a minimum-error cut
     with a narrow feather (image quilting), so no building is ghosted.
  4. Crops 24 squares across (carriageway = 12 squares, 3 lanes of 4) and
     writes, into `packages/client/public/art/roads/`:
       * `neon-street-strip.webp` — the whole loop, periodic: its last column
         is followed by its first. The chase layer scrolls it under the scene
         (`ChaseRoadPreset.strip`), so the road does not repeat for ~230 m.
       * `neon-street.webp` — the first 35 squares, the still background of the
         scene (shown before the strip loads and outside the chase layer).
       * `neon-street-thumb.webp` — the tile in the chase wizard.

The layout (24 squares, carriageway rows 6–18, strip length in squares) is
copied into `CHASE_ROADS` in `packages/shared/src/chase-roads.ts` — the script
prints the numbers; change one, change the other.

Run (needs `uv`):
    uv run --with pillow --with numpy python tools/art/chase-neon-street.py [source-dir] [out-dir]
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SOURCE = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("C:/AI/materialy/mapy")
OUT = (
    Path(sys.argv[2])
    if len(sys.argv) > 2
    else ROOT / "packages" / "client" / "public" / "art" / "roads"
)

FILES = {
    "A": "Neonowa mapa cyberpunkowej autostrady.png",
    "B": "Neonowa ulica cyberpunkowa z lotu ptaka.png",
    "C": "Neonowo-noir_ futurystyczna ulica z góry.png",
}

# Reference geometry = segment A (source rows): barriers and edge lines.
REF_RAIL_TOP, REF_EDGE_TOP, REF_EDGE_BOTTOM, REF_RAIL_BOTTOM = 150, 202, 500, 545
# Per segment: (rail top, edge top, edge bottom, rail bottom) in its own rows,
# and how many source columns to keep (B ends in a crossing we do not want).
GEOMETRY = {
    "A": ((150, 202, 500, 545), 2172),
    "B": ((150, 190, 485, 522), 1960),
    "C": ((160, 203, 471, 510), 2172),
}

SQUARES_ACROSS = 24
ROAD_ROWS = (6, 18)  # carriageway, in squares — ROAD_SIZE / road in chase-roads.ts
# Crop in reference rows: edge lines land on rows 6 and 18 of 25 px squares.
REF_SQUARE = (REF_EDGE_BOTTOM - REF_EDGE_TOP) / (ROAD_ROWS[1] - ROAD_ROWS[0])
CROP_TOP = REF_EDGE_TOP - ROAD_ROWS[0] * REF_SQUARE
CROP_HEIGHT = SQUARES_ACROSS * REF_SQUARE

OVERLAP = 220  # reference px of every join
FEATHER = 9  # px either side of the cut through sidewalks and buildings
# Rows (reference) that cross-fade over the whole overlap: barriers to barriers.
FADE_ROWS = (REF_RAIL_TOP - 14, REF_RAIL_BOTTOM + 14)

# Lane dashes (reference rows of the two lane lines, between the edge lines).
LANE_STEP = (REF_EDGE_BOTTOM - REF_EDGE_TOP) / 3
DASH_ROWS = (REF_EDGE_TOP + LANE_STEP, REF_EDGE_TOP + 2 * LANE_STEP)
DASH_THICKNESS = 4.5
DASH_PERIOD_TARGET = 228.0  # ~9 m; the real period divides the loop
DASH_FILL = 0.5  # dash length / period

MAX_TEXTURE = 8192  # widest strip we hand to WebGL
SCENE_SQUARES_ALONG = 35  # the scene window, as every built-in road
THUMB = (420, 216)


def load(key: str) -> np.ndarray:
    image = Image.open(SOURCE / FILES[key]).convert("RGB")
    return np.asarray(image).astype(np.float32) / 255.0


def warp(key: str) -> np.ndarray:
    """The segment in reference rows (0..724 of A), uniformly scaled to A's carriageway."""
    (rail_t, edge_t, edge_b, rail_b), keep = GEOMETRY[key]
    src = load(key)[:, :keep]
    scale = (REF_EDGE_BOTTOM - REF_EDGE_TOP) / (edge_b - edge_t)
    width = round(keep * scale)
    # Horizontal scale first (Lanczos), then the vertical map row by row.
    img = Image.fromarray((src * 255).astype(np.uint8)).resize(
        (width, src.shape[0] * 4), Image.LANCZOS
    )
    tall = np.asarray(img).astype(np.float32) / 255.0  # 4x rows for a precise lookup
    ref_anchor = np.array(
        [REF_RAIL_TOP, REF_EDGE_TOP, REF_EDGE_BOTTOM, REF_RAIL_BOTTOM], float
    )
    src_anchor = np.array([rail_t, edge_t, edge_b, rail_b], float)
    rows = np.arange(724, dtype=float) + 0.5
    src_rows = np.interp(rows, ref_anchor, src_anchor)
    # Outside the anchors keep the uniform scale.
    src_rows = np.where(
        rows < ref_anchor[0], src_anchor[0] - (ref_anchor[0] - rows) / scale, src_rows
    )
    src_rows = np.where(
        rows > ref_anchor[-1],
        src_anchor[-1] + (rows - ref_anchor[-1]) / scale,
        src_rows,
    )
    pos = np.clip(src_rows * 4 - 0.5, 0, tall.shape[0] - 1)
    lo = np.floor(pos).astype(int)
    hi = np.minimum(lo + 1, tall.shape[0] - 1)
    t = (pos - lo)[:, None, None]
    return tall[lo] * (1 - t) + tall[hi] * t


def luminance(img: np.ndarray) -> np.ndarray:
    return img @ np.array([0.299, 0.587, 0.114], np.float32)


def erase_dashes(img: np.ndarray) -> np.ndarray:
    """Paints the asphalt from a few rows away over every lane dash."""
    out = img.copy()
    lum = luminance(img)
    for centre in DASH_ROWS:
        top, bottom = int(centre - 13), int(centre + 13)
        band = lum[top:bottom]
        # The asphalt level of each column, from the band edges.
        base = np.minimum(
            np.median(lum[top - 8 : top], 0), np.median(lum[bottom : bottom + 8], 0)
        )
        # Neon-tinted paint is saturated too, so only the contrast counts.
        paint = band > base[None, :] + 0.05
        # Columns that really carry a dash (a run of paint), not texture.
        cols = paint.sum(0) >= 2
        paint &= cols[None, :]
        mask = np.zeros(lum.shape, bool)
        mask[top:bottom] = paint
        # Grow the mask: the dash has a soft dark outline and worn ends.
        grown = (
            np.asarray(
                Image.fromarray(mask.astype(np.uint8) * 255).filter(
                    ImageFilter.MaxFilter(9)
                )
            )
            > 0
        )
        ys, xs = np.nonzero(grown)
        half = (ys < centre).astype(int)
        donor = np.where(half == 1, ys - 14, ys + 14)
        out[ys, xs] = img[donor, xs]
    return out


def seam_path(left: np.ndarray, right: np.ndarray) -> np.ndarray:
    """Minimum-error vertical cut through the overlap, one column per row."""
    error = ((left - right) ** 2).sum(2)
    # 5 x 5 box blur: the cut follows regions that differ, not single pixels.
    padded = np.pad(error, 2, mode="edge")
    h, w = error.shape
    error = (
        sum(padded[dy : dy + h, dx : dx + w] for dy in range(5) for dx in range(5)) / 25
    )
    cost = error.copy()
    back = np.zeros((h, w), int)
    for y in range(1, h):
        prev = cost[y - 1]
        options = np.stack([np.roll(prev, 1), prev, np.roll(prev, -1)])
        options[0, 0] = np.inf
        options[2, -1] = np.inf
        choice = options.argmin(0)
        cost[y] += options[choice, np.arange(w)]
        back[y] = np.arange(w) + choice - 1
    # Keep the cut away from the overlap edges so the feather fits.
    margin = FEATHER + 2
    last = cost[-1].copy()
    last[:margin] = np.inf
    last[-margin:] = np.inf
    path = np.zeros(h, int)
    path[-1] = int(last.argmin())
    for y in range(h - 1, 0, -1):
        path[y - 1] = back[y, path[y]]
    return np.clip(path, margin, w - margin)


def join_alpha(left: np.ndarray, right: np.ndarray) -> np.ndarray:
    """Weight of the right segment across the overlap (rows x columns)."""
    h, w = left.shape[:2]
    x = np.arange(w, dtype=float)
    # Smooth cross-fade for the carriageway and the barriers.
    ramp = x / (w - 1)
    fade = ramp * ramp * (3 - 2 * ramp)
    # Narrow feather along the cut for sidewalks and buildings (the cut only
    # looks at those rows; inside the fade rows it is ignored).
    outside = np.ones(h, bool)
    outside[FADE_ROWS[0] : FADE_ROWS[1]] = False
    masked_l = left.copy()
    masked_r = right.copy()
    masked_l[~outside] = 0
    masked_r[~outside] = 0
    path = seam_path(masked_l, masked_r)
    cut = np.clip((x[None, :] - path[:, None]) / (2 * FEATHER) + 0.5, 0, 1)
    cut = cut * cut * (3 - 2 * cut)
    # Blend the two modes over a few rows at the barrier edges.
    rows = np.arange(h, dtype=float)
    inside = np.clip(
        np.minimum(rows - (FADE_ROWS[0] - 6), (FADE_ROWS[1] + 6) - rows) / 12 + 0.5,
        0,
        1,
    )[:, None]
    return inside * fade[None, :] + (1 - inside) * cut


def compose(segments: list[np.ndarray]) -> np.ndarray:
    """Loop of segments: each overlaps the next by OVERLAP, the last the first."""
    h = segments[0].shape[0]
    length = sum(s.shape[1] for s in segments) - OVERLAP * len(segments)
    canvas = np.zeros((h, length, 3), np.float32)
    starts = []
    at = 0
    for seg in segments:
        starts.append(at)
        at += seg.shape[1] - OVERLAP
    # Interior of every segment (outside the overlaps).
    for seg, start in zip(segments, starts):
        body = seg[:, OVERLAP : seg.shape[1] - OVERLAP]
        canvas[:, start + OVERLAP : start + seg.shape[1] - OVERLAP] = body
    # The joins, the last one wrapping onto column 0.
    for index, seg in enumerate(segments):
        nxt = segments[(index + 1) % len(segments)]
        left = seg[:, seg.shape[1] - OVERLAP :]
        right = nxt[:, :OVERLAP]
        alpha = join_alpha(left, right)[:, :, None]
        blended = left * (1 - alpha) + right * alpha
        start = (starts[index] + seg.shape[1] - OVERLAP) % length
        cols = (np.arange(OVERLAP) + start) % length
        canvas[:, cols] = blended
    return canvas


def paint_dashes(img: np.ndarray) -> tuple[np.ndarray, float]:
    """New lane dashes with one period that divides the loop."""
    h, length = img.shape[:2]
    count = max(1, round(length / DASH_PERIOD_TARGET))
    period = length / count
    out = img.copy()
    # Light under the paint: the low-frequency asphalt colour.
    glow = (
        np.asarray(
            Image.fromarray((img * 255).astype(np.uint8)).filter(
                ImageFilter.GaussianBlur(18)
            )
        ).astype(np.float32)
        / 255.0
    )
    rng = np.random.default_rng(7)
    wear = (
        np.asarray(
            Image.fromarray((rng.random((h, length)) * 255).astype(np.uint8)).filter(
                ImageFilter.GaussianBlur(1.2)
            )
        ).astype(np.float32)
        / 255.0
    )
    x = np.arange(length, dtype=float)
    phase = (x / period) % 1.0
    # Antialiased along the road: coverage of each column by the dash.
    along = np.clip(
        np.minimum(phase * period, (DASH_FILL - phase) * period) + 0.5, 0, 1
    )
    along[phase > DASH_FILL] = 0
    for centre in DASH_ROWS:
        rows = np.arange(h, dtype=float)
        across = np.clip(DASH_THICKNESS / 2 + 0.5 - np.abs(rows + 0.5 - centre), 0, 1)
        cover = across[:, None] * along[None, :]
        alpha = cover * (0.72 + 0.28 * wear)
        base = 0.50 * np.array([0.86, 0.88, 0.92], np.float32)
        tint = np.clip(glow - 0.08, 0, None) * 1.25
        colour = np.clip(base[None, None, :] + tint, 0, 1)
        out = out * (1 - alpha[:, :, None]) + colour * alpha[:, :, None]
    return out, period


def to_image(arr: np.ndarray) -> Image.Image:
    return Image.fromarray((np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8))


def main() -> None:
    segments = [erase_dashes(warp(key)) for key in ("A", "B", "C")]
    loop = compose(segments)
    loop, dash_period = paint_dashes(loop)
    top = round(CROP_TOP)
    loop = loop[top : top + round(CROP_HEIGHT)]
    strip = to_image(loop)
    # Up to 2x for a crisper edge at table zoom, but never wider than WebGL takes.
    factor = min(2.0, MAX_TEXTURE / strip.width)
    size = (round(strip.width * factor), round(strip.height * factor))
    strip = strip.resize(size, Image.LANCZOS).filter(
        ImageFilter.UnsharpMask(1.2, 40, 2)
    )
    square = strip.height / SQUARES_ACROSS
    length_sq = strip.width / square

    OUT.mkdir(parents=True, exist_ok=True)
    strip.save(OUT / "neon-street-strip.webp", quality=86, method=6)
    still = strip.crop((0, 0, round(SCENE_SQUARES_ALONG * square), strip.height))
    still.save(OUT / "neon-street.webp", quality=86, method=6)
    # Thumbnail: the carriageway and a bit of sidewalk, as the other tiles.
    thumb_h = still.width * THUMB[1] / THUMB[0]
    middle = (ROAD_ROWS[0] + ROAD_ROWS[1]) / 2 * square
    thumb = still.crop(
        (0, int(middle - thumb_h / 2), still.width, int(middle + thumb_h / 2))
    )
    thumb.resize(THUMB, Image.LANCZOS).save(
        OUT / "neon-street-thumb.webp", quality=82, method=6
    )

    print(f"strip {strip.width} x {strip.height} px, {square:.3f} px per square")
    print(
        f"strip length {length_sq:.4f} squares (dash period {dash_period * factor / square:.3f} sq)"
    )
    print(f"still {still.width} x {still.height} px")


if __name__ == "__main__":
    main()
