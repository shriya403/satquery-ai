"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Braces,
  Database,
  FileText,
  LocateFixed,
  MapPinned,
  Satellite,
  ShieldCheck,
  Waves
} from "lucide-react";
import { fetchDemoDatasets } from "../lib/api";
import {
  buildWorkspaceUrl,
  formatCoordinate,
  formatDatasetDate,
  getUnsupportedQueryHint,
  getWorkspaceHandoffQuestion,
  REAL_DEMO_DATASET_ID,
  sceneFromDataset,
  WATER_ANALYSIS_QUERY
} from "../lib/satquery";
import type { DatasetScene } from "../lib/satquery";
import type { DemoDataset } from "../lib/types";
import { EarthStage } from "./EarthStage";
import { THEMES, useTheme } from "./ThemeProvider";
import { ThemeControl } from "./ThemeControl";

type ApiStatus = "checking" | "online" | "offline";
type TopicId = "water" | "provenance" | "limits";

const TOPICS: Array<{
  id: TopicId;
  label: string;
  icon: typeof Waves;
}> = [
  { id: "water", label: "Water", icon: Waves },
  { id: "provenance", label: "Source", icon: Database },
  { id: "limits", label: "Limits", icon: ShieldCheck }
];

function statusClass(status: ApiStatus): string {
  if (status === "online") {
    return "status-online";
  }
  if (status === "offline") {
    return "status-error";
  }
  return "status-warning";
}

function statusLabel(status: ApiStatus): string {
  if (status === "online") {
    return "Scenes online";
  }
  if (status === "offline") {
    return "API unavailable";
  }
  return "Loading scenes";
}

function selectPreferredDataset(datasets: DemoDataset[]): string | null {
  if (!datasets.length) {
    return null;
  }

  return datasets.find((dataset) => dataset.dataset_id === REAL_DEMO_DATASET_ID)?.dataset_id ?? datasets[0].dataset_id;
}

function TopicPanel({ topic, scene }: { topic: TopicId; scene: DatasetScene | null }) {
  if (!scene) {
    return (
      <p className="muted-text">
        Start the backend to load API-backed scenes.
      </p>
    );
  }

  if (topic === "provenance") {
    return (
      <dl className="earth-topic-list">
        <div>
          <dt>Provider</dt>
          <dd>{scene.dataset.provider}</dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>
            {scene.dataset.source_url ? (
              <a href={scene.dataset.source_url} target="_blank" rel="noreferrer">
                STAC source item
              </a>
            ) : (
              "Local generated fixture"
            )}
          </dd>
        </div>
        <div>
          <dt>Coordinate Basis</dt>
          <dd>
            Marker center from API WGS84 bounds: {formatCoordinate(scene.center.lat, "lat")},{" "}
            {formatCoordinate(scene.center.lon, "lon")}.
          </dd>
        </div>
      </dl>
    );
  }

  if (topic === "limits") {
    return (
      <div className="earth-topic-copy">
        <p>{scene.dataset.usage_note}</p>
        <p>Temporal change, VQA/VLM, SAR fusion, vegetation segmentation, and built-up classification are not implemented in this milestone.</p>
      </div>
    );
  }

  return (
    <dl className="earth-topic-list">
      <div>
        <dt>Supported Analysis</dt>
        <dd>{scene.supportedAnalysis}</dd>
      </div>
      <div>
        <dt>Bands</dt>
        <dd>{scene.dataset.bands.join(", ")}</dd>
      </div>
      <div>
        <dt>Output</dt>
        <dd>GeoJSON polygons, largest-water highlight, projected area, and evidence JSON.</dd>
      </div>
    </dl>
  );
}

