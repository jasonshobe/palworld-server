# Mods Installation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users upload/list/delete Palworld mod files in a `/mods` volume; on each server start the controller mirrors them into `Pal/Content/Paks`, preserving subfolders and removing previously-installed mods that are gone.

**Architecture:** A stateless `ModManager` service owns a `/mods` → `Paks` mirror sync (tracked by a manifest on the persistent `/palworld` volume) plus upload/delete of staged files. A `/api/mods` router exposes it; `ServerManager.start()` calls `sync()` before launching. A React **Mods** tab manages the staged files and is always editable.

**Tech Stack:** Python 3 / FastAPI / pytest (backend); React 18 / TypeScript / Vite / React Query / vitest (frontend); Docker (cm2network/steamcmd runtime).

---

## File Structure

**Backend (create):**
- `backend/services/mod_manager.py` — `ModManager`: manifest, listing, `sync()`, `save()`, `delete()`.
- `backend/models/mods.py` — `ModInfo`, `ModsResponse` pydantic models.
- `backend/routers/mods.py` — `/api/mods` endpoints.
- `tests/test_mod_manager.py`, `tests/test_routers/test_mods.py`.

**Backend (modify):**
- `backend/services/server_manager.py` — call mod sync inside `start()`.
- `backend/main.py` — `mod_manager` singleton + include router.

**Frontend (create):**
- `frontend/src/api/mods.ts` — typed wrappers (upload via raw `fetch`/FormData).
- `frontend/src/pages/ModsPage.tsx` — the tab.
- `frontend/src/components/mods/ModList.tsx`, `frontend/src/components/mods/UploadForm.tsx`.
- `frontend/src/pages/ModsPage.test.tsx`.

**Frontend (modify):**
- `frontend/src/types/index.ts` — `ModInfo`, `ModsResponse`.
- `frontend/src/App.tsx` — `mods` route.
- `frontend/src/components/NavBar.tsx` — Mods tab (always enabled).

**Infra (modify):**
- `docker-compose.yml` — `mods-data` volume at `/mods`.
- `Dockerfile` — pre-create `/mods` with steam ownership.

---

## Task 1: ModManager scaffolding — manifest + listing

**Files:**
- Create: `backend/services/mod_manager.py`
- Test: `tests/test_mod_manager.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_mod_manager.py
import json
import pytest
from backend.services.mod_manager import ModManager


@pytest.fixture
def mgr(tmp_path):
    mods = tmp_path / "mods"
    paks = tmp_path / "paks"
    mods.mkdir()
    paks.mkdir()
    return ModManager(
        mods_dir=str(mods),
        paks_dir=str(paks),
        manifest_path=str(tmp_path / "manifest.json"),
    )


def test_list_empty(mgr):
    assert mgr.list_mods() == []


def test_list_reports_accepted_files_and_ignores_others(mgr):
    (mgr.mods_dir / "a.pak").write_bytes(b"x")
    (mgr.mods_dir / "readme.txt").write_text("hi")
    sub = mgr.mods_dir / "LogicMods"
    sub.mkdir()
    (sub / "b.utoc").write_bytes(b"yy")
    listed = {m["path"]: m for m in mgr.list_mods()}
    assert set(listed) == {"a.pak", "LogicMods/b.utoc"}
    assert listed["a.pak"]["size"] == 1
    assert listed["a.pak"]["installed"] is False


def test_installed_flag_reflects_manifest(mgr):
    (mgr.mods_dir / "a.pak").write_bytes(b"x")
    mgr.manifest_path.write_text(json.dumps(["a.pak"]))
    assert mgr.list_mods()[0]["installed"] is True


def test_manifest_missing_or_corrupt_treated_as_empty(mgr):
    (mgr.mods_dir / "a.pak").write_bytes(b"x")
    assert mgr.list_mods()[0]["installed"] is False  # no manifest file
    mgr.manifest_path.write_text("{not json")
    assert mgr.list_mods()[0]["installed"] is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_mod_manager.py -v`
Expected: FAIL with `ModuleNotFoundError: backend.services.mod_manager`

- [ ] **Step 3: Write minimal implementation**

