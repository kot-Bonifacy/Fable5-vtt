"""Built-in road backgrounds of the chase scene (MG, 03.11.2026).

Draws every file in `packages/client/public/art/roads/` from two CC0 asphalt
photos, downloaded on first run into a cache directory next to this script
(ignored by git):

  * ambientCG "Asphalt 031" colour map, CC0 1.0:
    https://ambientcg.com/view?id=Asphalt031
  * ambientCG "Asphalt 033" colour map, CC0 1.0:
    https://ambientcg.com/view?id=Asphalt033

Everything else — lane markings, barriers, neon, sidewalks, the city under the
viaduct, the sand of the Badlands — is drawn here, so the result is our own
work on top of two CC0 photos.

Seam: the chase layer (`buildSeamlessTexture` in `ChaseLayer.ts`) loops a
background by cross-fading its last CHASE_SEAM_SQUARES (3) squares into the
first ones. Every road here is periodic with PERIOD = width - 3 squares, so
the cross-fade blends two identical strips and no seam is left at all. That is
why every repeating element (dashes, lamps, joints, the asphalt tile) has a
period that divides PERIOD, and blurs wrap around.

The layout (rows, road band, size) is copied into `CHASE_ROADS` in
`packages/shared/src/chase-roads.ts` — change one, change the other.

Outputs, per road: `<id>.webp` (3500 x 1800, 1 square = 100 px = 1 m) and
`<id>-thumb.webp` (the picker in the chase wizard).

Run (needs `uv`):
    uv run --with pillow --with numpy python tools/art/chase-roads.py
"""

from __future__ import annotations

import io
import urllib.request
import zipfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "packages" / "client" / "public" / "art" / "roads"
CACHE = Path(__file__).resolve().parent / ".cache"
USER_AGENT = "VTT-chase-roads/1.0 (private tabletop project)"

GRID = 100  # px per square; 1 square = 1 m on a chase scene
SEAM_SQUARES = 3  # CHASE_SEAM_SQUARES in packages/shared/src/chase.ts
PERIOD = 32 * GRID  # 3200 px — every repeating element divides it
WIDTH = PERIOD + SEAM_SQUARES * GRID  # 3500 px = 35 squares
HEIGHT = 18 * GRID  # 1800 px = 18 squares
ASPHALT_TILE = 800  # the 2K photo shrunk to 8 m; 4 tiles per period
THUMB = (420, 216)

TEXTURES = {
    "grey": ("Asphalt031_2K-JPG", "Asphalt031_2K-JPG_Color.jpg"),
    "brown": ("Asphalt033_2K-JPG", "Asphalt033_2K-JPG_Color.jpg"),
}


def m(metres: float) -> int:
    return int(round(metres * GRID))


# ---------------------------------------------------------------- sources


def texture(key: str) -> np.ndarray:
    """The colour map as float RGB 0..1, ASPHALT_TILE square."""
    archive, member = TEXTURES[key]
    CACHE.mkdir(exist_ok=True)
    colour = CACHE / member
    if not colour.exists():
        url = f"https://ambientcg.com/get?file={archive}.zip"
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(request) as response:
            data = response.read()
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            colour.write_bytes(zf.read(member))
    image = Image.open(colour).convert("RGB").resize((ASPHALT_TILE, ASPHALT_TILE), Image.LANCZOS)
    return np.asarray(image, dtype=np.float32) / 255.0


def tiled(tile: np.ndarray, offset_y: int = 0) -> np.ndarray:
    """The tile repeated over PERIOD x HEIGHT (periodic along x by construction)."""
    reps_x = PERIOD // tile.shape[1]
    reps_y = (HEIGHT + offset_y) // tile.shape[0] + 1
    big = np.tile(tile, (reps_y, reps_x, 1))
    return big[offset_y : offset_y + HEIGHT]


# ---------------------------------------------------------------- helpers


def blur(a: np.ndarray, sigma: float) -> np.ndarray:
    """Gaussian blur in the frequency domain — wraps around, keeps x periodic."""
    if a.ndim == 3:
        return np.stack([blur(a[..., c], sigma) for c in range(a.shape[2])], axis=-1)
    h, w = a.shape
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.fftfreq(w)[None, :]
    kernel = np.exp(-2 * (np.pi * sigma) ** 2 * (fx**2 + fy**2))
    return np.real(np.fft.ifft2(np.fft.fft2(a) * kernel)).astype(np.float32)


