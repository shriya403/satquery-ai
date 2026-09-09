"use client";

import dynamic from "next/dynamic";
import { Component, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { LocateFixed, Minus, Plus, RotateCcw } from "lucide-react";
import type { DatasetScene } from "../lib/satquery";

const EARTH_TEXTURE_URL = "/earth/blue-marble-next-generation-2048.jpg";

export type EarthView = {
  lat: number;
  lon: number;
  distance: number;
};

type EarthStageProps = {
  scenes: DatasetScene[];
  selectedDatasetId: string | null;
  onSceneSelect: (datasetId: string) => void;
};

type EarthSceneProps = EarthStageProps & {
  autoRotate: boolean;
  reducedMotion: boolean;
  textureUrl: string;
  view: EarthView;
  onViewChange: (view: EarthView) => void;
  onSceneReady: () => void;
};

const EarthScene = dynamic<EarthSceneProps>(
  () => import("./EarthScene").then((module) => module.EarthScene),
  {
    ssr: false,
    loading: () => <EarthLoading />
  }
);

const DEFAULT_VIEW: EarthView = {
  lat: 18.4,
  lon: 73.8,
  distance: 3.05
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

function shouldForceStaticEarth(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("earthFallback") === "1" || window.localStorage.getItem("satquery-earth-force-static") === "true";
  } catch {
    return false;
  }
}

function useReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(query.matches);
    const update = () => setReducedMotion(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reducedMotion;
}

class EarthErrorBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    if (this.state.failed) {
      return null;
    }

    return this.props.children;
  }
}

function EarthLoading() {
  return (
    <div className="earth-static earth-loading" aria-hidden="true">
      <div className="earth-static-disc" />
    </div>
  );
}

function StaticMarker({
  scene,
  selected,
  onSelect
}: {
  scene: DatasetScene;
  selected: boolean;
  onSelect: (datasetId: string) => void;
}) {
  const x = clamp(50 + scene.center.lon / 3.6, 11, 89);
  const y = clamp(50 - scene.center.lat / 1.8, 12, 88);

  return (
    <button
      type="button"
      className="earth-static-marker"
      style={{ left: `${x}%`, top: `${y}%` }}
      aria-pressed={selected}
      aria-label={`Select ${scene.dataset.name}`}
      onClick={() => onSelect(scene.dataset.dataset_id)}
      title={scene.dataset.name}
    />
  );
}

function EarthFallback({ scenes, selectedDatasetId, onSceneSelect }: EarthStageProps) {
  return (
    <div className="earth-static" data-testid="earth-static-fallback">
      <div className="earth-static-disc" aria-hidden="true">
        {scenes.map((scene) => (
          <StaticMarker
            key={scene.dataset.dataset_id}
            scene={scene}
            selected={scene.dataset.dataset_id === selectedDatasetId}
            onSelect={onSceneSelect}
          />
        ))}
      </div>
      <div className="earth-static-status" role="status">
        Static Earth view
      </div>
    </div>
  );
}

