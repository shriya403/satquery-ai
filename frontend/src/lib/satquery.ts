import type { DemoDataset } from "./types";

export const WATER_ANALYSIS_QUERY =
  "Find water bodies in this image, calculate their approximate area, and highlight the largest one.";

export const REAL_DEMO_DATASET_ID = "sentinel2-pune-khadakwasla-2024-03-04";

const TEMPORAL_QUERY_PATTERN = /\b(after|before|between|change|changed|changes|compare|date|dates|loss|temporal)\b/;
const FUSION_QUERY_PATTERN = /\b(sar|radar|fusion|built-up|construction|vegetation|classify|classification)\b/;
const WATER_QUERY_PATTERN = /\b(water|river|lake|pond|reservoir)\b/;

export type DatasetScene = {
  dataset: DemoDataset;
  center: {
    lat: number;
    lon: number;
  };
  isRealScene: boolean;
  supportedAnalysis: string;
};

export function formatDatasetDate(value: string | null): string {
  if (!value) {
    return "Synthetic fixture";
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC"
  }).format(new Date(value));
}

export function formatCoordinate(value: number, axis: "lat" | "lon"): string {
  const suffix = axis === "lat" ? (value >= 0 ? "N" : "S") : value >= 0 ? "E" : "W";
  return `${Math.abs(value).toFixed(4)} ${suffix}`;
}

export function centerFromBounds(bounds: DemoDataset["bounds_wgs84"]): DatasetScene["center"] {
  const [west, south, east, north] = bounds;
  return {
    lat: (south + north) / 2,
    lon: (west + east) / 2
  };
}

export function sceneFromDataset(dataset: DemoDataset): DatasetScene {
  const isRealScene = Boolean(dataset.source_url && dataset.acquisition_date);
  return {
    dataset,
    center: centerFromBounds(dataset.bounds_wgs84),
    isRealScene,
    supportedAnalysis: dataset.bands.includes("green") && dataset.bands.includes("nir")
      ? "Single-date water-body detection with NDWI, polygonization, and projected area"
      : "Metadata preview only; missing green/NIR bands for the verified water workflow"
  };
}

export function getUnsupportedQueryHint(value: string): string | null {
  const normalized = value.toLowerCase();
  const asksForTemporal = TEMPORAL_QUERY_PATTERN.test(normalized);
  const asksForFusion = FUSION_QUERY_PATTERN.test(normalized);
  const asksForWater = WATER_QUERY_PATTERN.test(normalized);

  if (asksForTemporal) {
    return "Temporal/change requests are blocked in this milestone so they cannot be mistaken for single-image water analysis.";
  }
  if (asksForFusion) {
    return "Fusion, SAR, vegetation and built-up workflows are unavailable in the current browser demo.";
  }
  if (!asksForWater) {
    return "The verified workflow currently supports single-image water-body detection only.";
  }
  return null;
}

export function getWorkspaceHandoffQuestion(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || getUnsupportedQueryHint(trimmed)) {
    return WATER_ANALYSIS_QUERY;
  }
  return trimmed;
}

export function buildWorkspaceUrl(datasetId: string, question: string): string {
  const params = new URLSearchParams();
  params.set("dataset", datasetId);
  if (question.trim()) {
    params.set("q", question.trim());
  }
  params.set("source", "earth");
  return `/workspace?${params.toString()}`;
}
