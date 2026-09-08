from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from typing import Iterable

import numpy as np
from pyproj import Transformer
from shapely.geometry import box, mapping
from shapely.geometry.base import BaseGeometry
from shapely.ops import transform as transform_geometry
from shapely.ops import unary_union

from satquery.geospatial.area import calculate_polygon_area_m2
from satquery.geospatial.raster import PixelTransform


@dataclass(frozen=True)
class MaskFeature:
    feature_id: str
    pixel_count: int
    geometry_projected: BaseGeometry
    geometry_wgs84: BaseGeometry
    area_m2: float
    confidence: float

    @property
    def centroid_lon_lat(self) -> list[float]:
        centroid = self.geometry_wgs84.centroid
        return [float(centroid.x), float(centroid.y)]

    @property
    def bbox_lon_lat(self) -> list[float]:
        return [float(value) for value in self.geometry_wgs84.bounds]

    def to_geojson_feature(self) -> dict:
        return {
            "type": "Feature",
            "geometry": mapping(self.geometry_wgs84),
            "properties": {
                "id": self.feature_id,
                "pixel_count": self.pixel_count,
                "area_m2": round(self.area_m2, 2),
                "area_ha": round(self.area_m2 / 10_000.0, 4),
                "confidence": round(self.confidence, 3),
            },
        }


def _neighbors(row: int, col: int, height: int, width: int) -> Iterable[tuple[int, int]]:
    for next_row, next_col in ((row - 1, col), (row + 1, col), (row, col - 1), (row, col + 1)):
        if 0 <= next_row < height and 0 <= next_col < width:
            yield next_row, next_col


def connected_components(mask: np.ndarray) -> list[list[tuple[int, int]]]:
    if mask.ndim != 2:
        raise ValueError("Mask must be a 2D array")

    height, width = mask.shape
    visited = np.zeros(mask.shape, dtype=bool)
    components: list[list[tuple[int, int]]] = []

    for row in range(height):
        for col in range(width):
            if visited[row, col] or not bool(mask[row, col]):
                continue

            component: list[tuple[int, int]] = []
            queue: deque[tuple[int, int]] = deque([(row, col)])
            visited[row, col] = True

            while queue:
                current_row, current_col = queue.popleft()
                component.append((current_row, current_col))

                for next_row, next_col in _neighbors(current_row, current_col, height, width):
                    if not visited[next_row, next_col] and bool(mask[next_row, next_col]):
                        visited[next_row, next_col] = True
                        queue.append((next_row, next_col))

            components.append(component)

    return components


def _component_to_polygon(component: list[tuple[int, int]], pixel_transform: PixelTransform) -> BaseGeometry:
    pixel_polygons = [box(*pixel_transform.pixel_bounds(row, col)) for row, col in component]
    return unary_union(pixel_polygons)


def _to_wgs84(geometry: BaseGeometry, source_crs: str) -> BaseGeometry:
    transformer = Transformer.from_crs(source_crs, "EPSG:4326", always_xy=True)
    return transform_geometry(transformer.transform, geometry)


def vectorize_mask(
    mask: np.ndarray,
    pixel_transform: PixelTransform,
    source_crs: str,
    base_confidence: float,
    min_pixels: int = 1,
) -> list[MaskFeature]:
    detected_features: list[MaskFeature] = []
    for index, component in enumerate(connected_components(mask), start=1):
        if len(component) < min_pixels:
            continue

        projected = _component_to_polygon(component, pixel_transform)
        area_m2 = calculate_polygon_area_m2(projected, source_crs)
        confidence = float(max(0.0, min(base_confidence, 1.0)))
        detected_features.append(
            MaskFeature(
                feature_id=f"detected-{index}",
                pixel_count=len(component),
                geometry_projected=projected,
                geometry_wgs84=_to_wgs84(projected, source_crs),
                area_m2=area_m2,
                confidence=confidence,
            )
        )

    ranked_features: list[MaskFeature] = []
    for rank, feature in enumerate(sorted(detected_features, key=lambda item: item.area_m2, reverse=True), start=1):
        ranked_features.append(
            MaskFeature(
                feature_id=f"water-{rank}",
                pixel_count=feature.pixel_count,
                geometry_projected=feature.geometry_projected,
                geometry_wgs84=feature.geometry_wgs84,
                area_m2=feature.area_m2,
                confidence=feature.confidence,
            )
        )

    return ranked_features