export function LandingPage() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [query, setQuery] = useState(WATER_ANALYSIS_QUERY);
  const [datasets, setDatasets] = useState<DemoDataset[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null);
  const [apiStatus, setApiStatus] = useState<ApiStatus>("checking");
  const [apiMessage, setApiMessage] = useState<string | null>(null);
  const [topic, setTopic] = useState<TopicId>("water");
  const [transitioning, setTransitioning] = useState(false);
  const [cinematicSequence, setCinematicSequence] = useState(0);
  const [cinematicActive, setCinematicActive] = useState(false);
  const prefersReducedMotion = useRef(false);
  const queryInputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    prefersReducedMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let mounted = true;

    fetchDemoDatasets()
      .then((items) => {
        if (!mounted) {
          return;
        }
        setDatasets(items);
        setSelectedDatasetId((current) => current ?? selectPreferredDataset(items));
        setApiStatus("online");
        setApiMessage(null);
      })
      .catch((error: Error) => {
        if (!mounted) {
          return;
        }
        setApiStatus("offline");
        setApiMessage(error.message);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const scenes = useMemo(() => datasets.map(sceneFromDataset), [datasets]);
  const selectedScene = useMemo(
    () => scenes.find((scene) => scene.dataset.dataset_id === selectedDatasetId) ?? scenes[0] ?? null,
    [scenes, selectedDatasetId]
  );
  const handoffQuestion = useMemo(() => getWorkspaceHandoffQuestion(query), [query]);
  const queryHandoffNotice = query.trim() && getUnsupportedQueryHint(query)
    ? "Workspace handoff will use the supported water analysis query for this milestone."
    : null;
  const workspaceUrl = buildWorkspaceUrl(selectedScene?.dataset.dataset_id ?? REAL_DEMO_DATASET_ID, handoffQuestion);

  function selectScene(datasetId: string) {
    setSelectedDatasetId(datasetId);
    setTopic("water");
  }

  function openWorkspaceNow() {
    router.push(workspaceUrl);
  }

  function startCinematicDemo() {
    const preferredId =
      datasets.find((dataset) => dataset.dataset_id === REAL_DEMO_DATASET_ID)?.dataset_id ??
      selectedScene?.dataset.dataset_id ??
      null;

    if (preferredId) {
      setSelectedDatasetId(preferredId);
    }
    setTopic("water");
    setCinematicActive(true);
    setCinematicSequence((current) => current + 1);
  }

  function finishCinematicDemo() {
    setCinematicActive(false);
    window.setTimeout(() => {
      queryInputRef.current?.focus();
      queryInputRef.current?.select();
    }, 120);
  }

  function analyzeScene() {
    if (prefersReducedMotion.current) {
      openWorkspaceNow();
      return;
    }

    setTransitioning(true);
    window.setTimeout(openWorkspaceNow, 720);
  }

  return (
    <main className="earth-page app-page theme-transition">
      <section className="earth-landing" id="overview" aria-label="SatQuery Earth scene selector">
        <div className="earth-stars" aria-hidden="true" />
        <EarthStage
          scenes={scenes}
          selectedDatasetId={selectedScene?.dataset.dataset_id ?? null}
          onSceneSelect={selectScene}
          cinematicSequence={cinematicSequence}
          onCinematicComplete={finishCinematicDemo}
        />

        <nav className="earth-nav" aria-label="Primary">
          <Link className="wordmark" href="/">
            <span className="orbital-mark" aria-hidden="true" />
            <span>SatQuery AI</span>
          </Link>
          <div className="nav-links">
            <a className="nav-link" href="#overview">
              Earth
            </a>
            <Link className="nav-link" href={workspaceUrl}>
              Workspace
            </Link>
            <a className="nav-link" href="#evidence">
              Evidence
            </a>
          </div>
          <ThemeControl compact />
        </nav>

        <div className="earth-hero-copy">
          <p className="eyebrow">Evidence-first remote sensing assistant</p>
          <h1 className="hero-title">Query the Earth with Natural Language</h1>
          <p className="hero-copy">Select an API-backed scene, carry a natural-language question forward, and inspect the satellite evidence behind the answer.</p>
          <div className="earth-hero-status-row">
            <div className={`status-pill ${statusClass(apiStatus)}`} data-testid="earth-api-status">
              <span className="status-dot" aria-hidden="true" />
              {statusLabel(apiStatus)}
            </div>
            <button
              type="button"
              className="cinematic-demo-button"
              onClick={startCinematicDemo}
              disabled={!selectedScene || cinematicActive}
              data-testid="start-cinematic-demo"
            >
              <span className="cinematic-demo-dot" aria-hidden="true" />
              {cinematicActive ? "Cinematic sequence running" : "Start jury sequence"}
            </button>
          </div>
        </div>

        <aside className="earth-scene-panel panel" aria-label="Scene selection">
          <div className="panel-heading">
            <LocateFixed className="h-4 w-4" aria-hidden="true" />
            Scene Selection
          </div>

          <label className="field-label" htmlFor="earth-dataset">
            Dataset
          </label>
          <select
            id="earth-dataset"
            data-testid="earth-dataset-select"
            className="select-field"
            value={selectedScene?.dataset.dataset_id ?? ""}
            onChange={(event) => selectScene(event.target.value)}
            disabled={!scenes.length}
          >
            {scenes.map((scene) => (
              <option key={scene.dataset.dataset_id} value={scene.dataset.dataset_id}>
                {scene.dataset.name}
              </option>
            ))}
          </select>

          {apiMessage ? (
            <div className="alert error-alert mt-3" role="alert">
              {apiMessage}
            </div>
          ) : null}

          {selectedScene ? (
            <div className="earth-scene-details" data-testid="earth-scene-details">
              <div className="earth-selected-heading">
                <Satellite className="h-4 w-4" aria-hidden="true" />
                <span>{selectedScene.dataset.name}</span>
              </div>
              <dl className="earth-metadata-grid">
                <div>
                  <dt>Location</dt>
                  <dd>{selectedScene.dataset.location}</dd>
                </div>
                <div>
                  <dt>Acquisition</dt>
                  <dd>{formatDatasetDate(selectedScene.dataset.acquisition_date)}</dd>
                </div>
                <div>
                  <dt>Resolution</dt>
                  <dd>{selectedScene.dataset.pixel_size_m} m</dd>
                </div>
                <div>
                  <dt>CRS</dt>
                  <dd>{selectedScene.dataset.crs}</dd>
                </div>
              </dl>

              <div className="earth-topic-tabs" role="tablist" aria-label="Scene topic">
                {TOPICS.map((item) => {
                  const Icon = item.icon;
                  const selected = topic === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className="earth-topic-button"
                      role="tab"
                      aria-selected={selected}
                      aria-controls="earth-topic-panel"
                      onClick={() => setTopic(item.id)}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                      {item.label}
                    </button>
                  );
                })}
              </div>

              <div className="earth-topic-panel" id="earth-topic-panel" role="tabpanel" data-testid="earth-topic-panel">
                <TopicPanel topic={topic} scene={selectedScene} />
              </div>
            </div>
          ) : null}

          <label className="field-label mt-4" htmlFor="landing-query">
            Query
          </label>
          <textarea
            ref={queryInputRef}
            id="landing-query"
            data-testid="landing-query"
            className={`field earth-query ${!cinematicActive && cinematicSequence > 0 ? "is-demo-ready" : ""}`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {!cinematicActive && cinematicSequence > 0 ? (
            <div className="demo-ready-callout" role="status">
              <span className="demo-ready-index">LIVE</span>
              <span>
                Scene locked. Type the question live, then run the verified analysis.
              </span>
            </div>
          ) : null}
          {queryHandoffNotice ? (
            <div className="alert mt-3" role="status">
              {queryHandoffNotice}
            </div>
          ) : null}
          <div className="earth-actions">
            <button
              className="button button-primary"
              type="button"
              onClick={analyzeScene}
              disabled={!selectedScene}
              data-testid="analyze-scene"
            >
              Analyze this scene
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
            <Link className="button button-secondary" href={workspaceUrl}>
              Workspace
            </Link>
          </div>
        </aside>

        {transitioning ? (
          <div className="earth-transition" role="status" data-testid="earth-transition">
            <div className="earth-transition-line" aria-hidden="true" />
            <span>Opening analysis workspace</span>
            <button type="button" className="button button-ghost" onClick={openWorkspaceNow}>
              Skip animation
            </button>
          </div>
        ) : null}
      </section>

      <section className="section-band">
        <div className="section-inner">
          <p className="eyebrow">Visual systems</p>
          <h2 className="section-title">Four complete working themes</h2>
          <div className="theme-card-grid">
            {THEMES.map((item) => (
              <button
                key={item.id}
                className="theme-card"
                type="button"
                aria-pressed={theme === item.id}
                onClick={() => setTheme(item.id)}
              >
                <span className="panel-heading">
                  <Braces className="h-4 w-4" aria-hidden="true" />
                  {item.label}
                </span>
                <span className="muted-text">{item.atmosphere}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="section-band" id="evidence">
        <div className="section-inner">
          <p className="eyebrow">Analyst trust</p>
          <h2 className="section-title">Every answer must expose its evidence trail</h2>
          <div className="evidence-card-grid">
            <div className="evidence-card">
              <span className="panel-heading">
                <Database className="h-4 w-4" aria-hidden="true" />
                Provenance
              </span>
              <p className="muted-text">Dataset, source item, acquisition date, CRS, resolution and preprocessing remain visible.</p>
            </div>
            <div className="evidence-card">
              <span className="panel-heading">
                <MapPinned className="h-4 w-4" aria-hidden="true" />
                Spatial Output
              </span>
              <p className="muted-text">The backend returns GeoJSON polygons, coordinates and projected area measurements.</p>
            </div>
            <div className="evidence-card">
              <span className="panel-heading">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                Limits
              </span>
              <p className="muted-text">Heuristic confidence, cloud/shadow limits and missing ground-truth validation are labelled.</p>
            </div>
            <div className="evidence-card">
              <span className="panel-heading">
                <FileText className="h-4 w-4" aria-hidden="true" />
                Export
              </span>
              <p className="muted-text">The active API result can be downloaded as reproducible evidence JSON.</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