```python
# backend/services/mod_manager.py
import json
import shutil
from pathlib import Path
from typing import Callable

MODS_DIR = "/mods"
PAKS_DIR = "/palworld/Pal/Content/Paks"
MANIFEST_PATH = "/palworld/.mods_manifest.json"
ACCEPTED_EXTS = {".pak", ".utoc", ".ucas"}


class ModManager:
    def __init__(self, mods_dir=MODS_DIR, paks_dir=PAKS_DIR, manifest_path=MANIFEST_PATH):
        self.mods_dir = Path(mods_dir)
        self.paks_dir = Path(paks_dir)
        self.manifest_path = Path(manifest_path)

    def _read_manifest(self) -> list[str]:
        try:
            data = json.loads(self.manifest_path.read_text())
            if isinstance(data, list):
                return [str(p) for p in data]
        except (FileNotFoundError, ValueError, OSError):
            pass
        return []

    def _write_manifest(self, paths: list[str]) -> None:
        self.manifest_path.parent.mkdir(parents=True, exist_ok=True)
        self.manifest_path.write_text(json.dumps(sorted(paths)))

    def _iter_mod_files(self):
        if not self.mods_dir.exists():
            return
        for p in sorted(self.mods_dir.rglob("*")):
            if p.is_file() and p.suffix.lower() in ACCEPTED_EXTS:
                yield p

    def list_mods(self) -> list[dict]:
        installed = set(self._read_manifest())
        out = []
        for p in self._iter_mod_files():
            rel = p.relative_to(self.mods_dir).as_posix()
            out.append({"path": rel, "size": p.stat().st_size, "installed": rel in installed})
        return out
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_mod_manager.py -v`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/services/mod_manager.py tests/test_mod_manager.py
git commit -m "feat: add ModManager listing and manifest"
```

---

## Task 2: ModManager.sync — mirror /mods into Paks

**Files:**
- Modify: `backend/services/mod_manager.py`
- Test: `tests/test_mod_manager.py`

- [ ] **Step 1: Write the failing test**

```python
# append to tests/test_mod_manager.py
def test_sync_copies_new_files_preserving_subfolders(mgr):
    (mgr.mods_dir / "a.pak").write_bytes(b"aaa")
    sub = mgr.mods_dir / "LogicMods"
    sub.mkdir()
    (sub / "b.pak").write_bytes(b"bb")
    count = mgr.sync()
    assert count == 2
    assert (mgr.paks_dir / "a.pak").read_bytes() == b"aaa"
    assert (mgr.paks_dir / "LogicMods" / "b.pak").read_bytes() == b"bb"


def test_sync_overwrites_changed_file(mgr):
    (mgr.mods_dir / "a.pak").write_bytes(b"old")
    mgr.sync()
    (mgr.mods_dir / "a.pak").write_bytes(b"newer-content")
    mgr.sync()
    assert (mgr.paks_dir / "a.pak").read_bytes() == b"newer-content"


def test_sync_removes_delisted_mod(mgr):
    (mgr.mods_dir / "a.pak").write_bytes(b"a")
    (mgr.mods_dir / "b.pak").write_bytes(b"b")
    mgr.sync()
    (mgr.mods_dir / "b.pak").unlink()
    mgr.sync()
    assert (mgr.paks_dir / "a.pak").exists()
    assert not (mgr.paks_dir / "b.pak").exists()


def test_sync_never_deletes_base_game_paks(mgr):
    (mgr.paks_dir / "Pal-Windows.pak").write_bytes(b"game")  # not from /mods
    (mgr.mods_dir / "mod.pak").write_bytes(b"m")
    mgr.sync()
    (mgr.mods_dir / "mod.pak").unlink()
    mgr.sync()
    assert (mgr.paks_dir / "Pal-Windows.pak").exists()


def test_sync_prunes_empty_mod_subdirs(mgr):
    sub = mgr.mods_dir / "LogicMods"
    sub.mkdir()
    (sub / "b.pak").write_bytes(b"b")
    mgr.sync()
    (sub / "b.pak").unlink()
    mgr.sync()
    assert not (mgr.paks_dir / "LogicMods").exists()


