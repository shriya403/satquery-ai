from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from satquery.geospatial.indices import calculate_ndwi
from satquery.geospatial.raster import RasterBundle, ensure_required_bands


@dataclass(frozen=True)
class SegmentationResult:
    mask: np.ndarray
    index: np.ndarray
    threshold: float
    confidence: float
    bands_used: list[str]
    algorithms_used: list[str]


def segment_water(raster: RasterBundle, threshold: float = 0.20) -> SegmentationResult:
    ensure_required_bands(raster, ["green", "nir"])

    ndwi = calculate_ndwi(raster.bands["green"], raster.bands["nir"])
    mask = np.isfinite(ndwi) & (ndwi >= threshold)

    if not np.any(mask):
        confidence = 0.2
    else:
        mean_margin = float(np.nanmean(ndwi[mask] - threshold))
        confidence = float(np.clip(0.55 + mean_margin, 0.0, 0.95))

    return SegmentationResult(
        mask=mask,
        index=ndwi,
        threshold=threshold,
        confidence=confidence,
        bands_used=["green", "nir"],
        algorithms_used=["NDWI=(green-nir)/(green+nir)", f"water_mask=NDWI>={threshold:.2f}"],
    )
