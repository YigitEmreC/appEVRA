"""Draws the Evra app's PNG icons (the same design as icons/icon.svg).

Run from the app folder:  python tools/make_icons.py
"""
import math
from pathlib import Path

from PIL import Image, ImageDraw

NAVY = (21, 27, 46, 255)           # #151B2E
SKY = (154, 175, 221, 255)         # Kawaii Sky Blue #9AAFDD
SKY_GLOW = (154, 175, 221, 36)
SPLASH = (158, 213, 253, 255)      # Splashy Blue #9ED5FD
OUT = Path(__file__).resolve().parent.parent / "icons"


def draw(size: int, maskable: bool = False) -> Image.Image:
    scale = 4  # draw large, then shrink for smooth edges
    s = size * scale
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if maskable:
        d.rectangle([0, 0, s, s], fill=NAVY)
        k = 0.74  # keep the mark inside the safe zone
    else:
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill=NAVY)
        k = 1.0

    u = s / 512 * k            # one design unit
    off = (s - 512 * u) / 2

    def p(x, y):
        return (off + x * u, off + y * u)

    def dot(x, y, r, fill, draw_on=None):
        cx, cy = p(x, y)
        (draw_on or d).ellipse([cx - r * u, cy - r * u, cx + r * u, cy + r * u], fill=fill)

    # The soft glow goes on its own layer so it blends instead of replacing pixels.
    glow = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    dot(256, 256, 168, SKY_GLOW, ImageDraw.Draw(glow))
    img = Image.alpha_composite(img, glow)
    d = ImageDraw.Draw(img)

    # The "e": a bar, then an arc from its right end round to the bottom right.
    w = 44
    x0, y0 = p(150, 262)
    x1, _ = p(362, 262)
    d.line([x0, y0, x1, y0], fill=SKY, width=int(w * u))
    cx, cy = p(256, 262)
    r = 106 * u
    half = w * u / 2
    d.arc([cx - r - half, cy - r - half, cx + r + half, cy + r + half], start=44, end=360, fill=SKY, width=int(w * u))
    end = (256 + 106 * math.cos(math.radians(44)), 262 + 106 * math.sin(math.radians(44)))
    for x, y in [(150, 262), (362, 262), end]:
        dot(x, y, w / 2, SKY)

    dot(352, 160, 22, SPLASH)
    return img.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    for size in (180, 192, 512):
        draw(size).save(OUT / f"icon-{size}.png")
    draw(512, maskable=True).save(OUT / "icon-maskable-512.png")
    print("icons written to", OUT)