def noise(rng: np.random.Generator, sigma: float) -> np.ndarray:
    """Smooth noise 0..1, periodic along x."""
    n = blur(rng.standard_normal((HEIGHT, PERIOD)).astype(np.float32), sigma)
    n -= n.min()
    n /= max(1e-6, n.max())
    return n


def rows(top: float, bottom: float) -> np.ndarray:
    """Mask 0..1 of the rows between two metres (soft by one pixel)."""
    y = np.arange(HEIGHT, dtype=np.float32)[:, None] + 0.5
    mask = np.clip(y - top * GRID, 0, 1) * np.clip(bottom * GRID - y, 0, 1)
    return np.broadcast_to(mask, (HEIGHT, PERIOD)).astype(np.float32)


def grade(rgb: np.ndarray, level: float, contrast: float, tint: tuple[float, float, float]) -> np.ndarray:
    """Night grading: centre on the mean, scale contrast, set the mean, tint."""
    mean = rgb.mean()
    out = (rgb - mean) * contrast + level
    return np.clip(out * np.array(tint, dtype=np.float32), 0, 1)


def over(base: np.ndarray, colour: np.ndarray | tuple[float, float, float], alpha: np.ndarray) -> np.ndarray:
    a = alpha[..., None]
    col = np.asarray(colour, dtype=np.float32)
    return base * (1 - a) + col * a


def add(base: np.ndarray, colour: tuple[float, float, float], amount: np.ndarray) -> np.ndarray:
    return np.clip(base + np.asarray(colour, dtype=np.float32) * amount[..., None], 0, 1)


class Layer:
    """A greyscale mask drawn with PIL on a canvas three periods wide.

    Shapes are drawn at x, x - PERIOD and x + PERIOD, so anything that crosses
    the period edge comes back on the other side; `mask()` returns the middle
    period.
    """

    def __init__(self) -> None:
        self.image = Image.new("L", (PERIOD * 3, HEIGHT), 0)
        self.draw = ImageDraw.Draw(self.image)

    def rect(self, x0: float, y0: float, x1: float, y1: float, value: int = 255) -> None:
        for k in (0, 1, 2):
            dx = k * PERIOD
            self.draw.rectangle((x0 + dx, y0, x1 + dx, y1), fill=value)

    def ellipse(self, x0: float, y0: float, x1: float, y1: float, value: int = 255) -> None:
        for k in (0, 1, 2):
            dx = k * PERIOD
            self.draw.ellipse((x0 + dx, y0, x1 + dx, y1), fill=value)

    def line(self, points: list[tuple[float, float]], width: int, value: int = 255) -> None:
        for k in (0, 1, 2):
            dx = k * PERIOD
            self.draw.line([(x + dx, y) for x, y in points], fill=value, width=width)

    def mask(self, soften: float = 0.0) -> np.ndarray:
        image = self.image
        if soften > 0:
            image = image.filter(ImageFilter.GaussianBlur(soften))
        return np.asarray(image, dtype=np.float32)[:, PERIOD : 2 * PERIOD] / 255.0


def wear(rng: np.random.Generator, amount: float) -> np.ndarray:
    """Patchy wear of paint: 1 = fresh, lower = rubbed off."""
    patches = noise(rng, 18)
    grain = noise(rng, 1.2)
    return np.clip(1 - amount * (0.6 * patches + 0.6 * grain - 0.35), 0, 1)


def dashes(layer: Layer, y: float, dash: float, gap: float, width: float, phase: float = 0) -> None:
    cycle = m(dash + gap)
    assert PERIOD % cycle == 0, "dash cycle must divide the period"
    for x in range(0, PERIOD, cycle):
        x0 = x + m(phase)
        layer.rect(x0, m(y) - m(width) / 2, x0 + m(dash), m(y) + m(width) / 2)


def solid(layer: Layer, y: float, width: float) -> None:
    layer.rect(0, m(y) - m(width) / 2, PERIOD, m(y) + m(width) / 2)