def test_sync_returns_zero_when_no_mods_dir(tmp_path):
    m = ModManager(
        mods_dir=str(tmp_path / "absent"),
        paks_dir=str(tmp_path / "paks"),
        manifest_path=str(tmp_path / "manifest.json"),
    )
    assert m.sync() == 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_mod_manager.py -k sync -v`
Expected: FAIL with `AttributeError: 'ModManager' object has no attribute 'sync'`

- [ ] **Step 3: Write minimal implementation**

```python
# add methods to ModManager in backend/services/mod_manager.py
    def _prune_empty_dirs(self, directory: Path, root: Path) -> None:
        try:
            directory = directory.resolve()
            root = root.resolve()
        except OSError:
            return
        while directory != root and root in directory.parents:
            try:
                directory.rmdir()  # only removes empty dirs
            except OSError:
                break
            directory = directory.parent

    def sync(self, log: Callable[[str], None] | None = None) -> int:
        if not self.mods_dir.exists():
            return 0
        desired = {
            p.relative_to(self.mods_dir).as_posix(): p for p in self._iter_mod_files()
        }
        for rel, src in desired.items():
            dest = self.paks_dir / rel
            s = src.stat()
            if (
                not dest.exists()
                or dest.stat().st_size != s.st_size
                or dest.stat().st_mtime != s.st_mtime
            ):
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src, dest)  # copy2 preserves mtime for change detection
        for rel in set(self._read_manifest()) - set(desired):
            dest = self.paks_dir / rel
            if dest.exists():
                dest.unlink()
            self._prune_empty_dirs(dest.parent, self.paks_dir)
        self._write_manifest(list(desired))
        if log:
            log(f"[controller] Synced {len(desired)} mod file(s).")
        return len(desired)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_mod_manager.py -v`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add backend/services/mod_manager.py tests/test_mod_manager.py
git commit -m "feat: add ModManager mirror sync"
```

---

## Task 3: ModManager.save / delete — staged file management

**Files:**
- Modify: `backend/services/mod_manager.py`
- Test: `tests/test_mod_manager.py`

- [ ] **Step 1: Write the failing test**

```python
# append to tests/test_mod_manager.py
import io


def test_save_writes_file_and_returns_info(mgr):
    info = mgr.save("a.pak", "", io.BytesIO(b"data"))
    assert info == {"path": "a.pak", "size": 4, "installed": False}
    assert (mgr.mods_dir / "a.pak").read_bytes() == b"data"


def test_save_into_subfolder(mgr):
    info = mgr.save("b.pak", "LogicMods", io.BytesIO(b"bb"))
    assert info["path"] == "LogicMods/b.pak"
    assert (mgr.mods_dir / "LogicMods" / "b.pak").exists()


def test_save_rejects_bad_extension(mgr):
    with pytest.raises(ValueError):
        mgr.save("evil.exe", "", io.BytesIO(b"x"))


def test_save_rejects_traversal(mgr):
    with pytest.raises(ValueError):
        mgr.save("a.pak", "../escape", io.BytesIO(b"x"))


def test_delete_removes_file_and_prunes(mgr):
    mgr.save("b.pak", "LogicMods", io.BytesIO(b"bb"))
    mgr.delete("LogicMods/b.pak")
    assert not (mgr.mods_dir / "LogicMods").exists()


def test_delete_missing_raises(mgr):
    with pytest.raises(FileNotFoundError):
        mgr.delete("nope.pak")


def test_delete_rejects_traversal(mgr):
    with pytest.raises(ValueError):
        mgr.delete("../../etc/passwd")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_mod_manager.py -k "save or delete" -v`
Expected: FAIL with `AttributeError: 'ModManager' object has no attribute 'save'`

- [ ] **Step 3: Write minimal implementation**

