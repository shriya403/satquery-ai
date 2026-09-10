from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from satquery.geospatial.raster import RasterBundle, get_demo_dataset
from satquery.schemas import (
    CompatibilityReport,
    InputInspection,
    InputModality,
    OrchestrationPlanResponse,
    OrchestrationRequest,
    OrchestrationTask,
    SpecialistSelection,
    SpecialistState,
)


OPTICAL_BANDS = {
    "blue", "green", "red", "nir", "swir", "swir1", "swir2", "coastal",
}
SAR_BANDS = {"vv", "vh", "hh", "hv", "sigma0", "backscatter"}


@dataclass(frozen=True)
class SpecialistDefinition:
    specialist_id: str
    label: str
    state: SpecialistState
    capabilities: tuple[str, ...]
    implementation_note: str


SPECIALIST_REGISTRY: tuple[SpecialistDefinition, ...] = (
    SpecialistDefinition(
        "raster_inspector",
        "Raster Metadata Inspector",
        SpecialistState.ready,
        ("metadata inspection", "band inventory", "CRS validation", "input compatibility checks"),
        "Implemented with Rasterio-backed dataset loading.",
    ),
    SpecialistDefinition(
        "water_ndwi_specialist",
        "Water NDWI Specialist",
        SpecialistState.ready,
        ("single-image water segmentation", "NDWI calculation", "threshold masking"),
        "Implemented and used by the validated water analysis path.",
    ),
    SpecialistDefinition(
        "geospatial_vectorizer",
        "Geospatial Vector Measurement Specialist",
        SpecialistState.ready,
        ("mask vectorization", "projected polygon area", "WGS84 feature location", "GeoJSON overlays"),
        "Implemented and used by the validated water analysis path.",
    ),
    SpecialistDefinition(
        "evidence_grounder",
        "Evidence Grounding Specialist",
        SpecialistState.ready,
        ("provenance ledger", "execution summary", "limitations", "evidence-grounded response"),
        "Implemented without an external language model in the validated water path.",
    ),
    SpecialistDefinition(
        "rs_vqa_specialist",
        "Remote-Sensing VQA Specialist",
        SpecialistState.planned,
        ("single-image VQA", "scene description", "remote-sensing visual-language reasoning"),
        "Required next milestone; no VLM is claimed as active yet.",
    ),
    SpecialistDefinition(
        "text_grounding_specialist",
        "Text-Guided Grounding Specialist",
        SpecialistState.planned,
        ("language-conditioned region grounding", "bounding boxes or masks"),
        "Required next milestone; current water polygons are task-specific, not a general grounding model.",
    ),
    SpecialistDefinition(
        "temporal_change_specialist",
        "Bi-temporal Change Specialist",
        SpecialistState.planned,
        ("two-date compatibility validation", "change detection", "change localization", "change-VQA"),
        "Required next milestone; no temporal model is claimed as active yet.",
    ),
    SpecialistDefinition(
        "optical_sar_fusion_specialist",
        "Optical-SAR Fusion Specialist",
        SpecialistState.planned,
        ("optical-SAR pair validation", "cross-modal information extraction", "paired-image reasoning"),
        "Required next milestone; no SAR fusion model is claimed as active yet.",
    ),
)


def registry_payload() -> list[dict[str, Any]]:
    return [
        {
            "specialist_id": item.specialist_id,
            "label": item.label,
            "state": item.state.value,
            "capabilities": list(item.capabilities),
            "implementation_note": item.implementation_note,
        }
        for item in SPECIALIST_REGISTRY
    ]


def _registry_item(specialist_id: str) -> SpecialistDefinition:
    for item in SPECIALIST_REGISTRY:
        if item.specialist_id == specialist_id:
            return item
    raise KeyError(specialist_id)


def _infer_modality(raster: RasterBundle) -> InputModality:
    bands = {band.strip().lower() for band in raster.bands.keys()}
    if bands & SAR_BANDS:
        return InputModality.sar
    if bands & OPTICAL_BANDS:
        return InputModality.optical_multispectral
    return InputModality.unknown