def tyre_tracks(base: np.ndarray, rng: np.random.Generator, lanes: list[tuple[float, float]], strength: float) -> np.ndarray:
    """Darker wheel paths and a faint oil stripe in the middle of every lane."""
    layer = Layer()
    for top, bottom in lanes:
        centre = (top + bottom) / 2
        for off in (-0.85, 0.85):
            solid(layer, centre + off, 0.55)
    tracks = layer.mask(soften=14) * (0.6 + 0.4 * noise(rng, 30))
    oil = Layer()
    for top, bottom in lanes:
        solid(oil, (top + bottom) / 2, 0.4)
    stain = oil.mask(soften=20) * noise(rng, 40)
    return base * (1 - strength * tracks[..., None]) * (1 - 0.25 * stain[..., None])


def glow(mask: np.ndarray, sigma: float) -> np.ndarray:
    g = blur(mask, sigma)
    return g / max(1e-6, g.max())


def light_pools(centres: list[tuple[float, float]], radius: float) -> np.ndarray:
    layer = Layer()
    for x, y in centres:
        layer.ellipse(m(x) - m(radius) * 1.6, m(y) - m(radius), m(x) + m(radius) * 1.6, m(y) + m(radius))
    return glow(layer.mask(), m(radius) * 0.45)


def finish(rgb: np.ndarray, name: str) -> None:
    """Period plus the seam squares, saved as WebP, with a thumbnail."""
    full = np.concatenate([rgb, rgb[:, : SEAM_SQUARES * GRID]], axis=1)
    image = Image.fromarray((np.clip(full, 0, 1) * 255).round().astype(np.uint8), "RGB")
    assert image.size == (WIDTH, HEIGHT)
    OUT.mkdir(parents=True, exist_ok=True)
    image.save(OUT / f"{name}.webp", "WEBP", quality=72, method=6)
    thumb = image.crop((0, 0, m(35), HEIGHT)).resize(THUMB, Image.LANCZOS)
    thumb.save(OUT / f"{name}-thumb.webp", "WEBP", quality=80, method=6)
    print(f"{name}.webp {(OUT / f'{name}.webp').stat().st_size // 1024} kB")


def night_asphalt(rng: np.random.Generator, level: float = 0.2) -> np.ndarray:
    base = grade(tiled(texture("grey")), level, 1.25, (0.92, 0.96, 1.08))
    # Big slow variation — patched and newer asphalt, so the tile does not read.
    patch = noise(rng, 160)
    return np.clip(base * (0.85 + 0.3 * patch[..., None]), 0, 1)


def neon_wash(base: np.ndarray, rng: np.random.Generator, colours: list[tuple[float, float, float]], amount: float) -> np.ndarray:
    """Coloured reflections of signs on wet asphalt — soft, periodic blobs."""
    out = base
    for colour in colours:
        blobs = np.clip(noise(rng, 90) - 0.55, 0, 1) * 2.2
        out = add(out, colour, amount * blobs)
    return out


WHITE = (0.86, 0.87, 0.84)
YELLOW = (0.93, 0.74, 0.22)
CYAN = (0.25, 0.9, 1.0)
MAGENTA = (1.0, 0.25, 0.75)
AMBER = (1.0, 0.68, 0.25)


# ---------------------------------------------------------------- roads


