from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping

import numpy as np
import rasterio
from pyproj import Transformer

from satquery.schemas import DemoDatasetSummary


@dataclass(frozen=True)
class PixelTransform:
    origin_x: float
    origin_y: float
    pixel_size_x: float
    pixel_size_y: float

    def pixel_bounds(self, row: int, col: int) -> tuple[float, float, float, float]:
        min_x = self.origin_x + col * self.pixel_size_x
        max_x = self.origin_x + (col + 1) * self.pixel_size_x
        max_y = self.origin_y - row * self.pixel_size_y
        min_y = self.origin_y - (row + 1) * self.pixel_size_y
        return min_x, min_y, max_x, max_y

    @property
    def pixel_area_m2(self) -> float:
        return abs(self.pixel_size_x * self.pixel_size_y)


@dataclass(frozen=True)
class RasterBundle:
    dataset_id: str
    name: str
    provider: str
    usage_note: str
    acquisition_date: str | None
    location: str
    crs: str
    transform: PixelTransform
    bands: Mapping[str, np.ndarray]
    band_definitions: Mapping[str, str]
    source_url: str | None = None
    licence_or_usage: str = "Unspecified"
    preprocessing: tuple[str, ...] = ()
    checksum_sha256: str | None = None
    extra_metadata: Mapping[str, object] | None = None

    @property
    def shape(self) -> tuple[int, int]:
        first_band = next(iter(self.bands.values()))
        return first_band.shape

    @property
    def projected_bounds(self) -> tuple[float, float, float, float]:
        height, width = self.shape
        min_x = self.transform.origin_x
        max_y = self.transform.origin_y
        max_x = self.transform.origin_x + width * self.transform.pixel_size_x
        min_y = self.transform.origin_y - height * self.transform.pixel_size_y
        return min_x, min_y, max_x, max_y

    @property
    def bounds_wgs84(self) -> list[float]:
        min_x, min_y, max_x, max_y = self.projected_bounds
        transformer = Transformer.from_crs(self.crs, "EPSG:4326", always_xy=True)
        corners = [
            transformer.transform(min_x, min_y),
            transformer.transform(min_x, max_y),
            transformer.transform(max_x, min_y),
            transformer.transform(max_x, max_y),
        ]
        longitudes = [corner[0] for corner in corners]
        latitudes = [corner[1] for corner in corners]
        return [float(min(longitudes)), float(min(latitudes)), float(max(longitudes)), float(max(latitudes))]

    def summary(self) -> DemoDatasetSummary:
        return DemoDatasetSummary(
            dataset_id=self.dataset_id,
            name=self.name,
            provider=self.provider,
            source_url=self.source_url,
            licence_or_usage=self.licence_or_usage,
            acquisition_date=self.acquisition_date,
            location=self.location,
            crs=self.crs,
            pixel_size_m=float(self.transform.pixel_size_x),
            bounds_wgs84=self.bounds_wgs84,
            bands=sorted(self.bands.keys()),
            preprocessing=list(self.preprocessing),
            usage_note=self.usage_note,
        )


class DatasetNotFoundError(ValueError):
    pass


class UnsupportedBandError(ValueError):
    pass


REPO_ROOT = Path(__file__).resolve().parents[3]
DEMO_DATA_DIR = REPO_ROOT / "data" / "demo"
DEMO_REGISTRY_PATH = DEMO_DATA_DIR / "registry.json"


def ensure_required_bands(raster: RasterBundle, required_bands: list[str]) -> None:
    missing = [band for band in required_bands if band not in raster.bands]
    if missing:
        raise UnsupportedBandError(f"Dataset {raster.dataset_id} is missing required bands: {', '.join(missing)}")


