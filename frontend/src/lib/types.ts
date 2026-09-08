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
