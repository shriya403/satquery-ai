from __future__ import annotations

from satquery.schemas import Intent, QueryPlan, ToolName


class UnsupportedQueryError(ValueError):
    pass


def plan_query(question: str) -> QueryPlan:
    normalized = question.strip().lower()

    temporal_terms = [
        "after",
        "before",
        "between",
        "bi-temporal",
        "bitemporal",
        "change",
        "changed",
        "changes",
        "compare",
        "date",
        "dates",
        "decrease",
        "increased",
        "increase",
        "loss",
        "new construction",
        "temporal",
    ]
    if any(term in normalized for term in temporal_terms):
        raise UnsupportedQueryError(
            "Temporal/change analysis is not implemented in the current demo. "
            "Use the supported single-date water-body query, or add a second aligned dataset in the next milestone."
        )

    fusion_terms = ["sar", "radar", "fusion", "cross-modal", "optical and sar", "multispectral evidence", "built-up"]
    if any(term in normalized for term in fusion_terms):
        raise UnsupportedQueryError(
            "Multimodal/SAR fusion and built-up classification are not implemented in the current demo. "
            "The verified workflow is single-image Sentinel-2 water detection using NDWI."
        )

    if any(term in normalized for term in ["water", "river", "lake", "pond", "reservoir"]):
        assumptions = [
            "Interpreted the query as a water-body detection request.",
            "Used NDWI because green and NIR bands are available in the selected dataset.",
            "No per-pixel cloud/shadow mask or ground-truth validation is available in the current demo.",
        ]
        if any(term in normalized for term in ["largest", "biggest", "maximum"]):
            assumptions.append("Requested largest water body will be selected by calculated polygon area.")

        return QueryPlan(
            intent=Intent.spatial_feature_query,
            target_features=["water"],
            spatial_constraints={},
            temporal_constraints={},
            required_bands=["green", "nir"],
            tools=[
                ToolName.inspect_raster_metadata,
                ToolName.validate_crs,
                ToolName.calculate_ndwi,
                ToolName.segment_water,
                ToolName.vectorize_mask,
                ToolName.calculate_polygon_area,
                ToolName.locate_features,
                ToolName.create_map_overlay,
                ToolName.generate_grounded_explanation,
            ],
            assumptions=assumptions,
            expected_outputs=["mask", "polygons", "area_m2", "largest_feature", "confidence", "evidence"],
        )

    raise UnsupportedQueryError(
        "The current demo supports single-image water-body spatial queries only. "
        "Temporal analysis, VQA, vegetation segmentation, built-up detection and SAR fusion are not implemented yet."
    )
