from pydantic import BaseModel


class DeviceInfo(BaseModel):
    id: str
    name: str
    ip: str
    model: str | None = None
    firmware: str | None = None
    volume: float = 0.0
    muted: bool = False
    source: str | None = None
    group_id: str | None = None
    is_master: bool = False


class VolumeRequest(BaseModel):
    volume: float  # 0.0 - 1.0


class SourceRequest(BaseModel):
    source: str
