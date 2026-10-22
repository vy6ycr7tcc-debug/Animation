"""Fetch Poly Haven ground scans (CC0, 1k) for the regions' own soils and prepare them as the
game's other ground scans were: colour and occlusion divided by a wide wrap-around blur of
themselves (so no tile's broad light and dark reads as a grid across the land), normals with
their low frequencies removed. All are packed at 512 px into one tall image,
public/textures/regions.jpg (512 x 512·14): the colour of each scan (layers 0-6, in the order
below), then its normals (7-13); the game loads it as one texture array (a phone allows ~16
textures to a shader, and the ground already reads 13). Prints each scan's mean brightness, for
the gains in terrain.ts.

  python3 tools/build-ground-scans.py
"""
import io
import json
import sys
import urllib.request

import numpy as np
from PIL import Image, ImageFilter

# game name -> Poly Haven asset
SCANS = {
    "lichen": "aerial_grass_rock",  # E: frost tundra
    "leaves": "dry_decay_leaves",  # NE: autumn forest
    "ash": "burned_ground_01",  # N: volcanic ash
    "moor": "brown_mud_leaves_01",  # NW: heather moor
    "laterite": "red_laterite_soil_stones",  # SW: red rock
    "moss": "forest_leaves_02",  # S: mossland
    "chalk": "ground_grey",  # SE: chalk downs
}


UA = {"User-Agent": "inland-build-tools/1.0"}


def get_url(url: str) -> bytes:
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA)) as r:
        return r.read()


def fetch(url: str) -> Image.Image:
    return Image.open(io.BytesIO(get_url(url)))


def wrap_blur(a: np.ndarray, radius: int) -> np.ndarray:
    """A wide blur that wraps at the edges (the scans tile)."""
    h, w = a.shape[:2]
    big = np.tile(a, (3, 3, 1) if a.ndim == 3 else (3, 3))
    im = Image.fromarray(np.clip(big, 0, 255).astype(np.uint8))
    b = np.asarray(im.filter(ImageFilter.GaussianBlur(radius)), dtype=np.float32)
    return b[h : 2 * h, w : 2 * w]


def high_pass_colour(a: np.ndarray, radius=96) -> np.ndarray:
    lum = a.mean(axis=2, keepdims=True)
    blur = wrap_blur(np.repeat(lum, 3, axis=2), radius)[..., :1]
    mean = lum.mean()
    return np.clip(a * (mean / np.maximum(blur, 1)), 0, 255)


def high_pass_normal(a: np.ndarray, radius=64) -> np.ndarray:
    v = a / 127.5 - 1
    low = wrap_blur(a, radius) / 127.5 - 1
    v[..., :2] = v[..., :2] - low[..., :2]
    v[..., 2] = np.sqrt(np.clip(1 - (v[..., :2] ** 2).sum(-1), 0, 1))
    return np.clip((v + 1) * 127.5, 0, 255)


def main() -> None:
    S = 512
    cols, nors = [], []
    for name, asset in SCANS.items():
        files = json.loads(get_url(f"https://api.polyhaven.com/files/{asset}"))
        get = lambda k: fetch(files[k]["1k"]["jpg"]["url"]).convert("RGB")
        diff = high_pass_colour(np.asarray(get("Diffuse"), dtype=np.float32))
        nor = high_pass_normal(np.asarray(get("nor_gl"), dtype=np.float32))
        small = lambda a: np.asarray(Image.fromarray(a.astype(np.uint8)).resize((S, S), Image.LANCZOS))
        cols.append(small(diff))
        nors.append(small(nor))
        lum = (cols[-1].astype(np.float32) / 255) ** 2.2
        print(f"{name:9s} {asset:26s} mean {float((lum @ np.array([0.3, 0.5, 0.2])).mean()):.4f}", file=sys.stderr)
    atlas = np.concatenate(cols + nors, axis=0)
    Image.fromarray(atlas).save("public/textures/regions.jpg", quality=84, optimize=True, progressive=False)


if __name__ == "__main__":
    main()
