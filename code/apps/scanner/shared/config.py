import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    internal_api_key: str = os.environ.get("INTERNAL_API_KEY", "")
    api_url: str = os.environ.get("API_URL", "http://localhost:3001")
    scan_id: str = os.environ.get("SCAN_ID", "")
    scan_timeout: int = 300  # 5 Minuten max

    class Config:
        env_file = ".env"


settings = Settings()
