"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
import {
  AlertTriangle,
  Braces,
  CheckCircle2,
  Database,
  Download,
  Layers,
  Loader2,
  Play,
  Radar,
  Satellite,
  ShieldCheck,
  TimerReset
} from "lucide-react";
import { fetchDemoDatasets, runAnalysis } from "../lib/api";
import { formatDatasetDate, getUnsupportedQueryHint, REAL_DEMO_DATASET_ID, WATER_ANALYSIS_QUERY } from "../lib/satquery";
import type { AnalysisEvidence, AnalysisResponse, DemoDataset, OverlayFeature } from "../lib/types";
import { MapCanvas } from "./MapCanvas";
import { ThemeControl } from "./ThemeControl";

const SAMPLE_QUERIES = [
  {
    label: "Water Area",
    scenario: "Scenario A",
    question: WATER_ANALYSIS_QUERY,
    enabled: true,
    disabledReason: ""
  },
  {
    label: "Date Change",
    scenario: "Scenario B",
    question: "Compare these two dates and identify significant vegetation loss, new construction, or water-boundary change.",
    enabled: false,
    disabledReason: "Needs a second aligned acquisition. Not implemented yet."
  },
  {
    label: "Optical + SAR",
    scenario: "Scenario C",
    question: "Use optical and SAR evidence together to identify built-up and water-covered regions.",
    enabled: false,
    disabledReason: "SAR ingestion and fusion are not implemented yet."
  }
] as const;

const METRIC_LABELS: Record<string, string> = {
  feature_count: "Water polygons displayed",
  total_water_area_ha: "Estimated water area (ha)",
  largest_water_area_ha: "Largest polygon (ha)",
  ndwi_threshold: "NDWI threshold",
  min_component_pixels: "Minimum component pixels"
};

type ApiStatus = "checking" | "online" | "offline";

type WorkspaceState = {
  version: number;
  selectedDatasetId: string;
  question: string;
  showRaster: boolean;
  showOverlay: boolean;
  highlightLargest: boolean;
  overlayOpacity: number;
  selectedFeatureId: string | null;
};

type SampleQuery = (typeof SAMPLE_QUERIES)[number];

type ExportBundle = {
  schema_version: 1;
  exported_at: string;
  displayed_question: string;
  dataset: DemoDataset;
  analysis: AnalysisResponse;
};

const WORKSPACE_STATE_KEY = "satquery-workspace-state";
const WORKSPACE_STATE_VERSION = 1;

function readWorkspaceState(): Partial<WorkspaceState> | null {
  try {
    const raw = window.localStorage.getItem(WORKSPACE_STATE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      if ("version" in parsed && parsed.version !== WORKSPACE_STATE_VERSION) {
        return null;
      }
      return parsed as Partial<WorkspaceState>;
    }
  } catch {
    return null;
  }

  return null;
}

function writeWorkspaceState(state: WorkspaceState): void {
  try {
    window.localStorage.setItem(WORKSPACE_STATE_KEY, JSON.stringify(state));
  } catch {
    // Storage may be blocked; the workspace still works for the current session.
  }
}

function formatMetric(value: unknown): string {
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? value.toLocaleString("en-IN")
      : value.toLocaleString("en-IN", { maximumFractionDigits: 4 });
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return JSON.stringify(value);
}

