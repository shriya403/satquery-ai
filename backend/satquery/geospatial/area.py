from __future__ import annotations

from pyproj import CRS, Geod
from shapely.geometry.base import BaseGeometry


def calculate_polygon_area_m2(geometry: BaseGeometry, crs: str) -> float:
    crs_obj = CRS.from_user_input(crs)
    if crs_obj.is_projected:
        return float(abs(geometry.area))

    geod = Geod(ellps="WGS84")
    area_m2, _ = geod.geometry_area_perimeter(geometry)
    return float(abs(area_m2))
