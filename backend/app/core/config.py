from pydantic import BaseModel


class Settings(BaseModel):
    APP_NAME: str = "Data Analytics Lifecycle"
    API_V1_PREFIX: str = "/api/v1"
    CORS_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
    ]
    MAX_UPLOAD_SIZE_MB: int = 200


settings = Settings()