```python
# add methods to ModManager in backend/services/mod_manager.py
    def _safe_relpath(self, *parts: str) -> Path:
        rel = Path(*[p for p in parts if p])
        if not rel.parts or rel.is_absolute() or ".." in rel.parts:
            raise ValueError("Invalid path")
        return rel

    def save(self, filename: str, subfolder: str, fileobj) -> dict:
        if Path(filename).suffix.lower() not in ACCEPTED_EXTS:
            raise ValueError("Unsupported file type")
        rel = self._safe_relpath(subfolder, filename)
        dest = self.mods_dir / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        with dest.open("wb") as out:
            shutil.copyfileobj(fileobj, out)
        return {"path": rel.as_posix(), "size": dest.stat().st_size, "installed": False}

    def delete(self, relpath: str) -> None:
        rel = self._safe_relpath(relpath)
        dest = self.mods_dir / rel
        if not dest.is_file():
            raise FileNotFoundError(relpath)
        dest.unlink()
        self._prune_empty_dirs(dest.parent, self.mods_dir)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_mod_manager.py -v`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add backend/services/mod_manager.py tests/test_mod_manager.py
git commit -m "feat: add ModManager upload and delete"
```

---

## Task 4: Hook mod sync into ServerManager.start()

**Files:**
- Modify: `backend/services/server_manager.py:95-115`
- Test: `tests/test_server_manager.py`

- [ ] **Step 1: Write the failing test**

```python
# append to tests/test_server_manager.py
@pytest.mark.asyncio
async def test_start_syncs_mods_before_launch(manager, tmp_path):
    import backend.main as main
    binary = tmp_path / "PalServer.sh"
    binary.touch()

    mock_proc = MagicMock()
    mock_proc.stdout.readline = AsyncMock(return_value=b"")
    mock_proc.wait = AsyncMock(return_value=0)
    mock_proc.returncode = 0
    mock_mods = MagicMock()

    with patch("backend.services.server_manager.PALWORLD_BINARY", str(binary)), \
         patch("asyncio.create_subprocess_exec", return_value=mock_proc), \
         patch.object(main, "mod_manager", mock_mods):
        await manager.start()

    mock_mods.sync.assert_called_once()
    assert manager.state == ServerState.RUNNING
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_server_manager.py::test_start_syncs_mods_before_launch -v`
Expected: FAIL — `mock_mods.sync` not called (assert_called_once raises)

- [ ] **Step 3: Write minimal implementation**

In `backend/services/server_manager.py`, inside `start()`, add the sync as the first statement in the existing `try:` block (right after `self._push_log("[controller] Starting Palworld server...")` and before `env_opts = ...`):

```python
        try:
            import backend.main as _main
            _main.mod_manager.sync(self._push_log)
            env_opts = shlex.split(os.environ.get("PALWORLD_OPTS", ""))
```

The existing `except Exception: self.state = ServerState.STOPPED; raise` already aborts start on a sync error.

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_server_manager.py -v`
Expected: PASS (including the pre-existing `test_start_sets_running_state`, which uses the real `mod_manager` whose `/mods` is absent so `sync()` returns 0)

- [ ] **Step 5: Commit**

```bash
git add backend/services/server_manager.py tests/test_server_manager.py
git commit -m "feat: sync mods on server start"
```

---

## Task 5: Mods router + wiring + models

