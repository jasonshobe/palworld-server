from fastapi import APIRouter, HTTPException
from backend.models.config import ConfigUpdate
from backend.models.server import ServerState
from backend.services.config_manager import DEFAULT_SETTINGS, read_config, write_config
from backend.services.controller_settings import (
    CONTROLLER_KEYS,
    read_settings,
    write_settings,
)

router = APIRouter(prefix="/api/config", tags=["config"])


def _assert_stopped():
    from backend.main import server_manager
    if server_manager.state != ServerState.STOPPED:
        raise HTTPException(status_code=409, detail="Server must be stopped to modify configuration")


@router.get("")
def get_config():
    # Seed any keys absent on disk with defaults. Controller launch-option
    # settings are merged in alongside the .ini fields; the .ini is applied last
    # so a future PalWorldSettings key can never be shadowed by the store.
    return {**DEFAULT_SETTINGS, **read_settings(), **read_config()}


@router.put("")
def put_config(body: ConfigUpdate):
    _assert_stopped()
    incoming = dict(body.settings)

    # Split controller launch-option keys out of the .ini payload.
    controller = {k: incoming.pop(k) for k in CONTROLLER_KEYS if k in incoming}
    if controller:
        write_settings({**read_settings(), **controller})

    if incoming:
        current = read_config()
        current.update(incoming)
        write_config(current)
    return {"ok": True}
