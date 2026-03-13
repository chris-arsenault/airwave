from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings, loaded from environment variables."""

    dlna_base_url: str = "http://localhost:9000"
    database_path: str = "wiim-control.db"
    host: str = "0.0.0.0"
    port: int = 8000
    device_scan_interval: int = 30
    playback_poll_interval: float = 1.5

    model_config = {"env_prefix": "", "case_sensitive": False}


settings = Settings()
