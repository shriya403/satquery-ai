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


def test_unsupported_query_returns_422() -> None:
    response = client.post(
        "/api/query",
        json={"dataset_id": "synthetic-pune-water-fixture", "question": "Predict tomorrow's rainfall from this image."},
    )

    assert response.status_code == 422
