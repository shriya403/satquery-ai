from shapely.geometry import box

from satquery.geospatial.area import calculate_polygon_area_m2


def test_projected_area_uses_crs_units() -> None:
    geometry = box(700000, 2049900, 700100, 2050000)

    assert calculate_polygon_area_m2(geometry, "EPSG:32643") == 10_000.0


def test_geographic_area_is_positive() -> None:
    geometry = box(73.85, 18.50, 73.86, 18.51)

    area = calculate_polygon_area_m2(geometry, "EPSG:4326")

    assert 1_000_000 < area < 1_300_000
