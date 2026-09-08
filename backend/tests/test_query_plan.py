import pytest
from pydantic import ValidationError

from satquery.geospatial.raster import UnsupportedBandError, create_synthetic_pune_water_fixture, ensure_required_bands
from satquery.query_planner import UnsupportedQueryError, plan_query
from satquery.schemas import AnalysisEvidence


def test_water_query_plan_is_validated() -> None:
    plan = plan_query("Find water bodies and highlight the largest one")

    assert plan.intent == "spatial_feature_query"
    assert "water" in plan.target_features
    assert "green" in plan.required_bands
    assert "nir" in plan.required_bands
    assert "segment_water" in [tool.value for tool in plan.tools]


def test_unsupported_query_fails_closed() -> None:
    with pytest.raises(UnsupportedQueryError):
        plan_query("Estimate crop yield for next month")


def test_unsupported_band_validation() -> None:
    raster = create_synthetic_pune_water_fixture()

    with pytest.raises(UnsupportedBandError):
        ensure_required_bands(raster, ["green", "thermal"])


def test_confidence_schema_bounds() -> None:
    with pytest.raises(ValidationError):
        AnalysisEvidence(
            source_image="fixture",
            region="test",
            crs="EPSG:32643",
            bands_used=["green", "nir"],
            algorithms_used=["test"],
            confidence=1.2,
        )