def _inspect_dataset(dataset_id: str) -> InputInspection:
    raster = get_demo_dataset(dataset_id)
    modality = _infer_modality(raster)
    return InputInspection(
        dataset_id=raster.dataset_id,
        name=raster.name,
        modality=modality,
        acquisition_date=raster.acquisition_date,
        crs=raster.crs,
        shape=list(raster.shape),
        pixel_size_m=float(raster.transform.pixel_size_x),
        bounds_wgs84=raster.bounds_wgs84,
        bands=sorted(raster.bands.keys()),
        source_url=raster.source_url,
        metadata_checks={
            "has_crs": bool(raster.crs),
            "has_bands": bool(raster.bands),
            "has_spatial_bounds": len(raster.bounds_wgs84) == 4,
            "has_acquisition_date": raster.acquisition_date is not None,
        },
    )


def _bbox_overlap_ratio(first: list[float], second: list[float]) -> float:
    west = max(first[0], second[0])
    south = max(first[1], second[1])
    east = min(first[2], second[2])
    north = min(first[3], second[3])
    if west >= east or south >= north:
        return 0.0

    intersection = (east - west) * (north - south)
    first_area = max((first[2] - first[0]) * (first[3] - first[1]), 0.0)
    second_area = max((second[2] - second[0]) * (second[3] - second[1]), 0.0)
    denominator = min(first_area, second_area)
    if denominator <= 0:
        return 0.0
    return float(max(0.0, min(1.0, intersection / denominator)))


def classify_task(question: str) -> tuple[OrchestrationTask, str]:
    normalized = " ".join(question.strip().lower().split())

    fusion_terms = (
        "optical and sar", "optical + sar", "optical sar", "sar and optical",
        "sar + optical", "cross-modal", "cross modal", "fusion", "radar", "sar",
    )
    if any(term in normalized for term in fusion_terms):
        return (
            OrchestrationTask.optical_sar_fusion,
            "The query explicitly requests SAR/radar or cross-modal optical-SAR reasoning.",
        )

    temporal_terms = (
        "between these two", "between two", "two dates", "two images",
        "before and after", "before/after", "bi-temporal", "bitemporal",
        "multitemporal", "multi-temporal", "changed", "change",
        "compare dates", "compare these", "increase", "decrease", "loss",
        "new construction",
    )
    if any(term in normalized for term in temporal_terms):
        return (
            OrchestrationTask.temporal_change,
            "The query asks for comparison or change reasoning across acquisitions.",
        )

    water_terms = ("water", "river", "lake", "pond", "reservoir")
    measurement_terms = (
        "area", "calculate", "measure", "largest", "biggest", "how large",
        "hectare", "square",
    )
    if any(term in normalized for term in water_terms) and any(
        term in normalized for term in measurement_terms
    ):
        return (
            OrchestrationTask.geospatial_measurement,
            "The query requests a measurable water feature result that matches the validated NDWI/geospatial path.",
        )

    grounding_terms = (
        "highlight", "locate", "where is", "where are", "referred to",
        "mark the", "show me",
    )
    if any(term in normalized for term in grounding_terms):
        return (
            OrchestrationTask.text_guided_grounding,
            "The query asks for language-conditioned spatial localization.",
        )

    vqa_terms = (
        "describe", "what is visible", "what can you see", "major objects",
        "land cover", "scene", "caption", "identify objects", "what is in",
    )
    if any(term in normalized for term in vqa_terms):
        return (
            OrchestrationTask.single_image_vqa,
            "The query asks for semantic interpretation of a single remote-sensing image.",
        )

    return (
        OrchestrationTask.single_image_vqa,
        "No deterministic geospatial specialist matched; the controller routes the request to the general remote-sensing VQA specialist.",
    )


def _selected_specialist_ids(task: OrchestrationTask) -> tuple[str, ...]:
    if task == OrchestrationTask.geospatial_measurement:
        return ("raster_inspector", "water_ndwi_specialist", "geospatial_vectorizer", "evidence_grounder")
    if task == OrchestrationTask.text_guided_grounding:
        return ("raster_inspector", "text_grounding_specialist", "evidence_grounder")
    if task == OrchestrationTask.temporal_change:
        return ("raster_inspector", "temporal_change_specialist", "geospatial_vectorizer", "evidence_grounder")
    if task == OrchestrationTask.optical_sar_fusion:
        return ("raster_inspector", "optical_sar_fusion_specialist", "geospatial_vectorizer", "evidence_grounder")
    return ("raster_inspector", "rs_vqa_specialist", "evidence_grounder")