def create_synthetic_pune_water_fixture() -> RasterBundle:
    height = 80
    width = 80
    rows, cols = np.ogrid[:height, :width]

    green = np.full((height, width), 0.22, dtype=np.float32)
    red = np.full((height, width), 0.20, dtype=np.float32)
    nir = np.full((height, width), 0.28, dtype=np.float32)
    swir = np.full((height, width), 0.24, dtype=np.float32)

    large_water = ((rows - 48) / 12) ** 2 + ((cols - 27) / 16) ** 2 <= 1
    small_water = ((rows - 18) / 7) ** 2 + ((cols - 58) / 8) ** 2 <= 1
    vegetation = ((rows - 24) / 13) ** 2 + ((cols - 24) / 12) ** 2 <= 1
    built_up = (rows >= 48) & (rows <= 68) & (cols >= 50) & (cols <= 72)

    green[vegetation] = 0.30
    red[vegetation] = 0.08
    nir[vegetation] = 0.66
    swir[vegetation] = 0.18

    green[built_up] = 0.24
    red[built_up] = 0.25
    nir[built_up] = 0.22
    swir[built_up] = 0.44

    water = large_water | small_water
    green[water] = 0.34
    red[water] = 0.04
    nir[water] = 0.035
    swir[water] = 0.025

    return RasterBundle(
        dataset_id="synthetic-pune-water-fixture",
        name="Synthetic Pune water/land-cover fixture",
        provider="Generated locally for calculation tests",
        usage_note="Synthetic raster for deterministic tests only; not real satellite imagery.",
        licence_or_usage="Generated test fixture; no external data licence.",
        acquisition_date=None,
        location="Pune region synthetic grid, India",
        crs="EPSG:32643",
        transform=PixelTransform(origin_x=700000.0, origin_y=2050000.0, pixel_size_x=10.0, pixel_size_y=10.0),
        bands={
            "green": green,
            "red": red,
            "nir": nir,
            "swir": swir,
        },
        band_definitions={
            "green": "Synthetic green reflectance band",
            "red": "Synthetic red reflectance band",
            "nir": "Synthetic near-infrared reflectance band",
            "swir": "Synthetic short-wave infrared reflectance band",
        },
    )


def calculate_file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file_handle:
        for chunk in iter(lambda: file_handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _load_registry() -> list[dict]:
    if not DEMO_REGISTRY_PATH.exists():
        return []

    with DEMO_REGISTRY_PATH.open("r", encoding="utf-8") as file_handle:
        payload = json.load(file_handle)
    return list(payload.get("datasets", []))


def _pixel_transform_from_rasterio(transform: object) -> PixelTransform:
    if not np.isclose(float(transform.b), 0.0) or not np.isclose(float(transform.d), 0.0):
        raise ValueError("Rotated or sheared rasters are not supported by the current PixelTransform loader")

    return PixelTransform(
        origin_x=float(transform.c),
        origin_y=float(transform.f),
        pixel_size_x=float(transform.a),
        pixel_size_y=abs(float(transform.e)),
    )


def _load_geotiff_dataset(metadata: dict) -> RasterBundle:
    data_path = DEMO_DATA_DIR / metadata["path"]
    if not data_path.exists():
        raise DatasetNotFoundError(f"Dataset file is missing: {data_path}")

    expected_checksum = metadata.get("checksum_sha256")
    actual_checksum = calculate_file_sha256(data_path)
    if expected_checksum and actual_checksum != expected_checksum:
        raise ValueError(f"Checksum mismatch for {metadata['dataset_id']}: expected {expected_checksum}, got {actual_checksum}")

    band_metadata = metadata.get("bands", [])
    band_names = [band["name"] for band in band_metadata]

    with rasterio.open(data_path) as dataset:
        if dataset.count != len(band_names):
            raise ValueError(
                f"Dataset {metadata['dataset_id']} has {dataset.count} band(s), expected {len(band_names)} from registry"
            )

        bands = {
            band_name: dataset.read(index + 1).astype(np.float32)
            for index, band_name in enumerate(band_names)
        }
        band_definitions = {
            band["name"]: band.get("description", band["name"])
            for band in band_metadata
        }
        crs = dataset.crs.to_string() if dataset.crs else metadata["crs"]
        transform = _pixel_transform_from_rasterio(dataset.transform)

    return RasterBundle(
        dataset_id=metadata["dataset_id"],
        name=metadata["name"],
        provider=metadata["provider"],
        usage_note=metadata["usage_note"],
        source_url=metadata.get("source_url"),
        licence_or_usage=metadata.get("licence_or_usage", "Unspecified"),
        acquisition_date=metadata.get("acquisition_date"),
        location=metadata["location"],
        crs=crs,
        transform=transform,
        bands=bands,
        band_definitions=band_definitions,
        preprocessing=tuple(metadata.get("preprocessing", [])),
        checksum_sha256=actual_checksum,
        extra_metadata=metadata,
    )


def get_demo_dataset(dataset_id: str) -> RasterBundle:
    datasets = {
        "synthetic-pune-water-fixture": create_synthetic_pune_water_fixture,
    }
    if dataset_id in datasets:
        return datasets[dataset_id]()

    for metadata in _load_registry():
        if metadata.get("dataset_id") == dataset_id:
            return _load_geotiff_dataset(metadata)

    raise DatasetNotFoundError(f"Unknown dataset_id: {dataset_id}")


def list_demo_datasets() -> list[DemoDatasetSummary]:
    summaries = [create_synthetic_pune_water_fixture().summary()]
    for metadata in _load_registry():
        try:
            summaries.append(_load_geotiff_dataset(metadata).summary())
        except Exception:
            continue
    return summaries
