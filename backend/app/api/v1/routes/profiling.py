from fastapi import APIRouter, File, UploadFile, HTTPException

from app.core.config import settings
from app.schemas.profiling import ProfileResponse
from app.services.profiling_service import profile_dataset

router = APIRouter()


@router.post("/profile", response_model=ProfileResponse)
async def profile_file(file: UploadFile = File(...)):
    """Receive a CSV/XLSX file, return full profile + dataset type detection."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided.")

    lower = file.filename.lower()
    if not (lower.endswith(".csv") or lower.endswith(".xlsx") or lower.endswith(".xls")):
        raise HTTPException(
            status_code=400,
            detail="Unsupported file format. Please upload CSV or Excel (.xlsx).",
        )

    content = await file.read()

    size_mb = len(content) / (1024 * 1024)
    if size_mb > settings.MAX_UPLOAD_SIZE_MB:
        raise HTTPException(
            status_code=400,
            detail=f"File too large ({size_mb:.1f} MB). Maximum is {settings.MAX_UPLOAD_SIZE_MB} MB.",
        )

    try:
        result = profile_dataset(content, file.filename)
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to process file: {str(e)}",
        )

    return result
