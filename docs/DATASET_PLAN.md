# Dataset Plan

## Milestone 1

The current repository uses one clearly labeled synthetic raster fixture:

- Dataset ID: `synthetic-pune-water-fixture`
- Provider: generated locally in code
- Purpose: deterministic unit and integration testing only
- Usage note: not real satellite imagery; not valid for field claims
- CRS: EPSG:32643
- Pixel size: 10 m
- Bands: green, red, nir, swir

## Real Demo Dataset Added In Milestone 2

Primary packaged dataset:

- Sentinel-2 Level-2A optical sample from the public Earth Search/AWS COG catalog.
- Dataset ID: `sentinel2-pune-khadakwasla-2024-03-04`
- Scene: `S2A_43QCA_20240304_0_L2A`
- Location: Khadakwasla/Pune, Maharashtra, India.
- Bands: blue, green, red, NIR, SWIR.
- Local path: `data/demo/sentinel2_pune_khadakwasla_20240304.tif`
- Attribution details: `docs/DATASET_ATTRIBUTION.md`

This is now the primary real imagery sample for the spatial water-query demo.

## Remaining Candidate Data For Later Milestones

Temporal plan:

- Add a second Sentinel-2 acquisition over the same AOI, preferably same MGRS tile and low cloud cover.
- Validate alignment before differencing NDVI/NDWI/NDBI.

Fallback plan:

- Landsat Collection 2 Level-2 sample from USGS/NASA if Sentinel-2 acquisition or access becomes unreliable.

SAR/fusion plan:

- Add Sentinel-1 GRD or a preprocessed VV/VH sample only if a verified open-access sample can be clipped and cached reliably before the demo freeze.
- If SAR cannot be completed, present a modular fusion interface with one verified multiband optical example and explicitly label SAR as future work.

## Non-Negotiable Metadata Fields

- provider
- source URL
- licence or usage note
- acquisition date
- location
- spatial resolution
- CRS
- band definitions
- preprocessing performed
- checksum for reproducibility
