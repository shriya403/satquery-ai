from fastapi.testclient import TestClient

from satquery.api import app


client = TestClient(app)


def test_health_and_ready_endpoints() -> None:
    assert client.get("/health").json() == {"status": "ok"}

    ready = client.get("/ready").json()
    assert ready["status"] == "ready"
    assert ready["datasets_available"] >= 1


def test_demo_dataset_contract() -> None:
    response = client.get("/api/demo-datasets")

    assert response.status_code == 200
    datasets = response.json()
    assert datasets[0]["dataset_id"] == "synthetic-pune-water-fixture"
    assert len(datasets[0]["bounds_wgs84"]) == 4
    assert "Synthetic raster" in datasets[0]["usage_note"]


def test_preview_endpoint_returns_png() -> None:
    response = client.get("/api/demo-datasets/synthetic-pune-water-fixture/preview.png")

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.content.startswith(b"\x89PNG")


def test_spectral_preview_endpoints_return_png() -> None:
    for mode in ("rgb", "green", "nir", "ndwi", "water-mask"):
        response = client.get(
            f"/api/demo-datasets/synthetic-pune-water-fixture/spectral/{mode}.png"
        )
        assert response.status_code == 200
        assert response.headers["content-type"] == "image/png"
        assert response.content.startswith(b"\x89PNG")


def test_spectral_preview_rejects_unknown_mode() -> None:
    response = client.get(
        "/api/demo-datasets/synthetic-pune-water-fixture/spectral/not-a-mode.png"
    )
    assert response.status_code == 400
    assert "Supported modes" in response.json()["detail"]


def test_query_contract_returns_grounded_response() -> None:
    response = client.post(
        "/api/query",
        json={
            "dataset_id": "synthetic-pune-water-fixture",
            "question": "Find water bodies in this image, calculate their approximate area, and highlight the largest one.",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["dataset_id"] == "synthetic-pune-water-fixture"
    assert payload["evidence"][0]["crs"] == "EPSG:32643"
    assert payload["evidence"][0]["calculated_area_m2"] > 0
    assert payload["overlays"]
    assert payload["judge_trace"]["tools_executed"]


def test_query_with_aoi_constrains_analysis() -> None:
    datasets = client.get("/api/demo-datasets").json()
    dataset = next(
        item for item in datasets
        if item["dataset_id"] == "synthetic-pune-water-fixture"
    )
    west, south, east, north = dataset["bounds_wgs84"]
    midpoint_lon = (west + east) / 2.0

    question = (
        "Find water bodies in this image, calculate their approximate area, "
        "and highlight the largest one."
    )
    full_response = client.post(
        "/api/query",
        json={
            "dataset_id": "synthetic-pune-water-fixture",
            "question": question,
        },
    )
    assert full_response.status_code == 200

    aoi_bbox = [west, south, midpoint_lon, north]
    aoi_response = client.post(
        "/api/query",
        json={
            "dataset_id": "synthetic-pune-water-fixture",
            "question": question,
            "analysis_options": {"aoi_bbox_wgs84": aoi_bbox},
        },
    )
    assert aoi_response.status_code == 200

    full_payload = full_response.json()
    aoi_payload = aoi_response.json()

    assert aoi_payload["metrics"]["aoi_applied"] is True
    assert aoi_payload["metrics"]["analysis_scope"] == "selected_aoi"
    assert aoi_payload["metrics"]["aoi_pixel_count"] > 0
    assert (
        aoi_payload["metrics"]["total_water_area_ha"]
        < full_payload["metrics"]["total_water_area_ha"]
    )
    assert aoi_payload["evidence"][0]["coordinates"]["aoi_bbox_wgs84"]
    assert (
        aoi_payload["judge_trace"]["generated_plan"]["spatial_constraints"][
            "aoi_bbox_wgs84"
        ]
    )


def test_query_rejects_invalid_aoi() -> None:
    response = client.post(
        "/api/query",
        json={
            "dataset_id": "synthetic-pune-water-fixture",
            "question": (
                "Find water bodies in this image, calculate their approximate "
                "area, and highlight the largest one."
            ),
            "analysis_options": {
                "aoi_bbox_wgs84": [74.0, 19.0, 73.0, 18.0]
            },
        },
    )
    assert response.status_code == 422
    assert "west < east" in response.json()["detail"]


def test_unsupported_query_returns_422() -> None:
    response = client.post(
        "/api/query",
        json={"dataset_id": "synthetic-pune-water-fixture", "question": "Predict tomorrow's rainfall from this image."},
    )

    assert response.status_code == 422
