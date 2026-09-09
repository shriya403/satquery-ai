from __future__ import annotations

from io import BytesIO

import numpy as np
from PIL import Image

from satquery.geospatial.indices import calculate_ndwi
from satquery.geospatial.masks import segment_water
from satquery.geospatial.raster import RasterBundle, ensure_required_bands


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


def _encode_rgb_png(rgb: np.ndarray) -> bytes:
    image = Image.fromarray(rgb.astype(np.uint8), mode="RGB")
    output = BytesIO()
    image.save(output, format="PNG", optimize=True)
    return output.getvalue()


def _render_single_band(channel: np.ndarray) -> bytes:
    stretched = _stretch_to_uint8(channel)
    return _encode_rgb_png(np.dstack([stretched, stretched, stretched]))


def _render_ndwi(ndwi: np.ndarray) -> bytes:
    # False-colour display only: negative values use a warm ramp, values near
    # zero are neutral, and increasingly positive values move toward cyan/blue.
    # The underlying numerical NDWI array is not modified.
    valid = np.isfinite(ndwi)
    safe = np.where(valid, np.clip(ndwi, -1.0, 1.0), 0.0)
    negative = np.clip(-safe, 0.0, 1.0)
    positive = np.clip(safe, 0.0, 1.0)

    red = 218.0 + 30.0 * negative - 180.0 * positive
    green = 218.0 + 10.0 * negative - 40.0 * positive
    blue = 218.0 - 100.0 * negative + 37.0 * positive

    rgb = np.dstack([red, green, blue])
    rgb[~valid] = 0.0
    return _encode_rgb_png(np.clip(rgb, 0.0, 255.0))


def _render_water_mask(mask: np.ndarray) -> bytes:
    rgb = np.zeros((*mask.shape, 3), dtype=np.uint8)
    rgb[:, :] = (18, 24, 30)
    rgb[mask] = (55, 214, 244)
    return _encode_rgb_png(rgb)


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

    return _encode_rgb_png(np.dstack(channels))


def render_spectral_preview_png(raster: RasterBundle, mode: str) -> bytes:
    normalized_mode = mode.strip().lower()

    if normalized_mode == "rgb":
        return render_preview_png(raster)

    if normalized_mode in {"green", "nir"}:
        ensure_required_bands(raster, [normalized_mode])
        return _render_single_band(raster.bands[normalized_mode])

    if normalized_mode == "ndwi":
        ensure_required_bands(raster, ["green", "nir"])
        ndwi = calculate_ndwi(raster.bands["green"], raster.bands["nir"])
        return _render_ndwi(ndwi)

    if normalized_mode == "water-mask":
        return _render_water_mask(segment_water(raster).mask)

    raise ValueError(
        "Unknown spectral visualization mode. "
        "Supported modes: rgb, green, nir, ndwi, water-mask"
    )
