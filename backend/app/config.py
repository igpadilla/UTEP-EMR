from pathlib import Path

from pydantic_settings import BaseSettings

ROOT_ENV = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    supabase_url: str
    supabase_anon_key: str
    supabase_service_role_key: str
    supabase_jwt_secret: str

    model_config = {"env_file": str(ROOT_ENV), "extra": "ignore"}


settings = Settings()
