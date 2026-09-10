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

def test_orchestration_registry_discloses_ready_and_planned_specialists() -> None:
    response = client.get("/api/orchestration/registry")
    assert response.status_code == 200
    payload = response.json()
    states = {item["specialist_id"]: item["state"] for item in payload["specialists"]}
    assert states["water_ndwi_specialist"] == "ready"
    assert states["rs_vqa_specialist"] == "planned"
    assert states["temporal_change_specialist"] == "planned"
    assert states["optical_sar_fusion_specialist"] == "planned"


def test_orchestration_routes_verified_water_measurement() -> None:
    response = client.post(
        "/api/orchestration/plan",
        json={
            "question": "Find water bodies in this image, calculate their approximate area, and highlight the largest one.",
            "dataset_ids": ["synthetic-pune-water-fixture"],
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["task"] == "geospatial_measurement"
    assert payload["inputs"][0]["modality"] == "optical_multispectral"
    assert payload["compatibility"]["compatible"] is True
    assert payload["executable"] is True
    assert "calculate_ndwi" in payload["selected_tools"]
    assert payload["internal_reasoning_exposed"] is False


def test_orchestration_routes_single_image_vqa_without_faking_execution() -> None:
    response = client.post(
        "/api/orchestration/plan",
        json={
            "question": "Describe the land cover and major objects visible in this image.",
            "dataset_ids": ["synthetic-pune-water-fixture"],
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["task"] == "single_image_vqa"
    assert payload["required_input_count"] == 1
    assert payload["executable"] is False
    selected = {item["specialist_id"]: item["state"] for item in payload["selected_specialists"]}
    assert selected["rs_vqa_specialist"] == "planned"


def test_orchestration_temporal_route_requires_two_inputs() -> None:
    response = client.post(
        "/api/orchestration/plan",
        json={
            "question": "What changed between these two dates and where did the change occur?",
            "dataset_ids": ["synthetic-pune-water-fixture"],
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["task"] == "temporal_change"
    assert payload["required_input_count"] == 2
    assert payload["compatibility"]["compatible"] is False
    assert payload["executable"] is False
    assert any("requires exactly 2" in reason for reason in payload["compatibility"]["blocking_reasons"])


def test_orchestration_optical_sar_route_requires_modalities() -> None:
    response = client.post(
        "/api/orchestration/plan",
        json={
            "question": "Use optical and SAR images together to identify water-covered regions.",
            "dataset_ids": ["synthetic-pune-water-fixture", "synthetic-pune-water-fixture"],
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["task"] == "optical_sar_fusion"
    assert payload["executable"] is False
    assert any(
        "one optical/multispectral input and one SAR input" in reason
        for reason in payload["compatibility"]["blocking_reasons"]
    )

def test_vqa_status_is_honest_before_optional_runtime_is_enabled() -> None:
    response = client.get("/api/vqa/status")
    assert response.status_code == 200
    payload = response.json()
    assert payload["model_id"] == "AdaptLLM/remote-sensing-Qwen2-VL-2B-Instruct"
    assert payload["remote_sensing_adapted"] is True
    assert isinstance(payload["dependencies_available"], bool)
    assert isinstance(payload["enabled"], bool)


def test_vqa_query_returns_503_when_runtime_is_disabled() -> None:
    response = client.post(
        "/api/vqa/query",
        json={
            "dataset_id": "synthetic-pune-water-fixture",
            "question": "Describe the land cover and major objects visible in this image.",
        },
    )
    assert response.status_code == 503
    assert "disabled" in response.json()["detail"].lower()


def test_water_analysis_remains_available_with_vqa_disabled() -> None:
    response = client.post(
        "/api/query",
        json={
            "dataset_id": "synthetic-pune-water-fixture",
            "question": (
                "Find water bodies in this image, calculate their approximate "
                "area, and highlight the largest one."
            ),
        },
    )
    assert response.status_code == 200
    assert response.json()["metrics"]["total_water_area_ha"] > 0