def _selected_tools(task: OrchestrationTask) -> list[str]:
    if task == OrchestrationTask.geospatial_measurement:
        return [
            "inspect_raster_metadata", "validate_crs", "calculate_ndwi",
            "segment_water", "vectorize_mask", "calculate_polygon_area",
            "locate_features", "create_map_overlay", "generate_grounded_explanation",
        ]
    if task == OrchestrationTask.text_guided_grounding:
        return [
            "inspect_raster_metadata", "validate_crs",
            "text_guided_grounding_model [planned]",
            "create_map_overlay [planned]", "generate_grounded_explanation",
        ]
    if task == OrchestrationTask.temporal_change:
        return [
            "inspect_raster_metadata", "validate_pair_compatibility",
            "detect_temporal_change [planned]", "vectorize_change_regions [planned]",
            "generate_grounded_explanation",
        ]
    if task == OrchestrationTask.optical_sar_fusion:
        return [
            "inspect_raster_metadata", "validate_pair_compatibility",
            "optical_sar_fusion [planned]", "create_map_overlay [planned]",
            "generate_grounded_explanation",
        ]
    return [
        "inspect_raster_metadata", "remote_sensing_vqa_model [planned]",
        "generate_grounded_explanation",
    ]


def _required_input_count(task: OrchestrationTask) -> int:
    return 2 if task in {
        OrchestrationTask.temporal_change,
        OrchestrationTask.optical_sar_fusion,
    } else 1


def _compatibility_report(
    task: OrchestrationTask,
    inspections: list[InputInspection],
) -> CompatibilityReport:
    blocking: list[str] = []
    warnings: list[str] = []
    checks: list[dict[str, Any]] = []

    required_count = _required_input_count(task)
    checks.append({
        "check": "input_count",
        "required": required_count,
        "observed": len(inspections),
        "passed": len(inspections) == required_count,
    })
    if len(inspections) != required_count:
        blocking.append(
            f"{task.value} requires exactly {required_count} input dataset(s); received {len(inspections)}."
        )

    for inspection in inspections:
        metadata_ok = all(
            bool(inspection.metadata_checks[key])
            for key in ("has_crs", "has_bands", "has_spatial_bounds")
        )
        checks.append({
            "check": f"metadata:{inspection.dataset_id}",
            "passed": metadata_ok,
            "modality": inspection.modality.value,
            "crs": inspection.crs,
            "shape": inspection.shape,
        })
        if not metadata_ok:
            blocking.append(f"Dataset {inspection.dataset_id} is missing required spatial metadata.")

    if task == OrchestrationTask.geospatial_measurement and inspections:
        inspection = inspections[0]
        has_green_nir = {"green", "nir"}.issubset({band.lower() for band in inspection.bands})
        optical = inspection.modality == InputModality.optical_multispectral
        checks.append({
            "check": "water_ndwi_requirements",
            "passed": has_green_nir and optical,
            "requires": ["optical/multispectral", "green", "nir"],
            "observed_modality": inspection.modality.value,
            "observed_bands": inspection.bands,
        })
        if not optical:
            blocking.append("Validated water measurement currently requires an optical/multispectral input.")
        if not has_green_nir:
            blocking.append("Validated water measurement requires Green and NIR bands.")

    if len(inspections) == 2:
        first, second = inspections
        crs_match = first.crs == second.crs
        shape_match = first.shape == second.shape
        overlap_ratio = _bbox_overlap_ratio(first.bounds_wgs84, second.bounds_wgs84)
        checks.extend([
            {
                "check": "pair_crs_match",
                "passed": crs_match,
                "first": first.crs,
                "second": second.crs,
            },
            {
                "check": "pair_shape_match",
                "passed": shape_match,
                "first": first.shape,
                "second": second.shape,
            },
            {
                "check": "pair_wgs84_bbox_overlap",
                "passed": overlap_ratio > 0.0,
                "overlap_ratio_of_smaller_bbox": round(overlap_ratio, 6),
            },
        ])
        if overlap_ratio <= 0.0:
            blocking.append("Input pair has no overlapping WGS84 bounding boxes.")
        if not crs_match:
            warnings.append("Input CRS values differ; reprojection/alignment would be required before pixel-level pair analysis.")
        if not shape_match:
            warnings.append("Input raster shapes differ; resampling/alignment would be required before pixel-level pair analysis.")

        if task == OrchestrationTask.temporal_change:
            distinct = (
                first.acquisition_date is not None
                and second.acquisition_date is not None
                and first.acquisition_date != second.acquisition_date
            )
            checks.append({
                "check": "distinct_acquisition_dates",
                "passed": distinct,
                "first": first.acquisition_date,
                "second": second.acquisition_date,
            })
            if not distinct:
                blocking.append("Temporal analysis requires two distinct dated acquisitions.")

        if task == OrchestrationTask.optical_sar_fusion:
            correct_modalities = {first.modality, second.modality} == {
                InputModality.optical_multispectral,
                InputModality.sar,
            }
            checks.append({
                "check": "optical_sar_modalities",
                "passed": correct_modalities,
                "observed": [first.modality.value, second.modality.value],
            })
            if not correct_modalities:
                blocking.append("Optical-SAR fusion requires one optical/multispectral input and one SAR input.")

        warnings.append(
            "Bounding-box/metadata compatibility does not prove pixel-level co-registration; specialist execution must verify alignment before analysis."
        )

    if task == OrchestrationTask.single_image_vqa:
        warnings.append("Remote-sensing VQA specialist is not implemented yet; the controller only exposes the intended route.")
    elif task == OrchestrationTask.text_guided_grounding:
        warnings.append("General text-guided grounding specialist is not implemented yet; existing water polygons are task-specific.")
    elif task == OrchestrationTask.temporal_change:
        warnings.append("Bi-temporal change specialist is not implemented yet; no change result is produced by this routing endpoint.")
    elif task == OrchestrationTask.optical_sar_fusion:
        warnings.append("Optical-SAR fusion specialist is not implemented yet; no fusion result is produced by this routing endpoint.")

    return CompatibilityReport(
        compatible=not blocking,
        checks=checks,
        warnings=warnings,
        blocking_reasons=blocking,
    )