export function EarthStage({ scenes, selectedDatasetId, onSceneSelect }: EarthStageProps) {
  const reducedMotion = useReducedMotion();
  const [webglState, setWebglState] = useState<"checking" | "available" | "unavailable">("checking");
  const [sceneReady, setSceneReady] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [view, setView] = useState<EarthView>(DEFAULT_VIEW);
  const dragState = useRef<{ dragging: boolean; x: number; y: number; pointerId: number | null }>({
    dragging: false,
    x: 0,
    y: 0,
    pointerId: null
  });

  const selectedScene = useMemo(
    () => scenes.find((scene) => scene.dataset.dataset_id === selectedDatasetId) ?? scenes[0] ?? null,
    [scenes, selectedDatasetId]
  );

  useEffect(() => {
    setWebglState(shouldForceStaticEarth() || !supportsWebGL() ? "unavailable" : "available");
  }, []);

  useEffect(() => {
    setAutoRotate(!reducedMotion);
  }, [reducedMotion]);

  useEffect(() => {
    if (!selectedScene) {
      return;
    }

    setView((current) => ({
      lat: selectedScene.center.lat,
      lon: selectedScene.center.lon,
      distance: Math.min(current.distance, 3.15)
    }));
  }, [selectedScene]);

  function beginDrag(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragState.current = {
      dragging: true,
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId
    };
    setAutoRotate(false);
  }

  function updateDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragState.current.dragging) {
      return;
    }

    const dx = event.clientX - dragState.current.x;
    const dy = event.clientY - dragState.current.y;
    dragState.current.x = event.clientX;
    dragState.current.y = event.clientY;
    setView((current) => ({
      ...current,
      lat: clamp(current.lat + dy * 0.18, -72, 72),
      lon: ((current.lon - dx * 0.24 + 540) % 360) - 180
    }));
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragState.current.pointerId !== null) {
      event.currentTarget.releasePointerCapture(dragState.current.pointerId);
    }
    dragState.current.dragging = false;
    dragState.current.pointerId = null;
  }

  function zoomBy(amount: number) {
    setAutoRotate(false);
    setView((current) => ({
      ...current,
      distance: clamp(current.distance + amount, 2.35, 4.15)
    }));
  }

  function resetView() {
    if (selectedScene) {
      setView({
        lat: selectedScene.center.lat,
        lon: selectedScene.center.lon,
        distance: 3.05
      });
    } else {
      setView(DEFAULT_VIEW);
    }
    setAutoRotate(!reducedMotion);
  }

  function rotateWest() {
    setAutoRotate(false);
    setView((current) => ({
      ...current,
      lon: ((current.lon - 36 + 540) % 360) - 180
    }));
  }

  return (
    <div
      className="earth-stage"
      data-testid="earth-stage"
      onPointerDown={webglState === "available" ? beginDrag : undefined}
      onPointerMove={webglState === "available" ? updateDrag : undefined}
      onPointerUp={webglState === "available" ? endDrag : undefined}
      onPointerCancel={webglState === "available" ? endDrag : undefined}
      onWheel={(event) => {
        if (webglState !== "available") {
          return;
        }
        event.preventDefault();
        zoomBy(event.deltaY > 0 ? 0.22 : -0.22);
      }}
    >
      {webglState === "checking" ? <EarthLoading /> : null}
      {webglState === "unavailable" ? (
        <EarthFallback scenes={scenes} selectedDatasetId={selectedDatasetId} onSceneSelect={onSceneSelect} />
      ) : null}
      {webglState === "available" ? (
        <EarthErrorBoundary onError={() => setWebglState("unavailable")}>
          <EarthScene
            scenes={scenes}
            selectedDatasetId={selectedDatasetId}
            onSceneSelect={onSceneSelect}
            autoRotate={autoRotate}
            reducedMotion={reducedMotion}
            textureUrl={EARTH_TEXTURE_URL}
            view={view}
            onViewChange={setView}
            onSceneReady={() => setSceneReady(true)}
          />
        </EarthErrorBoundary>
      ) : null}

      <div className="earth-control-bar" aria-label="Globe controls">
        <button className="icon-button earth-control-button" type="button" onClick={rotateWest} title="Rotate view" aria-label="Rotate view">
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
        </button>
        <button className="icon-button earth-control-button" type="button" onClick={() => zoomBy(-0.28)} title="Zoom in" aria-label="Zoom in">
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
        <button className="icon-button earth-control-button" type="button" onClick={() => zoomBy(0.28)} title="Zoom out" aria-label="Zoom out">
          <Minus className="h-4 w-4" aria-hidden="true" />
        </button>
        <button className="icon-button earth-control-button" type="button" onClick={resetView} title="Reset view" aria-label="Reset view">
          <LocateFixed className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {webglState === "available" && !sceneReady ? (
        <div className="earth-static-status" role="status">
          Loading Earth
        </div>
      ) : null}
    </div>
  );
}
