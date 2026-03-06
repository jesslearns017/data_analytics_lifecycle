import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "Data Analytics Lifecycle"
    API_V1_PREFIX: str = "/api/v1"
    CORS_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
    ]
    MAX_UPLOAD_SIZE_MB: int = 200
    ENVIRONMENT: str = "development"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()

# In production, allow overriding CORS via CORS_ORIGINS env var (comma-separated)
_extra_origins = os.environ.get("CORS_ORIGINS_EXTRA")
if _extra_origins:
    settings.CORS_ORIGINS.extend([o.strip() for o in _extra_origins.split(",") if o.strip()])