**Files:**
- Create: `backend/models/mods.py`, `backend/routers/mods.py`
- Modify: `backend/main.py:13` (singleton), `backend/main.py:30-36` (router include)
- Test: `tests/test_routers/test_mods.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_routers/test_mods.py
import io
import pytest
from unittest.mock import patch
from backend.services.mod_manager import ModManager


@pytest.fixture(autouse=True)
def mods_dir(tmp_path):
    import backend.main as main
    mgr = ModManager(
        mods_dir=str(tmp_path / "mods"),
        paks_dir=str(tmp_path / "paks"),
        manifest_path=str(tmp_path / "manifest.json"),
    )
    (tmp_path / "mods").mkdir()
    with patch.object(main, "mod_manager", mgr):
        yield mgr


def test_list_empty(client):
    resp = client.get("/api/mods")
    assert resp.status_code == 200
    assert resp.json() == {"mods": []}


def test_upload_then_list(client):
    resp = client.post(
        "/api/mods/upload",
        files={"file": ("a.pak", io.BytesIO(b"data"), "application/octet-stream")},
    )
    assert resp.status_code == 200
    assert resp.json() == {"path": "a.pak", "size": 4, "installed": False}
    listed = client.get("/api/mods").json()["mods"]
    assert listed[0]["path"] == "a.pak"


def test_upload_into_subfolder(client):
    resp = client.post(
        "/api/mods/upload",
        files={"file": ("b.pak", io.BytesIO(b"bb"), "application/octet-stream")},
        data={"subfolder": "LogicMods"},
    )
    assert resp.json()["path"] == "LogicMods/b.pak"


def test_upload_rejects_bad_extension(client):
    resp = client.post(
        "/api/mods/upload",
        files={"file": ("evil.exe", io.BytesIO(b"x"), "application/octet-stream")},
    )
    assert resp.status_code == 400


def test_delete_removes_file(client, mods_dir):
    (mods_dir.mods_dir / "a.pak").write_bytes(b"x")
    resp = client.delete("/api/mods/a.pak")
    assert resp.status_code == 200
    assert client.get("/api/mods").json()["mods"] == []


def test_delete_missing_returns_404(client):
    resp = client.delete("/api/mods/nope.pak")
    assert resp.status_code == 404
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_routers/test_mods.py -v`
Expected: FAIL — 404 on `/api/mods` (router not registered)

- [ ] **Step 3: Write minimal implementation**

```python
# backend/models/mods.py
from pydantic import BaseModel


class ModInfo(BaseModel):
    path: str
    size: int
    installed: bool


class ModsResponse(BaseModel):
    mods: list[ModInfo]
```

```python
# backend/routers/mods.py
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
```

In `backend/main.py`, add the import and singleton near the other globals (after line 13 `server_manager = ServerManager()`):

```python
from backend.services.mod_manager import ModManager
...
mod_manager = ModManager()
```

(Place the `from backend.services.mod_manager import ModManager` import alongside the existing `from backend.services.server_manager import ServerManager` at the top.)

Then register the router. Change the router import line and includes:

```python
from backend.routers import auth as auth_router, server, config, saves, mods  # noqa: E402
...
app.include_router(saves.router, dependencies=_protected)
app.include_router(mods.router, dependencies=_protected)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_routers/test_mods.py -v`
Expected: PASS (6 tests)

- [ ] **Step 5: Run the full backend suite**

Run: `pytest tests/ -v`
Expected: PASS (all tests)

- [ ] **Step 6: Commit**

```bash
git add backend/models/mods.py backend/routers/mods.py backend/main.py tests/test_routers/test_mods.py
git commit -m "feat: add /api/mods router"
```

---

## Task 6: Docker volume + ownership

**Files:**
- Modify: `docker-compose.yml:8-17`, `Dockerfile:33-34`

- [ ] **Step 1: Add the volume to docker-compose.yml**

Add `/mods` to the service volumes and declare the named volume:

```yaml
    volumes:
      - palworld-data:/palworld
      - mods-data:/mods
...
volumes:
  palworld-data:
  mods-data:
```

- [ ] **Step 2: Pre-create /mods with steam ownership in Dockerfile**

Change the pre-create line so named-volume init preserves ownership:

```dockerfile
# Pre-create /palworld and /mods so Docker named-volume init preserves steam ownership
RUN mkdir -p /palworld /mods && chown -R steam:steam /app /palworld /mods
```

- [ ] **Step 3: Verify the build**

Run: `docker compose build`
Expected: build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml Dockerfile
git commit -m "feat: add /mods volume"
```

---

## Task 7: Frontend API wrapper + types

**Files:**
- Modify: `frontend/src/types/index.ts`
- Create: `frontend/src/api/mods.ts`

- [ ] **Step 1: Add types**

Append to `frontend/src/types/index.ts`:

```typescript
export interface ModInfo {
  path: string
  size: number
  installed: boolean
}

export interface ModsResponse {
  mods: ModInfo[]
}
```

- [ ] **Step 2: Write the API wrapper**

```typescript
// frontend/src/api/mods.ts
import { apiFetch } from "./client"
import type { ModInfo, ModsResponse } from "@/types"

