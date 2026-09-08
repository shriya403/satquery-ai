from satquery.analysis.spatial_query import run_query
from satquery.geospatial.masks import segment_water
from satquery.geospatial.raster import create_synthetic_pune_water_fixture


def test_scenario_a_water_detection_end_to_end() -> None:
    response = run_query(
        question="Find water bodies in this image, calculate their approximate area, and highlight the largest one.",
        dataset_id="synthetic-pune-water-fixture",
    )

    raster = create_synthetic_pune_water_fixture()
    segmentation = segment_water(raster)
    expected_area_m2 = int(segmentation.mask.sum()) * raster.transform.pixel_area_m2

    assert response.metrics["feature_count"] == 2
    assert response.metrics["total_water_area_m2"] == expected_area_m2
    assert response.metrics["largest_water_area_m2"] > response.metrics["total_water_area_m2"] / 2
    assert response.evidence[0].coordinates["largest_feature_id"] == "water-1"
    assert response.evidence[0].coordinates["largest_centroid_lon_lat"][0] > 70
    assert response.evidence[0].coordinates["largest_centroid_lon_lat"][1] > 10
    assert response.confidence >= 0.8
    assert response.provenance_ledger["external_model_used"] is False
