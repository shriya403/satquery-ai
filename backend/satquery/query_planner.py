from __future__ import annotations

from satquery.schemas import Intent, QueryPlan, ToolName


class UnsupportedQueryError(ValueError):
    pass


def plan_query(question: str) -> QueryPlan:
    normalized = question.strip().lower()

    if any(term in normalized for term in ["water", "river", "lake", "pond", "reservoir"]):
        assumptions = [
            "Interpreted the query as a water-body detection request.",
            "Used NDWI because green and NIR bands are available in the selected dataset.",
            "No cloud/shadow mask is available in the Milestone 1 synthetic fixture.",
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
        "Milestone 1 supports water-body spatial queries only. Temporal and fusion intents are planned next."
    )
