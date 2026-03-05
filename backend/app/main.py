from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api.v1.routes import profiling as profiling_routes
from app.api.v1.routes import etl as etl_routes
from app.api.v1.routes import modeling as modeling_routes

app = FastAPI(
    title=settings.APP_NAME,
    docs_url="/docs",
    openapi_url="/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
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
