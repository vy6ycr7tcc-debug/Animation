"""The archetypes as glowing carvings, traced from Samuel's Ra tarot photos (reference/IMG_00xx).

Each card's ink is kept as line and everything else (paper, the card's outer frame) is dropped:
the photo is enlarged, its ink found by darkness, broad black fills hollowed to their outline
(so a black pyramid or robe reads as a carved edge, not a blot), and written as a two-channel PNG
(luminance = the line, alpha = a soft glow around it) to public/textures/cards/<numeral>.png.
The game lights the line and the glow in the archetype's colour (world/glyphs.ts).

    pip install pillow numpy && python3 tools/build-card-glyphs.py
"""
import os
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.join(os.path.dirname(__file__), "..")
SRC = os.path.join(ROOT, "reference")
OUT = os.path.join(ROOT, "public", "textures", "cards")

# Which photo is which card (the photos are not in deck order). Where the recorded voice and
# the card differ, the voice wins (VIII Strength with the lion, XI Justice with the scales).
CARDS = {
    "I": 33, "II": 38, "III": 41, "IV": 44, "V": 39, "VI": 50, "VII": 53,
    "VIII": 45, "IX": 47, "X": 42, "XI": 34, "XII": 48, "XIII": 51, "XIV": 54,
    "XV": 37, "XVI": 40, "XVII": 43, "XVIII": 46, "XIX": 49, "XX": 52, "XXI": 55, "XXII": 56,
}
W, H = 480, 840  # output size (the cards are ~0.57 wide to tall)
SCALE = 3  # work at this multiple of the output for smooth lines


def trace(n: int) -> Image.Image:
    im = Image.open(os.path.join(SRC, f"IMG_00{n}.jpeg")).convert("L")
    w, h = im.size
    # inside the card's own frame: drop the outer border and the photo's margins
    ix, iy = int(w * 0.09), int(h * 0.06)
    im = im.crop((ix, iy, w - ix, h - iy)).resize((W * SCALE, H * SCALE), Image.LANCZOS)
    g = np.asarray(im, dtype=np.float32) / 255.0
    # the paper is not quite white and the photo not quite even: judge ink against the local paper
    paper = np.asarray(im.filter(ImageFilter.MaxFilter(31)).filter(ImageFilter.GaussianBlur(24)), dtype=np.float32) / 255.0
    ink = np.clip((paper - g - 0.16) / 0.28, 0, 1)
    # hollow the broad fills: what survives a wide erosion is fill, not line
    ink_img = Image.fromarray((ink * 255).astype(np.uint8))
    core = np.asarray(ink_img.filter(ImageFilter.MinFilter(13)), dtype=np.float32) / 255.0
    core = np.asarray(Image.fromarray((core * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(9)), dtype=np.float32) / 255.0
    line = np.clip(ink - core * 0.82, 0, 1)
    # where hatching is dense (a shaded sky, a textured robe) the lines crowd into a haze of light:
    # dim them there, so the figure's outline carries the drawing
    dens = np.asarray(Image.fromarray((line * 255).astype(np.uint8)).filter(ImageFilter.BoxBlur(18)), dtype=np.float32) / 255.0
    line *= 1 - np.clip((dens - 0.22) / 0.3, 0, 1) * 0.65
    # fade out at the edges, so no scrap of the frame shows as a hard edge
    yy, xx = np.mgrid[0:H * SCALE, 0:W * SCALE]
    ex = np.minimum(xx, W * SCALE - 1 - xx) / (W * SCALE * 0.035)
    ey = np.minimum(yy, H * SCALE - 1 - yy) / (H * SCALE * 0.025)
    line *= np.clip(np.minimum(ex, ey), 0, 1)
    L = Image.fromarray((line * 255).astype(np.uint8)).resize((W, H), Image.LANCZOS)
    glow = L.filter(ImageFilter.GaussianBlur(9))
    ga = np.asarray(glow, dtype=np.float32)
    ga = np.clip(ga / max(1.0, np.percentile(ga, 99.5)) * 255, 0, 255).astype(np.uint8)
    return Image.merge("LA", (L, Image.fromarray(ga)))


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    for numeral, n in CARDS.items():
        out = os.path.join(OUT, f"{numeral}.png")
        trace(n).save(out, optimize=True)
        print(numeral, n, os.path.getsize(out) // 1024, "KB")


if __name__ == "__main__":
    main()