def highway() -> None:
    """Autostrada: three lanes one way, shoulders, concrete barriers.

    Rows (m): verge 0-1.5, barrier 1.5-2, shoulder 2-3, lanes 3-15,
    shoulder 15-16, barrier 16-16.5, verge 16.5-18. Road band 2..16.
    """
    rng = np.random.default_rng(31)
    rgb = night_asphalt(rng, 0.2)
    lanes = [(3, 7), (7, 11), (11, 15)]
    rgb = tyre_tracks(rgb, rng, lanes, 0.22)
    rgb = neon_wash(rgb, rng, [CYAN, MAGENTA], 0.05)

    # Verges: dark gravel from the brown photo.
    gravel = grade(tiled(texture("brown"), 300), 0.1, 1.6, (0.85, 0.85, 0.92))
    verge = np.maximum(rows(0, 1.5), rows(16.5, 18))
    rgb = rgb * (1 - verge[..., None]) + gravel * verge[..., None]

    # Markings: solid edges, 3 m dashes every 8 m between lanes.
    paint = Layer()
    solid(paint, 3.1, 0.2)
    solid(paint, 14.9, 0.2)
    dashes(paint, 7, 3, 5, 0.15)
    dashes(paint, 11, 3, 5, 0.15, phase=4)
    rgb = over(rgb, WHITE, paint.mask(0.8) * wear(rng, 0.5) * 0.92)

    # Concrete barriers with a lit top edge and reflectors every 4 m.
    concrete = grade(tiled(texture("grey"), 120), 0.42, 0.8, (1.0, 1.0, 1.02))
    for top, bottom in ((1.5, 2.0), (16.0, 16.5)):
        band = rows(top, bottom)
        rgb = rgb * (1 - band[..., None]) + concrete * band[..., None]
        rgb = add(rgb, (0.12, 0.12, 0.12), rows(top, top + 0.08))
        rgb = over(rgb, (0.02, 0.02, 0.03), rows(bottom - 0.05, bottom + 0.06) * 0.8)
        dots = Layer()
        for x in range(0, PERIOD, m(4)):
            dots.ellipse(x - 9, m((top + bottom) / 2) - 9, x + 9, m((top + bottom) / 2) + 9)
        reflectors = dots.mask()
        rgb = over(rgb, AMBER, reflectors)
        rgb = add(rgb, AMBER, glow(reflectors, 10) * 0.25)

    # Street lamps on the barriers every 16 m — warm pools on the road.
    pools = light_pools([(x, 3.2) for x in range(0, 32, 16)] + [(x + 8, 14.8) for x in range(0, 32, 16)], 3.2)
    rgb = np.clip(rgb * (1 + 0.55 * pools[..., None]) + np.array(AMBER) * 0.06 * pools[..., None], 0, 1)
    finish(rgb, "highway")


def zebra_zone() -> np.ndarray:
    zone = Layer()
    zone.rect(m(21.6), 0, m(25.4), HEIGHT)
    return zone.mask()


def street() -> None:
    """Ulica miejska 2+2: sidewalks, two lanes each way, double yellow line.

    Rows (m): sidewalk 0-2 (curb 1.8-2), lanes 2-16 (four of 3.5 m), sidewalk
    16-18 (curb 16-16.2). Road band 2..16.
    """
    rng = np.random.default_rng(32)
    rgb = night_asphalt(rng, 0.19)
    lanes = [(2, 5.5), (5.5, 9), (9, 12.5), (12.5, 16)]
    rgb = tyre_tracks(rgb, rng, lanes, 0.2)
    rgb = neon_wash(rgb, rng, [MAGENTA, CYAN, (0.6, 0.35, 1.0)], 0.08)

    # Sidewalks: square slabs, 1 m, with dark joints and a light curb.
    slab = grade(tiled(texture("grey"), 200), 0.3, 0.7, (1.0, 0.98, 0.97))
    walk = np.maximum(rows(0, 2), rows(16, 18))
    rgb = rgb * (1 - walk[..., None]) + slab * walk[..., None]
    joints = Layer()
    for x in range(0, PERIOD, m(1)):
        joints.rect(x - 2, 0, x + 2, m(1.8))
        joints.rect(x - 2, m(16.2), x + 2, HEIGHT)
    joints.rect(0, m(0.9) - 2, PERIOD, m(0.9) + 2)
    joints.rect(0, m(17.1) - 2, PERIOD, m(17.1) + 2)
    rgb = over(rgb, (0.08, 0.08, 0.09), joints.mask(0.6) * 0.7)
    curb = np.maximum(rows(1.8, 2.0), rows(16.0, 16.2))
    rgb = over(rgb, (0.5, 0.5, 0.5), curb * 0.85)
    rgb = over(rgb, (0.03, 0.03, 0.04), np.maximum(rows(1.98, 2.06), rows(16.16, 16.24)) * 0.7)
    # House walls at the very edge of the frame.
    rgb = over(rgb, (0.05, 0.05, 0.07), np.maximum(rows(0, 0.25), rows(17.75, 18)))

    # Markings.
    paint = Layer()
    dashes(paint, 5.5, 3, 5, 0.15)
    dashes(paint, 12.5, 3, 5, 0.15, phase=4)
    # No dash runs through the zebra crossing (22-25 m).
    white = paint.mask(0.8) * (1 - zebra_zone())
    yellow = Layer()
    solid(yellow, 8.85, 0.13)
    solid(yellow, 9.15, 0.13)
    rgb = over(rgb, WHITE, white * wear(rng, 0.7) * 0.9)
    rgb = over(rgb, YELLOW, yellow.mask(0.8) * wear(rng, 0.6) * 0.92)

    # One zebra crossing per period, stripes along the traffic.
    zebra = Layer()
    for y in np.arange(2.3, 15.8, 1.0):
        zebra.rect(m(22), m(y), m(25), m(y + 0.5))
    rgb = over(rgb, WHITE, zebra.mask(0.8) * wear(rng, 0.8) * 0.85)

    # Manholes and storm drains.
    holes = Layer()
    holes.ellipse(m(8) - 35, m(7.2) - 35, m(8) + 35, m(7.2) + 35)
    holes.ellipse(m(28) - 35, m(13.8) - 35, m(28) + 35, m(13.8) + 35)
    rgb = over(rgb, (0.1, 0.1, 0.11), holes.mask(0.8) * 0.9)
    drains = Layer()
    for x in (5, 21):
        drains.rect(m(x), m(2.05), m(x) + 60, m(2.35))
        drains.rect(m(x + 8), m(15.65), m(x + 8) + 60, m(15.95))
    rgb = over(rgb, (0.02, 0.02, 0.025), drains.mask() * 0.9)

    # Shop signs spilling coloured light onto the sidewalks and the outer lanes.
    signs = [(3, 0.3, MAGENTA), (11, 0.3, CYAN), (19, 0.3, YELLOW), (27, 0.3, (0.6, 0.35, 1.0)),
             (7, 17.7, CYAN), (15, 17.7, MAGENTA), (23, 17.7, AMBER), (30, 17.7, CYAN)]
    for x, y, colour in signs:
        spot = Layer()
        spot.ellipse(m(x) - m(2.4), m(y) - m(1.6), m(x) + m(2.4), m(y) + m(1.6))
        rgb = add(rgb, colour, glow(spot.mask(), 70) * 0.32)
        strip = Layer()
        strip.rect(m(x) - m(1.3), m(y) - 10, m(x) + m(1.3), m(y) + 10)
        rgb = over(rgb, colour, strip.mask(1.5))
        rgb = add(rgb, colour, glow(strip.mask(), 12) * 0.45)
    finish(rgb, "street")


