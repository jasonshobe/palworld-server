from fastapi import APIRouter, HTTPException
from backend.models.config import ConfigUpdate
from backend.models.server import ServerState
from backend.services.config_manager import read_config, write_config

router = APIRouter(prefix="/api/config", tags=["config"])


def _assert_stopped():
    from backend.main import server_manager
    if server_manager.state != ServerState.STOPPED:
        raise HTTPException(status_code=409, detail="Server must be stopped to modify configuration")


@router.get("")
def get_config():
    return read_config()


@router.put("")
def put_config(body: ConfigUpdate):
    _assert_stopped()
    current = read_config()
    current.update(body.settings)
    write_config(current)
    return {"ok": True}
