from fastapi import APIRouter, File, Form, UploadFile, HTTPException

from app.core.config import settings
from app.schemas.modeling import ModelTrainRequest, ModelTrainResponse
from app.services.modeling_service import train_model

import json

router = APIRouter(tags=["modeling"])


@router.post("/models/train", response_model=ModelTrainResponse)
async def train(
    file: UploadFile = File(...),
    config_json: str = Form(...),
):
    """Train a model on the uploaded (cleaned) CSV."""
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

    try:
        result = train_model(content, file.filename, req)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Training failed: {str(e)}")

    return result
