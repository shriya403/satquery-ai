from __future__ import annotations

import importlib.util
from dataclasses import dataclass
from functools import lru_cache
from io import BytesIO
from time import perf_counter
from typing import Any

from PIL import Image

from satquery.config import get_settings
from satquery.geospatial.raster import get_demo_dataset
from satquery.schemas import VqaResponse, VqaStatusResponse
from satquery.visualization.preview import render_preview_png


MODEL_ADAPTATION_NOTE = (
    "AdaptLLM/remote-sensing-Qwen2-VL-2B-Instruct is a Qwen2-VL model "
    "post-trained on remote-sensing visual instructions."
)


class VqaRuntimeUnavailableError(RuntimeError):
    pass


@dataclass
class LoadedVqaRuntime:
    model: Any
    processor: Any
    torch: Any
    device: str
    dtype_name: str


def _dependency_available(name: str) -> bool:
    return importlib.util.find_spec(name) is not None


def vqa_dependencies_available() -> bool:
    return _dependency_available("torch") and _dependency_available("transformers")


def _resolve_device(torch_module: Any, requested: str) -> str:
    normalized = requested.strip().lower()
    if normalized == "auto":
        return "cuda" if torch_module.cuda.is_available() else "cpu"
    if normalized == "cuda":
        if not torch_module.cuda.is_available():
            raise VqaRuntimeUnavailableError(
                "SATQUERY_VQA_DEVICE=cuda was requested, but CUDA is not available."
            )
        return "cuda"
    if normalized == "cpu":
        return "cpu"
    raise VqaRuntimeUnavailableError(
        "SATQUERY_VQA_DEVICE must be one of: auto, cuda, cpu."
    )


@lru_cache(maxsize=1)
def load_vqa_runtime() -> LoadedVqaRuntime:
    settings = get_settings()
    if not settings.vqa_enabled:
        raise VqaRuntimeUnavailableError(
            "Remote-sensing VQA is disabled. Set SATQUERY_VQA_ENABLED=1 before starting the backend."
        )
    if not vqa_dependencies_available():
        raise VqaRuntimeUnavailableError(
            "Remote-sensing VQA dependencies are missing. Install the optional VQA dependencies first."
        )

    import torch
    from transformers import AutoProcessor, Qwen2VLForConditionalGeneration

    device = _resolve_device(torch, settings.vqa_device)
    dtype = torch.float16 if device == "cuda" else torch.float32
    dtype_name = str(dtype).replace("torch.", "")

    processor = AutoProcessor.from_pretrained(
        settings.vqa_model_id,
        trust_remote_code=False,
    )
    model = Qwen2VLForConditionalGeneration.from_pretrained(
        settings.vqa_model_id,
        torch_dtype=dtype,
        low_cpu_mem_usage=True,
        trust_remote_code=False,
    )
    model.to(device)
    model.eval()

    return LoadedVqaRuntime(
        model=model,
        processor=processor,
        torch=torch,
        device=device,
        dtype_name=dtype_name,
    )


def vqa_status() -> VqaStatusResponse:
    settings = get_settings()
    dependencies = vqa_dependencies_available()
    loaded = load_vqa_runtime.cache_info().currsize > 0

    if not settings.vqa_enabled:
        note = (
            "VQA code is installed but disabled. Set SATQUERY_VQA_ENABLED=1 "
            "after installing model dependencies."
        )
    elif not dependencies:
        note = "VQA is enabled but optional model dependencies are not installed."
    elif loaded:
        note = "Remote-sensing VQA runtime is loaded and ready."
    else:
        note = (
            "Dependencies are available. The model will load/download lazily "
            "on the first VQA request."
        )

    return VqaStatusResponse(
        enabled=settings.vqa_enabled,
        dependencies_available=dependencies,
        model_id=settings.vqa_model_id,
        requested_device=settings.vqa_device,
        loaded=loaded,
        remote_sensing_adapted=True,
        adaptation_note=MODEL_ADAPTATION_NOTE,
        note=note,
    )


def run_remote_sensing_vqa(dataset_id: str, question: str) -> VqaResponse:
    settings = get_settings()
    raster = get_demo_dataset(dataset_id)
    runtime = load_vqa_runtime()

    image = Image.open(BytesIO(render_preview_png(raster))).convert("RGB")

    instruction = (
        "Answer as a remote-sensing visual question answering specialist. "
        "Use only evidence visible in the supplied Earth-observation image. "
        "Be concise and distinguish observation from uncertainty. "
        "Do not invent exact areas, coordinates, dates, sensor metadata, or counts. "
        "If the question requires quantitative geospatial measurement, say that a "
        "specialist geospatial tool should be used."
    )
    prompt = f"{instruction}\n\nQuestion: {question.strip()}"

    messages = [
        {
            "role": "user",
            "content": [
                {"type": "image"},
                {"type": "text", "text": prompt},
            ],
        }
    ]

    started = perf_counter()
    chat_text = runtime.processor.apply_chat_template(
        messages,
        tokenize=False,
        add_generation_prompt=True,
    )
    inputs = runtime.processor(
        text=[chat_text],
        images=[image],
        padding=True,
        return_tensors="pt",
    )
    inputs = {
        key: value.to(runtime.device) if hasattr(value, "to") else value
        for key, value in inputs.items()
    }

    with runtime.torch.inference_mode():
        generated_ids = runtime.model.generate(
            **inputs,
            max_new_tokens=settings.vqa_max_new_tokens,
            do_sample=False,
            use_cache=True,
        )

    input_length = inputs["input_ids"].shape[1]
    generated_only = generated_ids[:, input_length:]
    answer = runtime.processor.batch_decode(
        generated_only,
        skip_special_tokens=True,
        clean_up_tokenization_spaces=False,
    )[0].strip()
    elapsed_ms = round((perf_counter() - started) * 1000.0, 2)

    return VqaResponse(
        dataset_id=dataset_id,
        question=question,
        answer=answer,
        model_id=settings.vqa_model_id,
        model_family="Qwen2-VL-2B",
        remote_sensing_adapted=True,
        adaptation_note=MODEL_ADAPTATION_NOTE,
        source_image=f"Registered RGB preview derived from {raster.name}",
        source_url=raster.source_url,
        device=runtime.device,
        dtype=runtime.dtype_name,
        latency_ms=elapsed_ms,
        max_new_tokens=settings.vqa_max_new_tokens,
        confidence=None,
        confidence_note=(
            "No calibrated VQA confidence is reported. This is a semantic model output, "
            "not a quantitative geospatial measurement."
        ),
        provenance={
            "dataset_id": raster.dataset_id,
            "dataset_name": raster.name,
            "provider": raster.provider,
            "acquisition_date": raster.acquisition_date,
            "crs": raster.crs,
            "bands_available": sorted(raster.bands.keys()),
            "preview_rendering": "RGB contrast-stretched registered raster preview",
            "deterministic_generation": True,
            "external_model_used": True,
        },
        limitations=[
            "The VQA specialist reasons over the rendered RGB preview, not the full multispectral tensor.",
            "Semantic VQA output is not independent ground-truth validation.",
            "Exact area and coordinates must come from geospatial specialist tools.",
            "Inference quality depends on the remote-sensing adaptation dataset and image resolution.",
        ],
    )
