from fastapi import APIRouter, File, Form, UploadFile, HTTPException

from app.core.config import settings
from app.schemas.etl import ETLApplyResponse, ETLPlan, ETLPlanRequest
from app.services.etl_service import apply_plan, compute_health_score, recommend_plan
from app.services.profiling_service import _read_file

import json

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


@router.post("/etl/apply")
async def apply_etl(
    file: UploadFile = File(...),
    plan_json: str = Form(...),
):
    """Apply an ETL plan to a file. Returns cleaned CSV + treatment log + health scores."""
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

    # Compute health score BEFORE cleaning
    try:
        df_before = _read_file(content, file.filename)
        health_before = compute_health_score(df_before)
    except Exception:
        health_before = {"total": None, "insufficient_data": True}

    # Apply the plan
    try:
        result = apply_plan(content, file.filename, plan)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"ETL failed: {str(e)}")

    # Compute health score AFTER cleaning
    import base64, io, pandas as pd
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
