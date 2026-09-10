from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache


def _parse_bool(value: str | None, default: bool) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _parse_origins(value: str | None) -> tuple[str, ...]:
    if not value:
        return ("http://localhost:3000", "http://127.0.0.1:3000")
    return tuple(origin.strip() for origin in value.split(",") if origin.strip())


@dataclass(frozen=True)
class Settings:
    environment: str
    allowed_origins: tuple[str, ...]
    max_upload_mb: int
    demo_mode: bool
    vqa_enabled: bool
    vqa_model_id: str
    vqa_device: str
    vqa_max_new_tokens: int


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    max_upload_raw = os.getenv("SATQUERY_MAX_UPLOAD_MB", "256")
    try:
        max_upload_mb = int(max_upload_raw)
    except ValueError:
        max_upload_mb = 256

    vqa_tokens_raw = os.getenv("SATQUERY_VQA_MAX_NEW_TOKENS", "128")
    try:
        vqa_max_new_tokens = int(vqa_tokens_raw)
    except ValueError:
        vqa_max_new_tokens = 128

    return Settings(
        environment=os.getenv("SATQUERY_ENV", "development"),
        allowed_origins=_parse_origins(os.getenv("SATQUERY_ALLOWED_ORIGINS")),
        max_upload_mb=max(1, min(max_upload_mb, 1024)),
        demo_mode=_parse_bool(os.getenv("SATQUERY_DEMO_MODE"), True),
        vqa_enabled=_parse_bool(os.getenv("SATQUERY_VQA_ENABLED"), False),
        vqa_model_id=os.getenv(
            "SATQUERY_VQA_MODEL_ID",
            "AdaptLLM/remote-sensing-Qwen2-VL-2B-Instruct",
        ),
        vqa_device=os.getenv("SATQUERY_VQA_DEVICE", "auto").strip().lower(),
        vqa_max_new_tokens=max(16, min(vqa_max_new_tokens, 512)),
    )
