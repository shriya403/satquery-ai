from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, field_validator


class Intent(str, Enum):
    spatial_feature_query = "spatial_feature_query"
    temporal_change = "temporal_change"
    fusion_classification = "fusion_classification"


class OrchestrationTask(str, Enum):
    single_image_vqa = "single_image_vqa"
    text_guided_grounding = "text_guided_grounding"
    temporal_change = "temporal_change"
    optical_sar_fusion = "optical_sar_fusion"
    geospatial_measurement = "geospatial_measurement"


class InputModality(str, Enum):
    optical_multispectral = "optical_multispectral"
    sar = "sar"
    unknown = "unknown"


class SpecialistState(str, Enum):
    ready = "ready"
    planned = "planned"


class OrchestrationRequest(BaseModel):
    question: str = Field(min_length=3, max_length=1000)
    dataset_ids: list[str] = Field(min_length=1, max_length=2)


class InputInspection(BaseModel):
    dataset_id: str
    name: str
    modality: InputModality
    acquisition_date: str | None = None
    crs: str
    shape: list[int]
    pixel_size_m: float
    bounds_wgs84: list[float]
    bands: list[str]
    source_url: str | None = None
    metadata_checks: dict[str, bool] = Field(default_factory=dict)


class CompatibilityReport(BaseModel):
    compatible: bool
    checks: list[dict[str, Any]] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    blocking_reasons: list[str] = Field(default_factory=list)


class SpecialistSelection(BaseModel):
    specialist_id: str
    label: str
    state: SpecialistState
    capabilities: list[str] = Field(default_factory=list)
    implementation_note: str


class OrchestrationPlanResponse(BaseModel):
    registry_version: str
    question: str
    task: OrchestrationTask
    route_reason: str
    required_input_count: int
    inputs: list[InputInspection]
    compatibility: CompatibilityReport
    selected_specialists: list[SpecialistSelection]
    selected_tools: list[str]
    executable: bool
    execution_note: str
    controller_trace: list[dict[str, Any]] = Field(default_factory=list)
    internal_reasoning_exposed: bool = False


class ToolName(str, Enum):
    inspect_raster_metadata = "inspect_raster_metadata"
    validate_crs = "validate_crs"
    calculate_ndvi = "calculate_ndvi"
    calculate_ndwi = "calculate_ndwi"
    calculate_ndbi = "calculate_ndbi"
    segment_water = "segment_water"
    classify_land_cover = "classify_land_cover"
    detect_temporal_change = "detect_temporal_change"
    vectorize_mask = "vectorize_mask"
    calculate_polygon_area = "calculate_polygon_area"
    locate_features = "locate_features"
    compare_regions = "compare_regions"
    create_map_overlay = "create_map_overlay"
    generate_grounded_explanation = "generate_grounded_explanation"
    export_analysis_report = "export_analysis_report"


class QueryPlan(BaseModel):
    intent: Intent
    target_features: list[str] = Field(min_length=1)
    spatial_constraints: dict[str, Any] = Field(default_factory=dict)
    temporal_constraints: dict[str, Any] = Field(default_factory=dict)
    required_bands: list[str] = Field(default_factory=list)
    tools: list[ToolName] = Field(min_length=1)
    assumptions: list[str] = Field(default_factory=list)
    expected_outputs: list[str] = Field(default_factory=list)

    @field_validator("target_features", "required_bands", "assumptions", "expected_outputs")
    @classmethod
    def strip_strings(cls, values: list[str]) -> list[str]:
        return [value.strip() for value in values if value.strip()]


class AnalysisEvidence(BaseModel):
    source_image: str
    source_url: str | None = None
    acquisition_date: str | None = None
    region: str
    crs: str
    bands_used: list[str]
    algorithms_used: list[str]
    thresholds: dict[str, float] = Field(default_factory=dict)
    coordinates: dict[str, Any] = Field(default_factory=dict)
    calculated_area_m2: float | None = None
    confidence: float = Field(ge=0.0, le=1.0)
    limitations: list[str] = Field(default_factory=list)
    artifact_refs: dict[str, str] = Field(default_factory=dict)


class OverlayFeature(BaseModel):
    type: str = "Feature"
    geometry: dict[str, Any]
    properties: dict[str, Any]


class AnalysisResponse(BaseModel):
    dataset_id: str
    concise_answer: str
    evidence: list[AnalysisEvidence]
    overlays: list[OverlayFeature]
    metrics: dict[str, Any]
    confidence: float = Field(ge=0.0, le=1.0)
    warnings: list[str] = Field(default_factory=list)
    follow_up_queries: list[str] = Field(default_factory=list)
    provenance_ledger: dict[str, Any] = Field(default_factory=dict)
    judge_trace: dict[str, Any] = Field(default_factory=dict)


class QueryRequest(BaseModel):
    question: str = Field(min_length=3, max_length=1000)
    dataset_id: str = "synthetic-pune-water-fixture"
    analysis_options: dict[str, Any] = Field(default_factory=dict)


class DemoDatasetSummary(BaseModel):
    dataset_id: str
    name: str
    provider: str
    source_url: str | None = None
    licence_or_usage: str
    acquisition_date: str | None
    location: str
    crs: str
    pixel_size_m: float
    bounds_wgs84: list[float]
    bands: list[str]
    preprocessing: list[str] = Field(default_factory=list)
    usage_note: str

class VqaRequest(BaseModel):
    dataset_id: str
    question: str = Field(min_length=3, max_length=1000)


class VqaStatusResponse(BaseModel):
    enabled: bool
    dependencies_available: bool
    model_id: str
    requested_device: str
    loaded: bool
    remote_sensing_adapted: bool
    adaptation_note: str
    note: str


class VqaResponse(BaseModel):
    dataset_id: str
    question: str
    answer: str
    model_id: str
    model_family: str
    remote_sensing_adapted: bool
    adaptation_note: str
    source_image: str
    source_url: str | None = None
    device: str
    dtype: str
    latency_ms: float
    max_new_tokens: int
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    confidence_note: str
    provenance: dict[str, Any] = Field(default_factory=dict)
    limitations: list[str] = Field(default_factory=list)