def build_orchestration_plan(request: OrchestrationRequest) -> OrchestrationPlanResponse:
    task, route_reason = classify_task(request.question)

    inspections = [_inspect_dataset(dataset_id) for dataset_id in request.dataset_ids]
    compatibility = _compatibility_report(task, inspections)
    specialist_ids = _selected_specialist_ids(task)
    specialists = [
        SpecialistSelection(
            specialist_id=item.specialist_id,
            label=item.label,
            state=item.state,
            capabilities=list(item.capabilities),
            implementation_note=item.implementation_note,
        )
        for item in (_registry_item(specialist_id) for specialist_id in specialist_ids)
    ]

    all_specialists_ready = all(
        specialist.state == SpecialistState.ready for specialist in specialists
    )
    executable = compatibility.compatible and all_specialists_ready

    if executable:
        execution_note = "This route is executable by the currently validated SatQuery backend."
    else:
        reasons = list(compatibility.blocking_reasons)
        unavailable = [
            specialist.label for specialist in specialists
            if specialist.state != SpecialistState.ready
        ]
        if unavailable:
            reasons.append("Specialist implementation pending: " + ", ".join(unavailable) + ".")
        execution_note = " ".join(reasons) or "The controller produced a route, but specialist execution is not enabled."

    controller_trace = [
        {"stage": "interpret_query", "status": "complete", "result": task.value},
        {
            "stage": "inspect_inputs",
            "status": "complete",
            "result": [
                {
                    "dataset_id": item.dataset_id,
                    "modality": item.modality.value,
                    "bands": item.bands,
                    "crs": item.crs,
                }
                for item in inspections
            ],
        },
        {
            "stage": "compatibility_check",
            "status": "complete",
            "result": {
                "compatible": compatibility.compatible,
                "blocking_reasons": compatibility.blocking_reasons,
            },
        },
        {
            "stage": "select_specialists",
            "status": "complete",
            "result": [
                {"specialist_id": item.specialist_id, "state": item.state.value}
                for item in specialists
            ],
        },
        {
            "stage": "execution_gate",
            "status": "ready" if executable else "blocked",
            "result": execution_note,
        },
    ]

    return OrchestrationPlanResponse(
        registry_version="satquery-specialists-v1",
        question=request.question,
        task=task,
        route_reason=route_reason,
        required_input_count=_required_input_count(task),
        inputs=inspections,
        compatibility=compatibility,
        selected_specialists=specialists,
        selected_tools=_selected_tools(task),
        executable=executable,
        execution_note=execution_note,
        controller_trace=controller_trace,
        internal_reasoning_exposed=False,
    )
