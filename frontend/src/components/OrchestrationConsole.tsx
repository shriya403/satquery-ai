"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Cpu,
  Database,
  GitBranch,
  Loader2,
  Play,
  Route,
  Satellite,
  ShieldCheck,
  XCircle
} from "lucide-react";
import {
  fetchDemoDatasets,
  fetchOrchestrationRegistry,
  fetchVqaStatus,
  planOrchestration,
  previewUrl,
  runRemoteSensingVqa
} from "../lib/api";
import type {
  DemoDataset,
  OrchestrationPlanResponse,
  SpecialistRegistryResponse,
  VqaResponse,
  VqaStatusResponse
} from "../lib/types";
import { ThemeControl } from "./ThemeControl";

const ROUTE_EXAMPLES = [
  {
    label: "Measured water",
    question:
      "Find water bodies in this image, calculate their approximate area, and highlight the largest one."
  },
  {
    label: "Single-image VQA",
    question:
      "Describe the land cover and major objects visible in this image."
  },
  {
    label: "Text grounding",
    question:
      "Highlight the water body referred to in the query."
  },
  {
    label: "Temporal change",
    question:
      "What changed between these two dates and where did the change occur?"
  },
  {
    label: "Optical + SAR",
    question:
      "Use optical and SAR images together to identify water-covered regions."
  }
] as const;

