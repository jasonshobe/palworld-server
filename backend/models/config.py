from pydantic import BaseModel


class ConfigUpdate(BaseModel):
    settings: dict[str, object]
