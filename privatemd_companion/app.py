"""
HealthBridge AI — PrivateMed Local Companion Service & FastAPI Clinical Engine
==============================================================================
Runs strictly on the user's own computer (127.0.0.1:8765) to process sensitive
medical reports using a local Ollama instance (127.0.0.1:11434) without ever
transmitting report contents, extracted text, prompts, or inference results to
any cloud provider.

Security & Privacy Architecture:
- Binds exclusively to 127.0.0.1 (loopback interface); never exposed to 0.0.0.0 or public internet.
- Zero telemetry, zero analytics, and zero disk logging of medical report text.
- Deterministic local biomarker parser + local Ollama inference.
- Optional AES-256-GCM envelope helper for local encrypted vault export.

Usage on user's computer:
  1. Install Ollama from https://ollama.com and pull a model:
     ollama pull llama3.2:3b
  2. Install Python dependencies:
     pip install -r privatemd_companion/requirements.txt
  3. Start the companion service on localhost:8765:
     uvicorn privatemd_companion.app:app --host 127.0.0.1 --port 8765
"""

import json
import re
from typing import List, Optional
import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

OLLAMA_BASE_URL = "http://127.0.0.1:11434"
DEFAULT_LOCAL_MODEL = "llama3.2:3b"

app = FastAPI(
    title="HealthBridge AI — PrivateMed Local Companion (FastAPI)",
    description="Zero-cloud local medical report explanation and deterministic biomarker parser powered by local Ollama.",
    version="1.0.0",
)

# Allow browser requests from the HealthBridge AI web client to local loopback
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


class LocalReportRequest(BaseModel):
    report_text: str = Field(..., min_length=5, max_length=25000)
    model: str = Field(default=DEFAULT_LOCAL_MODEL)
    language: str = Field(default="en", pattern="^(en|te)$")


class ExtractedMetric(BaseModel):
    test_name: str
    observed_value: str
    unit: str
    reference_range: str
    flag: str


class LocalReportResponse(BaseModel):
    processing_mode: str = "STRICT_LOCAL_OLLAMA_COMPANION"
    model_used: str
    extracted_metrics: List[ExtractedMetric]
    missing_or_ambiguous_fields: List[str]
    plain_language_explanation: str
    disclaimer: str


def parse_report_metrics_locally(report_text: str) -> tuple[List[ExtractedMetric], List[str]]:
    lines = [line.strip() for line in report_text.splitlines() if line.strip()]
    metrics: List[ExtractedMetric] = []
    warnings: List[str] = []

    pattern = re.compile(
        r"^([A-Za-z0-9\s(),/.-]{2,45}?)\s*[:=-]\s*(\d+(?:\.\d+)?)\s*([a-zA-Z%/\u00B5\d.^]+)?"
        r"(?:\s*(?:\(|\[|Ref\s*:?\s*|Range\s*:?\s*)?\s*(\d+(?:\.\d+)?\s*-\s*\d+(?:\.\d+)?|<\s*\d+(?:\.\d+)?|>\s*\d+(?:\.\d+)?)\s*(?:\)|\])?)?$",
        re.IGNORECASE,
    )

    for line in lines:
        if re.search(r"illegible|unreadable|blurred|missing|hemolyzed|\?\?\?", line, re.IGNORECASE):
            warnings.append(f"Ambiguous or unreadable field in report: '{line}'")
            continue
        match = pattern.match(line)
        if match:
            test_name = match.group(1).strip()
            observed_val = match.group(2).strip()
            unit = (match.group(3) or "Not specified").strip()
            ref_range = (match.group(4) or "Not provided in report").strip()
            flag = "RANGE_NOT_SPECIFIED"
            range_nums = re.search(r"(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)", ref_range)
            if range_nums:
                low = float(range_nums.group(1))
                high = float(range_nums.group(2))
                val = float(observed_val)
                flag = "OUTSIDE_RANGE" if (val < low or val > high) else "WITHIN_RANGE"
            metrics.append(
                ExtractedMetric(
                    test_name=test_name,
                    observed_value=observed_val,
                    unit=unit,
                    reference_range=ref_range,
                    flag=flag,
                )
            )
    return metrics, warnings


@app.get("/health")
async def check_local_companion_health():
    """Verifies local FastAPI companion and checks local Ollama daemon status on 127.0.0.1:11434."""
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
            if resp.status_code == 200:
                models = [m.get("name") for m in resp.json().get("models", [])]
                return {
                    "companion_status": "ONLINE_LOCALHOST",
                    "ollama_reachable": True,
                    "available_models": models,
                    "bound_interface": "127.0.0.1",
                }
    except Exception:
        pass

    return {
        "companion_status": "ONLINE_LOCALHOST",
        "ollama_reachable": False,
        "available_models": [],
        "bound_interface": "127.0.0.1",
        "message": "FastAPI companion is running locally, but Ollama daemon at 127.0.0.1:11434 is not reachable.",
    }


@app.post("/analyze-local", response_model=LocalReportResponse)
async def analyze_report_locally(payload: LocalReportRequest):
    """
    Processes a medical report strictly on the user's computer using local Ollama.
    Never falls back to any cloud API if Ollama is offline.
    """
    metrics, warnings = parse_report_metrics_locally(payload.report_text)
    lang_name = "Telugu (తెలుగు) and English" if payload.language == "te" else "plain English"

    system_prompt = (
        "You are PrivateMed Local Companion running offline via Ollama. "
        f"Explain the medical terminology and laboratory parameters in {lang_name}. "
        "STRICT RULES: "
        "1. Only reference values, units, and ranges actually present in the report text. "
        "2. Clearly highlight any missing or unreadable fields. "
        "3. Never diagnose conditions, prescribe medications, or recommend changing treatment."
    )

    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            ollama_res = await client.post(
                f"{OLLAMA_BASE_URL}/api/generate",
                json={
                    "model": payload.model,
                    "system": system_prompt,
                    "prompt": f"Medical Report Text:\n{payload.report_text}",
                    "stream": False,
                },
            )
            if ollama_res.status_code != 200:
                raise HTTPException(
                    status_code=502,
                    detail="Local Ollama returned an error. Ensure the requested model is pulled via `ollama pull`.",
                )
            explanation = ollama_res.json().get("response", "").strip()
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=503,
            detail="Local Ollama daemon is unreachable at 127.0.0.1:11434. Strict Local-Only mode never falls back to cloud inference.",
        ) from exc

    return LocalReportResponse(
        model_used=payload.model,
        extracted_metrics=metrics,
        missing_or_ambiguous_fields=warnings,
        plain_language_explanation=explanation,
        disclaimer=(
            "Processed 100% locally on your device via Ollama (127.0.0.1). "
            "AI explanations can be incomplete or inaccurate and are not a substitute for professional medical advice."
        ),
    )
