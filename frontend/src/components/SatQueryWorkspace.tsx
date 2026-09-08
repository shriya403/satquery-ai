"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Braces,
  CheckCircle2,
  Database,
  Download,
  Layers,
  Loader2,
  MapPinned,
  Play,
  Radar,
  ShieldCheck
} from "lucide-react";
import { fetchDemoDatasets, runAnalysis } from "@/lib/api";
import type { AnalysisResponse, DemoDataset } from "@/lib/types";
import { MapCanvas } from "./MapCanvas";

const SAMPLE_QUERIES = [
  {
    label: "Water Area",
    scenario: "Scenario A",
    question: "Find water bodies in this image, calculate their approximate area, and highlight the largest one."
  },
  {
    label: "Date Change",
    scenario: "Scenario B",
    question: "Compare these two dates and identify significant vegetation loss, new construction, or water-boundary change."
  },
  {
    label: "Band Fusion",
    scenario: "Scenario C",
    question: "Use optical and multispectral evidence to determine whether this region is water, vegetation, built-up land, or uncertain."
  }
] as const;

function formatDate(value: string | null): string {
  if (!value) {
    return "Synthetic fixture";
  }
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC"
  }).format(new Date(value));
}

function formatMetric(value: unknown): string {
  if (typeof value === "number") {
    return Number.isInteger(value) ? value.toLocaleString("en-IN") : value.toLocaleString("en-IN", { maximumFractionDigits: 4 });
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return JSON.stringify(value);
}

function exportReport(response: AnalysisResponse | null) {
  if (!response) {
    return;
  }

  const blob = new Blob([JSON.stringify(response, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${response.dataset_id}-satquery-report.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export function SatQueryWorkspace() {
  const [datasets, setDatasets] = useState<DemoDataset[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState("sentinel2-pune-khadakwasla-2024-03-04");
  const [question, setQuestion] = useState(SAMPLE_QUERIES[0].question);
  const [response, setResponse] = useState<AnalysisResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [showRaster, setShowRaster] = useState(true);
  const [showOverlay, setShowOverlay] = useState(true);
  const [highlightLargest, setHighlightLargest] = useState(true);

  useEffect(() => {
    let mounted = true;

    fetchDemoDatasets()
      .then((items) => {
        if (!mounted) {
          return;
        }
        setDatasets(items);
        if (!items.some((item) => item.dataset_id === selectedDatasetId) && items[0]) {
          setSelectedDatasetId(items[0].dataset_id);
        }
      })
      .catch((error: Error) => {
        if (mounted) {
          setBootError(error.message);
        }
      });

    return () => {
      mounted = false;
    };
  }, [selectedDatasetId]);

  const selectedDataset = useMemo(
    () => datasets.find((dataset) => dataset.dataset_id === selectedDatasetId) ?? datasets[0] ?? null,
    [datasets, selectedDatasetId]
  );

  async function handleRun() {
    if (!selectedDataset || loading) {
      return;
    }

    setLoading(true);
    setQueryError(null);
    try {
      const result = await runAnalysis(question, selectedDataset.dataset_id);
      setResponse(result);
    } catch (error) {
      setResponse(null);
      setQueryError(error instanceof Error ? error.message : "Analysis failed.");
    } finally {
      setLoading(false);
    }
  }

  const evidence = response?.evidence[0] ?? null;
  const tools = response?.judge_trace.tools_executed ?? [];

  return (
    <main className="min-h-screen bg-carbon-950 text-neutral-100">
      <header className="flex flex-col gap-3 border-b border-neutral-800 bg-carbon-900 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-signal-teal">
            <Radar className="h-4 w-4" aria-hidden="true" />
            SIH26167 · ISRO · Team ST-SW-07
          </div>
          <h1 className="mt-1 text-xl font-semibold text-neutral-50">GeoNexus SatQuery AI</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-300">
          <span className="inline-flex items-center gap-1 border border-neutral-700 bg-carbon-850 px-2.5 py-1">
            <ShieldCheck className="h-3.5 w-3.5 text-signal-green" aria-hidden="true" />
            Deterministic Geo Core
          </span>
          <span className="inline-flex items-center gap-1 border border-neutral-700 bg-carbon-850 px-2.5 py-1">
            <Activity className="h-3.5 w-3.5 text-signal-cyan" aria-hidden="true" />
            Evidence Grounded
          </span>
        </div>
      </header>

      <div className="grid min-h-[calc(100vh-74px)] grid-cols-1 grid-rows-[auto_auto_auto_auto] lg:grid-cols-[300px_minmax(0,1fr)_390px] lg:grid-rows-[minmax(520px,1fr)_260px]">
        <aside className="border-b border-neutral-800 bg-carbon-900 p-4 lg:border-b-0 lg:border-r">
          <section>
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-neutral-50">
              <Database className="h-4 w-4 text-signal-cyan" aria-hidden="true" />
              Datasets
            </div>
            {bootError ? (
              <div className="border border-signal-red/60 bg-signal-red/10 p-3 text-sm text-red-100">
                Backend unavailable: {bootError}
              </div>
            ) : null}
            <label className="mt-2 block text-xs font-medium uppercase tracking-[0.14em] text-neutral-400" htmlFor="dataset">
              Active Raster
            </label>
            <select
              id="dataset"
              className="mt-2 w-full border border-neutral-700 bg-carbon-950 px-3 py-2 text-sm text-neutral-50 outline-none focus:border-signal-cyan"
              value={selectedDataset?.dataset_id ?? selectedDatasetId}
              onChange={(event) => {
                setSelectedDatasetId(event.target.value);
                setResponse(null);
              }}
            >
              {datasets.map((dataset) => (
                <option key={dataset.dataset_id} value={dataset.dataset_id}>
                  {dataset.name}
                </option>
              ))}
            </select>
          </section>

          <section className="mt-5 border-t border-neutral-800 pt-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-neutral-50">
              <Layers className="h-4 w-4 text-signal-amber" aria-hidden="true" />
              Layers
            </div>
            {[
              ["Raster preview", showRaster, setShowRaster],
              ["Water overlay", showOverlay, setShowOverlay],
              ["Largest highlight", highlightLargest, setHighlightLargest]
            ].map(([label, checked, setter]) => (
              <label key={label as string} className="mb-3 flex items-center justify-between gap-3 text-sm text-neutral-200">
                <span>{label as string}</span>
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-signal-cyan"
                  checked={checked as boolean}
                  onChange={(event) => (setter as (value: boolean) => void)(event.target.checked)}
                />
              </label>
            ))}
          </section>

          {selectedDataset ? (
            <section className="mt-5 border-t border-neutral-800 pt-5 text-sm text-neutral-300">
              <div className="mb-2 font-semibold text-neutral-50">Scene Metadata</div>
              <dl className="space-y-2">
                <div>
                  <dt className="text-xs uppercase tracking-[0.14em] text-neutral-500">Location</dt>
                  <dd>{selectedDataset.location}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-[0.14em] text-neutral-500">Acquisition</dt>
                  <dd>{formatDate(selectedDataset.acquisition_date)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-[0.14em] text-neutral-500">CRS / Pixel</dt>
                  <dd>
                    {selectedDataset.crs} · {selectedDataset.pixel_size_m} m
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-[0.14em] text-neutral-500">Bands</dt>
                  <dd className="mt-1 flex flex-wrap gap-1">
                    {selectedDataset.bands.map((band) => (
                      <span key={band} className="border border-neutral-700 bg-carbon-950 px-2 py-0.5 text-xs text-neutral-200">
                        {band}
                      </span>
                    ))}
                  </dd>
                </div>
              </dl>
            </section>
          ) : null}
        </aside>

        <section className="min-h-[520px] bg-carbon-950 p-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-neutral-300">
            <div className="flex items-center gap-2">
              <MapPinned className="h-4 w-4 text-signal-green" aria-hidden="true" />
              <span>{selectedDataset?.dataset_id ?? "No dataset loaded"}</span>
            </div>
            <span>{response ? `${response.overlays.length} overlay feature(s)` : "Awaiting analysis"}</span>
          </div>
          <MapCanvas
            dataset={selectedDataset}
            response={response}
            showRaster={showRaster}
            showOverlay={showOverlay}
            highlightLargest={highlightLargest}
          />
        </section>

        <aside className="border-t border-neutral-800 bg-carbon-900 p-4 lg:border-l lg:border-t-0">
          <section>
            <div className="mb-3 text-sm font-semibold text-neutral-50">Natural-Language Query</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-1">
              {SAMPLE_QUERIES.map((sample) => (
                <button
                  key={sample.label}
                  type="button"
                  className="border border-neutral-700 bg-carbon-850 px-3 py-2 text-left text-sm text-neutral-100 hover:border-signal-cyan focus:border-signal-cyan focus:outline-none"
                  onClick={() => setQuestion(sample.question)}
                >
                  <span className="block text-xs uppercase tracking-[0.14em] text-neutral-500">{sample.scenario}</span>
                  <span className="block font-medium">{sample.label}</span>
                </button>
              ))}
            </div>
            <label className="mt-4 block text-xs font-medium uppercase tracking-[0.14em] text-neutral-400" htmlFor="question">
              Query
            </label>
            <textarea
              id="question"
              className="mt-2 min-h-[118px] w-full resize-y border border-neutral-700 bg-carbon-950 p-3 text-sm text-neutral-50 outline-none focus:border-signal-cyan"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
            />
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className="inline-flex flex-1 items-center justify-center gap-2 border border-signal-cyan bg-signal-cyan px-3 py-2 text-sm font-semibold text-carbon-950 hover:bg-cyan-300 focus:outline-none focus:ring-2 focus:ring-signal-cyan focus:ring-offset-2 focus:ring-offset-carbon-900 disabled:cursor-not-allowed disabled:border-neutral-700 disabled:bg-neutral-700 disabled:text-neutral-400"
                onClick={handleRun}
                disabled={loading || !selectedDataset}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
                Run Analysis
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center border border-neutral-700 bg-carbon-850 px-3 py-2 text-neutral-100 hover:border-signal-amber focus:border-signal-amber focus:outline-none disabled:cursor-not-allowed disabled:text-neutral-600"
                onClick={() => exportReport(response)}
                disabled={!response}
                title="Export evidence JSON"
                aria-label="Export evidence JSON"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </section>

          {queryError ? (
            <section className="mt-4 border border-signal-amber/70 bg-signal-amber/10 p-3 text-sm text-amber-100" role="alert">
              <div className="flex gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{queryError}</span>
              </div>
            </section>
          ) : null}

          {response ? (
            <section className="mt-4 space-y-4">
              <div className="border border-neutral-700 bg-carbon-850 p-3">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-neutral-50">
                  <CheckCircle2 className="h-4 w-4 text-signal-green" aria-hidden="true" />
                  Grounded Answer
                </div>
                <p className="text-sm leading-6 text-neutral-200">{response.concise_answer}</p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {Object.entries(response.metrics)
                  .filter(([key]) => ["feature_count", "total_water_area_ha", "largest_water_area_ha", "ndwi_threshold"].includes(key))
                  .map(([key, value]) => (
                    <div key={key} className="border border-neutral-700 bg-carbon-850 p-3">
                      <div className="text-xs uppercase tracking-[0.14em] text-neutral-500">{key.replaceAll("_", " ")}</div>
                      <div className="mt-1 text-lg font-semibold text-neutral-50">{formatMetric(value)}</div>
                    </div>
                  ))}
              </div>

              {evidence ? (
                <div className="border border-neutral-700 bg-carbon-850 p-3 text-sm text-neutral-200">
                  <div className="mb-2 font-semibold text-neutral-50">Evidence</div>
                  <p>Source: {evidence.source_image}</p>
                  <p>Acquisition: {formatDate(evidence.acquisition_date)}</p>
                  <p>Region: {evidence.region}</p>
                  <p>Confidence: {Math.round(evidence.confidence * 100)}%</p>
                  <div className="mt-2 text-xs text-neutral-400">
                    {evidence.limitations.map((limitation) => (
                      <p key={limitation}>- {limitation}</p>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}
        </aside>

        <section className="border-t border-neutral-800 bg-carbon-900 p-4 lg:col-span-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-neutral-50">
              <Braces className="h-4 w-4 text-signal-amber" aria-hidden="true" />
              Judge Mode Trace
            </div>
            <span className="text-xs text-neutral-500">
              {response?.judge_trace.total_latency_ms ? `${response.judge_trace.total_latency_ms} ms backend latency` : "Run a query to populate the trace"}
            </span>
          </div>
          <div className="grid gap-3 text-sm lg:grid-cols-[1.2fr_1fr_1fr]">
            <div className="border border-neutral-700 bg-carbon-950 p-3">
              <div className="text-xs uppercase tracking-[0.14em] text-neutral-500">Generated Plan</div>
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-5 text-neutral-300">
                {response ? JSON.stringify(response.judge_trace.generated_plan, null, 2) : "No plan executed yet."}
              </pre>
            </div>
            <div className="border border-neutral-700 bg-carbon-950 p-3">
              <div className="text-xs uppercase tracking-[0.14em] text-neutral-500">Tools Executed</div>
              <div className="mt-2 flex max-h-40 flex-wrap gap-1 overflow-auto">
                {tools.length ? (
                  tools.map((tool) => (
                    <span key={tool} className="border border-neutral-700 bg-carbon-850 px-2 py-1 text-xs text-neutral-200">
                      {tool}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-neutral-500">No tools executed yet.</span>
                )}
              </div>
            </div>
            <div className="border border-neutral-700 bg-carbon-950 p-3">
              <div className="text-xs uppercase tracking-[0.14em] text-neutral-500">Warnings</div>
              <div className="mt-2 space-y-2 text-xs leading-5 text-neutral-300">
                {response?.warnings.length ? response.warnings.map((warning) => <p key={warning}>{warning}</p>) : <p>No analysis warnings yet.</p>}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
