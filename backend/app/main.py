from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.task_manager import get_task, cleanup_task, TaskStatus
from app.api.v1.routes import profiling as profiling_routes
from app.api.v1.routes import etl as etl_routes
from app.api.v1.routes import modeling as modeling_routes

_is_prod = settings.ENVIRONMENT == "production"

app = FastAPI(
    title=settings.APP_NAME,
    docs_url=None if _is_prod else "/docs",
    openapi_url=None if _is_prod else "/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(
    profiling_routes.router,
    prefix=settings.API_V1_PREFIX,
)

app.include_router(
    etl_routes.router,
    prefix=settings.API_V1_PREFIX,
)

app.include_router(
    modeling_routes.router,
    prefix=settings.API_V1_PREFIX,
)


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.get("/api/v1/tasks/{task_id}")
def poll_task(task_id: str):
    """Poll a background task for status and results."""
    task = get_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found.")

    response: dict = {"task_id": task.id, "status": task.status}

    if task.status == TaskStatus.COMPLETED:
        response["result"] = task.result
        cleanup_task(task_id)
    elif task.status == TaskStatus.FAILED:
        response["error"] = task.error
        cleanup_task(task_id)

    return response
