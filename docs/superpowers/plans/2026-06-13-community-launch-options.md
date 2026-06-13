# Community / Launch-Option Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add UI toggles for the two upstream env→launch-arg server options — `COMMUNITY` (`-publiclobby`) and `QUERY_PORT` (`-queryport=N`) — surfaced in the Configuration tab's "Server" section and applied at server start.

**Architecture:** Launch args have no `PalWorldSettings.ini` home, so they live in a new JSON store `controller-settings.json` managed by `backend/services/controller_settings.py` (plain functions, like `config_manager`). The config router is the seam: `GET /api/config` merges the store into the `.ini` payload; `PUT` splits controller keys back out so they never reach the `.ini`. The server router reads the store at start and passes `extra_args` to `ServerManager.start` (which already accepts them).

**Tech Stack:** Python / FastAPI / pytest (backend); React / TypeScript / Vite (frontend).

---

## File Structure

- **Create** `backend/services/controller_settings.py` — read/write the JSON store + translate settings to CLI args. Sole owner of the `community` / `query_port` keys.
- **Modify** `backend/routers/config.py` — merge store into `GET`, split it out of `PUT`.
- **Modify** `backend/routers/server.py` — build launch args from the store at `start`.
- **Modify** `frontend/src/pages/ConfigPage.tsx` — two new field entries in the "Server" section.
- **Create** `tests/test_controller_settings.py` — unit tests for the service.
- **Modify** `tests/test_routers/test_config.py` — merge/split coverage.
- **Modify** `tests/test_routers/test_server.py` — launch-arg coverage.

`server_manager.py` is **not** modified — `start(self, extra_args=None)` already supports injected args.

---

### Task 1: `controller_settings` service

**Files:**
- Create: `backend/services/controller_settings.py`
- Test: `tests/test_controller_settings.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_controller_settings.py`:

```python
import json
from backend.services import controller_settings as cs


def test_read_returns_defaults_when_file_absent(tmp_path):
    settings = cs.read_settings(tmp_path / "nope.json")
    assert settings == {"community": False, "query_port": None}


def test_read_returns_defaults_when_file_corrupt(tmp_path):
    p = tmp_path / "controller-settings.json"
    p.write_text("{ not json", encoding="utf-8")
    assert cs.read_settings(p) == {"community": False, "query_port": None}


def test_write_then_read_round_trip(tmp_path):
    p = tmp_path / "controller-settings.json"
    cs.write_settings({"community": True, "query_port": 27015}, p)
    assert cs.read_settings(p) == {"community": True, "query_port": 27015}


def test_write_drops_unrecognized_keys(tmp_path):
    p = tmp_path / "controller-settings.json"
    cs.write_settings({"community": True, "ServerName": "hax"}, p)
    on_disk = json.loads(p.read_text(encoding="utf-8"))
    assert "ServerName" not in on_disk
    assert on_disk["community"] is True


def test_write_normalizes_blank_query_port_to_none(tmp_path):
    p = tmp_path / "controller-settings.json"
    cs.write_settings({"query_port": ""}, p)
    assert cs.read_settings(p)["query_port"] is None


def test_write_coerces_numeric_string_query_port_to_int(tmp_path):
    p = tmp_path / "controller-settings.json"
    cs.write_settings({"query_port": "27015"}, p)
    assert cs.read_settings(p)["query_port"] == 27015


def test_build_launch_args_empty_when_defaults():
    assert cs.build_launch_args({"community": False, "query_port": None}) == []


def test_build_launch_args_community_adds_publiclobby():
    assert cs.build_launch_args({"community": True, "query_port": None}) == ["-publiclobby"]


def test_build_launch_args_query_port_adds_flag():
    assert cs.build_launch_args({"community": False, "query_port": 27015}) == ["-queryport=27015"]


def test_build_launch_args_both():
    args = cs.build_launch_args({"community": True, "query_port": 27015})
    assert args == ["-publiclobby", "-queryport=27015"]


def test_build_launch_args_ignores_blank_query_port():
    assert cs.build_launch_args({"community": False, "query_port": ""}) == []
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_controller_settings.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'backend.services.controller_settings'`

- [ ] **Step 3: Write the implementation**

Create `backend/services/controller_settings.py`:

