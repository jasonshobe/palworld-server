from enum import Enum
from pydantic import BaseModel


class ServerState(str, Enum):
    STOPPED = "stopped"
    STARTING = "starting"
    RUNNING = "running"
    STOPPING = "stopping"
    UPDATING = "updating"


class ServerStatus(BaseModel):
    state: ServerState
    logs: list[str]
