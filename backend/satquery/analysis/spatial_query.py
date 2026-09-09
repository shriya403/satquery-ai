from __future__ import annotations

from time import perf_counter
from typing import Any

import numpy as np
from pyproj import Transformer

from satquery import __version__
from satquery.geospatial.masks import segment_water
from satquery.geospatial.raster import RasterBundle, ensure_required_bands, get_demo_dataset
from satquery.geospatial.vectorize import MaskFeature, vectorize_mask
from satquery.query_planner import plan_query
from satquery.schemas import AnalysisEvidence, AnalysisResponse, OverlayFeature, QueryPlan


AoiBounds = tuple[float, float, float, float]


class InvalidAnalysisOptionError(ValueError):
    pass


def _round_metric(value: float) -> float:
    return round(float(value), 4)


def _parse_aoi_bbox(
    analysis_options: dict[str, Any],
    raster: RasterBundle,
) -> AoiBounds | None:
    raw = analysis_options.get("aoi_bbox_wgs84")
    if raw is None:
        return None

    if not isinstance(raw, (list, tuple)) or len(raw) != 4:
        raise InvalidAnalysisOptionError(
            "analysis_options.aoi_bbox_wgs84 must be [west, south, east, north]."
        )

    try:
        west, south, east, north = (float(value) for value in raw)
    except (TypeError, ValueError) as exc:
        raise InvalidAnalysisOptionError(
            "AOI bounds must contain four finite numeric coordinates."
        ) from exc

    values = np.asarray([west, south, east, north], dtype=np.float64)
    if not np.all(np.isfinite(values)):
        raise InvalidAnalysisOptionError("AOI bounds must be finite numeric coordinates.")
    if not (-180.0 <= west <= 180.0 and -180.0 <= east <= 180.0):
        raise InvalidAnalysisOptionError("AOI longitude must be within [-180, 180].")
    if not (-90.0 <= south <= 90.0 and -90.0 <= north <= 90.0):
        raise InvalidAnalysisOptionError("AOI latitude must be within [-90, 90].")
    if west >= east or south >= north:
        raise InvalidAnalysisOptionError(
            "AOI requires west < east and south < north."
        )

    dataset_west, dataset_south, dataset_east, dataset_north = raster.bounds_wgs84
    clipped_west = max(west, dataset_west)
    clipped_south = max(south, dataset_south)
    clipped_east = min(east, dataset_east)
    clipped_north = min(north, dataset_north)

    if clipped_west >= clipped_east or clipped_south >= clipped_north:
        raise InvalidAnalysisOptionError(
            "Selected AOI does not intersect the active dataset."
        )

    return (
        float(clipped_west),
        float(clipped_south),
        float(clipped_east),
        float(clipped_north),
    )


def _aoi_pixel_mask(raster: RasterBundle, bounds: AoiBounds) -> np.ndarray:
    west, south, east, north = bounds
    height, width = raster.shape

    xs = raster.transform.origin_x + (
        np.arange(width, dtype=np.float64) + 0.5
    ) * raster.transform.pixel_size_x
    ys = raster.transform.origin_y - (
        np.arange(height, dtype=np.float64) + 0.5
    ) * raster.transform.pixel_size_y
    projected_x, projected_y = np.meshgrid(xs, ys)

    transformer = Transformer.from_crs(
        raster.crs,
        "EPSG:4326",
        always_xy=True,
    )
    longitudes, latitudes = transformer.transform(projected_x, projected_y)

    return (
        (longitudes >= west)
        & (longitudes <= east)
        & (latitudes >= south)
        & (latitudes <= north)
    )


def _metadata_ledger(raster: RasterBundle) -> dict[str, Any]:
    return {
        "dataset_id": raster.dataset_id,
        "name": raster.name,
        "provider": raster.provider,
        "usage_note": raster.usage_note,
        "acquisition_date": raster.acquisition_date,
        "location": raster.location,
        "crs": raster.crs,
        "pixel_size_m": raster.transform.pixel_size_x,
        "shape": list(raster.shape),
        "bands": dict(raster.band_definitions),
    }


def _largest_feature(features: list[MaskFeature]) -> MaskFeature | None:
    if not features:
        return None
    return max(features, key=lambda feature: feature.area_m2)


