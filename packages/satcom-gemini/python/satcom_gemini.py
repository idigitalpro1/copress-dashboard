"""Small Python twin of packages/satcom-gemini.

Reads the same registry/models.json. Use this from news_video.py (or a later
Health IQ service) so model pins, denied ids and key isolation stay in one file.

This module does not call the Gemini API. Pair it with the existing news_video.py
HTTP helpers, or port those onto this client in a later phase.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REGISTRY_PATH = ROOT / "registry" / "models.json"
VERSION_PATH = ROOT / "VERSION"

_GEMINI_KEY = re.compile(r"AIza[0-9A-Za-z_\-]{20,}")


def load_registry(path: Path | None = None) -> dict:
    return json.loads((path or REGISTRY_PATH).read_text(encoding="utf-8"))


def version() -> str:
    return VERSION_PATH.read_text(encoding="utf-8").strip()


class ModelDenied(Exception):
    pass


class KeyIsolation(Exception):
    pass


def resolve_model(registry: dict, workload: str, requested: str | None = None) -> str:
    spec = registry["workloads"].get(workload)
    if not spec:
        raise ModelDenied(f"unknown workload '{workload}'")
    model = requested or spec["defaultModel"]
    denied = registry.get("denied", {}).get(model)
    if denied:
        raise ModelDenied(f"model '{model}' is denied ({denied.get('reason')}).")
    allowed = list(spec.get("allowedModels") or []) + list(spec.get("optionalModels") or [])
    if model not in allowed:
        raise ModelDenied(f"model '{model}' is not on the {workload} allow-list (fail closed).")
    return model


def select_key(env: dict, registry: dict, workload: str) -> tuple[str, str, bool]:
    spec = registry["workloads"].get(workload)
    if not spec:
        raise KeyIsolation(f"unknown workload '{workload}'")
    primary = (env.get(spec["keyEnv"]) or "").strip()
    if primary:
        return primary, spec["keyEnv"], False
    fallback_name = spec.get("fallbackKeyEnv")
    if fallback_name:
        fallback = (env.get(fallback_name) or "").strip()
        if fallback:
            return fallback, fallback_name, True
    raise KeyIsolation(f"{spec['keyEnv']} is not set for workload '{workload}'")


def redact(text: str, env: dict) -> str:
    out = "" if text is None else str(text)
    for name in (
        "GEMINI_API_KEY_VIDEO", "GEMINI_API_KEY_COPY", "GEMINI_API_KEY_SUSAN",
        "GEMINI_API_KEY", "SUPABASE_SERVICE_ROLE_KEY",
    ):
        key = (env.get(name) or "").strip()
        if key:
            out = out.replace(key, "***")
    out = re.sub(r"(?i)([?&]key=)[^&\s\"']+", r"\1***", out)
    out = re.sub(r"(?i)(x-goog-api-key[\"']?\s*[:=]\s*[\"']?)[^\s\"',}]+", r"\1***", out)
    return _GEMINI_KEY.sub("***", out)
