from typing import List

from pydantic_settings import BaseSettings


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

    # LLM provider credentials
    ANTHROPIC_API_KEY: str = ""
    GEMINI_API_KEY: str = ""

    # Anthropic model config
    ANTHROPIC_MODEL: str = "claude-sonnet-4-6"
    ANTHROPIC_MAX_TOKENS: int = 8096

    # Gemini model config
    GEMINI_MODEL: str = "gemini-2.0-flash"
    GEMINI_MAX_TOKENS: int = 8096

    class Config:
        env_file = ".env"


settings = Settings()
