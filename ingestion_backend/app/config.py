from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/ollive_chat"
    REDIS_URL: str = "redis://localhost:6379/0"
    OBSERVE_ME_API_KEY: str = ""
    PROJECT_NAME: str = "observe-me ingestion"
    VERSION: str = "0.1.0"
    API_V1_STR: str = "/api/v1"

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
