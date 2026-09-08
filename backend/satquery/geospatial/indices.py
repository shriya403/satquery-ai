from __future__ import annotations

import numpy as np


def normalized_difference(numerator_band: np.ndarray, denominator_band: np.ndarray) -> np.ndarray:
    numerator = numerator_band.astype(np.float32)
    denominator = denominator_band.astype(np.float32)
    divisor = numerator + denominator

    with np.errstate(divide="ignore", invalid="ignore"):
        index = (numerator - denominator) / divisor

    index[~np.isfinite(index)] = np.nan
    index[np.isclose(divisor, 0.0)] = np.nan
    return index


def calculate_ndvi(nir: np.ndarray, red: np.ndarray) -> np.ndarray:
    return normalized_difference(nir, red)


def calculate_ndwi(green: np.ndarray, nir: np.ndarray) -> np.ndarray:
    return normalized_difference(green, nir)


def calculate_ndbi(swir: np.ndarray, nir: np.ndarray) -> np.ndarray:
    return normalized_difference(swir, nir)