function labelTask(task: string): string {
  return task
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function OrchestrationConsole() {
  const [datasets, setDatasets] = useState<DemoDataset[]>([]);
  const [registry, setRegistry] = useState<SpecialistRegistryResponse | null>(null);
  const [question, setQuestion] = useState<string>(ROUTE_EXAMPLES[0].question);
  const [primaryId, setPrimaryId] = useState("");
  const [secondaryId, setSecondaryId] = useState("");
  const [includeSecond, setIncludeSecond] = useState(false);
  const [plan, setPlan] = useState<OrchestrationPlanResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vqaStatus, setVqaStatus] = useState<VqaStatusResponse | null>(null);
  const [vqaResult, setVqaResult] = useState<VqaResponse | null>(null);
  const [vqaLoading, setVqaLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      fetchDemoDatasets(),
      fetchOrchestrationRegistry(),
      fetchVqaStatus()
    ])
      .then(([items, registryPayload, vqaStatusPayload]) => {
        if (!mounted) return;
        setDatasets(items);
        setRegistry(registryPayload);
        setVqaStatus(vqaStatusPayload);
        const preferred =
          items.find((item) =>
            item.dataset_id.includes("sentinel2-pune-khadakwasla")
          ) ?? items[0];
        if (preferred) {
          setPrimaryId(preferred.dataset_id);
          setSecondaryId(preferred.dataset_id);
        }
      })
      .catch((err: Error) => {
        if (mounted) setError(err.message);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const primary = useMemo(
    () => datasets.find((item) => item.dataset_id === primaryId) ?? null,
    [datasets, primaryId]
  );
  const secondary = useMemo(
    () => datasets.find((item) => item.dataset_id === secondaryId) ?? null,
    [datasets, secondaryId]
  );

  async function inspectAndRoute() {
    if (!primaryId) return;
    setLoading(true);
    setError(null);
    setPlan(null);
    setVqaResult(null);
    try {
      const ids =
        includeSecond && secondaryId
          ? [primaryId, secondaryId]
          : [primaryId];
      const result = await planOrchestration(question, ids);
      setPlan(result);
      if (result.required_input_count === 2) {
        setIncludeSecond(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Controller request failed.");
    } finally {
      setLoading(false);
    }
  }


async function executeVqa() {
  if (
    !plan ||
    plan.task !== "single_image_vqa" ||
    !plan.executable ||
    !primaryId
  ) {
    return;
  }

  setVqaLoading(true);
  setError(null);
  setVqaResult(null);

  try {
    const result = await runRemoteSensingVqa(question, primaryId);
    setVqaResult(result);

    const [statusPayload, registryPayload] = await Promise.all([
      fetchVqaStatus(),
      fetchOrchestrationRegistry()
    ]);
    setVqaStatus(statusPayload);
    setRegistry(registryPayload);
  } catch (err) {
    setError(
      err instanceof Error
        ? err.message
        : "Remote-sensing VQA execution failed."
    );
  } finally {
    setVqaLoading(false);
  }
}

  return (
    <main className="app-page controller-page theme-transition">
      <header className="controller-topbar">
        <div>
          <Link className="controller-back" href="/">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Earth
          </Link>
          <div className="controller-title-row">
            <div className="controller-title-icon">
              <Route className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p className="eyebrow">Agentic remote-sensing controller</p>
              <h1>SatQuery Orchestration Console</h1>
            </div>
          </div>
        </div>
        <ThemeControl compact />
      </header>

      <section className="controller-layout">
        <aside className="panel controller-input-panel">
          <div className="panel-heading">
            <Satellite className="h-4 w-4" aria-hidden="true" />
            Inputs + Query
          </div>

          <label className="field-label" htmlFor="controller-question">
            Natural-language request
          </label>
          <textarea
            id="controller-question"
            className="field controller-question"
            value={question}
            onChange={(event) => {
              setQuestion(event.target.value);
              setPlan(null);
            }}
          />

          <div className="controller-example-row">
            {ROUTE_EXAMPLES.map((example) => (
              <button
                key={example.label}
                type="button"
                className="controller-example"
                onClick={() => {
                  setQuestion(example.question);
                  setPlan(null);
                  if (
                    example.label === "Temporal change" ||
                    example.label === "Optical + SAR"
                  ) {
                    setIncludeSecond(true);
                  }
                }}
              >
                {example.label}
              </button>
            ))}
          </div>

          <div className="controller-input-card">
            <div className="controller-input-heading">
              <span>INPUT A</span>
              <strong>Primary scene</strong>
            </div>
            <select
              className="select-field"
              value={primaryId}
              onChange={(event) => {
                setPrimaryId(event.target.value);
                setPlan(null);
              }}
            >
              {datasets.map((dataset) => (
                <option key={dataset.dataset_id} value={dataset.dataset_id}>
                  {dataset.name}
                </option>
              ))}
            </select>
            {primary ? (
              <div className="controller-mini-meta">
                <span>{primary.crs}</span>
                <span>{primary.pixel_size_m} m</span>
                <span>{primary.bands.join(", ")}</span>
              </div>
            ) : null}
          </div>

          <label className="controller-pair-toggle">
            <input
              type="checkbox"
              checked={includeSecond}
              onChange={(event) => {
                setIncludeSecond(event.target.checked);
                setPlan(null);
              }}
            />
            <span>
              <strong>Include paired input</strong>
              <small>Required for temporal and optical + SAR routes.</small>
            </span>
          </label>

          {includeSecond ? (
            <div className="controller-input-card is-secondary">
              <div className="controller-input-heading">
                <span>INPUT B</span>
                <strong>Paired scene</strong>
              </div>
              <select
                className="select-field"
                value={secondaryId}
                onChange={(event) => {
                  setSecondaryId(event.target.value);
                  setPlan(null);
                }}
              >
                {datasets.map((dataset) => (
                  <option key={dataset.dataset_id} value={dataset.dataset_id}>
                    {dataset.name}
                  </option>
                ))}
              </select>
              {secondary ? (
                <div className="controller-mini-meta">
                  <span>{secondary.crs}</span>
                  <span>{secondary.pixel_size_m} m</span>
                  <span>{secondary.bands.join(", ")}</span>
                </div>
              ) : null}
            </div>
          ) : null}

          <button
            type="button"
            className="button button-primary controller-plan-button"
            onClick={inspectAndRoute}
            disabled={loading || !primaryId || question.trim().length < 3}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Play className="h-4 w-4" aria-hidden="true" />
            )}
            Inspect + Route
          </button>

          {error ? <div className="alert error-alert mt-3">{error}</div> : null}
        </aside>

        <div className="controller-main">
          <section className="panel controller-status-panel">
            <div className="controller-status-head">
              <div>
                <p className="eyebrow">Observable controller state</p>
                <h2>{plan ? labelTask(plan.task) : "Awaiting request"}</h2>
                <p className="muted-text">
                  {plan
                    ? plan.route_reason
                    : "Run Inspect + Route to classify the task and select specialists."}
                </p>
              </div>
              {plan ? (
                <div
                  className={`controller-gate ${
                    plan.executable ? "is-ready" : "is-blocked"
                  }`}
                >
                  {plan.executable ? (
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <XCircle className="h-4 w-4" aria-hidden="true" />
                  )}
                  {plan.executable ? "Executable now" : "Execution blocked"}
                </div>
              ) : null}
            </div>

            {plan ? (
              <div className="controller-summary-grid">
                <article>
                  <span>Task</span>
                  <strong>{labelTask(plan.task)}</strong>
                </article>
                <article>
                  <span>Inputs required</span>
                  <strong>{plan.required_input_count}</strong>
                </article>
                <article>
                  <span>Compatibility</span>
                  <strong>
                    {plan.compatibility.compatible ? "Pass" : "Blocked"}
                  </strong>
                </article>
                <article>
                  <span>Reasoning exposure</span>
                  <strong>
                    {plan.internal_reasoning_exposed ? "Exposed" : "Hidden"}
                  </strong>
                </article>
              </div>
            ) : null}
          </section>

          {plan ? (
            <>

              {plan.task === "single_image_vqa" ? (
                <section className="panel controller-section controller-vqa-panel">
                  <div className="controller-vqa-head">
                    <div>
                      <p className="eyebrow">Executable specialist</p>
                      <h3>Real Remote-Sensing VQA</h3>
                      <p className="muted-text">
                        Run the selected scene through the active remote-sensing-adapted vision-language model.
                      </p>
                    </div>
                    <div
                      className={`controller-vqa-runtime ${
                        vqaStatus?.enabled && vqaStatus.dependencies_available
                          ? "is-ready"
                          : "is-offline"
                      }`}
                    >
                      {vqaStatus?.enabled && vqaStatus.dependencies_available
                        ? vqaStatus.loaded
                          ? "Model loaded"
                          : "Runtime ready"
                        : "Runtime unavailable"}
                    </div>
                  </div>

                  <div className="controller-vqa-preview">
                    <img
                      src={previewUrl(primaryId)}
                      alt={primary?.name ?? "Selected remote-sensing scene"}
                    />
                  </div>

                  <div className="controller-vqa-actions">
                    <button
                      type="button"
                      className="button button-primary"
                      onClick={executeVqa}
                      disabled={
                        vqaLoading ||
                        !plan.executable ||
                        !vqaStatus?.enabled ||
                        !vqaStatus.dependencies_available
                      }
                    >
                      {vqaLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Play className="h-4 w-4" aria-hidden="true" />
                      )}
                      {vqaLoading ? "Running VQA..." : "Execute VQA"}
                    </button>
                    <span className="muted-text">
                      {vqaStatus?.model_id ?? "VQA runtime status unavailable"}
                    </span>
                  </div>

                  {!plan.executable ? (
                    <div className="alert error-alert">
                      Execution is blocked until the VQA specialist/runtime is ready.
                    </div>
                  ) : null}

                  {vqaResult ? (
                    <div className="controller-vqa-answer">
                      <div>
                        <p className="eyebrow">Model answer</p>
                        <blockquote>{vqaResult.answer}</blockquote>
                      </div>

                      <div className="controller-vqa-meta">
                        <article><span>Model</span><strong>{vqaResult.model_family}</strong></article>
                        <article><span>Device</span><strong>{vqaResult.device}</strong></article>
                        <article><span>Runtime</span><strong>{vqaResult.dtype}</strong></article>
                        <article><span>Latency</span><strong>{(vqaResult.latency_ms / 1000).toFixed(2)} s</strong></article>
                      </div>

                      <div className="controller-vqa-trust">
                        <p><strong>Remote-sensing adapted:</strong>{" "}{vqaResult.remote_sensing_adapted ? "Yes" : "No"}</p>
                        <p><strong>Adaptation:</strong>{" "}{vqaResult.adaptation_note}</p>
                        <p><strong>Confidence:</strong>{" "}{vqaResult.confidence === null ? "Not calibrated / not reported" : vqaResult.confidence}</p>
                        <p className="muted-text">{vqaResult.confidence_note}</p>
                      </div>

                      <div>
                        <p className="eyebrow">Limitations</p>
                        <ul className="controller-vqa-limits">
                          {vqaResult.limitations.map((limitation) => (
                            <li key={limitation}>{limitation}</li>
                          ))}
                        </ul>
                      </div>

                      <details className="controller-vqa-provenance">
                        <summary>VQA provenance</summary>
                        <pre>{JSON.stringify(vqaResult.provenance, null, 2)}</pre>
                      </details>
                    </div>
                  ) : null}
                </section>
              ) : null}

              <section className="panel controller-section">
                <div className="panel-heading">
                  <Database className="h-4 w-4" aria-hidden="true" />
                  Input Inspection
                </div>
                <div className="controller-inspection-grid">
                  {plan.inputs.map((input, index) => (
                    <article
                      key={`${input.dataset_id}-${index}`}
                      className="controller-inspection-card"
                    >
                      <span className="controller-card-index">
                        INPUT {String.fromCharCode(65 + index)}
                      </span>
                      <strong>{input.name}</strong>
                      <dl>
                        <div>
                          <dt>Modality</dt>
                          <dd>{input.modality}</dd>
                        </div>
                        <div>
                          <dt>CRS</dt>
                          <dd>{input.crs}</dd>
                        </div>
                        <div>
                          <dt>Shape</dt>
                          <dd>{input.shape.join(" x ")}</dd>
                        </div>
                        <div>
                          <dt>Resolution</dt>
                          <dd>{input.pixel_size_m} m</dd>
                        </div>
                        <div>
                          <dt>Bands</dt>
                          <dd>{input.bands.join(", ")}</dd>
                        </div>
                        <div>
                          <dt>Acquisition</dt>
                          <dd>{input.acquisition_date ?? "Not available"}</dd>
                        </div>
                      </dl>
                    </article>
                  ))}
                </div>
              </section>

              <section className="panel controller-section">
                <div className="panel-heading">
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  Compatibility Gate
                </div>

                {plan.compatibility.blocking_reasons.length ? (
                  <div className="controller-blockers">
                    {plan.compatibility.blocking_reasons.map((reason) => (
                      <div key={reason}>
                        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                        <span>{reason}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="controller-pass-line">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    Input requirements passed for this route.
                  </div>
                )}

                <div className="controller-check-grid">
                  {plan.compatibility.checks.map((check, index) => (
                    <article
                      key={`${String(check.check)}-${index}`}
                      className={`controller-check ${
                        check.passed === false ? "is-failed" : "is-passed"
                      }`}
                    >
                      <div>
                        {check.passed === false ? (
                          <XCircle className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                        )}
                        <strong>{String(check.check)}</strong>
                      </div>
                      <pre>{JSON.stringify(check, null, 2)}</pre>
                    </article>
                  ))}
                </div>

                {plan.compatibility.warnings.map((warning) => (
                  <p key={warning} className="controller-warning">
                    {warning}
                  </p>
                ))}
              </section>

              <section className="panel controller-section">
                <div className="panel-heading">
                  <Cpu className="h-4 w-4" aria-hidden="true" />
                  Specialist Selection
                </div>
                <div className="controller-specialist-grid">
                  {plan.selected_specialists.map((specialist) => (
                    <article
                      key={specialist.specialist_id}
                      className={`controller-specialist ${
                        specialist.state === "ready"
                          ? "is-ready"
                          : "is-planned"
                      }`}
                    >
                      <div className="controller-specialist-head">
                        <strong>{specialist.label}</strong>
                        <span>{specialist.state}</span>
                      </div>
                      <p>{specialist.implementation_note}</p>
                      <div className="controller-capabilities">
                        {specialist.capabilities.map((capability) => (
                          <span key={capability}>{capability}</span>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section className="panel controller-section">
                <div className="panel-heading">
                  <GitBranch className="h-4 w-4" aria-hidden="true" />
                  Selected Tool Route
                </div>
                <div className="controller-tool-route">
                  {plan.selected_tools.map((tool, index) => (
                    <div key={`${tool}-${index}`}>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <strong>{tool}</strong>
                    </div>
                  ))}
                </div>

                <div
                  className={`controller-execution-note ${
                    plan.executable ? "is-ready" : "is-blocked"
                  }`}
                >
                  <strong>
                    {plan.executable
                      ? "Execution gate open"
                      : "Execution gate closed"}
                  </strong>
                  <span>{plan.execution_note}</span>
                </div>
              </section>

              <details className="panel controller-raw-trace">
                <summary>Controller trace</summary>
                <pre>{JSON.stringify(plan.controller_trace, null, 2)}</pre>
              </details>
            </>
          ) : (
            <section className="panel controller-empty">
              <Route className="h-8 w-8" aria-hidden="true" />
              <strong>Transparent orchestration, not a hidden chatbot.</strong>
              <span>
                The controller classifies the task, inspects modality and metadata,
                validates input compatibility, selects specialists, and blocks routes
                that do not yet have a real implementation.
              </span>
            </section>
          )}

          {registry ? (
            <section className="panel controller-registry">
              <div className="panel-heading">
                <Cpu className="h-4 w-4" aria-hidden="true" />
                Specialist Registry
              </div>
              <div className="controller-registry-row">
                {registry.specialists.map((specialist) => (
                  <div key={specialist.specialist_id}>
                    <span
                      className={
                        specialist.state === "ready"
                          ? "registry-dot is-ready"
                          : "registry-dot"
                      }
                    />
                    <strong>{specialist.label}</strong>
                    <small>{specialist.state}</small>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </section>
    </main>
  );
}
