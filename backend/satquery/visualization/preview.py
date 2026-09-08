from __future__ import annotations

from io import BytesIO

import numpy as np
from PIL import Image

from satquery.geospatial.raster import RasterBundle


def _stretch_to_uint8(channel: np.ndarray) -> np.ndarray:
    valid = channel[np.isfinite(channel)]
    if valid.size == 0:
        return np.zeros(channel.shape, dtype=np.uint8)

    low, high = np.nanpercentile(valid, [2, 98])
    if not np.isfinite(low) or not np.isfinite(high) or np.isclose(low, high):
        low = float(np.nanmin(valid))
        high = float(np.nanmax(valid))

    if np.isclose(low, high):
        return np.zeros(channel.shape, dtype=np.uint8)

    stretched = np.clip((channel - low) / (high - low), 0.0, 1.0)
    stretched[~np.isfinite(stretched)] = 0.0
    return (stretched * 255).astype(np.uint8)


def render_preview_png(raster: RasterBundle) -> bytes:
    if {"red", "green", "blue"}.issubset(raster.bands):
        channel_names = ("red", "green", "blue")
    elif {"nir", "green", "red"}.issubset(raster.bands):
        channel_names = ("nir", "green", "red")
    else:
        channel_names = tuple(list(raster.bands.keys())[:3])

    if len(channel_names) < 3:
        first = next(iter(raster.bands.values()))
        channels = [_stretch_to_uint8(first)] * 3
    else:
        channels = [_stretch_to_uint8(raster.bands[name]) for name in channel_names]

    rgb = np.dstack(channels)
    image = Image.fromarray(rgb)
    output = BytesIO()
    image.save(output, format="PNG", optimize=True)
    return output.getvalue()