def viaduct() -> None:
    """Estakada: three lanes over a drop, neon barriers, the city far below.

    Rows (m): void 0-2.5, barrier 2.5-3, lanes 3-15, barrier 15-15.5,
    void 15.5-18. Road band 3..15.
    """
    rng = np.random.default_rng(33)
    rgb = night_asphalt(rng, 0.21)
    lanes = [(3, 7), (7, 11), (11, 15)]
    rgb = tyre_tracks(rgb, rng, lanes, 0.2)
    rgb = neon_wash(rgb, rng, [CYAN, MAGENTA], 0.06)

    # The city under the viaduct, 50 m down: deep navy haze, lit districts,
    # winding avenues and the odd sign — slightly out of focus.
    city = np.zeros_like(rgb) + np.array((0.012, 0.016, 0.04), dtype=np.float32)
    haze = noise(rng, 120)
    city = add(city, (0.13, 0.05, 0.2), haze * 0.3)
    district = np.clip(noise(rng, 70) - 0.45, 0, 1) * 1.8
    city = add(city, (0.08, 0.06, 0.1), district * 0.5)
    avenues = Layer()
    for top, bottom in ((0.0, 2.5), (15.5, 18.0)):
        for _ in range(2):
            y0 = rng.uniform(m(top) + 30, m(bottom) - 30)
            amp = rng.uniform(15, 45)
            phase = rng.uniform(0, 2 * np.pi)
            cycles = int(rng.integers(1, 4))
            points = [
                (x, y0 + amp * np.sin(2 * np.pi * cycles * x / PERIOD + phase))
                for x in range(0, PERIOD + 1, 40)
            ]
            avenues.line(points, width=7)
        for _ in range(9):
            x = rng.uniform(0, PERIOD)
            y0 = rng.uniform(m(top), m(bottom))
            avenues.line([(x, y0), (x + rng.uniform(-60, 60), y0 + rng.uniform(-110, 110))], width=5)
    lanes_below = avenues.mask(1.5)
    city = add(city, AMBER, glow(lanes_below, 16) * 0.35 + lanes_below * 0.45)
    palette = [CYAN, MAGENTA, AMBER, (0.75, 0.82, 1.0)]
    masks = [Layer() for _ in palette]
    placed = 0
    while placed < 2200:
        x = rng.uniform(0, PERIOD)
        y = rng.uniform(0, m(2.5)) if rng.random() < 0.5 else rng.uniform(m(15.5), HEIGHT)
        if rng.random() > 0.15 + district[int(y) % HEIGHT, int(x) % PERIOD]:
            continue
        r = rng.uniform(1.5, 3.5)
        masks[rng.integers(len(palette))].ellipse(x - r, y - r, x + r, y + r)
        placed += 1
    for colour, layer in zip(palette, masks):
        dots = layer.mask(0.8)
        city = add(city, colour, dots * 0.7 + glow(dots, 8) * 0.25)
    city = blur(city, 1.6)
    void = np.maximum(rows(0, 2.5), rows(15.5, 18))
    rgb = rgb * (1 - void[..., None]) + city * void[..., None]
    # Shadow of the deck on the haze right below the edge.
    rgb = rgb * (1 - 0.5 * (np.maximum(rows(2.0, 2.5), rows(15.5, 16.0)))[..., None])

    # Markings and expansion joints every 16 m.
    paint = Layer()
    solid(paint, 3.3, 0.18)
    solid(paint, 14.7, 0.18)
    dashes(paint, 7, 3, 5, 0.15)
    dashes(paint, 11, 3, 5, 0.15, phase=4)
    rgb = over(rgb, WHITE, paint.mask(0.8) * wear(rng, 0.45) * 0.92)
    joints = Layer()
    for x in range(m(6), PERIOD + m(6), m(16)):
        joints.rect(x - 8, m(3), x + 8, m(15))
    j = joints.mask(0.8)
    rgb = over(rgb, (0.32, 0.33, 0.36), j * 0.9)
    rgb = over(rgb, (0.04, 0.04, 0.05), np.roll(j, 10, axis=1) * 0.5)

    # Neon barriers: dark parapet, cyan tube on the top barrier, magenta below.
    for (top, bottom), colour in (((2.5, 3.0), CYAN), ((15.0, 15.5), MAGENTA)):
        band = rows(top, bottom)
        rgb = over(rgb, (0.1, 0.1, 0.12), band)
        tube = rows((top + bottom) / 2 - 0.05, (top + bottom) / 2 + 0.05)
        rgb = over(rgb, (0.9, 1.0, 1.0), tube * 0.8)
        rgb = add(rgb, colour, glow(tube, 28) * 0.9 + glow(tube, 6) * 0.6)
        posts = Layer()
        for x in range(0, PERIOD, m(2)):
            posts.rect(x - 6, m(top) - 2, x + 6, m(bottom) + 2)
        rgb = over(rgb, (0.04, 0.04, 0.05), posts.mask() * 0.85)
    finish(rgb, "viaduct")


