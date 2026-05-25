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
    try:
        background_tasks.add_task(mgr.start)
        return {"ok": True}
    except RuntimeError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.post("/stop")
async def stop(background_tasks: BackgroundTasks):
    mgr = get_manager()
    try:
        background_tasks.add_task(mgr.stop)
        return {"ok": True}
    except RuntimeError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.post("/update")
async def update(background_tasks: BackgroundTasks):
    mgr = get_manager()
    if mgr.state != ServerState.STOPPED:
        raise HTTPException(status_code=409, detail="Server must be stopped before updating")
    background_tasks.add_task(mgr.update)
    return {"ok": True}