def _build_water_evidence(
    raster: RasterBundle,
    plan: QueryPlan,
    features: list[MaskFeature],
    threshold: float,
    min_component_pixels: int,
    confidence: float,
    aoi_bbox_wgs84: AoiBounds | None = None,
) -> AnalysisEvidence:
    largest = _largest_feature(features)
    total_area_m2 = sum(feature.area_m2 for feature in features)

    coordinates: dict[str, Any] = {
        "crs_display": "EPSG:4326",
        "feature_count": len(features),
    }
    if largest:
        coordinates.update(
            {
                "largest_feature_id": largest.feature_id,
                "largest_centroid_lon_lat": largest.centroid_lon_lat,
                "largest_bbox_lon_lat": largest.bbox_lon_lat,
            }
        )
    if aoi_bbox_wgs84 is not None:
        coordinates["aoi_bbox_wgs84"] = list(aoi_bbox_wgs84)

    limitations = [
        "Water mask uses an NDWI threshold; turbid water, terrain shadow, dark roofs, or wet soil can be confused with water.",
        "No atmospheric, terrain, or independent ground-truth validation is evaluated in the current pipeline.",
        "Water confidence is based on NDWI margin and data availability, not a trained validation dataset.",
    ]
    if aoi_bbox_wgs84 is not None:
        limitations.append(
            "AOI analysis uses a user-selected rectangular WGS84 bounding box; pixels are included by pixel-centre location."
        )
    if raster.extra_metadata and raster.extra_metadata.get("cloud_cover_percent") is not None:
        limitations.append(
            f"Source STAC item reports tile-level cloud cover {raster.extra_metadata['cloud_cover_percent']}%, "
            "but no per-pixel cloud/shadow mask is applied yet."
        )
    if "synthetic" in raster.usage_note.lower():
        limitations.append("Synthetic fixture only; not a real satellite acquisition.")

    return AnalysisEvidence(
        source_image=raster.name,
        source_url=raster.source_url,
        acquisition_date=raster.acquisition_date,
        region=raster.location,
        crs=raster.crs,
        bands_used=plan.required_bands,
        algorithms_used=[
            "NDWI=(green-nir)/(green+nir)",
            "Thresholded NDWI water mask",
            *(
                ["WGS84 rectangular AOI mask applied before component labeling/vectorization"]
                if aoi_bbox_wgs84 is not None
                else []
            ),
            "4-connected component labeling",
            "Pixel-edge polygon union",
            "Projected CRS area calculation",
        ],
        thresholds={"ndwi_water": threshold, "min_component_pixels": float(min_component_pixels)},
        coordinates=coordinates,
        calculated_area_m2=_round_metric(total_area_m2),
        confidence=confidence,
        limitations=limitations,
        artifact_refs={
            "mask": f"memory://{raster.dataset_id}/water-mask",
            "vector_overlay": f"memory://{raster.dataset_id}/water-polygons.geojson",
        },
    )