export const getMods = () => apiFetch<ModsResponse>("/mods")

export const deleteMod = (path: string) =>
  apiFetch<{ ok: boolean }>(
    `/mods/${path.split("/").map(encodeURIComponent).join("/")}`,
    { method: "DELETE" }
  )

export async function uploadMod(file: File, subfolder: string): Promise<ModInfo> {
  const form = new FormData()
  form.append("file", file)
  if (subfolder) form.append("subfolder", subfolder)
  const resp = await fetch("/api/mods/upload", {
    method: "POST",
    credentials: "include",
    body: form,
  })
  if (resp.status === 401) {
    window.dispatchEvent(new Event("unauthorized"))
    const error = new Error("Unauthorized") as Error & { status?: number }
    error.status = 401
    throw error
  }
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}))
    throw new Error(body.detail ?? resp.statusText)
  }
  return resp.json() as Promise<ModInfo>
}
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/api/mods.ts
git commit -m "feat: add mods API client"
```

---

## Task 8: Mods page + components + routing + nav

**Files:**
- Create: `frontend/src/components/mods/ModList.tsx`, `frontend/src/components/mods/UploadForm.tsx`, `frontend/src/pages/ModsPage.tsx`
- Modify: `frontend/src/App.tsx`, `frontend/src/components/NavBar.tsx`

- [ ] **Step 1: Write the UploadForm component**

```tsx
// frontend/src/components/mods/UploadForm.tsx
import { useState } from "react"
import { Button } from "@/components/ui/button"

interface Props {
  onUpload: (file: File, subfolder: string) => void
  disabled?: boolean
}

export default function UploadForm({ onUpload, disabled }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [subfolder, setSubfolder] = useState("")

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (file) {
          onUpload(file, subfolder.trim())
          setFile(null)
          ;(e.target as HTMLFormElement).reset()
        }
      }}
    >
      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-400">Mod file (.pak / .utoc / .ucas)</label>
        <input
          type="file"
          accept=".pak,.utoc,.ucas"
          className="text-sm"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-400">Subfolder (optional)</label>
        <input
          type="text"
          value={subfolder}
          placeholder="e.g. LogicMods"
          className="rounded border bg-transparent px-2 py-1 text-sm"
          onChange={(e) => setSubfolder(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={disabled || !file}>
        Upload
      </Button>
    </form>
  )
}
```

- [ ] **Step 2: Write the ModList component**

```tsx
// frontend/src/components/mods/ModList.tsx
import type { ModInfo } from "@/types"
import { Button } from "@/components/ui/button"

interface Props {
  mods: ModInfo[]
  onDelete: (path: string) => void
}