function exportReport(response: AnalysisResponse | null, question: string, dataset: DemoDataset | null): { initiated: boolean; filename?: string } {
  if (!response || !dataset) {
    return { initiated: false };
  }

  const payload: ExportBundle = {
    schema_version: 1,
    exported_at: new Date().toISOString(),
    displayed_question: question,
    dataset,
    analysis: response
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const filename = `${response.dataset_id}-satquery-water-analysis.json`;
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { initiated: true, filename };
}

function statusLabel(status: ApiStatus): string {
  if (status === "online") {
    return "API online";
  }
  if (status === "offline") {
    return "API unavailable";
  }
  return "Checking API";
}

function evidenceRows(response: AnalysisResponse | null, evidence: AnalysisEvidence | null) {
  if (!response || !evidence) {
    return [];
  }

  const largest = response.overlays[0]?.properties;
  return [
    {
      claim: "Estimated water area",
      source: evidence.source_image,
      method: "NDWI threshold, component filtering, projected polygon area",
      artifact: evidence.artifact_refs.vector_overlay ?? "GeoJSON overlay",
      state: `${formatMetric(response.metrics.total_water_area_ha)} ha in selected region`
    },
    {
      claim: "Largest detected water polygon",
      source: evidence.region,
      method: "Area-ranked vectorized mask component",
      artifact: largest?.id ?? "No feature",
      state: largest ? `${largest.area_ha} ha` : "No polygon returned"
    },
    {
      claim: "Acquisition provenance",
      source: evidence.source_url ?? "Local synthetic fixture",
      method: "Dataset registry and checksum-validated GeoTIFF",
      artifact: evidence.acquisition_date ?? "Synthetic date absent",
      state: evidence.crs
    }
  ];
}

function formatRecordEntries(record: Record<string, unknown>): Array<{ key: string; value: string }> {
  return Object.entries(record).map(([key, value]) => ({
    key,
    value: formatMetric(value)
  }));
}

export function SatQueryWorkspace() {
  const [datasets, setDatasets] = useState<DemoDataset[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState(REAL_DEMO_DATASET_ID);
  const [question, setQuestion] = useState<string>(WATER_ANALYSIS_QUERY);
  const [response, setResponse] = useState<AnalysisResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [apiStatus, setApiStatus] = useState<ApiStatus>("checking");
  const [bootError, setBootError] = useState<string | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [unavailableSelectionMessage, setUnavailableSelectionMessage] = useState<string | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [showRaster, setShowRaster] = useState(true);
  const [showOverlay, setShowOverlay] = useState(true);
  const [highlightLargest, setHighlightLargest] = useState(true);
  const [overlayOpacity, setOverlayOpacity] = useState(0.28);
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);
  const [workspaceStateReady, setWorkspaceStateReady] = useState(false);
  const [urlDatasetParam, setUrlDatasetParam] = useState<string | null>(null);
  const [parameterNotice, setParameterNotice] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const transferredDatasetId = params.get("dataset");
    const transferredQuery = params.get("q");
    const savedState = readWorkspaceState();
    const parameterMessages: string[] = [];

    if (savedState) {
      if (typeof savedState.selectedDatasetId === "string") {
        setSelectedDatasetId(savedState.selectedDatasetId);
      }
      if (typeof savedState.question === "string" && savedState.question.trim()) {
        setQuestion(savedState.question);
      }
      if (typeof savedState.showRaster === "boolean") {
        setShowRaster(savedState.showRaster);
      }
      if (typeof savedState.showOverlay === "boolean") {
        setShowOverlay(savedState.showOverlay);
      }
      if (typeof savedState.highlightLargest === "boolean") {
        setHighlightLargest(savedState.highlightLargest);
      }
      if (
        typeof savedState.overlayOpacity === "number" &&
        Number.isFinite(savedState.overlayOpacity) &&
        savedState.overlayOpacity >= 0.1 &&
        savedState.overlayOpacity <= 0.65
      ) {
        setOverlayOpacity(savedState.overlayOpacity);
      }
      if (typeof savedState.selectedFeatureId === "string" || savedState.selectedFeatureId === null) {
        setSelectedFeatureId(savedState.selectedFeatureId);
      }
    }

    if (transferredDatasetId !== null) {
      const requestedDatasetId = transferredDatasetId.trim();
      if (requestedDatasetId) {
        setSelectedDatasetId(requestedDatasetId);
        setUrlDatasetParam(requestedDatasetId);
      } else {
        parameterMessages.push("The URL dataset parameter was empty; using the saved or default scene.");
      }
    }
    if (transferredQuery !== null) {
      const requestedQuery = transferredQuery.trim();
      if (requestedQuery) {
        setQuestion(requestedQuery);
      } else {
        setQuestion(WATER_ANALYSIS_QUERY);
        parameterMessages.push("The URL q parameter was empty; using the supported water analysis query.");
      }
    }
    setParameterNotice(parameterMessages.length ? parameterMessages.join(" ") : null);
    setWorkspaceStateReady(true);
  }, []);

  useEffect(() => {
    if (!workspaceStateReady) {
      return;
    }

    writeWorkspaceState({
      version: WORKSPACE_STATE_VERSION,
      selectedDatasetId,
      question,
      showRaster,
      showOverlay,
      highlightLargest,
      overlayOpacity,
      selectedFeatureId
    });
  }, [
    workspaceStateReady,
    selectedDatasetId,
    question,
    showRaster,
    showOverlay,
    highlightLargest,
    overlayOpacity,
    selectedFeatureId
  ]);

  useEffect(() => {
    let mounted = true;

    fetchDemoDatasets()
      .then((items) => {
        if (!mounted) {
          return;
        }
        setDatasets(items);
        setApiStatus("online");
        if (!items.some((item) => item.dataset_id === REAL_DEMO_DATASET_ID)) {
          setBootError(
            `The real demo dataset '${REAL_DEMO_DATASET_ID}' is not available. Synthetic data will not be selected automatically.`
          );
        }
      })
      .catch((error: Error) => {
        if (mounted) {
          setApiStatus("offline");
          setBootError(error.message);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!datasets.length || datasets.some((dataset) => dataset.dataset_id === selectedDatasetId)) {
      return;
    }

    const fallbackDatasetId = datasets.find((dataset) => dataset.dataset_id === REAL_DEMO_DATASET_ID)?.dataset_id ?? datasets[0].dataset_id;
    const invalidDatasetId = selectedDatasetId;
    setSelectedDatasetId(fallbackDatasetId);

    if (urlDatasetParam === invalidDatasetId) {
      setParameterNotice((current) =>
        [
          current,
          `The URL dataset parameter '${invalidDatasetId}' is not available; using '${fallbackDatasetId}' instead.`
        ]
          .filter(Boolean)
          .join(" ")
      );
    }
  }, [datasets, selectedDatasetId, urlDatasetParam]);

  const selectedDataset = useMemo(
    () => datasets.find((dataset) => dataset.dataset_id === selectedDatasetId) ?? null,
    [datasets, selectedDatasetId]
  );

  const unsupportedHint = getUnsupportedQueryHint(question);
  const queryNotice = queryError ?? unavailableSelectionMessage ?? unsupportedHint;
  const queryNoticeIsError = Boolean(queryError);
  const evidence = response?.evidence[0] ?? null;
  const tools = response?.judge_trace.tools_executed ?? [];
  const rows = evidenceRows(response, evidence);
  const thresholdRows = evidence ? formatRecordEntries(evidence.thresholds) : [];
  const artifactRows = evidence ? formatRecordEntries(evidence.artifact_refs) : [];
  const analysisStatusMessage = loading
    ? `Running request against ${selectedDataset?.name ?? "selected scene"}...`
    : response
      ? `Analysis complete: ${formatMetric(response.metrics.feature_count)} polygon(s), ${formatMetric(response.metrics.total_water_area_ha)} ha total estimated water area.`
      : "Ready for the supported water-body analysis workflow.";
  const layerControls = [
    { label: "Raster preview", checked: showRaster, setChecked: setShowRaster },
    { label: "Water overlay", checked: showOverlay, setChecked: setShowOverlay },
    { label: "Largest highlight", checked: highlightLargest, setChecked: setHighlightLargest }
  ];

  async function handleRun() {
    if (!selectedDataset || loading) {
      return;
    }

    setLoading(true);
    setQueryError(null);
    setUnavailableSelectionMessage(null);
    setExportMessage(null);
    try {
      const result = await runAnalysis(question, selectedDataset.dataset_id);
      setApiStatus("online");
      setResponse(result);
      setSelectedFeatureId(result.overlays[0]?.properties.id ?? null);
    } catch (error) {
      setResponse(null);
      setSelectedFeatureId(null);
      setQueryError(error instanceof Error ? error.message : "Analysis failed.");
    } finally {
      setLoading(false);
    }
  }

  function clearResultForInputChange(nextQuestion: string) {
    setQuestion(nextQuestion);
    setResponse(null);
    setSelectedFeatureId(null);
    setQueryError(null);
    setUnavailableSelectionMessage(null);
    setExportMessage(null);
  }

  function handleSampleQuery(sample: SampleQuery) {
    if (sample.enabled) {
      clearResultForInputChange(sample.question);
      return;
    }

    setQueryError(null);
    setExportMessage(null);
    setUnavailableSelectionMessage(
      `${sample.label} is unavailable in this milestone: ${sample.disabledReason} The active supported water query is unchanged.`
    );
  }

  function handleQuestionKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      void handleRun();
    }
  }

  function handleExport() {
    try {
      const exported = exportReport(response, question, selectedDataset);
      setExportMessage(
        exported.initiated
          ? `Evidence JSON download initiated: ${exported.filename}.`
          : "Run an analysis before exporting."
      );
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : "Export failed.");
    }
  }

  return (
    <main className="workspace-root theme-transition">
      <header className="workspace-topbar">
        <div className="flex flex-wrap items-center gap-4">
          <Link className="wordmark" href="/">
            <span className="orbital-mark" aria-hidden="true" />
            <span>SatQuery AI</span>
          </Link>
          <Link className="nav-link" href="/">
            Overview
          </Link>
          <div className={`status-pill ${apiStatus === "online" ? "status-online" : apiStatus === "offline" ? "status-error" : "status-warning"}`}>
            <span className="status-dot" aria-hidden="true" />
            {statusLabel(apiStatus)}
          </div>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <span className="muted-text truncate">
            {selectedDataset ? selectedDataset.name : "No scene selected"}
          </span>
          <ThemeControl compact />
          <button className="button button-secondary" type="button" onClick={handleExport} disabled={!response} data-testid="export-json">
            <Download className="h-4 w-4" aria-hidden="true" />
            Export JSON
          </button>
        </div>
      </header>

      <div className="workspace-layout">
        <aside className="panel">
          <div className="panel-scroll">
            <section className="panel-section">
              <div className="panel-heading">
                <Database className="h-4 w-4" aria-hidden="true" />
                Scene Input
              </div>
              {bootError ? (
                <div className="alert error-alert" role="alert">
                  <div className="flex gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{bootError}</span>
                  </div>
                </div>
              ) : null}
              {parameterNotice ? (
                <div className="alert mt-3" role="status" data-testid="url-parameter-notice">
                  <div className="flex gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{parameterNotice}</span>
                  </div>
                </div>
              ) : null}
              <label className="field-label" htmlFor="dataset">
                Active raster
              </label>
              <select
                id="dataset"
                data-testid="dataset-select"
                className="select-field"
                value={selectedDatasetId}
                onChange={(event) => {
                  setSelectedDatasetId(event.target.value);
                  setResponse(null);
                  setSelectedFeatureId(null);
                  setQueryError(null);
                  setUnavailableSelectionMessage(null);
                  setExportMessage(null);
                }}
              >
                {datasets.map((dataset) => (
                  <option key={dataset.dataset_id} value={dataset.dataset_id}>
                    {dataset.name}
                  </option>
                ))}
              </select>
              {!selectedDataset && datasets.length ? (
                <p className="field-note mt-2">Selected dataset is unavailable. Choose an available dataset explicitly.</p>
              ) : null}
            </section>

            {selectedDataset ? (
              <section className="panel-section">
                <div className="panel-heading">
                  <Satellite className="h-4 w-4" aria-hidden="true" />
                  Sensor/Product
                </div>
                <dl className="metadata-list">
                  <div>
                    <dt className="metadata-label">Location</dt>
                    <dd className="metadata-value">{selectedDataset.location}</dd>
                  </div>
                  <div>
                    <dt className="metadata-label">Acquisition</dt>
                    <dd className="metadata-value mono">{formatDatasetDate(selectedDataset.acquisition_date)}</dd>
                  </div>
                  <div>
                    <dt className="metadata-label">CRS / Resolution</dt>
                    <dd className="metadata-value mono">
                      {selectedDataset.crs} | {selectedDataset.pixel_size_m} m
                    </dd>
                  </div>
                  <div>
                    <dt className="metadata-label">Source</dt>
                    <dd className="metadata-value">
                      {selectedDataset.source_url ? (
                        <a className="underline decoration-[var(--accent-primary)] underline-offset-4" href={selectedDataset.source_url} target="_blank" rel="noreferrer">
                          STAC source item
                        </a>
                      ) : (
                        "Generated synthetic fixture"
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="metadata-label">Bands</dt>
                    <dd className="metadata-value band-list">
                      {selectedDataset.bands.map((band) => (
                        <span key={band} className="tag">
                          {band}
                        </span>
                      ))}
                    </dd>
                  </div>
                </dl>
              </section>
            ) : null}

            <section className="panel-section">
              <div className="panel-heading">
                <Layers className="h-4 w-4" aria-hidden="true" />
                Layers
              </div>
              {layerControls.map((control) => (
                <label key={control.label} className="checkbox-row">
                  <span>{control.label}</span>
                  <input
                    type="checkbox"
                    className="checkbox-field"
                    checked={control.checked}
                    onChange={(event) => control.setChecked(event.target.checked)}
                  />
                </label>
              ))}
              <label className="field-label mt-3" htmlFor="overlay-opacity">
                Overlay opacity
              </label>
              <input
                id="overlay-opacity"
                className="range-field"
                type="range"
                min="0.1"
                max="0.65"
                step="0.05"
                value={overlayOpacity}
                onChange={(event) => setOverlayOpacity(Number(event.target.value))}
              />
            </section>

            <section className="panel-section">
              <div className="panel-heading">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                Method Status
              </div>
              <div className="metadata-list">
                <p className="metadata-value">Rule-based water analysis: available.</p>
                <p className="metadata-value">VLM/VQA: not implemented.</p>
                <p className="metadata-value">Temporal change: unavailable until a second aligned acquisition is added.</p>
                <p className="metadata-value">SAR fusion: unavailable until SAR ingestion and preprocessing are verified.</p>
              </div>
            </section>

            <section className="panel-section timeline-panel">
              <div className="panel-heading">
                <TimerReset className="h-4 w-4" aria-hidden="true" />
                Timeline Comparison
              </div>
              <p className="metadata-value">
                Reference acquisition: {selectedDataset ? formatDatasetDate(selectedDataset.acquisition_date) : "none loaded"}.
              </p>
              <p className="field-note mt-2">
                Missing second image. Change analysis requires a spatially aligned image pair with documented acquisition dates, CRS,
                resolution and nodata/cloud handling.
              </p>
            </section>
          </div>
        </aside>

        <section className="map-shell" aria-label="Satellite map and analysis overlays">
          <div className="map-dataset-badge">
            <span className="mono">{selectedDataset?.dataset_id ?? "No dataset loaded"}</span>
          </div>
          <MapCanvas
            dataset={selectedDataset}
            response={response}
            showRaster={showRaster}
            showOverlay={showOverlay}
            highlightLargest={highlightLargest}
            overlayOpacity={overlayOpacity}
            selectedFeatureId={selectedFeatureId}
            onFeatureSelect={setSelectedFeatureId}
          />
        </section>

        <aside className="panel result-panel">
          <div className="panel-scroll">
            <section className="panel-section query-action-section">
              <div className="panel-heading">
                <Radar className="h-4 w-4" aria-hidden="true" />
                Query Composer
              </div>
              <label className="field-label" htmlFor="question">
                Spatial question
              </label>
              <textarea
                id="question"
                data-testid="query-input"
                className="field"
                value={question}
                onChange={(event) => clearResultForInputChange(event.target.value)}
                onKeyDown={handleQuestionKeyDown}
                aria-describedby="query-help"
              />
              <p id="query-help" className="field-note mt-2">
                <span data-testid="analysis-status" role="status">{analysisStatusMessage}</span>
              </p>
              <button
                type="button"
                data-testid="run-analysis"
                className="button button-primary mt-3 w-full"
                onClick={handleRun}
                disabled={loading || !selectedDataset}
                aria-busy={loading}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
                {loading ? "Running analysis" : "Run analysis"}
              </button>
              {queryNotice ? (
                <div className={`alert mt-3 ${queryNoticeIsError ? "error-alert" : ""}`} role={queryNoticeIsError ? "alert" : "status"}>
                  <div className="flex gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{queryNotice}</span>
                  </div>
                </div>
              ) : null}
            </section>

            <section className="panel-section">
              <div className="panel-heading">Scenarios</div>
              <div className="query-chip-grid">
                {SAMPLE_QUERIES.map((sample) => (
                  <button
                    key={sample.label}
                    type="button"
                    className="chip-button"
                    onClick={() => handleSampleQuery(sample)}
                    data-unavailable={!sample.enabled ? "true" : undefined}
                    title={sample.disabledReason || sample.question}
                  >
                    <span className="metadata-label">{sample.scenario}</span>
                    <span className="mt-1 block font-semibold">{sample.label}</span>
                    {!sample.enabled ? <span className="field-note mt-1 block">{sample.disabledReason}</span> : null}
                  </button>
                ))}
              </div>
            </section>

            {exportMessage ? (
              <section className="panel-section">
                <div className="alert" role="status">
                  {exportMessage}
                </div>
              </section>
            ) : null}

            {response ? (
              <section className="panel-section space-y-3">
                <div className="result-card" data-testid="answer-panel">
                  <div className="panel-heading">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    Grounded Answer
                  </div>
                  <p className="leading-7 text-[var(--text-secondary)]">{response.concise_answer}</p>
                </div>

                <div className="metric-grid">
                  {Object.entries(response.metrics)
                    .filter(([key]) => ["feature_count", "total_water_area_ha", "largest_water_area_ha", "ndwi_threshold"].includes(key))
                    .map(([key, value]) => (
                      <div key={key} className="metric-card">
                        <div className="metadata-label">{METRIC_LABELS[key] ?? key.replaceAll("_", " ")}</div>
                        <div className="metric-value">{formatMetric(value)}</div>
                      </div>
                    ))}
                </div>

                <div className="result-card">
                  <div className="panel-heading">Detected Regions</div>
                  <div className="feature-list">
                    {response.overlays.map((feature: OverlayFeature) => (
                      <button
                        key={feature.properties.id}
                        className="feature-button"
                        type="button"
                        aria-pressed={selectedFeatureId === feature.properties.id}
                        onClick={() => setSelectedFeatureId(feature.properties.id)}
                      >
                        <span className="font-semibold">{feature.properties.id}</span>
                        <span className="ml-2 mono">{feature.properties.area_ha} ha</span>
                      </button>
                    ))}
                  </div>
                </div>

                {evidence ? (
                  <details className="result-card evidence-drawer" data-testid="evidence-drawer" open>
                    <summary className="panel-heading">Evidence Drawer</summary>
                    <div className="metadata-list">
                      <p className="metadata-value">Source: {evidence.source_image}</p>
                      <p className="metadata-value">Acquisition: <span className="mono">{formatDatasetDate(evidence.acquisition_date)}</span></p>
                      <p className="metadata-value">Region: {evidence.region}</p>
                      <p className="metadata-value">CRS: <span className="mono">{evidence.crs}</span></p>
                      <p className="metadata-value">Bands: <span className="mono">{evidence.bands_used.join(", ")}</span></p>
                      <p className="metadata-value">Method: {evidence.algorithms_used.join(" -> ")}</p>
                      <p className="metadata-value">Heuristic confidence - uncalibrated: <span className="mono">{Math.round(evidence.confidence * 100)}%</span></p>
                      {thresholdRows.length ? (
                        <div className="mt-2">
                          <div className="metadata-label">Parameters</div>
                          {thresholdRows.map((item) => (
                            <p key={item.key} className="field-note mt-1">
                              <span className="mono">{item.key}</span>: {item.value}
                            </p>
                          ))}
                        </div>
                      ) : null}
                      {artifactRows.length ? (
                        <div className="mt-2">
                          <div className="metadata-label">Result artifacts</div>
                          {artifactRows.map((item) => (
                            <p key={item.key} className="field-note mt-1">
                              <span className="mono">{item.key}</span>: {item.value}
                            </p>
                          ))}
                        </div>
                      ) : null}
                      <div className="mt-2">
                        <div className="metadata-label">Limitations</div>
                        {evidence.limitations.map((limitation) => (
                          <p key={limitation} className="field-note mt-1">
                            {limitation}
                          </p>
                        ))}
                      </div>
                    </div>
                  </details>
                ) : null}
              </section>
            ) : null}
          </div>
        </aside>

        <section className="panel judge-panel" data-testid="judge-trace">
          <div className="panel-scroll">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="panel-heading mb-0">
                <Braces className="h-4 w-4" aria-hidden="true" />
                Judge Mode Trace
              </div>
              <span className="field-note">
                {response?.judge_trace.total_latency_ms
                  ? `${response.judge_trace.total_latency_ms} ms backend latency`
                  : "Run a query to populate the trace"}
              </span>
            </div>
            <div className="trace-grid mt-3">
              <div className="result-card">
                <div className="metadata-label">Generated plan</div>
                <pre className="code-block mt-2">{response ? JSON.stringify(response.judge_trace.generated_plan, null, 2) : "No plan executed yet."}</pre>
              </div>
              <div className="result-card">
                <div className="metadata-label">Tools executed</div>
                <div className="tool-list mt-2">
                  {tools.length ? tools.map((tool) => <span key={tool} className="tag">{tool}</span>) : <span className="field-note">No tools executed yet.</span>}
                </div>
              </div>
              <div className="result-card">
                <div className="metadata-label">Evidence matrix</div>
                {rows.length ? (
                  <div className="mt-2 overflow-auto">
                    <table className="evidence-table">
                      <thead>
                        <tr>
                          <th>Claim</th>
                          <th>Method</th>
                          <th>State</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => (
                          <tr key={row.claim}>
                            <td>{row.claim}</td>
                            <td>{row.method}</td>
                            <td>{row.state}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="field-note mt-2">No evidence rows yet.</p>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
