# Milestone 1 Status

Goal: establish a trustworthy geospatial backend nucleus before building UI polish.

Implemented:

- FastAPI application with `/health`, `/ready`, `/api/demo-datasets`, and `/api/query`.
- Deterministic water-body query on a synthetic multispectral raster.
- NDWI-derived segmentation with vectorized polygon overlays.
- Area calculations in projected CRS units.
- WGS84 coordinates for map display.
- Evidence, confidence, warnings, and judge trace in every response.
- Tests for indices, area, query-plan validation, API contract, and the spatial scenario.

Validation scope:

- Synthetic calculation fixture only.
- No real satellite dataset has been packaged yet.
- No frontend has been built yet.

Next milestone:

Package one real open Sentinel-2 or Landsat scene clip with attribution, then wire a minimal map frontend to the backend response.