```python
import json
from pathlib import Path
from typing import Any

CONTROLLER_SETTINGS_PATH = Path("/palworld/controller-settings.json")

# Keys this store owns. The config router uses this to split them out of the
# PalWorldSettings.ini payload so they are never written to the .ini.
CONTROLLER_KEYS = {"community", "query_port"}

DEFAULTS: dict[str, Any] = {"community": False, "query_port": None}


def _normalize(settings: dict[str, Any]) -> dict[str, Any]:
    result = {k: settings[k] for k in CONTROLLER_KEYS if k in settings}
    if "community" in result:
        result["community"] = bool(result["community"])
    if "query_port" in result:
        qp = result["query_port"]
        if qp in (None, ""):
            result["query_port"] = None
        else:
            try:
                result["query_port"] = int(qp)
            except (TypeError, ValueError):
                result["query_port"] = None
    return result


def read_settings(path: Path = CONTROLLER_SETTINGS_PATH) -> dict[str, Any]:
    settings = dict(DEFAULTS)
    if path.exists():
        try:
            on_disk = json.loads(path.read_text(encoding="utf-8"))
            settings.update(_normalize(on_disk))
        except (json.JSONDecodeError, OSError):
            pass
    return settings


def write_settings(settings: dict[str, Any], path: Path = CONTROLLER_SETTINGS_PATH) -> None:
    merged = {**DEFAULTS, **_normalize(settings)}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(merged), encoding="utf-8")


def build_launch_args(settings: dict[str, Any]) -> list[str]:
    args: list[str] = []
    if settings.get("community"):
        args.append("-publiclobby")
    qp = settings.get("query_port")
    if qp not in (None, ""):
        args.append(f"-queryport={int(qp)}")
    return args
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_controller_settings.py -v`
Expected: PASS (all 11 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/services/controller_settings.py tests/test_controller_settings.py
git commit -m "feat: add controller-settings store for launch options"
```

---

### Task 2: Config router merges/splits controller keys

**Files:**
- Modify: `backend/routers/config.py`
- Test: `tests/test_routers/test_config.py`

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_routers/test_config.py`:

```python
def test_get_config_includes_controller_settings(client):
    with patch("backend.routers.config.read_config", return_value={}), \
         patch("backend.routers.config.read_settings",
               return_value={"community": True, "query_port": 27015}):
        resp = client.get("/api/config")
    assert resp.status_code == 200
    body = resp.json()
    assert body["community"] is True
    assert body["query_port"] == 27015


def test_put_config_routes_controller_keys_to_store_not_ini(client):
    update = {"ServerName": "New Name", "community": True, "query_port": 27015}
    with patch("backend.routers.config.read_config", return_value={}), \
         patch("backend.routers.config.write_config") as mock_write_config, \
         patch("backend.routers.config.read_settings",
               return_value={"community": False, "query_port": None}), \
         patch("backend.routers.config.write_settings") as mock_write_settings:
        resp = client.put("/api/config", json={"settings": update})
    assert resp.status_code == 200

    # controller keys go to the store...
    mock_write_settings.assert_called_once()
    stored = mock_write_settings.call_args[0][0]
    assert stored["community"] is True
    assert stored["query_port"] == 27015

    # ...and are NOT written to the .ini
    written_ini = mock_write_config.call_args[0][0]
    assert "community" not in written_ini
    assert "query_port" not in written_ini
    assert written_ini["ServerName"] == "New Name"


def test_put_config_without_controller_keys_skips_store_write(client):
    with patch("backend.routers.config.read_config", return_value={}), \
         patch("backend.routers.config.write_config"), \
         patch("backend.routers.config.write_settings") as mock_write_settings:
        resp = client.put("/api/config", json={"settings": {"ServerName": "X"}})
    assert resp.status_code == 200
    mock_write_settings.assert_not_called()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_routers/test_config.py -v -k controller`
Expected: FAIL — `read_settings`/`write_settings` are not importable from `backend.routers.config` (AttributeError on patch), or `community` absent from GET body.

- [ ] **Step 3: Modify the config router**

Replace the entire contents of `backend/routers/config.py` with:

```python
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
    # Seed any keys absent on disk with defaults; on-disk values always win.
    # Controller launch-option settings are merged in alongside the .ini fields.
    return {**DEFAULT_SETTINGS, **read_config(), **read_settings()}


@router.put("")
def put_config(body: ConfigUpdate):
    _assert_stopped()
    incoming = dict(body.settings)

    # Split controller launch-option keys out of the .ini payload.
    controller = {k: incoming.pop(k) for k in CONTROLLER_KEYS if k in incoming}
    if controller:
        write_settings({**read_settings(), **controller})

    current = read_config()
    current.update(incoming)
    write_config(current)
    return {"ok": True}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_routers/test_config.py -v`
Expected: PASS (existing tests + 3 new ones)

- [ ] **Step 5: Commit**

```bash
git add backend/routers/config.py tests/test_routers/test_config.py
git commit -m "feat: merge/split controller launch options in config router"
```

---

### Task 3: Server router applies launch args at start

**Files:**
- Modify: `backend/routers/server.py`
- Test: `tests/test_routers/test_server.py`

- [ ] **Step 1: Write the failing test**

Append to `tests/test_routers/test_server.py`:

```python
def test_start_passes_launch_args_from_controller_settings(client, mock_manager):
    import backend.main as main_mod
    main_mod.server_manager = mock_manager
    mock_manager.start = AsyncMock()
    with patch("backend.routers.server.read_settings",
               return_value={"community": True, "query_port": 27015}):
        resp = client.post("/api/server/start")
    assert resp.status_code == 200
    mock_manager.start.assert_called_once_with(["-publiclobby", "-queryport=27015"])


def test_start_passes_empty_args_when_no_options(client, mock_manager):
    import backend.main as main_mod
    main_mod.server_manager = mock_manager
    mock_manager.start = AsyncMock()
    with patch("backend.routers.server.read_settings",
               return_value={"community": False, "query_port": None}):
        resp = client.post("/api/server/start")
    assert resp.status_code == 200
    mock_manager.start.assert_called_once_with([])
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_routers/test_server.py -v -k launch_args`
Expected: FAIL — `read_settings` not importable from `backend.routers.server`, or `start` called with no args.

- [ ] **Step 3: Modify the server router**

In `backend/routers/server.py`, add the import near the top (after the existing imports on lines 1-2):

```python
from backend.services.controller_settings import read_settings, build_launch_args
```

Then replace the existing `start` handler (lines 18-24):

```python
@router.post("/start")
async def start(background_tasks: BackgroundTasks):
    mgr = get_manager()
    if mgr.state != ServerState.STOPPED:
        raise HTTPException(status_code=409, detail=f"Cannot start: server is {mgr.state}")
    extra_args = build_launch_args(read_settings())
    background_tasks.add_task(mgr.start, extra_args)
    return {"ok": True}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_routers/test_server.py -v`
Expected: PASS — both new tests plus the existing `test_start_calls_manager` (which still passes; `assert_called_once()` is satisfied by the `[]` call).

- [ ] **Step 5: Commit**

```bash
git add backend/routers/server.py tests/test_routers/test_server.py
git commit -m "feat: apply community/query-port launch args at server start"
```

---

### Task 4: Frontend — surface the two fields

**Files:**
- Modify: `frontend/src/pages/ConfigPage.tsx`

- [ ] **Step 1: Add the field entries**

In `frontend/src/pages/ConfigPage.tsx`, in the `SECTIONS` array's `"Server"` section, add these two entries immediately after the `RESTAPIPort` line (currently line 50, the last field before the section's closing `]`):

