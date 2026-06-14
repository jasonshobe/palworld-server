from pydantic import BaseModel


class ModInfo(BaseModel):
    path: str
    size: int
    installed: bool


class ModsResponse(BaseModel):
    mods: list[ModInfo]
