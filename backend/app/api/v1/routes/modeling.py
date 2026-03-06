from fastapi import APIRouter, File, Form, UploadFile, HTTPException

from app.core.config import settings
from app.core.task_manager import submit_task
from app.schemas.modeling import ModelTrainRequest, ModelTrainResponse
from app.services.modeling_service import train_model

import json

router = APIRouter(tags=["modeling"])


def _run_training(content: bytes, filename: str, req: ModelTrainRequest) -> dict:
    """Wrapper that runs training and returns a serializable dict."""
    result = train_model(content, filename, req)
    return result.model_dump()


@router.post("/models/train")
async def train(
    file: UploadFile = File(...),
    config_json: str = Form(...),
):
    """Submit a model training task. Returns a task_id to poll for results."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided.")

    content = await file.read()
    size_mb = len(content) / (1024 * 1024)
    if size_mb > settings.MAX_UPLOAD_SIZE_MB:
        raise HTTPException(status_code=400, detail=f"File too large ({size_mb:.1f} MB).")

    try:
        req_dict = json.loads(config_json)
        req = ModelTrainRequest(**req_dict)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid config JSON: {str(e)}")

    task_id = submit_task(_run_training, content, file.filename, req)
    return {"task_id": task_id}