def _run_water_analysis(
    question: str,
    raster: RasterBundle,
    started_at: float,
    analysis_options: dict[str, Any] | None = None,
) -> AnalysisResponse:
    options = analysis_options or {}
    plan = plan_query(question)
    ensure_required_bands(raster, plan.required_bands)

    aoi_bbox_wgs84 = _parse_aoi_bbox(options, raster)
    if aoi_bbox_wgs84 is not None:
        plan.spatial_constraints["aoi_bbox_wgs84"] = list(aoi_bbox_wgs84)

    is_synthetic = "synthetic" in raster.usage_note.lower()
    min_component_pixels = 25
    segmentation = segment_water(raster)
    analysis_confidence = segmentation.confidence if is_synthetic else min(segmentation.confidence, 0.82)

    analysis_mask = segmentation.mask
    aoi_pixel_count = int(np.prod(raster.shape))
    if aoi_bbox_wgs84 is not None:
        spatial_mask = _aoi_pixel_mask(raster, aoi_bbox_wgs84)
        aoi_pixel_count = int(np.count_nonzero(spatial_mask))
        analysis_mask = segmentation.mask & spatial_mask

    features = vectorize_mask(
        analysis_mask,
        raster.transform,
        raster.crs,
        base_confidence=analysis_confidence,
        min_pixels=min_component_pixels,
    )

    largest = _largest_feature(features)
    total_area_m2 = sum(feature.area_m2 for feature in features)
    total_pixels = int(np.count_nonzero(analysis_mask))
    largest_area_m2 = largest.area_m2 if largest else 0.0
    confidence = analysis_confidence if features else 0.2

    overlays = [OverlayFeature(**feature.to_geojson_feature()) for feature in features]
    evidence = _build_water_evidence(
        raster=raster,
        plan=plan,
        features=features,
        threshold=segmentation.threshold,
        min_component_pixels=min_component_pixels,
        confidence=confidence,
        aoi_bbox_wgs84=aoi_bbox_wgs84,
    )

    elapsed_ms = round((perf_counter() - started_at) * 1000, 2)
    largest_text = (
        f" The largest detected polygon is {largest.feature_id} at approximately "
        f"{largest_area_m2 / 10_000.0:.3f} hectares."
        if largest
        else " No water polygon passed the threshold."
    )

    warnings = [
        "Current planner is deterministic keyword parsing; LLM/VLM planning is not enabled yet.",
    ]
    if "synthetic" in raster.usage_note.lower():
        warnings.insert(0, "This response is generated from a synthetic calculation fixture, not real satellite imagery.")

    return AnalysisResponse(
        dataset_id=raster.dataset_id,
        concise_answer=(
            f"Detected {len(features)} water-body region(s) "
            f"{'inside the selected AOI ' if aoi_bbox_wgs84 is not None else ''}"
            f"with an approximate total area of "
            f"{total_area_m2 / 10_000.0:.3f} hectares using NDWI thresholding."
            f"{largest_text}"
        ),
        evidence=[evidence],
        overlays=overlays,
        metrics={
            "feature_count": len(features),
            "water_pixels": total_pixels,
            "pixel_area_m2": raster.transform.pixel_area_m2,
            "total_water_area_m2": _round_metric(total_area_m2),
            "total_water_area_ha": _round_metric(total_area_m2 / 10_000.0),
            "largest_water_area_m2": _round_metric(largest_area_m2),
            "largest_water_area_ha": _round_metric(largest_area_m2 / 10_000.0),
            "ndwi_threshold": segmentation.threshold,
            "min_component_pixels": min_component_pixels,
            "analysis_scope": "selected_aoi" if aoi_bbox_wgs84 is not None else "full_scene",
            "aoi_applied": aoi_bbox_wgs84 is not None,
            "aoi_pixel_count": aoi_pixel_count,
            "aoi_bbox_wgs84": list(aoi_bbox_wgs84) if aoi_bbox_wgs84 is not None else None,
        },
        confidence=confidence,
        warnings=warnings,
        follow_up_queries=[
            "Compare this water boundary against a later date.",
            "Classify vegetation and built-up regions in the same scene.",
            "Export the query plan and evidence ledger as a report.",
        ],
        provenance_ledger={
            "satquery_version": __version__,
            "dataset": _metadata_ledger(raster),
            "query_plan": plan.model_dump(mode="json"),
            "processing_steps": [
                "inspect_raster_metadata",
                "validate_crs",
                "calculate_ndwi",
                "segment_water",
                "vectorize_mask",
                "calculate_polygon_area",
                "locate_features",
                "create_map_overlay",
                "generate_grounded_explanation",
            ],
            "execution_time_ms": elapsed_ms,
            "analysis_options": {
                "aoi_bbox_wgs84": list(aoi_bbox_wgs84) if aoi_bbox_wgs84 is not None else None,
            },
            "external_model_used": False,
        },
        judge_trace={
            "user_question": question,
            "generated_plan": plan.model_dump(mode="json"),
            "tools_executed": [tool.value for tool in plan.tools],
            "evidence_count": 1,
            "overlay_count": len(overlays),
            "analysis_scope": "selected_aoi" if aoi_bbox_wgs84 is not None else "full_scene",
            "aoi_bbox_wgs84": list(aoi_bbox_wgs84) if aoi_bbox_wgs84 is not None else None,
            "final_response": "Grounded response created from NDWI mask, vector polygons, and projected area.",
            "total_latency_ms": elapsed_ms,
        },
    )


def run_query(
    question: str,
    dataset_id: str,
    analysis_options: dict[str, Any] | None = None,
) -> AnalysisResponse:
    started_at = perf_counter()
    raster = get_demo_dataset(dataset_id)
    return _run_water_analysis(
        question=question,
        raster=raster,
        started_at=started_at,
        analysis_options=analysis_options,
    )