def badlands() -> None:
    """Droga w Badlands: two worn lanes through the desert, sand drifts.

    Rows (m): sand 0-5, road 5-13 (two lanes of 4 m), sand 13-18.
    Road band 4..14 — a car may run on the hard sand next to the asphalt.
    """
    rng = np.random.default_rng(34)
    # Sun-bleached, cracked asphalt — dusk light, so lighter than the city.
    road = grade(tiled(texture("grey")), 0.33, 1.1, (1.04, 0.98, 0.9))
    road = road * (0.85 + 0.3 * noise(rng, 140)[..., None])
    road = tyre_tracks(road, rng, [(5, 9), (9, 13)], 0.12)

    # Cracks: long walks that keep their heading, with the odd branch.
    cracks = Layer()
    for _ in range(46):
        x = rng.uniform(0, PERIOD)
        y = rng.uniform(m(5.3), m(12.7))
        heading = rng.uniform(0, 2 * np.pi)
        width = int(rng.integers(2, 4))
        points = [(x, y)]
        for step in range(int(rng.integers(10, 34))):
            heading += rng.normal(0, 0.45)
            x += 22 * np.cos(heading)
            y = min(max(y + 22 * np.sin(heading), m(5.1)), m(12.9))
            points.append((x, y))
            if step > 3 and rng.random() < 0.08:
                bx, by, bh = x, y, heading + rng.choice([-1.1, 1.1])
                branch = [(bx, by)]
                for _ in range(int(rng.integers(3, 9))):
                    bh += rng.normal(0, 0.4)
                    bx += 18 * np.cos(bh)
                    by = min(max(by + 18 * np.sin(bh), m(5.1)), m(12.9))
                    branch.append((bx, by))
                cracks.line(branch, width=max(1, width - 1))
        cracks.line(points, width=width)
    road = over(road, (0.07, 0.06, 0.05), cracks.mask(0.9) * 0.6)
    # Patches of newer, darker asphalt over the worst bits.
    patches = Layer()
    for x in (4, 13, 27):
        y0 = rng.uniform(5.6, 11.0)
        patches.rect(m(x), m(y0), m(x + rng.uniform(1.5, 3)), m(y0 + rng.uniform(1, 2)))
    road = road * (1 - 0.28 * patches.mask(9)[..., None])

    # Markings: faded yellow centre dashes, no edge lines left.
    paint = Layer()
    dashes(paint, 9, 4, 4, 0.15)
    road = over(road, YELLOW, paint.mask(0.8) * wear(rng, 1.1) * 0.7)

    # Sand: the brown photo lifted and warmed, with ripples and scrub.
    sand = grade(tiled(texture("brown"), 400), 0.52, 1.5, (1.18, 0.98, 0.72))
    ripples = Layer()
    for y in np.arange(0, 18, 0.45):
        points = [(x, m(y) + 18 * np.sin(2 * np.pi * x / m(8))) for x in range(0, PERIOD + 1, 50)]
        ripples.line(points, width=6)
    sand = sand * (1 - 0.08 * ripples.mask(4)[..., None])
    sand = sand * (0.85 + 0.3 * noise(rng, 100)[..., None])

    # Edges of the asphalt are eaten by sand — noisy, wind-blown.
    edge = noise(rng, 22)
    y = np.arange(HEIGHT, dtype=np.float32)[:, None]
    depth_top = (m(5) + 70 * edge) - y
    depth_bottom = y - (m(13) - 70 * edge)
    on_sand = np.clip(np.maximum(depth_top, depth_bottom) / 12 + 0.5, 0, 1)
    drift = np.clip(noise(rng, 30) - 0.62, 0, 1) * 2.5 * rows(5, 13)
    sand_alpha = np.clip(on_sand + drift * 0.8, 0, 1)
    rgb = road * (1 - sand_alpha[..., None]) + sand * sand_alpha[..., None]

    # Scrub: bushes are clumps of small leaves, each with a shadow to the
    # lower right; rocks are few and pale on the lit side.
    scrub = Layer()
    for _ in range(70):
        cx = rng.uniform(0, PERIOD)
        cy = rng.uniform(m(0.3), m(4.2)) if rng.random() < 0.5 else rng.uniform(m(13.8), m(17.7))
        size = rng.uniform(10, 26)
        for _ in range(int(rng.integers(6, 14))):
            ang = rng.uniform(0, 2 * np.pi)
            dist = rng.uniform(0, size)
            r = rng.uniform(3, 7)
            x, y = cx + dist * np.cos(ang), cy + dist * np.sin(ang)
            scrub.ellipse(x - r, y - r, x + r, y + r)
    leaves = scrub.mask(1.0)
    rgb = over(rgb, (0.1, 0.08, 0.05), np.roll(leaves, (8, 8), axis=(0, 1)) * 0.45)
    rgb = over(rgb, (0.24, 0.24, 0.12), leaves * 0.85)
    rocks = Layer()
    for _ in range(26):
        x = rng.uniform(0, PERIOD)
        y = rng.uniform(m(0.3), m(4.3)) if rng.random() < 0.5 else rng.uniform(m(13.7), m(17.7))
        r = rng.uniform(6, 16)
        rocks.ellipse(x - r, y - r * 0.75, x + r, y + r * 0.75)
    stones = rocks.mask(1.2)
    rgb = over(rgb, (0.12, 0.09, 0.06), np.roll(stones, (6, 6), axis=(0, 1)) * 0.5)
    rgb = over(rgb, (0.5, 0.44, 0.36), stones * 0.9)

    # Dusk: warm from the top of the frame, a little darker at the bottom.
    light = np.linspace(1.08, 0.88, HEIGHT, dtype=np.float32)[:, None, None]
    rgb = np.clip(rgb * light * np.array((1.0, 0.94, 0.88), dtype=np.float32), 0, 1)
    finish(rgb, "badlands")


if __name__ == "__main__":
    highway()
    street()
    viaduct()
    badlands()
