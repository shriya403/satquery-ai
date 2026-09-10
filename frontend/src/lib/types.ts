export type AoiBounds = [number, number, number, number];

export type DemoDataset = {
  dataset_id: string;
  name: string;
  provider: string;
  source_url: string | null;
  licence_or_usage: string;
  acquisition_date: string | null;
  location: string;
  crs: string;
  pixel_size_m: number;
  bounds_wgs84: [number, number, number, number];
  bands: string[];
  preprocessing: string[];
  usage_note: string;
};

export type AnalysisEvidence = {
  source_image: string;
  source_url: string | null;
  acquisition_date: string | null;
  region: string;
  crs: string;
  bands_used: string[];
  algorithms_used: string[];
  thresholds: Record<string, number>;
  coordinates: Record<string, unknown>;
  calculated_area_m2: number | null;
  confidence: number;
  limitations: string[];
  artifact_refs: Record<string, string>;
};

export type OverlayFeature = {
  type: "Feature";
  geometry: GeoJSON.Geometry;
  properties: {
    id: string;
    pixel_count: number;
    area_m2: number;
    area_ha: number;
    confidence: number;
  };
};

export type AnalysisResponse = {
  dataset_id: string;
  concise_answer: string;
  evidence: AnalysisEvidence[];
  overlays: OverlayFeature[];
  metrics: Record<string, unknown>;
  confidence: number;
  warnings: string[];
  follow_up_queries: string[];
  provenance_ledger: Record<string, unknown>;
  judge_trace: {
    user_question?: string;
    generated_plan?: Record<string, unknown>;
    tools_executed?: string[];
    evidence_count?: number;
    overlay_count?: number;
    final_response?: string;
    total_latency_ms?: number;
  };
};
export type OrchestrationTask =
  | "single_image_vqa"
  | "text_guided_grounding"
  | "temporal_change"
  | "optical_sar_fusion"
  | "geospatial_measurement";

export type InputModality = "optical_multispectral" | "sar" | "unknown";
export type SpecialistState = "ready" | "planned";

export type InputInspection = {
  dataset_id: string;
  name: string;
  modality: InputModality;
  acquisition_date: string | null;
  crs: string;
  shape: number[];
  pixel_size_m: number;
  bounds_wgs84: number[];
  bands: string[];
  source_url: string | null;
  metadata_checks: Record<string, boolean>;
};

export type CompatibilityReport = {
  compatible: boolean;
  checks: Array<Record<string, unknown>>;
  warnings: string[];
  blocking_reasons: string[];
};

export type SpecialistSelection = {
  specialist_id: string;
  label: string;
  state: SpecialistState;
  capabilities: string[];
  implementation_note: string;
};

export type OrchestrationPlanResponse = {
  registry_version: string;
  question: string;
  task: OrchestrationTask;
  route_reason: string;
  required_input_count: number;
  inputs: InputInspection[];
  compatibility: CompatibilityReport;
  selected_specialists: SpecialistSelection[];
  selected_tools: string[];
  executable: boolean;
  execution_note: string;
  controller_trace: Array<Record<string, unknown>>;
  internal_reasoning_exposed: boolean;
};

export type SpecialistRegistryItem = {
  specialist_id: string;
  label: string;
  state: SpecialistState;
  capabilities: string[];
  implementation_note: string;
};

export type SpecialistRegistryResponse = {
  registry_version: string;
  specialists: SpecialistRegistryItem[];
};

