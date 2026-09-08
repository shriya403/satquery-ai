# Dataset Attribution

## Sentinel-2 Pune/Khadakwasla Demo Chip

- Dataset ID: `sentinel2-pune-khadakwasla-2024-03-04`
- Source STAC item: `S2A_43QCA_20240304_0_L2A`
- Source catalog URL: `https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/S2A_43QCA_20240304_0_L2A`
- Acquisition datetime: `2024-03-04T05:43:56.801000Z`
- Platform/instrument: Sentinel-2A MSI
- Location: Khadakwasla/Pune, Maharashtra, India
- AOI bbox: `[73.735, 18.405, 73.815, 18.475]` in EPSG:4326
- CRS after clipping: EPSG:32643
- Pixel size: 10 m reference grid
- Bands packaged: blue/B02, green/B03, red/B04, NIR/B08, SWIR/B11 resampled to 10 m
- Local file: `data/demo/sentinel2_pune_khadakwasla_20240304.tif`

## Licence And Usage Note

Copernicus Sentinel data are available on a free, full and open basis. Public communication or distribution should acknowledge the source, for this sample: `Copernicus Sentinel data 2024`.

The local file is a clipped and resampled derivative for offline demonstration. It is suitable for showing the SatQuery pipeline, but it is not a validated hydrological product.

## Preprocessing

1. Queried exact Earth Search STAC item `S2A_43QCA_20240304_0_L2A`.
2. Read public Sentinel-2 L2A COG band assets from AWS Open Data.
3. Clipped the AOI around Khadakwasla/Pune.
4. Converted scaled reflectance digital numbers to float reflectance by dividing by `10000`.
5. Resampled SWIR/B11 from 20 m to the 10 m Band 02 reference grid.
6. Wrote a compressed local multiband GeoTIFF and registry entry with SHA256 checksum.

## Synthetic Fixture

- Dataset ID: `synthetic-pune-water-fixture`
- Provider: generated locally in code
- Purpose: calculation and API tests only
- Usage note: not satellite imagery and must not be used for performance claims
