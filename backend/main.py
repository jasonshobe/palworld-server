import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from backend.middleware.auth import AuthMiddleware, require_auth
from backend.services.mod_manager import ModManager
from backend.services.server_manager import ServerManager

_password = os.environ.get("CONTROLLER_PASSWORD") or None
auth = AuthMiddleware(password=_password)
server_manager = ServerManager()
mod_manager = ModManager()
save_manager = None  # initialized lazily on first access (save may not exist yet)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global save_manager
    try:
        from backend.services.save_manager import SaveManager as _SM
        save_manager = _SM()
    except RuntimeError:
        pass  # No save file yet — saves endpoints return 503 until server runs
    yield


app = FastAPI(lifespan=lifespan)

from backend.routers import auth as auth_router, server, config, saves, mods  # noqa: E402

_protected = [require_auth()]
app.include_router(auth_router.router)
app.include_router(server.router, dependencies=_protected)
app.include_router(config.router, dependencies=_protected)
app.include_router(saves.router, dependencies=_protected)
app.include_router(mods.router, dependencies=_protected)

static_dir = Path(__file__).parent / "static"
if static_dir.exists():
    app.mount("/", StaticFiles(directory=str(static_dir), html=True), name="static")
