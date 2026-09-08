# Milestone 2 Status

Goal: replace demo-only synthetic imagery with a real, legally usable, cached satellite sample while keeping the deterministic backend contract.

Implemented:

- `tools/create_demo_dataset.py` downloads and clips one exact Sentinel-2 L2A STAC item.
- Real demo dataset registry at `data/demo/registry.json`.
- Local multiband GeoTIFF at `data/demo/sentinel2_pune_khadakwasla_20240304.tif`.
- Source STAC item copy at `data/demo/sentinel2_pune_khadakwasla_20240304.stac-item.json`.
- Rasterio ingestion path that loads real multiband reflectance into `RasterBundle`.
- Checksum validation before loading packaged real demo data.
- Real dataset appears in `/api/demo-datasets`.
- Existing spatial water query runs on real Sentinel-2 pixels.

Verified:

- Test suite: 17 passed.
- API sample query on `sentinel2-pune-khadakwasla-2024-03-04` returned:
  - 2 displayed water-body polygon(s) after component filtering.
  - total displayed water area: 503.33 ha.
  - largest water polygon: 502.90 ha.
  - confidence: 0.82, capped because no ground-truth validation or per-pixel cloud/shadow mask is implemented yet.

Still not implemented:

- Frontend map rendering.
- Temporal before/after dataset pair.
- SAR/optical fusion.
- Cloud/shadow masking with Sentinel-2 SCL.
- Report export.

Demo warning:

The Sentinel-2 chip is real imagery, but the water mask is a threshold-based analysis result. It should be demonstrated as an explainable remote-sensing estimate, not as an officially validated hydrology product.
