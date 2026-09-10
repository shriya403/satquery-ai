from __future__ import annotations

from io import BytesIO

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from satquery.analysis.spatial_query import InvalidAnalysisOptionError, run_query
from satquery.config import get_settings
from satquery.geospatial.raster import DatasetNotFoundError, UnsupportedBandError, get_demo_dataset, list_demo_datasets
from satquery.orchestration import build_orchestration_plan, registry_payload
from satquery.query_planner import UnsupportedQueryError
from satquery.schemas import (
    AnalysisResponse,
    DemoDatasetSummary,
    OrchestrationPlanResponse,
    OrchestrationRequest,
    QueryRequest,
)
from satquery.visualization.preview import render_preview_png, render_spectral_preview_png

settings = get_settings()

app = FastAPI(
    title="GeoNexus SatQuery AI API",
    version="0.1.0",
    description="Evidence-grounded remote sensing query backend.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.allowed_origins),
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/ready")
def ready() -> dict[str, object]:
    return {
        "status": "ready",
        "demo_mode": settings.demo_mode,
        "datasets_available": len(list_demo_datasets()),
    }


@app.get("/api/demo-datasets", response_model=list[DemoDatasetSummary])
def demo_datasets() -> list[DemoDatasetSummary]:
    return list_demo_datasets()


@app.get("/api/demo-datasets/{dataset_id}/preview.png")
def dataset_preview(dataset_id: str) -> StreamingResponse:
    try:
        preview = render_preview_png(get_demo_dataset(dataset_id))
    except DatasetNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    return StreamingResponse(BytesIO(preview), media_type="image/png")


@app.get("/api/demo-datasets/{dataset_id}/spectral/{mode}.png")
def dataset_spectral_preview(dataset_id: str, mode: str) -> StreamingResponse:
    try:
        preview = render_spectral_preview_png(get_demo_dataset(dataset_id), mode)
    except DatasetNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except UnsupportedBandError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return StreamingResponse(BytesIO(preview), media_type="image/png")


@app.get("/api/orchestration/registry")
def orchestration_registry() -> dict[str, object]:
    return {
        "registry_version": "satquery-specialists-v1",
        "specialists": registry_payload(),
    }


@app.post("/api/orchestration/plan", response_model=OrchestrationPlanResponse)
def orchestration_plan(request: OrchestrationRequest) -> OrchestrationPlanResponse:
    try:
        return build_orchestration_plan(request)
    except DatasetNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/api/query", response_model=AnalysisResponse)
def query(request: QueryRequest) -> AnalysisResponse:
    try:
        return run_query(
            question=request.question,
            dataset_id=request.dataset_id,
            analysis_options=request.analysis_options,
        )
    except DatasetNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except UnsupportedBandError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except UnsupportedQueryError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except InvalidAnalysisOptionError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