export default function ModList({ mods, onDelete }: Props) {
  if (mods.length === 0) {
    return <p className="text-sm text-slate-400">No mods uploaded yet.</p>
  }
  return (
    <ul className="divide-y rounded border">
      {mods.map((m) => (
        <li key={m.path} className="flex items-center justify-between px-3 py-2 text-sm">
          <span className="font-mono">{m.path}</span>
          <span className="flex items-center gap-3">
            <span className="text-xs text-slate-400">
              {m.installed ? "installed" : "pending"}
            </span>
            <Button variant="ghost" size="sm" onClick={() => onDelete(m.path)}>
              Delete
            </Button>
          </span>
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 3: Write the ModsPage**

```tsx
// frontend/src/pages/ModsPage.tsx
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { getMods, uploadMod, deleteMod } from "@/api/mods"
import UploadForm from "@/components/mods/UploadForm"
import ModList from "@/components/mods/ModList"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function ModsPage() {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ["mods"], queryFn: getMods })
  const invalidate = () => qc.invalidateQueries({ queryKey: ["mods"] })

  const upload = useMutation({
    mutationFn: ({ file, subfolder }: { file: File; subfolder: string }) =>
      uploadMod(file, subfolder),
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: (path: string) => deleteMod(path),
    onSuccess: invalidate,
  })

  return (
    <div className="container mx-auto max-w-3xl space-y-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle>Mods</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="rounded bg-slate-800 px-3 py-2 text-sm text-slate-300">
            Mod changes apply on the next server start.
          </p>
          <UploadForm
            disabled={upload.isPending}
            onUpload={(file, subfolder) => upload.mutate({ file, subfolder })}
          />
          {upload.isError && (
            <p className="text-sm text-red-400">{(upload.error as Error).message}</p>
          )}
          <ModList mods={data?.mods ?? []} onDelete={(p) => remove.mutate(p)} />
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 4: Add the route in App.tsx**

Add the import with the other page imports:

```tsx
import ModsPage from "@/pages/ModsPage"
```

Add the route after the `saves` route inside `<Route path="/" element={<Layout />}>`:

```tsx
              <Route path="mods" element={<ModsPage />} />
```

- [ ] **Step 5: Add the Mods tab in NavBar.tsx**

Mods is always editable, so add it as a standalone always-enabled `NavLink` (modelled on the `Server` link), placed right after the `config`/`saves` map block and before the closing `</div>` of the tab group:

```tsx
          <NavLink
            to="/mods"
            className={({ isActive }) =>
              cn("px-3 py-1.5 rounded text-sm transition-colors",
                isActive ? "bg-slate-700" : "hover:bg-slate-800")
            }
          >
            Mods
          </NavLink>
```

- [ ] **Step 6: Type-check and build**

Run: `cd frontend && npx tsc --noEmit && npm run build`
Expected: type-check clean, build succeeds.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/mods frontend/src/pages/ModsPage.tsx frontend/src/App.tsx frontend/src/components/NavBar.tsx
git commit -m "feat: add Mods tab"
```

---

## Task 9: Mods page test

**Files:**
- Create: `frontend/src/pages/ModsPage.test.tsx`

- [ ] **Step 1: Write the test**

```tsx
// frontend/src/pages/ModsPage.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import ModsPage from "./ModsPage"
import * as api from "@/api/mods"

vi.mock("@/api/mods")

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ModsPage />
    </QueryClientProvider>
  )
}

describe("ModsPage", () => {
  beforeEach(() => {
    vi.mocked(api.getMods).mockResolvedValue({
      mods: [{ path: "a.pak", size: 4, installed: true }],
    })
    vi.mocked(api.uploadMod).mockResolvedValue({ path: "b.pak", size: 2, installed: false })
    vi.mocked(api.deleteMod).mockResolvedValue({ ok: true })
  })

  it("shows the apply-on-restart note and the mod list", async () => {
    renderPage()
    expect(screen.getByText(/apply on the next server start/i)).toBeInTheDocument()
    expect(await screen.findByText("a.pak")).toBeInTheDocument()
  })

  it("uploads a selected file", async () => {
    renderPage()
    const file = new File([new Uint8Array([1, 2])], "b.pak")
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })
    fireEvent.click(screen.getByRole("button", { name: /upload/i }))
    await waitFor(() => expect(api.uploadMod).toHaveBeenCalledWith(file, ""))
  })

  it("deletes a mod", async () => {
    renderPage()
    await screen.findByText("a.pak")
    fireEvent.click(screen.getByRole("button", { name: /delete/i }))
    await waitFor(() => expect(api.deleteMod).toHaveBeenCalledWith("a.pak"))
  })
})
```

- [ ] **Step 2: Run the test**

Run: `cd frontend && npm run test -- ModsPage`
Expected: PASS (3 tests)

- [ ] **Step 3: Run the full frontend suite + lint**

Run: `cd frontend && npm run test && npm run lint`
Expected: all tests pass, lint clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/ModsPage.test.tsx
git commit -m "test: add ModsPage tests"
```

---

## Final Verification

- [ ] Run backend suite: `pytest tests/ -v` → all pass.
- [ ] Run frontend suite: `cd frontend && npm run test` → all pass.
- [ ] Type-check + build: `cd frontend && npx tsc --noEmit && npm run build` → clean.
- [ ] Build image: `docker compose build` → succeeds.
- [ ] Manual smoke (optional): `docker compose up -d`, open the controller, visit the **Mods** tab, upload a `.pak`, confirm it lists as "pending", start the server, confirm the log shows `Synced N mod file(s).` and the file is now "installed".