```ts
      { key: "community", label: "List in Community Server Browser", type: "bool" },
      { key: "query_port", label: "Steam Query Port", type: "number" },
```

The resulting tail of the "Server" section should read:

```ts
      { key: "RESTAPIEnabled", label: "Enable REST API", type: "bool" },
      { key: "RESTAPIPort", label: "REST API Port", type: "number" },
      { key: "community", label: "List in Community Server Browser", type: "bool" },
      { key: "query_port", label: "Steam Query Port", type: "number" },
    ],
  },
```

No other frontend changes are needed: `ConfigField` already renders `bool` (Switch) and
`number` (numeric Input, blank ⇒ `""`), and `ConfigPage` already round-trips the whole config
object on save (`putConfig({ ...config, ...edits })`), so the new keys reach `PUT /api/config`.

- [ ] **Step 2: Type-check and build**

Run: `cd frontend && npx tsc --noEmit && npm run build`
Expected: no type errors; build completes to `frontend/dist/`.

> Requires Node 22 (`nvm use 22` if needed). The two entries are plain `FieldMeta` objects, so this should pass without other changes.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/ConfigPage.tsx
git commit -m "feat: add community + query-port fields to Server config section"
```

---

### Task 5: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full backend suite**

Run: `pytest tests/ -v`
Expected: all tests PASS (new service, config-router, and server-router tests included).

- [ ] **Step 2: Run frontend checks**

Run: `cd frontend && npm run lint && npm run test`
Expected: lint clean; vitest passes (no tests were changed, so this confirms nothing regressed).

- [ ] **Step 3: Confirm clean tree**

Run: `git status`
Expected: clean working tree; all work committed across Tasks 1-4.

---

## Notes for the implementer

- **Absolute imports only** (`backend.X`) — never relative. See `CLAUDE.md`.
- **Do not modify `server_manager.py`** — `start(self, extra_args=None)` already prepends
  `extra_args` before `PALWORLD_OPTS`.
- **Editing is gated on `server stopped`** — already enforced by `_assert_stopped()` (backend
  409) and the disabled state in `ConfigPage`/`NavBar`. Launch args only matter at start, so no
  extra gating is needed.
- The store file lives on the persistent `/palworld` volume, so settings survive container
  restarts.
- **Commit trailer:** append `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
  to each commit message (repo convention). The single-line `-m` examples above omit it for
  brevity.
