from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from backend.models.mods import ModInfo, ModsResponse

router = APIRouter(prefix="/api/mods", tags=["mods"])


def _manager():
    import backend.main as _main
    return _main.mod_manager


@router.get("", response_model=ModsResponse)
def list_mods():
    return ModsResponse(mods=_manager().list_mods())


@router.post("/upload", response_model=ModInfo)
def upload_mod(file: UploadFile = File(...), subfolder: str = Form("")):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required")
    try:
        return _manager().save(file.filename, subfolder, file.file)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{path:path}")
def delete_mod(path: str):
    try:
        _manager().delete(path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Mod not found")
    return {"ok": True}
