from fastapi import APIRouter, BackgroundTasks, HTTPException
from backend.models.server import ServerState, ServerStatus

router = APIRouter(prefix="/api/server", tags=["server"])


def get_manager():
    from backend.main import server_manager
    return server_manager


@router.get("/status", response_model=ServerStatus)
def get_status():
    mgr = get_manager()
    return ServerStatus(state=mgr.state, logs=mgr.logs)


@router.post("/start")
async def start(background_tasks: BackgroundTasks):
    mgr = get_manager()
    if mgr.state != ServerState.STOPPED:
        raise HTTPException(status_code=409, detail=f"Cannot start: server is {mgr.state}")
    background_tasks.add_task(mgr.start)
    return {"ok": True}


@router.post("/stop")
async def stop(background_tasks: BackgroundTasks):
    mgr = get_manager()
    if mgr.state != ServerState.RUNNING:
        raise HTTPException(status_code=409, detail=f"Cannot stop: server is {mgr.state}")

    async def _stop_and_invalidate_saves():
        await mgr.stop()
        import backend.main as _main
        _main.save_manager = None  # force reload from disk on next saves request

    background_tasks.add_task(_stop_and_invalidate_saves)
    return {"ok": True}


@router.post("/update")
async def update(background_tasks: BackgroundTasks):
    mgr = get_manager()
    if mgr.state != ServerState.STOPPED:
        raise HTTPException(status_code=409, detail="Server must be stopped before updating")
    background_tasks.add_task(mgr.update)
    return {"ok": True}
