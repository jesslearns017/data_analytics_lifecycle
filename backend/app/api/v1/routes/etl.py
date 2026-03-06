import base64
import io
import json

import pandas as pd
from fastapi import APIRouter, File, Form, UploadFile, HTTPException

from app.core.config import settings
from app.core.task_manager import submit_task
from app.schemas.etl import ETLApplyResponse, ETLPlan, ETLPlanRequest
from app.services.etl_service import apply_plan, compute_health_score, recommend_plan
from app.services.profiling_service import _read_file

router = APIRouter(tags=["etl"])


@router.post("/etl/plan", response_model=ETLPlan)
async def generate_plan(req: ETLPlanRequest):
    """Generate a recommended ETL plan from a profile JSON."""
    try:
        plan = recommend_plan(
            profile=req.profile,
            dataset_type=req.dataset_type,
            target_column=req.target_column,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to generate plan: {str(e)}")
    return plan


def _run_etl(content: bytes, filename: str, plan: ETLPlan) -> dict:
    """Wrapper that runs ETL apply + health scores and returns a serializable dict."""
    # Health score BEFORE cleaning
    try:
        df_before = _read_file(content, filename)
        health_before = compute_health_score(df_before)
    except Exception:
        health_before = {"total": None, "insufficient_data": True}

    # Apply the plan
    result = apply_plan(content, filename, plan)

    # Health score AFTER cleaning
    try:
        cleaned_bytes = base64.b64decode(result.cleaned_csv_base64)
        df_after = pd.read_csv(io.BytesIO(cleaned_bytes))
        health_after = compute_health_score(df_after)
    except Exception:
        health_after = {"total": None, "insufficient_data": True}

    return {
        **result.model_dump(),
        "health_before": health_before,
        "health_after": health_after,
    }


@router.post("/etl/apply")
async def apply_etl(
    file: UploadFile = File(...),
    plan_json: str = Form(...),
):
    """Submit an ETL apply task. Returns a task_id to poll for results."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided.")

    content = await file.read()
    size_mb = len(content) / (1024 * 1024)
    if size_mb > settings.MAX_UPLOAD_SIZE_MB:
        raise HTTPException(status_code=400, detail=f"File too large ({size_mb:.1f} MB).")

    try:
        plan_dict = json.loads(plan_json)
        plan = ETLPlan(**plan_dict)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid plan JSON: {str(e)}")

    task_id = submit_task(_run_etl, content, file.filename, plan)
    return {"task_id": task_id}
