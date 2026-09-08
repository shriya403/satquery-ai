from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

import httpx
import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.warp import reproject, transform_bounds
from rasterio.windows import from_bounds


REPO_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = REPO_ROOT / "data" / "demo"
ITEM_ID = "S2A_43QCA_20240304_0_L2A"
ITEM_URL = f"https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/{ITEM_ID}"
DATASET_ID = "sentinel2-pune-khadakwasla-2024-03-04"
OUTPUT_TIF = DATA_DIR / "sentinel2_pune_khadakwasla_20240304.tif"
REGISTRY_PATH = DATA_DIR / "registry.json"
STAC_COPY_PATH = DATA_DIR / "sentinel2_pune_khadakwasla_20240304.stac-item.json"

# A small Khadakwasla/Pune chip that keeps the demo portable while preserving
# a visible water-body signal for NDWI-based analysis.
AOI_BBOX_WGS84 = [73.735, 18.405, 73.815, 18.475]
OUTPUT_BANDS = [
    {
        "name": "blue",
        "asset_key": "blue",
        "description": "Sentinel-2 MSI Band 02 blue surface reflectance, 10 m",
    },
    {
        "name": "green",
        "asset_key": "green",
        "description": "Sentinel-2 MSI Band 03 green surface reflectance, 10 m",
    },
    {
        "name": "red",
        "asset_key": "red",
        "description": "Sentinel-2 MSI Band 04 red surface reflectance, 10 m",
    },
    {
        "name": "nir",
        "asset_key": "nir",
        "description": "Sentinel-2 MSI Band 08 near-infrared surface reflectance, 10 m",
    },
    {
        "name": "swir",
        "asset_key": "swir16",
        "description": "Sentinel-2 MSI Band 11 short-wave infrared surface reflectance, resampled from 20 m to 10 m",
    },
]


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file_handle:
        for chunk in iter(lambda: file_handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _fetch_stac_item() -> dict[str, Any]:
    response = httpx.get(ITEM_URL, timeout=60)
    response.raise_for_status()
    return response.json()


def _read_to_reference_grid(
    href: str,
    bbox_wgs84: list[float],
    reference_shape: tuple[int, int] | None = None,
    reference_transform: object | None = None,
    reference_crs: object | None = None,
) -> tuple[np.ndarray, object, object]:
    with rasterio.open(href) as src:
        if reference_shape is None or reference_transform is None or reference_crs is None:
            projected_bounds = transform_bounds("EPSG:4326", src.crs, *bbox_wgs84, densify_pts=21)
            window = from_bounds(*projected_bounds, transform=src.transform).round_offsets().round_lengths()
            data = src.read(1, window=window, masked=True).astype(np.float32).filled(np.nan) / 10000.0
            return data, src.window_transform(window), src.crs

        projected_bounds = transform_bounds("EPSG:4326", src.crs, *bbox_wgs84, densify_pts=21)
        window = from_bounds(*projected_bounds, transform=src.transform).round_offsets().round_lengths()
        source = src.read(1, window=window, masked=True).astype(np.float32).filled(np.nan) / 10000.0
        destination = np.full(reference_shape, np.nan, dtype=np.float32)
        reproject(
            source=source,
            destination=destination,
            src_transform=src.window_transform(window),
            src_crs=src.crs,
            dst_transform=reference_transform,
            dst_crs=reference_crs,
            resampling=Resampling.bilinear,
            src_nodata=np.nan,
            dst_nodata=np.nan,
        )
        return destination, reference_transform, reference_crs


def create_dataset() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    item = _fetch_stac_item()
    STAC_COPY_PATH.write_text(json.dumps(item, indent=2), encoding="utf-8")

    first_asset = item["assets"][OUTPUT_BANDS[0]["asset_key"]]["href"]
    first_band, reference_transform, reference_crs = _read_to_reference_grid(first_asset, AOI_BBOX_WGS84)
    height, width = first_band.shape

    arrays = [first_band]
    for band in OUTPUT_BANDS[1:]:
        array, _, _ = _read_to_reference_grid(
            item["assets"][band["asset_key"]]["href"],
            AOI_BBOX_WGS84,
            reference_shape=(height, width),
            reference_transform=reference_transform,
            reference_crs=reference_crs,
        )
        arrays.append(array)

    profile = {
        "driver": "GTiff",
        "height": height,
        "width": width,
        "count": len(arrays),
        "dtype": "float32",
        "crs": reference_crs,
        "transform": reference_transform,
        "compress": "deflate",
        "predictor": 3,
        "tiled": True,
        "blockxsize": 256,
        "blockysize": 256,
        "nodata": np.nan,
    }

    with rasterio.open(OUTPUT_TIF, "w", **profile) as dst:
        for index, (array, band) in enumerate(zip(arrays, OUTPUT_BANDS), start=1):
            dst.write(array.astype(np.float32), index)
            dst.set_band_description(index, band["name"])
            dst.update_tags(index, description=band["description"], source_asset=band["asset_key"])
        dst.update_tags(
            dataset_id=DATASET_ID,
            stac_item_id=ITEM_ID,
            source_stac_item=ITEM_URL,
            aoi_bbox_wgs84=json.dumps(AOI_BBOX_WGS84),
            reflectance_scale="source digital numbers divided by 10000",
        )

    checksum = _sha256(OUTPUT_TIF)
    registry = {
        "datasets": [
            {
                "dataset_id": DATASET_ID,
                "name": "Sentinel-2 L2A Khadakwasla/Pune demo chip",
                "provider": "Copernicus Sentinel-2 L2A via Element 84 Earth Search / AWS Open Data",
                "source_url": ITEM_URL,
                "licence_or_usage": "Copernicus Sentinel data are available on a free, full and open basis; public communication should acknowledge 'Copernicus Sentinel data 2024'.",
                "usage_note": "Real Sentinel-2 L2A optical sample clipped for offline demonstration; water detection is algorithmic and not externally validated.",
                "acquisition_date": item["properties"].get("datetime"),
                "location": "Khadakwasla/Pune, Maharashtra, India",
                "crs": str(reference_crs),
                "pixel_size_m": 10.0,
                "aoi_bbox_wgs84": AOI_BBOX_WGS84,
                "stac_item_id": ITEM_ID,
                "stac_copy": STAC_COPY_PATH.name,
                "cloud_cover_percent": item["properties"].get("eo:cloud_cover"),
                "path": OUTPUT_TIF.name,
                "checksum_sha256": checksum,
                "bands": [
                    {
                        "name": band["name"],
                        "description": band["description"],
                        "source_asset": band["asset_key"],
                        "source_href": item["assets"][band["asset_key"]]["href"],
                    }
                    for band in OUTPUT_BANDS
                ],
                "preprocessing": [
                    "Queried exact Earth Search STAC item S2A_43QCA_20240304_0_L2A.",
                    "Clipped bands to AOI bbox [73.735, 18.405, 73.815, 18.475] in EPSG:4326.",
                    "Converted Sentinel-2 scaled reflectance digital numbers to float reflectance by dividing by 10000.",
                    "Resampled Band 11 SWIR from 20 m to the 10 m Band 03 reference grid using bilinear resampling.",
                    "Wrote a local compressed multiband GeoTIFF for offline demo reproducibility.",
                ],
            }
        ]
    }
    REGISTRY_PATH.write_text(json.dumps(registry, indent=2), encoding="utf-8")
    print(f"Wrote {OUTPUT_TIF}")
    print(f"Wrote {REGISTRY_PATH}")
    print(f"SHA256 {checksum}")
    print(f"Shape {height}x{width}, CRS {reference_crs}")


if __name__ == "__main__":
    create_dataset()
