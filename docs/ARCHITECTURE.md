# GeoNexus SatQuery AI Architecture

## Target Architecture

```mermaid
flowchart LR
  U["User query"] --> FE["Geospatial workstation UI"]
  FE --> API["FastAPI backend"]
  API --> Planner["Validated query planner"]
  Planner --> Tools["Deterministic geospatial tools"]
  Tools --> Evidence["Evidence ledger"]
  Evidence --> Explainer["Grounded explanation generator"]
  Evidence --> Overlay["Map overlays and metrics"]
  Explainer --> API
  Overlay --> API
  API --> FE
```

## Milestone 1 Architecture

```mermaid
flowchart LR
  Q["POST /api/query"] --> P["Deterministic planner"]
  P --> M["Synthetic raster fixture"]
  M --> I["NDWI calculation"]
  I --> S["Water segmentation"]
  S --> V["Mask vectorization"]
  V --> A["Projected area calculation"]
  A --> R["AnalysisResponse with evidence, overlays, metrics, judge trace"]
```

## Planned Tool Contract

- `inspect_raster_metadata`
- `validate_crs`
- `calculate_ndvi`
- `calculate_ndwi`
- `calculate_ndbi`
- `segment_water`
- `classify_land_cover`
- `detect_temporal_change`
- `vectorize_mask`
- `calculate_polygon_area`
- `locate_features`
- `compare_regions`
- `create_map_overlay`
- `generate_grounded_explanation`
- `export_analysis_report`

Milestone 1 implements the core path for water segmentation and area calculation. Temporal change, real raster ingestion, and multimodal fusion remain planned.
