from pathlib import Path

from satquery.analysis.spatial_query import run_query
from satquery.geospatial.raster import DEMO_DATA_DIR, get_demo_dataset, list_demo_datasets


REAL_DATASET_ID = "sentinel2-pune-khadakwasla-2024-03-04"


def test_real_demo_dataset_file_is_packaged() -> None:
    assert (DEMO_DATA_DIR / "registry.json").exists()
    assert (DEMO_DATA_DIR / "sentinel2_pune_khadakwasla_20240304.tif").exists()
    assert Path(DEMO_DATA_DIR / "sentinel2_pune_khadakwasla_20240304.stac-item.json").exists()


def test_real_demo_dataset_loads_with_metadata() -> None:
    summaries = list_demo_datasets()
    ids = {dataset.dataset_id for dataset in summaries}

    assert REAL_DATASET_ID in ids

    raster = get_demo_dataset(REAL_DATASET_ID)
    assert raster.acquisition_date == "2024-03-04T05:43:56.801000Z"
    assert raster.crs == "EPSG:32643"
    assert raster.shape[0] > 100
    assert raster.shape[1] > 100
    assert {"blue", "green", "red", "nir", "swir"}.issubset(set(raster.bands))
    assert raster.checksum_sha256
    assert len(raster.bounds_wgs84) == 4


def test_real_demo_water_query_end_to_end() -> None:
    response = run_query(
        question="Find water bodies in this image, calculate their approximate area, and highlight the largest one.",
        dataset_id=REAL_DATASET_ID,
    )

    assert response.dataset_id == REAL_DATASET_ID
    assert response.metrics["feature_count"] >= 1
    assert response.metrics["total_water_area_m2"] > 0
    assert response.evidence[0].acquisition_date == "2024-03-04T05:43:56.801000Z"
    assert response.evidence[0].source_url
    assert response.overlays
    assert all("synthetic" not in warning.lower() for warning in response.warnings)
