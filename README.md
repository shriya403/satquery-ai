# GeoNexus - SatQuery AI

Competition target: SIH26167, "An Interactive Vision-Language Assistant for Multimodal Remote Sensing Image Analysis through Text Queries".

## Current Milestone Status

Implemented in Milestone 1:

- Deterministic backend nucleus with FastAPI.
- Validated `QueryPlan`, `AnalysisEvidence`, and `AnalysisResponse` schemas.
- Synthetic raster fixture for calculation tests only.
- NDWI/NDVI/NDBI index functions.
- Water segmentation using NDWI thresholding.
- Mask vectorization into projected and WGS84 polygons.
- Projection-aware area calculation.
- Evidence-grounded spatial query endpoint.
- Health/readiness endpoints and basic environment configuration.
- Unit, API contract, and spatial scenario integration tests.

Implemented in Milestone 2:

- Real Sentinel-2 L2A Pune/Khadakwasla demo chip generation script.
- Local dataset registry with source URL, acquisition date, CRS, bands, preprocessing, cloud-cover metadata, and SHA256 checksum.
- Rasterio-based local GeoTIFF ingestion into the deterministic analysis pipeline.
- Real imagery water-query API path using the same evidence schema as the synthetic fixture.

Not yet implemented:

- Frontend geospatial workstation.
- Temporal change scenario.
- Multiband/SAR fusion scenario.
- Exportable PDF/HTML report.
- Docker and full presentation artifact pack.

## Run Locally

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install --upgrade pip
.\.venv\Scripts\python -m pip install -e ".[dev]"
.\.venv\Scripts\python tools\create_demo_dataset.py
.\.venv\Scripts\python -m pytest
.\.venv\Scripts\python -m uvicorn satquery.api:app --host 127.0.0.1 --port 8000
```

Open the API docs at [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs).

Example spatial query:

```powershell
Invoke-RestMethod `
  -Uri http://127.0.0.1:8000/api/query `
  -Method Post `
  -ContentType "application/json" `
  -Body '{"question":"Find water bodies in this image, calculate their approximate area, and highlight the largest one.","dataset_id":"sentinel2-pune-khadakwasla-2024-03-04"}'
```

## Technical Principle

SatQuery AI must not invent pixel-level findings. The query planner may interpret intent, but masks, polygons, area, coordinates, confidence, and evidence must come from deterministic geospatial tools or explicitly named models.

Milestone 1 uses a deterministic keyword planner rather than an LLM. This is deliberate graceful degradation: the backend already works when model access is absent, and future LLM integration must produce a validated `QueryPlan` before any tool runs.

## Demo Data

The primary demo dataset is a clipped Sentinel-2 L2A sample over Khadakwasla/Pune, acquired on 2024-03-04. The synthetic fixture remains only for calculation tests and must not be presented as satellite evidence.
