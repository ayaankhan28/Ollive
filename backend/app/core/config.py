from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    PROJECT_NAME: str = "Ollive Chat"
    DESCRIPTION: str = "Ollive Chat API"
    VERSION: str = "0.1.0"
    API_V1_STR: str = "/api/v1"

    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:3001",
    ]

    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/ollive_chat"
    ANTHROPIC_API_KEY: str = ""
    GEMINI_API_KEY: str = ""

    class Config:
        env_file = ".env"


settings = Settings()
