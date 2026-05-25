# Palworld Controller Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single Docker container running a FastAPI controller web app that manages a Palworld dedicated server as a child process, with a React SPA for server control, settings editing, and save file (pal) editing.

**Architecture:** FastAPI (Python) serves a built React SPA as static files and exposes a REST API. The Palworld server is a child process owned by the controller. Palworld-Pal-Editor is imported as a Python library for save file operations. A single `/palworld` Docker volume persists all server data.

**Tech Stack:** Python 3.11, FastAPI, uvicorn, pytest, asyncio — React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, React Query, React Router v6 — Docker multi-stage build from `cm2network/steamcmd`

---

## File Structure

```
palworld-server/
├── .gitignore
├── .env.example
├── Dockerfile
├── entrypoint.sh
├── docker-compose.yml
├── LICENSE
├── backend/
│   ├── main.py                    # FastAPI app factory
│   ├── requirements.txt
│   ├── routers/
│   │   ├── __init__.py
│   │   ├── auth.py                # POST /api/auth/login|logout
│   │   ├── server.py              # GET/POST /api/server/status|start|stop|update
│   │   ├── config.py              # GET/PUT /api/config
│   │   └── saves.py               # GET/PATCH/DELETE /api/saves/...
│   ├── services/
│   │   ├── __init__.py
│   │   ├── server_manager.py      # State machine + subprocess lifecycle
│   │   ├── config_manager.py      # PalWorldSettings.ini parse/write
│   │   └── save_manager.py        # Palworld-Pal-Editor wrapper
│   ├── middleware/
│   │   ├── __init__.py
│   │   └── auth.py                # FastAPI auth dependency
│   └── models/
│       ├── __init__.py
│       ├── server.py              # ServerState, ServerStatus
│       ├── config.py              # ConfigUpdate
│       ├── saves.py               # PlayerSummary, PalSummary, PalPatch
│       └── auth.py                # LoginRequest
├── tests/
│   ├── __init__.py
│   ├── conftest.py
│   ├── test_server_manager.py
│   ├── test_config_manager.py
│   ├── test_save_manager.py
│   └── test_routers/
│       ├── __init__.py
│       ├── test_auth.py
│       ├── test_server.py
│       ├── test_config.py
│       └── test_saves.py
└── frontend/
    ├── index.html
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    ├── tailwind.config.js
    ├── postcss.config.js
    ├── components.json            # shadcn/ui config
    └── src/
        ├── main.tsx
        ├── App.tsx                # Router + auth gate
        ├── types/index.ts         # Shared TypeScript types
        ├── api/
        │   ├── client.ts          # Base fetch wrapper (401 handling)
        │   ├── server.ts
        │   ├── config.ts
        │   ├── saves.ts
        │   └── auth.ts
        ├── context/
        │   └── AuthContext.tsx
        ├── hooks/
        │   ├── useServerStatus.ts # Polls /api/server/status every 2s
        │   └── useAuth.ts
        ├── pages/
        │   ├── LoginPage.tsx
        │   ├── ServerPage.tsx
        │   ├── ConfigPage.tsx
        │   └── SavesPage.tsx
        └── components/
            ├── Layout.tsx
            ├── NavBar.tsx
            ├── ServerStatusBadge.tsx
            ├── LogViewer.tsx
            ├── config/
            │   └── ConfigField.tsx
            └── saves/
                ├── PalList.tsx
                └── PalDetail.tsx
```

---

## Task 1: Project Scaffold

**Files:**
- Create: `.gitignore`
- Create: `.env.example`
- Create: `LICENSE`
- Create: `backend/requirements.txt`
- Create: `backend/routers/__init__.py`, `backend/services/__init__.py`, `backend/middleware/__init__.py`, `backend/models/__init__.py`
- Create: `tests/__init__.py`, `tests/test_routers/__init__.py`

- [ ] **Step 1: Write .gitignore**

```
__pycache__/
*.pyc
*.pyo
.venv/
venv/
.env
*.egg-info/
.pytest_cache/
node_modules/
frontend/dist/
frontend/.vite/
*.log
```

- [ ] **Step 2: Write .env.example**

```
# Leave CONTROLLER_PASSWORD unset for open access (private network)
CONTROLLER_PASSWORD=
CONTROLLER_PORT=8080
PALWORLD_OPTS=
```

- [ ] **Step 3: Write LICENSE (GPL-3.0)**

Download the GPL-3.0 license text:

```bash
curl -o LICENSE https://www.gnu.org/licenses/gpl-3.0.txt
```

- [ ] **Step 4: Write backend/requirements.txt**

```
fastapi==0.115.5
uvicorn[standard]==0.32.1
python-multipart==0.0.12
palworld-pal-editor @ git+https://github.com/KrisCris/Palworld-Pal-Editor.git
pytest==8.3.4
pytest-asyncio==0.24.0
httpx==0.27.2
anyio==4.6.2
```

- [ ] **Step 5: Create empty __init__.py files**

```bash
touch backend/routers/__init__.py backend/services/__init__.py \
      backend/middleware/__init__.py backend/models/__init__.py \
      tests/__init__.py tests/test_routers/__init__.py
```

- [ ] **Step 6: Write tests/conftest.py**

```python
import pytest
from fastapi.testclient import TestClient

@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"
```

- [ ] **Step 7: Commit**

```bash
git add .gitignore .env.example LICENSE backend/requirements.txt \
        backend/routers/__init__.py backend/services/__init__.py \
        backend/middleware/__init__.py backend/models/__init__.py \
        tests/__init__.py tests/test_routers/__init__.py tests/conftest.py
git commit -m "chore: project scaffold"
```

---

## Task 2: Backend Models

**Files:**
- Create: `backend/models/server.py`
- Create: `backend/models/config.py`
- Create: `backend/models/saves.py`
- Create: `backend/models/auth.py`

- [ ] **Step 1: Write backend/models/server.py**

```python
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
```

- [ ] **Step 2: Write backend/models/config.py**

```python
from pydantic import BaseModel


class ConfigUpdate(BaseModel):
    settings: dict[str, object]
```

- [ ] **Step 3: Write backend/models/saves.py**

```python
from pydantic import BaseModel


class PlayerSummary(BaseModel):
    uid: str
    nickname: str
    level: int


class PlayersResponse(BaseModel):
    players: list[PlayerSummary]
    has_working_pals: bool


class PalSummary(BaseModel):
    instance_id: str
    player_uid: str | None
    display_name: str | None
    nickname: str
    level: int
    gender: str | None
    is_unref: bool
    in_owner_palbox: bool


class PalPatch(BaseModel):
    player_uid: str | None = None
    key: str
    value: object
```

- [ ] **Step 4: Write backend/models/auth.py**

```python
from pydantic import BaseModel


class LoginRequest(BaseModel):
    password: str


class AuthStatus(BaseModel):
    required: bool
```

- [ ] **Step 5: Commit**

```bash
git add backend/models/
git commit -m "feat: add Pydantic models"
```

---

## Task 3: Server Manager

**Files:**
- Create: `backend/services/server_manager.py`
- Create: `tests/test_server_manager.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_server_manager.py
import asyncio
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from backend.services.server_manager import ServerManager, ServerState


@pytest.fixture
def manager():
    return ServerManager()


def test_initial_state_is_stopped(manager):
    assert manager.state == ServerState.STOPPED


def test_logs_empty_on_init(manager):
    assert manager.logs == []


def test_logs_returns_last_100_lines(manager):
    for i in range(150):
        manager._push_log(f"line {i}")
    logs = manager.logs
    assert len(logs) == 100
    assert logs[0] == "line 50"
    assert logs[-1] == "line 149"


@pytest.mark.asyncio
async def test_start_raises_if_not_stopped(manager):
    manager.state = ServerState.RUNNING
    with pytest.raises(RuntimeError, match="Cannot start"):
        await manager.start()


@pytest.mark.asyncio
async def test_stop_raises_if_not_running(manager):
    with pytest.raises(RuntimeError, match="Cannot stop"):
        await manager.stop()


@pytest.mark.asyncio
async def test_update_raises_if_not_stopped(manager):
    manager.state = ServerState.RUNNING
    with pytest.raises(RuntimeError, match="must be stopped"):
        await manager.update()


@pytest.mark.asyncio
async def test_start_sets_running_state(manager, tmp_path):
    binary = tmp_path / "PalServer.sh"
    binary.touch()

    mock_proc = MagicMock()
    mock_proc.stdout.readline = AsyncMock(return_value=b"")
    mock_proc.wait = AsyncMock(return_value=0)
    mock_proc.returncode = 0

    with patch("backend.services.server_manager.PALWORLD_BINARY", str(binary)), \
         patch("asyncio.create_subprocess_exec", return_value=mock_proc):
        await manager.start()

    assert manager.state == ServerState.RUNNING


@pytest.mark.asyncio
async def test_stop_terminates_process_and_sets_stopped(manager):
    mock_proc = MagicMock()
    mock_proc.terminate = MagicMock()
    mock_proc.wait = AsyncMock(return_value=0)
    manager.state = ServerState.RUNNING
    manager._process = mock_proc

    await manager.stop()

    assert manager.state == ServerState.STOPPED
    mock_proc.terminate.assert_called_once()


@pytest.mark.asyncio
async def test_update_runs_steamcmd_and_returns_to_stopped(manager):
    lines = [b"Downloading...\n", b"Success.\n", b""]
    line_iter = iter(lines)

    mock_proc = MagicMock()
    mock_proc.stdout.__aiter__ = AsyncMock(return_value=iter([b"Downloading...\n", b"Success.\n"]))

    async def fake_aiter(self):
        for line in [b"Downloading...\n", b"Success.\n"]:
            yield line

    mock_proc.__class__.__aiter__ = fake_aiter
    mock_proc.wait = AsyncMock(return_value=0)
    mock_proc.returncode = 0

    # Use a simpler approach: patch stdout as an async generator
    async def mock_stdout():
        for line in [b"Downloading...\n", b"Success.\n"]:
            yield line

    real_proc = MagicMock()
    real_proc.stdout = mock_stdout()
    real_proc.wait = AsyncMock(return_value=0)
    real_proc.returncode = 0

    with patch("asyncio.create_subprocess_exec", return_value=real_proc):
        await manager.update()

    assert manager.state == ServerState.STOPPED
    assert any("Downloading" in line for line in manager.logs)
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && python -m pytest ../tests/test_server_manager.py -v 2>&1 | head -30
```

Expected: `ModuleNotFoundError: No module named 'backend'`

- [ ] **Step 3: Write backend/services/server_manager.py**

```python
import asyncio
from collections import deque
from pathlib import Path

from backend.models.server import ServerState

STEAMCMD_PATH = "/home/steam/steamcmd/steamcmd.sh"
PALWORLD_DIR = "/palworld"
PALWORLD_BINARY = "/palworld/PalServer.sh"
STEAMAPP_ID = "2394010"


class ServerManager:
    def __init__(self):
        self.state = ServerState.STOPPED
        self._process: asyncio.subprocess.Process | None = None
        self._logs: deque[str] = deque(maxlen=1000)

    @property
    def logs(self) -> list[str]:
        return list(self._logs)[-100:]

    def _push_log(self, line: str) -> None:
        self._logs.append(line)

    async def _tail_output(self, process: asyncio.subprocess.Process) -> None:
        async for line in process.stdout:
            self._push_log(line.decode().rstrip())
        await process.wait()
        if self.state == ServerState.RUNNING:
            self._push_log(f"[controller] Server exited (code {process.returncode})")
            self.state = ServerState.STOPPED
        self._process = None

    async def update(self) -> None:
        if self.state != ServerState.STOPPED:
            raise RuntimeError("Server must be stopped before updating")
        self.state = ServerState.UPDATING
        try:
            self._push_log("[controller] Starting SteamCMD update...")
            proc = await asyncio.create_subprocess_exec(
                STEAMCMD_PATH,
                "+force_install_dir", PALWORLD_DIR,
                "+login", "anonymous",
                "+app_update", STEAMAPP_ID, "validate",
                "+quit",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
            )
            async for line in proc.stdout:
                self._push_log(line.decode().rstrip())
            await proc.wait()
            if proc.returncode != 0:
                raise RuntimeError(f"SteamCMD failed (code {proc.returncode})")
            self._push_log("[controller] Update complete.")
        finally:
            self.state = ServerState.STOPPED

    async def start(self, extra_args: list[str] | None = None) -> None:
        if self.state != ServerState.STOPPED:
            raise RuntimeError(f"Cannot start: server is {self.state}")

        if not Path(PALWORLD_BINARY).exists():
            await self.update()

        self.state = ServerState.STARTING
        self._push_log("[controller] Starting Palworld server...")

        args = [
            PALWORLD_BINARY,
            "-useperfthreads",
            "-NoAsyncLoadingThread",
            "-UseMultithreadForDS",
        ]
        if extra_args:
            args.extend(extra_args)

        proc = await asyncio.create_subprocess_exec(
            *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        self._process = proc
        self.state = ServerState.RUNNING
        asyncio.create_task(self._tail_output(proc))

    async def stop(self) -> None:
        if self.state != ServerState.RUNNING:
            raise RuntimeError(f"Cannot stop: server is {self.state}")

        self.state = ServerState.STOPPING
        self._push_log("[controller] Stopping Palworld server...")

        try:
            self._process.terminate()
            try:
                await asyncio.wait_for(self._process.wait(), timeout=30.0)
            except asyncio.TimeoutError:
                self._push_log("[controller] Graceful shutdown timed out, killing...")
                self._process.kill()
                await self._process.wait()
        finally:
            self._push_log("[controller] Server stopped.")
            self.state = ServerState.STOPPED
            self._process = None
```

- [ ] **Step 4: Install dependencies and run tests**

```bash
cd /path/to/project
pip install -r backend/requirements.txt
cd backend && python -m pytest ../tests/test_server_manager.py -v
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/services/server_manager.py tests/test_server_manager.py
git commit -m "feat: server manager with state machine and subprocess lifecycle"
```

---

## Task 4: Config Manager

**Files:**
- Create: `backend/services/config_manager.py`
- Create: `tests/test_config_manager.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_config_manager.py
from pathlib import Path
import pytest
from backend.services.config_manager import read_config, write_config

SAMPLE_INI = """\
[/Script/Pal.PalGameWorldSettings]
OptionSettings=(DayTimeSpeedRate=1.000000,NightTimeSpeedRate=2.000000,ExpRate=3.000000,bEnablePlayerToPlayerDamage=False,ServerName="My Server",DeathPenalty=All,ServerPlayerMaxNum=32)
"""


@pytest.fixture
def ini_file(tmp_path):
    p = tmp_path / "PalWorldSettings.ini"
    p.write_text(SAMPLE_INI, encoding="utf-8")
    return p


def test_read_returns_float(ini_file):
    cfg = read_config(ini_file)
    assert cfg["DayTimeSpeedRate"] == pytest.approx(1.0)
    assert cfg["NightTimeSpeedRate"] == pytest.approx(2.0)


def test_read_returns_int(ini_file):
    cfg = read_config(ini_file)
    assert cfg["ServerPlayerMaxNum"] == 32


def test_read_returns_bool_false(ini_file):
    cfg = read_config(ini_file)
    assert cfg["bEnablePlayerToPlayerDamage"] is False


def test_read_returns_unquoted_string_as_enum(ini_file):
    cfg = read_config(ini_file)
    assert cfg["DeathPenalty"] == "All"


def test_read_returns_quoted_string_without_quotes(ini_file):
    cfg = read_config(ini_file)
    assert cfg["ServerName"] == "My Server"


def test_read_returns_empty_dict_for_missing_file(tmp_path):
    cfg = read_config(tmp_path / "nonexistent.ini")
    assert cfg == {}


def test_round_trip(ini_file, tmp_path):
    cfg = read_config(ini_file)
    out = tmp_path / "out.ini"
    write_config(cfg, out)
    cfg2 = read_config(out)
    assert cfg2["DayTimeSpeedRate"] == pytest.approx(cfg["DayTimeSpeedRate"])
    assert cfg2["ServerName"] == cfg["ServerName"]
    assert cfg2["bEnablePlayerToPlayerDamage"] == cfg["bEnablePlayerToPlayerDamage"]
    assert cfg2["DeathPenalty"] == cfg["DeathPenalty"]
    assert cfg2["ServerPlayerMaxNum"] == cfg["ServerPlayerMaxNum"]


def test_write_creates_parent_dirs(tmp_path):
    cfg = {"DayTimeSpeedRate": 1.0}
    path = tmp_path / "deep" / "nested" / "PalWorldSettings.ini"
    write_config(cfg, path)
    assert path.exists()
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
python -m pytest tests/test_config_manager.py -v 2>&1 | head -20
```

Expected: `ModuleNotFoundError` or `ImportError`.

- [ ] **Step 3: Write backend/services/config_manager.py**

```python
from pathlib import Path
from typing import Any

SETTINGS_PATH = Path("/palworld/Pal/Saved/Config/LinuxServer/PalWorldSettings.ini")
SECTION_HEADER = "[/Script/Pal.PalGameWorldSettings]"

# These fields are stored with surrounding double-quotes in the INI file
STRING_FIELDS = {
    "ServerName", "ServerDescription", "AdminPassword", "ServerPassword",
    "PublicIP", "BanListURL", "Region",
}


def _find_option_content(text: str) -> str | None:
    marker = "OptionSettings=("
    start = text.find(marker)
    if start == -1:
        return None
    pos = start + len(marker)
    depth = 1
    while pos < len(text) and depth > 0:
        if text[pos] == "(":
            depth += 1
        elif text[pos] == ")":
            depth -= 1
        pos += 1
    return text[start + len(marker): pos - 1]


def _parse_pairs(content: str) -> dict[str, Any]:
    pairs: dict[str, Any] = {}
    depth = 0
    in_string = False
    current = ""

    for ch in content:
        if ch == '"':
            in_string = not in_string
            current += ch
        elif not in_string and ch == "(":
            depth += 1
            current += ch
        elif not in_string and ch == ")":
            depth -= 1
            current += ch
        elif not in_string and ch == "," and depth == 0:
            if "=" in current:
                k, _, v = current.partition("=")
                pairs[k.strip()] = _parse_value(v.strip())
            current = ""
        else:
            current += ch

    if current and "=" in current:
        k, _, v = current.partition("=")
        pairs[k.strip()] = _parse_value(v.strip())

    return pairs


def _parse_value(raw: str) -> Any:
    if raw.startswith('"') and raw.endswith('"'):
        return raw[1:-1]
    if raw.startswith("("):
        return raw  # nested structure (e.g., CrossplayPlatforms), keep as-is
    if raw.lower() == "true":
        return True
    if raw.lower() == "false":
        return False
    try:
        if "." in raw:
            return float(raw)
        return int(raw)
    except ValueError:
        return raw  # enum value (e.g., "All", "None", "ItemAndEquipment")


def _format_value(key: str, value: Any) -> str:
    if isinstance(value, bool):
        return str(value)
    if isinstance(value, float):
        return f"{value:.6f}"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, str):
        if key in STRING_FIELDS:
            return f'"{value}"'
        return value  # enum or nested structure
    return str(value)


def read_config(path: Path = SETTINGS_PATH) -> dict[str, Any]:
    if not path.exists():
        return {}
    text = path.read_text(encoding="utf-8")
    content = _find_option_content(text)
    if content is None:
        return {}
    return _parse_pairs(content)


def write_config(settings: dict[str, Any], path: Path = SETTINGS_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    options = ",".join(f"{k}={_format_value(k, v)}" for k, v in settings.items())
    text = f"{SECTION_HEADER}\nOptionSettings=({options})\n"
    path.write_text(text, encoding="utf-8")
```

- [ ] **Step 4: Run tests**

```bash
python -m pytest tests/test_config_manager.py -v
```

Expected: All 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/services/config_manager.py tests/test_config_manager.py
git commit -m "feat: config manager for PalWorldSettings.ini"
```

---

## Task 5: Save Manager

**Files:**
- Create: `backend/services/save_manager.py`
- Create: `tests/test_save_manager.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_save_manager.py
import uuid
from pathlib import Path
from unittest.mock import MagicMock, patch
import pytest
from backend.services.save_manager import SaveManager, find_save_path


@pytest.fixture
def save_dir(tmp_path):
    server_id = str(uuid.uuid4())
    save_path = tmp_path / "SaveGames" / "0" / server_id
    save_path.mkdir(parents=True)
    (save_path / "Level.sav").touch()
    return tmp_path / "SaveGames" / "0", server_id


def test_find_save_path_returns_uuid_dir(save_dir):
    base, server_id = save_dir
    found = find_save_path(base)
    assert found is not None
    assert found.name == server_id


def test_find_save_path_returns_none_when_empty(tmp_path):
    base = tmp_path / "SaveGames" / "0"
    base.mkdir(parents=True)
    assert find_save_path(base) is None


def test_find_save_path_skips_non_uuid_dirs(tmp_path):
    base = tmp_path / "SaveGames" / "0"
    base.mkdir(parents=True)
    (base / "not-a-uuid").mkdir()
    assert find_save_path(base) is None


def test_save_manager_init_raises_when_no_save(tmp_path):
    base = tmp_path / "SaveGames" / "0"
    base.mkdir(parents=True)
    with pytest.raises(RuntimeError, match="No save"):
        SaveManager(save_base=base)


def test_save_manager_get_players_calls_library(save_dir):
    base, server_id = save_dir
    mock_ppe_manager = MagicMock()
    mock_ppe_manager.get_players.return_value = []

    with patch("backend.services.save_manager.PPESaveManager", return_value=mock_ppe_manager), \
         patch("backend.services.save_manager.PPESaveManager.__call__", return_value=mock_ppe_manager):
        sm = SaveManager.__new__(SaveManager)
        sm._manager = mock_ppe_manager
        sm._save_path = base / server_id
        players = sm.get_players()

    mock_ppe_manager.get_players.assert_called_once()
    assert players == []
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
python -m pytest tests/test_save_manager.py -v 2>&1 | head -20
```

Expected: `ImportError` or `ModuleNotFoundError`.

- [ ] **Step 3: Write backend/services/save_manager.py**

```python
import re
import uuid
from pathlib import Path
from typing import Any

from palworld_pal_editor.core.save_manager import SaveManager as PPESaveManager

SAVE_BASE = Path("/palworld/Pal/Saved/SaveGames/0")
UUID_PATTERN = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)


def find_save_path(base: Path = SAVE_BASE) -> Path | None:
    if not base.exists():
        return None
    for entry in base.iterdir():
        if entry.is_dir() and UUID_PATTERN.match(entry.name):
            return entry
    return None


class SaveManager:
    def __init__(self, save_base: Path = SAVE_BASE):
        save_path = find_save_path(save_base)
        if save_path is None:
            raise RuntimeError(f"No save directory found under {save_base}")
        self._save_path = save_path
        self._manager = PPESaveManager()
        self._manager.open(str(save_path))

    def get_players(self) -> list[Any]:
        return self._manager.get_players()

    def get_working_pals(self) -> list[Any]:
        return self._manager.get_working_pals()

    def get_player(self, uid: str) -> Any:
        return self._manager.get_player(uid)

    def get_working_pal(self, guid: str):
        return self._manager.get_working_pal(guid)

    def delete_pal(self, guid: str) -> bool:
        return self._manager.delete_pal(guid)

    def set_pal_attr(self, player_uid: str, instance_id: str, key: str, value: Any) -> None:
        if player_uid == "PAL_BASE_WORKER_BTN":
            pal = self._manager.get_working_pal(instance_id)
        else:
            player = self._manager.get_player(player_uid)
            if player is None:
                raise ValueError(f"Player {player_uid} not found")
            pal = player.get_pal(instance_id)
        if pal is None:
            raise ValueError(f"Pal {instance_id} not found")
        setattr(pal, key, value)

    def commit(self) -> None:
        self._manager.save(str(self._save_path))
```

- [ ] **Step 4: Run tests**

```bash
python -m pytest tests/test_save_manager.py -v
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/services/save_manager.py tests/test_save_manager.py
git commit -m "feat: save manager wrapping Palworld-Pal-Editor"
```

---

## Task 6: Auth Middleware

**Files:**
- Create: `backend/middleware/auth.py`
- Create: `tests/test_routers/test_auth.py` (partial — full tests in Task 7)

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_routers/test_auth.py
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from backend.middleware.auth import AuthMiddleware, require_auth


def make_app(password: str | None):
    app = FastAPI()
    auth = AuthMiddleware(password=password)

    @app.get("/protected")
    def protected(token=require_auth(auth)):
        return {"ok": True}

    @app.post("/login")
    def login(body: dict, response=None):
        tok = auth.login(body.get("password", ""))
        if tok is None:
            from fastapi import HTTPException
            raise HTTPException(status_code=401)
        return {"token": tok}

    return app, auth


def test_no_password_allows_access():
    app, _ = make_app(password=None)
    client = TestClient(app)
    resp = client.get("/protected")
    assert resp.status_code == 200


def test_password_required_returns_401_without_token():
    app, _ = make_app(password="secret")
    client = TestClient(app)
    resp = client.get("/protected")
    assert resp.status_code == 401


def test_login_with_correct_password_returns_token():
    app, auth = make_app(password="secret")
    client = TestClient(app)
    resp = client.post("/login", json={"password": "secret"})
    assert resp.status_code == 200
    assert "token" in resp.json()


def test_login_with_wrong_password_returns_none():
    _, auth = make_app(password="secret")
    assert auth.login("wrong") is None


def test_valid_token_allows_access():
    app, auth = make_app(password="secret")
    client = TestClient(app)
    token = auth.login("secret")
    resp = client.get("/protected", cookies={"session": token})
    assert resp.status_code == 200


def test_logout_invalidates_token():
    _, auth = make_app(password="secret")
    token = auth.login("secret")
    auth.logout(token)
    assert not auth.is_valid(token)
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
python -m pytest tests/test_routers/test_auth.py -v 2>&1 | head -20
```

Expected: `ImportError`.

- [ ] **Step 3: Write backend/middleware/auth.py**

```python
import secrets
from fastapi import Cookie, Depends, HTTPException


class AuthMiddleware:
    def __init__(self, password: str | None):
        self._password = password or None
        self._tokens: set[str] = set()

    @property
    def required(self) -> bool:
        return self._password is not None

    def login(self, password: str) -> str | None:
        if self._password is None or password != self._password:
            return None
        token = secrets.token_hex(32)
        self._tokens.add(token)
        return token

    def logout(self, token: str) -> None:
        self._tokens.discard(token)

    def is_valid(self, token: str | None) -> bool:
        if not self.required:
            return True
        return token in self._tokens


def require_auth(auth: AuthMiddleware):
    def dependency(session: str | None = Cookie(default=None)):
        if not auth.is_valid(session):
            raise HTTPException(status_code=401, detail="Unauthorized")
    return Depends(dependency)
```

- [ ] **Step 4: Run tests**

```bash
python -m pytest tests/test_routers/test_auth.py -v
```

Expected: All 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/middleware/auth.py tests/test_routers/test_auth.py
git commit -m "feat: optional auth middleware"
```

---

## Task 7: FastAPI App + Auth Router

**Files:**
- Create: `backend/main.py`
- Create: `backend/routers/auth.py`
- Modify: `tests/conftest.py`

- [ ] **Step 1: Write backend/routers/auth.py**

```python
import os
from fastapi import APIRouter, HTTPException, Response
from backend.models.auth import LoginRequest, AuthStatus

router = APIRouter(prefix="/api/auth", tags=["auth"])


def get_auth():
    from backend.main import auth
    return auth


@router.get("/status", response_model=AuthStatus)
def auth_status():
    return AuthStatus(required=get_auth().required)


@router.post("/login")
def login(body: LoginRequest, response: Response):
    token = get_auth().login(body.password)
    if token is None:
        raise HTTPException(status_code=401, detail="Invalid password")
    response.set_cookie("session", token, httponly=True, samesite="strict")
    return {"ok": True}


@router.post("/logout")
def logout(response: Response, session: str | None = None):
    from fastapi import Cookie
    if session:
        get_auth().logout(session)
    response.delete_cookie("session")
    return {"ok": True}
```

- [ ] **Step 2: Write backend/main.py**

```python
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from backend.middleware.auth import AuthMiddleware
from backend.services.server_manager import ServerManager

_password = os.environ.get("CONTROLLER_PASSWORD") or None
auth = AuthMiddleware(password=_password)
server_manager = ServerManager()
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

from backend.routers import auth as auth_router, server, config, saves  # noqa: E402
app.include_router(auth_router.router)
app.include_router(server.router)
app.include_router(config.router)
app.include_router(saves.router)

static_dir = Path(__file__).parent / "static"
if static_dir.exists():
    app.mount("/", StaticFiles(directory=str(static_dir), html=True), name="static")
```

- [ ] **Step 3: Update tests/conftest.py**

```python
import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("CONTROLLER_PASSWORD", "")
    from backend import main
    main.auth = __import__("backend.middleware.auth", fromlist=["AuthMiddleware"]).AuthMiddleware(password=None)
    main.server_manager = __import__("backend.services.server_manager", fromlist=["ServerManager"]).ServerManager()
    from fastapi.testclient import TestClient
    from backend.main import app
    return TestClient(app)


@pytest.fixture
def client_with_auth(monkeypatch):
    monkeypatch.setenv("CONTROLLER_PASSWORD", "testpass")
    from backend import main
    main.auth = __import__("backend.middleware.auth", fromlist=["AuthMiddleware"]).AuthMiddleware(password="testpass")
    from fastapi.testclient import TestClient
    from backend.main import app
    return TestClient(app)
```

- [ ] **Step 4: Verify app starts**

```bash
cd backend && python -m uvicorn main:app --port 8080 &
sleep 2
curl -s http://localhost:8080/api/auth/status | python -m json.tool
kill %1
```

Expected output:
```json
{"required": false}
```

- [ ] **Step 5: Commit**

```bash
git add backend/main.py backend/routers/auth.py tests/conftest.py
git commit -m "feat: FastAPI app factory and auth router"
```

---

## Task 8: Server Router

**Files:**
- Create: `backend/routers/server.py`
- Create: `tests/test_routers/test_server.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_routers/test_server.py
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from fastapi.testclient import TestClient
from backend.models.server import ServerState


@pytest.fixture
def mock_manager():
    m = MagicMock()
    m.state = ServerState.STOPPED
    m.logs = []
    return m


def test_get_status_returns_stopped(client, mock_manager):
    import backend.main as main_mod
    main_mod.server_manager = mock_manager
    resp = client.get("/api/server/status")
    assert resp.status_code == 200
    assert resp.json()["state"] == "stopped"


def test_start_calls_manager(client, mock_manager):
    import backend.main as main_mod
    main_mod.server_manager = mock_manager
    mock_manager.start = AsyncMock()
    resp = client.post("/api/server/start")
    assert resp.status_code == 200
    mock_manager.start.assert_called_once()


def test_stop_calls_manager(client, mock_manager):
    import backend.main as main_mod
    main_mod.server_manager = mock_manager
    mock_manager.state = ServerState.RUNNING
    mock_manager.stop = AsyncMock()
    resp = client.post("/api/server/stop")
    assert resp.status_code == 200
    mock_manager.stop.assert_called_once()


def test_update_calls_manager(client, mock_manager):
    import backend.main as main_mod
    main_mod.server_manager = mock_manager
    mock_manager.update = AsyncMock()
    resp = client.post("/api/server/update")
    assert resp.status_code == 200
    mock_manager.update.assert_called_once()


def test_update_returns_409_when_running(client, mock_manager):
    import backend.main as main_mod
    main_mod.server_manager = mock_manager
    mock_manager.state = ServerState.RUNNING
    mock_manager.update = AsyncMock(side_effect=RuntimeError("must be stopped"))
    resp = client.post("/api/server/update")
    assert resp.status_code == 409
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
python -m pytest tests/test_routers/test_server.py -v 2>&1 | head -20
```

Expected: `ImportError` (router not yet created).

- [ ] **Step 3: Write backend/routers/server.py**

```python
from fastapi import APIRouter, BackgroundTasks, HTTPException
from backend.models.server import ServerStatus

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
    try:
        background_tasks.add_task(mgr.update)
        return {"ok": True}
    except RuntimeError as e:
        raise HTTPException(status_code=409, detail=str(e))
```

- [ ] **Step 4: Run tests**

```bash
python -m pytest tests/test_routers/test_server.py -v
```

Expected: All 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/routers/server.py tests/test_routers/test_server.py
git commit -m "feat: server control router"
```

---

## Task 9: Config Router

**Files:**
- Create: `backend/routers/config.py`
- Create: `tests/test_routers/test_config.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_routers/test_config.py
from unittest.mock import MagicMock, patch
import pytest
from backend.models.server import ServerState


def test_get_config_returns_dict(client):
    sample = {"DayTimeSpeedRate": 1.0, "ServerName": "Test"}
    with patch("backend.routers.config.read_config", return_value=sample):
        resp = client.get("/api/config")
    assert resp.status_code == 200
    assert resp.json()["DayTimeSpeedRate"] == pytest.approx(1.0)


def test_put_config_calls_write(client):
    with patch("backend.routers.config.read_config", return_value={}), \
         patch("backend.routers.config.write_config") as mock_write:
        resp = client.put("/api/config", json={"settings": {"DayTimeSpeedRate": 2.0}})
    assert resp.status_code == 200
    mock_write.assert_called_once()


def test_put_config_returns_409_when_server_running(client):
    import backend.main as main_mod
    from backend.services.server_manager import ServerManager
    from backend.models.server import ServerState
    m = MagicMock()
    m.state = ServerState.RUNNING
    main_mod.server_manager = m
    resp = client.put("/api/config", json={"settings": {}})
    assert resp.status_code == 409
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
python -m pytest tests/test_routers/test_config.py -v 2>&1 | head -20
```

- [ ] **Step 3: Write backend/routers/config.py**

```python
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
```

- [ ] **Step 4: Run tests**

```bash
python -m pytest tests/test_routers/test_config.py -v
```

Expected: All 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/routers/config.py tests/test_routers/test_config.py
git commit -m "feat: config router with server-state guard"
```

---

## Task 10: Saves Router

**Files:**
- Create: `backend/routers/saves.py`
- Create: `tests/test_routers/test_saves.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_routers/test_saves.py
from unittest.mock import MagicMock, patch
import pytest
from backend.models.server import ServerState


@pytest.fixture(autouse=True)
def mock_save_manager():
    mock_sm = MagicMock()
    player = MagicMock()
    player.PlayerUId = "uid-1"
    player.NickName = "Player1"
    player.Level = 10
    mock_sm.get_players.return_value = [player]
    mock_sm.get_working_pals.return_value = []
    with patch("backend.routers.saves._get_save_manager", return_value=mock_sm):
        yield mock_sm


def test_get_players_returns_list(client):
    resp = client.get("/api/saves/players")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["players"]) == 1
    assert data["players"][0]["nickname"] == "Player1"


def test_get_pals_returns_list(client, mock_save_manager):
    pal = MagicMock()
    pal.InstanceId = "pal-1"
    pal.DisplayName = "Lamball"
    pal.NickName = ""
    pal.Level = 5
    pal.Gender = MagicMock(value="Male")
    pal.is_unreferenced_pal = False
    pal.in_owner_palbox = True
    player = mock_save_manager.get_players.return_value[0]
    player.get_sorted_pals.return_value = [pal]
    resp = client.get("/api/saves/pals?player_uid=uid-1")
    assert resp.status_code == 200
    assert len(resp.json()) == 1


def test_patch_pal_returns_409_when_server_running(client):
    import backend.main as main_mod
    m = MagicMock()
    m.state = ServerState.RUNNING
    main_mod.server_manager = m
    resp = client.patch("/api/saves/pals/pal-1", json={"player_uid": "uid-1", "key": "NickName", "value": "Fluffy"})
    assert resp.status_code == 409


def test_commit_saves_file(client, mock_save_manager):
    resp = client.post("/api/saves/commit")
    assert resp.status_code == 200
    mock_save_manager.commit.assert_called_once()
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
python -m pytest tests/test_routers/test_saves.py -v 2>&1 | head -20
```

- [ ] **Step 3: Write backend/routers/saves.py**

```python
from fastapi import APIRouter, HTTPException, Query
from backend.models.server import ServerState
from backend.models.saves import PlayersResponse, PlayerSummary, PalSummary, PalPatch

router = APIRouter(prefix="/api/saves", tags=["saves"])


def _assert_stopped():
    from backend.main import server_manager
    if server_manager.state != ServerState.STOPPED:
        raise HTTPException(status_code=409, detail="Server must be stopped to edit saves")


def _get_save_manager():
    from backend.main import save_manager
    if save_manager is None:
        raise HTTPException(status_code=503, detail="No save file found")
    return save_manager


@router.get("/players", response_model=PlayersResponse)
def get_players():
    sm = _get_save_manager()
    players = sm.get_players()
    has_working = len(sm.get_working_pals()) > 0
    return PlayersResponse(
        players=[
            PlayerSummary(
                uid=str(p.PlayerUId),
                nickname=p.NickName or str(p.PlayerUId),
                level=p.Level or 1,
            )
            for p in players
        ],
        has_working_pals=has_working,
    )


@router.get("/pals", response_model=list[PalSummary])
def get_pals(player_uid: str = Query(...)):
    sm = _get_save_manager()
    if player_uid == "PAL_BASE_WORKER_BTN":
        pals = sm.get_working_pals()
        owner_uid = None
    else:
        player = sm.get_player(player_uid)
        if player is None:
            raise HTTPException(status_code=404, detail="Player not found")
        pals = player.get_sorted_pals()
        owner_uid = player_uid

    return [
        PalSummary(
            instance_id=str(p.InstanceId),
            player_uid=owner_uid,
            display_name=p.DisplayName,
            nickname=p.NickName or "",
            level=p.Level or 1,
            gender=p.Gender.value if p.Gender else None,
            is_unref=p.is_unreferenced_pal,
            in_owner_palbox=p.in_owner_palbox,
        )
        for p in pals
    ]


@router.patch("/pals/{instance_id}")
def patch_pal(instance_id: str, body: PalPatch):
    _assert_stopped()
    sm = _get_save_manager()
    try:
        sm.set_pal_attr(body.player_uid or "PAL_BASE_WORKER_BTN", instance_id, body.key, body.value)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"ok": True}


@router.delete("/pals/{instance_id}")
def delete_pal(instance_id: str):
    _assert_stopped()
    sm = _get_save_manager()
    if not sm.delete_pal(instance_id):
        raise HTTPException(status_code=404, detail="Pal not found")
    return {"ok": True}


@router.get("/pals/{instance_id}")
def get_pal(instance_id: str, player_uid: str = Query(...)):
    sm = _get_save_manager()
    if player_uid == "PAL_BASE_WORKER_BTN":
        pal = sm.get_working_pal(instance_id)
    else:
        player = sm.get_player(player_uid)
        if player is None:
            raise HTTPException(status_code=404, detail="Player not found")
        pal = player.get_pal(instance_id)
    if pal is None:
        raise HTTPException(status_code=404, detail="Pal not found")
    return {
        "instance_id": str(pal.InstanceId),
        "character_id": pal.CharacterID,
        "display_name": pal.DisplayName,
        "nickname": pal.NickName or "",
        "level": pal.Level or 1,
        "gender": pal.Gender.value if pal.Gender else None,
        "rank": pal.Rank if pal.Rank else 1,
        "rank_hp": pal.Rank_HP or 0,
        "rank_attack": pal.Rank_Attack or 0,
        "rank_defence": pal.Rank_Defence or 0,
        "rank_craft_speed": pal.Rank_CraftSpeed or 0,
        "talent_hp": pal.Talent_HP or 0,
        "talent_melee": pal.Talent_Melee or 0,
        "talent_shot": pal.Talent_Shot or 0,
        "talent_defense": pal.Talent_Defense or 0,
        "passive_skills": pal.PassiveSkillList or [],
        "mastered_waza": pal.MasteredWaza or [],
        "equip_waza": pal.EquipWaza or [],
        "has_worker_sick": pal.HasWorkerSick,
        "is_fainted": pal.IsFaintedPal,
        "computed_max_hp": pal.ComputedMaxHP,
        "computed_attack": pal.ComputedAttack,
        "computed_defense": pal.ComputedDefense,
    }


@router.post("/commit")
def commit_save():
    _assert_stopped()
    sm = _get_save_manager()
    sm.commit()
    return {"ok": True}
```

- [ ] **Step 4: Run all backend tests**

```bash
python -m pytest tests/ -v
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/routers/saves.py tests/test_routers/test_saves.py
git commit -m "feat: saves router for pal editing"
```

---

## Task 11: Frontend Scaffold

**Files:**
- Create: `frontend/` (full Vite + React + TypeScript + Tailwind + shadcn/ui scaffold)

- [ ] **Step 1: Initialize Vite project**

```bash
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
```

- [ ] **Step 2: Install Tailwind CSS**

```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

Write `tailwind.config.js`:

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
}
```

Replace `src/index.css` content:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 3: Install React Router and React Query**

```bash
npm install react-router-dom @tanstack/react-query
```

- [ ] **Step 4: Initialize shadcn/ui**

```bash
npx shadcn@latest init
```

When prompted:
- Style: Default
- Base color: Slate
- CSS variables: Yes

Then add the components we'll need:

```bash
npx shadcn@latest add button badge tabs tooltip switch label input slider card separator
```

- [ ] **Step 5: Install Vitest and React Testing Library**

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

Add to `vite.config.ts`:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test-setup.ts',
  },
})
```

Create `src/test-setup.ts`:

```typescript
import '@testing-library/jest-dom'
```

- [ ] **Step 6: Verify scaffold builds**

```bash
npm run build
```

Expected: Build succeeds, `dist/` directory created.

- [ ] **Step 7: Commit**

```bash
cd ..
git add frontend/
git commit -m "chore: frontend scaffold with Vite, React, Tailwind, shadcn/ui"
```

---

## Task 12: TypeScript Types and API Client

**Files:**
- Create: `frontend/src/types/index.ts`
- Create: `frontend/src/api/client.ts`
- Create: `frontend/src/api/server.ts`
- Create: `frontend/src/api/config.ts`
- Create: `frontend/src/api/saves.ts`
- Create: `frontend/src/api/auth.ts`

- [ ] **Step 1: Write frontend/src/types/index.ts**

```typescript
export type ServerState = "stopped" | "starting" | "running" | "stopping" | "updating"

export interface ServerStatus {
  state: ServerState
  logs: string[]
}

export interface PlayerSummary {
  uid: string
  nickname: string
  level: number
}

export interface PlayersResponse {
  players: PlayerSummary[]
  has_working_pals: boolean
}

export interface PalSummary {
  instance_id: string
  player_uid: string | null
  display_name: string | null
  nickname: string
  level: number
  gender: string | null
  is_unref: boolean
  in_owner_palbox: boolean
}

export interface AuthStatus {
  required: boolean
}
```

- [ ] **Step 2: Write frontend/src/api/client.ts**

```typescript
const BASE = "/api"

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const resp = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    ...options,
  })

  if (resp.status === 401) {
    window.dispatchEvent(new Event("unauthorized"))
    throw new ApiError(401, "Unauthorized")
  }

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}))
    throw new ApiError(resp.status, body.detail ?? resp.statusText)
  }

  return resp.json() as Promise<T>
}
```

- [ ] **Step 3: Write frontend/src/api/server.ts**

```typescript
import { apiFetch } from "./client"
import type { ServerStatus } from "@/types"

export const getServerStatus = () => apiFetch<ServerStatus>("/server/status")
export const startServer = () => apiFetch<{ ok: boolean }>("/server/start", { method: "POST" })
export const stopServer = () => apiFetch<{ ok: boolean }>("/server/stop", { method: "POST" })
export const updateServer = () => apiFetch<{ ok: boolean }>("/server/update", { method: "POST" })
```

- [ ] **Step 4: Write frontend/src/api/config.ts**

```typescript
import { apiFetch } from "./client"

export const getConfig = () => apiFetch<Record<string, unknown>>("/config")
export const putConfig = (settings: Record<string, unknown>) =>
  apiFetch<{ ok: boolean }>("/config", {
    method: "PUT",
    body: JSON.stringify({ settings }),
  })
```

- [ ] **Step 5: Write frontend/src/api/saves.ts**

```typescript
import { apiFetch } from "./client"
import type { PlayersResponse, PalSummary } from "@/types"

export const getPlayers = () => apiFetch<PlayersResponse>("/saves/players")
export const getPals = (playerUid: string) =>
  apiFetch<PalSummary[]>(`/saves/pals?player_uid=${encodeURIComponent(playerUid)}`)
export const patchPal = (instanceId: string, playerUid: string, key: string, value: unknown) =>
  apiFetch<{ ok: boolean }>(`/saves/pals/${instanceId}`, {
    method: "PATCH",
    body: JSON.stringify({ player_uid: playerUid, key, value }),
  })
export const getPal = (instanceId: string, playerUid: string) =>
  apiFetch<Record<string, unknown>>(`/saves/pals/${instanceId}?player_uid=${encodeURIComponent(playerUid)}`)
export const deletePal = (instanceId: string) =>
  apiFetch<{ ok: boolean }>(`/saves/pals/${instanceId}`, { method: "DELETE" })
export const commitSave = () => apiFetch<{ ok: boolean }>("/saves/commit", { method: "POST" })
```

- [ ] **Step 6: Write frontend/src/api/auth.ts**

```typescript
import { apiFetch } from "./client"
import type { AuthStatus } from "@/types"

export const getAuthStatus = () => apiFetch<AuthStatus>("/auth/status")
export const login = (password: string) =>
  apiFetch<{ ok: boolean }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ password }),
  })
export const logout = () => apiFetch<{ ok: boolean }>("/auth/logout", { method: "POST" })
```

- [ ] **Step 7: Write a quick test for the API client**

```typescript
// src/api/client.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { apiFetch } from './client'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

describe('apiFetch', () => {
  it('returns parsed JSON on success', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ state: 'stopped' }),
    } as Response)

    const result = await apiFetch('/server/status')
    expect(result).toEqual({ state: 'stopped' })
  })

  it('dispatches unauthorized event on 401', async () => {
    const listener = vi.fn()
    window.addEventListener('unauthorized', listener)
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
    } as Response)

    await apiFetch('/protected').catch(() => {})
    expect(listener).toHaveBeenCalled()
    window.removeEventListener('unauthorized', listener)
  })
})
```

- [ ] **Step 8: Run frontend tests**

```bash
cd frontend && npm run test -- --run
```

Expected: 2 tests pass.

- [ ] **Step 9: Commit**

```bash
cd ..
git add frontend/src/types/ frontend/src/api/
git commit -m "feat: TypeScript types and API client"
```

---

## Task 13: Auth Context and Login Page

**Files:**
- Create: `frontend/src/context/AuthContext.tsx`
- Create: `frontend/src/hooks/useAuth.ts`
- Create: `frontend/src/pages/LoginPage.tsx`

- [ ] **Step 1: Write frontend/src/context/AuthContext.tsx**

```typescript
import { createContext, useContext, useEffect, useState } from "react"
import { getAuthStatus, login as apiLogin, logout as apiLogout } from "@/api/auth"

interface AuthContextValue {
  required: boolean
  authenticated: boolean
  login: (password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [required, setRequired] = useState(false)
  const [authenticated, setAuthenticated] = useState(false)

  useEffect(() => {
    getAuthStatus().then((s) => {
      setRequired(s.required)
      if (!s.required) setAuthenticated(true)
      else setAuthenticated(sessionStorage.getItem("authed") === "1")
    })

    const handler = () => { setAuthenticated(false); sessionStorage.removeItem("authed") }
    window.addEventListener("unauthorized", handler)
    return () => window.removeEventListener("unauthorized", handler)
  }, [])

  async function login(password: string) {
    await apiLogin(password)
    setAuthenticated(true)
    sessionStorage.setItem("authed", "1")
  }

  async function logout() {
    await apiLogout()
    setAuthenticated(false)
    sessionStorage.removeItem("authed")
  }

  return (
    <AuthContext.Provider value={{ required, authenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuthContext() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuthContext must be inside AuthProvider")
  return ctx
}
```

- [ ] **Step 2: Write frontend/src/hooks/useAuth.ts**

```typescript
export { useAuthContext as useAuth } from "@/context/AuthContext"
```

- [ ] **Step 3: Write frontend/src/pages/LoginPage.tsx**

```typescript
import { useState } from "react"
import { useAuth } from "@/hooks/useAuth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function LoginPage() {
  const { login } = useAuth()
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      await login(password)
    } catch {
      setError("Incorrect password")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-950">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Palworld Controller</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/context/ frontend/src/hooks/ frontend/src/pages/LoginPage.tsx
git commit -m "feat: auth context and login page"
```

---

## Task 14: App Shell (Router + Navigation)

**Files:**
- Create: `frontend/src/components/Layout.tsx`
- Create: `frontend/src/components/NavBar.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/main.tsx`

- [ ] **Step 1: Write frontend/src/components/NavBar.tsx**

```typescript
import { NavLink } from "react-router-dom"
import { cn } from "@/lib/utils"
import type { ServerState } from "@/types"

interface NavBarProps {
  serverState: ServerState
  onLogout?: () => void
  authRequired: boolean
}

const EDITING_BLOCKED: ServerState[] = ["starting", "running", "stopping", "updating"]

export default function NavBar({ serverState, onLogout, authRequired }: NavBarProps) {
  const editingBlocked = EDITING_BLOCKED.includes(serverState)

  return (
    <nav className="border-b bg-slate-900 text-slate-100">
      <div className="container mx-auto flex items-center gap-6 h-14 px-4">
        <span className="font-semibold text-sm">Palworld Controller</span>
        <div className="flex gap-2">
          <NavLink
            to="/server"
            className={({ isActive }) =>
              cn("px-3 py-1.5 rounded text-sm transition-colors",
                isActive ? "bg-slate-700" : "hover:bg-slate-800")
            }
          >
            Server
          </NavLink>
          {(["config", "saves"] as const).map((tab) => (
            <NavLink
              key={tab}
              to={`/${tab}`}
              className={({ isActive }) =>
                cn("px-3 py-1.5 rounded text-sm transition-colors capitalize",
                  editingBlocked ? "opacity-40 pointer-events-none" : "hover:bg-slate-800",
                  isActive ? "bg-slate-700" : "")
              }
              title={editingBlocked ? "Stop the server to edit" : undefined}
            >
              {tab === "config" ? "Configuration" : "Saves"}
            </NavLink>
          ))}
        </div>
        {authRequired && (
          <button
            onClick={onLogout}
            className="ml-auto text-xs text-slate-400 hover:text-slate-200"
          >
            Sign out
          </button>
        )}
      </div>
    </nav>
  )
}
```

- [ ] **Step 2: Write frontend/src/components/Layout.tsx**

```typescript
import { Outlet } from "react-router-dom"
import NavBar from "./NavBar"
import { useAuth } from "@/hooks/useAuth"
import { useServerStatus } from "@/hooks/useServerStatus"

export default function Layout() {
  const { required, logout } = useAuth()
  const { data } = useServerStatus()

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <NavBar
        serverState={data?.state ?? "stopped"}
        authRequired={required}
        onLogout={logout}
      />
      <main className="container mx-auto p-6">
        <Outlet />
      </main>
    </div>
  )
}
```

- [ ] **Step 3: Write frontend/src/hooks/useServerStatus.ts**

```typescript
import { useQuery } from "@tanstack/react-query"
import { getServerStatus } from "@/api/server"

export function useServerStatus() {
  return useQuery({
    queryKey: ["serverStatus"],
    queryFn: getServerStatus,
    refetchInterval: 2000,
  })
}
```

- [ ] **Step 4: Write frontend/src/App.tsx**

```typescript
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { AuthProvider } from "@/context/AuthContext"
import { useAuth } from "@/hooks/useAuth"
import Layout from "@/components/Layout"
import LoginPage from "@/pages/LoginPage"
import ServerPage from "@/pages/ServerPage"
import ConfigPage from "@/pages/ConfigPage"
import SavesPage from "@/pages/SavesPage"

const queryClient = new QueryClient()

function AuthGate({ children }: { children: React.ReactNode }) {
  const { required, authenticated } = useAuth()
  if (required && !authenticated) return <LoginPage />
  return <>{children}</>
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <AuthGate>
            <Routes>
              <Route path="/" element={<Layout />}>
                <Route index element={<Navigate to="/server" replace />} />
                <Route path="server" element={<ServerPage />} />
                <Route path="config" element={<ConfigPage />} />
                <Route path="saves" element={<SavesPage />} />
              </Route>
            </Routes>
          </AuthGate>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
```

- [ ] **Step 5: Write frontend/src/main.tsx**

```typescript
import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import "./index.css"

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

- [ ] **Step 6: Create placeholder pages to unblock build**

```typescript
// src/pages/ServerPage.tsx
export default function ServerPage() { return <div>Server</div> }

// src/pages/ConfigPage.tsx
export default function ConfigPage() { return <div>Config</div> }

// src/pages/SavesPage.tsx
export default function SavesPage() { return <div>Saves</div> }
```

- [ ] **Step 7: Verify build succeeds**

```bash
cd frontend && npm run build
```

Expected: Build succeeds without type errors.

- [ ] **Step 8: Commit**

```bash
cd ..
git add frontend/src/
git commit -m "feat: app shell with router and navigation"
```

---

## Task 15: Server Page

**Files:**
- Create: `frontend/src/components/ServerStatusBadge.tsx`
- Create: `frontend/src/components/LogViewer.tsx`
- Modify: `frontend/src/pages/ServerPage.tsx`

- [ ] **Step 1: Write frontend/src/components/ServerStatusBadge.tsx**

```typescript
import { Badge } from "@/components/ui/badge"
import type { ServerState } from "@/types"

const STATE_CONFIG: Record<ServerState, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  stopped: { label: "Stopped", variant: "secondary" },
  starting: { label: "Starting...", variant: "outline" },
  running: { label: "Running", variant: "default" },
  stopping: { label: "Stopping...", variant: "outline" },
  updating: { label: "Updating...", variant: "outline" },
}

export default function ServerStatusBadge({ state }: { state: ServerState }) {
  const { label, variant } = STATE_CONFIG[state]
  return <Badge variant={variant}>{label}</Badge>
}
```

- [ ] **Step 2: Write frontend/src/components/LogViewer.tsx**

```typescript
import { useEffect, useRef } from "react"

export default function LogViewer({ lines }: { lines: string[] }) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [lines])

  return (
    <div className="bg-black rounded-md p-3 h-64 overflow-y-auto font-mono text-xs text-green-400">
      {lines.length === 0
        ? <span className="text-slate-500">No output yet.</span>
        : lines.map((line, i) => <div key={i}>{line}</div>)
      }
      <div ref={bottomRef} />
    </div>
  )
}
```

- [ ] **Step 3: Write frontend/src/pages/ServerPage.tsx**

```typescript
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { startServer, stopServer, updateServer } from "@/api/server"
import { useServerStatus } from "@/hooks/useServerStatus"
import ServerStatusBadge from "@/components/ServerStatusBadge"
import LogViewer from "@/components/LogViewer"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function ServerPage() {
  const { data } = useServerStatus()
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ["serverStatus"] })

  const startMut = useMutation({ mutationFn: startServer, onSuccess: invalidate })
  const stopMut = useMutation({ mutationFn: stopServer, onSuccess: invalidate })
  const updateMut = useMutation({ mutationFn: updateServer, onSuccess: invalidate })

  const state = data?.state ?? "stopped"
  const logs = data?.logs ?? []

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-row items-center gap-4 space-y-0">
          <CardTitle>Server Status</CardTitle>
          <ServerStatusBadge state={state} />
        </CardHeader>
        <CardContent className="flex gap-3">
          <Button
            onClick={() => startMut.mutate()}
            disabled={state !== "stopped" || startMut.isPending}
          >
            Start
          </Button>
          <Button
            variant="destructive"
            onClick={() => stopMut.mutate()}
            disabled={state !== "running" || stopMut.isPending}
          >
            Stop
          </Button>
          <Button
            variant="outline"
            onClick={() => updateMut.mutate()}
            disabled={state !== "stopped" || updateMut.isPending}
          >
            Update
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Server Log</CardTitle></CardHeader>
        <CardContent><LogViewer lines={logs} /></CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 4: Write a component test**

```typescript
// src/components/ServerStatusBadge.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import ServerStatusBadge from './ServerStatusBadge'

describe('ServerStatusBadge', () => {
  it('shows Stopped for stopped state', () => {
    render(<ServerStatusBadge state="stopped" />)
    expect(screen.getByText('Stopped')).toBeInTheDocument()
  })

  it('shows Running for running state', () => {
    render(<ServerStatusBadge state="running" />)
    expect(screen.getByText('Running')).toBeInTheDocument()
  })
})
```

- [ ] **Step 5: Run tests**

```bash
cd frontend && npm run test -- --run
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
cd ..
git add frontend/src/
git commit -m "feat: server page with status, controls, and log viewer"
```

---

## Task 16: Config Page

**Files:**
- Create: `frontend/src/components/config/ConfigField.tsx`
- Modify: `frontend/src/pages/ConfigPage.tsx`

- [ ] **Step 1: Define field metadata (inline in ConfigPage)**

The config page groups fields into sections and renders each with the appropriate input. Boolean fields (prefixed with `b`) use a Switch; float/int fields use a Slider or Input; string fields use Input; enum fields use a Select.

- [ ] **Step 2: Write frontend/src/components/config/ConfigField.tsx**

```typescript
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"

export type FieldMeta = {
  key: string
  label: string
  type: "float" | "int" | "bool" | "string" | "enum"
  min?: number
  max?: number
  step?: number
  options?: string[]
}

interface ConfigFieldProps {
  meta: FieldMeta
  value: unknown
  onChange: (key: string, value: unknown) => void
  disabled?: boolean
}

export default function ConfigField({ meta, value, onChange, disabled }: ConfigFieldProps) {
  const { key, label, type } = meta

  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0">
      <Label className="text-sm text-slate-300 flex-1">{label}</Label>
      <div className="w-48">
        {type === "bool" && (
          <Switch
            checked={Boolean(value)}
            onCheckedChange={(v) => onChange(key, v)}
            disabled={disabled}
          />
        )}
        {(type === "float" || type === "int") && meta.min !== undefined && (
          <div className="flex items-center gap-2">
            <Slider
              min={meta.min}
              max={meta.max ?? 10}
              step={meta.step ?? (type === "int" ? 1 : 0.1)}
              value={[Number(value ?? meta.min)]}
              onValueChange={([v]) => onChange(key, type === "int" ? Math.round(v) : v)}
              disabled={disabled}
              className="flex-1"
            />
            <span className="text-xs w-10 text-right">{Number(value ?? meta.min).toFixed(type === "float" ? 1 : 0)}</span>
          </div>
        )}
        {type === "string" && (
          <Input
            value={String(value ?? "")}
            onChange={(e) => onChange(key, e.target.value)}
            disabled={disabled}
            className="h-7 text-sm"
          />
        )}
        {type === "enum" && (
          <select
            value={String(value ?? "")}
            onChange={(e) => onChange(key, e.target.value)}
            disabled={disabled}
            className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm"
          >
            {meta.options?.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Write frontend/src/pages/ConfigPage.tsx**

```typescript
import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { getConfig, putConfig } from "@/api/config"
import { useServerStatus } from "@/hooks/useServerStatus"
import ConfigField, { type FieldMeta } from "@/components/config/ConfigField"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const SECTIONS: { title: string; fields: FieldMeta[] }[] = [
  {
    title: "Server",
    fields: [
      { key: "ServerName", label: "Server Name", type: "string" },
      { key: "ServerDescription", label: "Description", type: "string" },
      { key: "ServerPassword", label: "Server Password", type: "string" },
      { key: "AdminPassword", label: "Admin Password", type: "string" },
      { key: "ServerPlayerMaxNum", label: "Max Players", type: "int", min: 1, max: 32 },
      { key: "PublicPort", label: "Port", type: "int", min: 1024, max: 65535 },
    ],
  },
  {
    title: "Gameplay",
    fields: [
      { key: "DayTimeSpeedRate", label: "Day Speed", type: "float", min: 0.1, max: 5, step: 0.1 },
      { key: "NightTimeSpeedRate", label: "Night Speed", type: "float", min: 0.1, max: 5, step: 0.1 },
      { key: "ExpRate", label: "EXP Rate", type: "float", min: 0.1, max: 20, step: 0.1 },
      { key: "PalCaptureRate", label: "Pal Capture Rate", type: "float", min: 0.1, max: 5, step: 0.1 },
      { key: "PalSpawnNumRate", label: "Pal Spawn Rate", type: "float", min: 0.1, max: 3, step: 0.1 },
      { key: "CollectionDropRate", label: "Collection Drop Rate", type: "float", min: 0, max: 5, step: 0.1 },
      { key: "EnemyDropItemRate", label: "Enemy Drop Rate", type: "float", min: 0, max: 5, step: 0.1 },
      { key: "WorkSpeedRate", label: "Work Speed", type: "float", min: 0.1, max: 5, step: 0.1 },
      { key: "DeathPenalty", label: "Death Penalty", type: "enum", options: ["None", "Item", "ItemAndEquipment", "All"] },
    ],
  },
  {
    title: "Multiplayer",
    fields: [
      { key: "bIsMultiplay", label: "Multiplayer", type: "bool" },
      { key: "bIsPvP", label: "PvP", type: "bool" },
      { key: "bEnablePlayerToPlayerDamage", label: "Player Damage", type: "bool" },
      { key: "bEnableFriendlyFire", label: "Friendly Fire", type: "bool" },
      { key: "GuildPlayerMaxNum", label: "Max Guild Members", type: "int", min: 1, max: 20 },
    ],
  },
]

export default function ConfigPage() {
  const { data: status } = useServerStatus()
  const qc = useQueryClient()
  const disabled = status?.state !== "stopped"

  const { data: config } = useQuery({ queryKey: ["config"], queryFn: getConfig })
  const [edits, setEdits] = useState<Record<string, unknown>>({})

  const saveMut = useMutation({
    mutationFn: () => putConfig({ ...(config ?? {}), ...edits }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["config"] }); setEdits({}) },
  })

  const merged = { ...(config ?? {}), ...edits }

  function handleChange(key: string, value: unknown) {
    setEdits((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="space-y-6">
      {disabled && (
        <div className="rounded-md bg-amber-950 border border-amber-800 px-4 py-2 text-sm text-amber-200">
          Stop the server to edit configuration.
        </div>
      )}
      {SECTIONS.map((section) => (
        <Card key={section.title}>
          <CardHeader><CardTitle className="text-base">{section.title}</CardTitle></CardHeader>
          <CardContent>
            {section.fields.map((field) => (
              <ConfigField
                key={field.key}
                meta={field}
                value={merged[field.key]}
                onChange={handleChange}
                disabled={disabled}
              />
            ))}
          </CardContent>
        </Card>
      ))}
      <div className="flex justify-end">
        <Button
          onClick={() => saveMut.mutate()}
          disabled={disabled || Object.keys(edits).length === 0 || saveMut.isPending}
        >
          Save Configuration
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Verify build**

```bash
cd frontend && npm run build
```

- [ ] **Step 5: Commit**

```bash
cd ..
git add frontend/src/
git commit -m "feat: configuration page with typed field editors"
```

---

## Task 17: Saves Page

**Files:**
- Create: `frontend/src/components/saves/PalList.tsx`
- Create: `frontend/src/components/saves/PalDetail.tsx`
- Modify: `frontend/src/pages/SavesPage.tsx`

- [ ] **Step 1: Write frontend/src/components/saves/PalList.tsx**

```typescript
import { useState } from "react"
import type { PalSummary } from "@/types"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface PalListProps {
  pals: PalSummary[]
  selectedId: string | null
  onSelect: (pal: PalSummary) => void
}

export default function PalList({ pals, selectedId, onSelect }: PalListProps) {
  const [search, setSearch] = useState("")

  const filtered = pals.filter((p) => {
    const name = (p.display_name ?? p.instance_id).toLowerCase()
    const nick = p.nickname.toLowerCase()
    const q = search.toLowerCase()
    return name.includes(q) || nick.includes(q)
  })

  return (
    <div className="flex flex-col gap-2">
      <Input
        placeholder="Search pals..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="h-8 text-sm"
      />
      <div className="overflow-y-auto max-h-[calc(100vh-280px)] space-y-1">
        {filtered.map((pal) => (
          <button
            key={pal.instance_id}
            onClick={() => onSelect(pal)}
            className={cn(
              "w-full text-left px-3 py-2 rounded text-sm transition-colors",
              selectedId === pal.instance_id ? "bg-slate-700" : "hover:bg-slate-800"
            )}
          >
            <div className="flex items-center gap-2">
              <span className="flex-1 truncate">{pal.display_name ?? pal.instance_id}</span>
              {pal.nickname && <span className="text-xs text-slate-400 truncate">"{pal.nickname}"</span>}
              <Badge variant="outline" className="text-xs">Lv {pal.level}</Badge>
            </div>
          </button>
        ))}
        {filtered.length === 0 && <p className="text-sm text-slate-500 p-2">No pals found.</p>}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Write frontend/src/components/saves/PalDetail.tsx**

```typescript
import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { PalSummary } from "@/types"
import { getPal, patchPal, deletePal } from "@/api/saves"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

interface PalDetailProps {
  pal: PalSummary
  disabled?: boolean
  onDeleted: () => void
}

type PalDetail = Record<string, unknown>

function StatRow({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="flex justify-between text-sm py-0.5">
      <span className="text-slate-400">{label}</span>
      <span>{String(value ?? "—")}</span>
    </div>
  )
}

export default function PalDetail({ pal, disabled, onDeleted }: PalDetailProps) {
  const qc = useQueryClient()
  const playerUid = pal.player_uid ?? "PAL_BASE_WORKER_BTN"

  const { data: detail } = useQuery<PalDetail>({
    queryKey: ["pal", pal.instance_id],
    queryFn: () => getPal(pal.instance_id, playerUid),
  })

  const [nickname, setNickname] = useState(pal.nickname)

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["pals"] })
    qc.invalidateQueries({ queryKey: ["pal", pal.instance_id] })
  }

  const patch = (key: string, value: unknown) =>
    patchPal(pal.instance_id, playerUid, key, value)

  const nicknameMut = useMutation({ mutationFn: () => patch("NickName", nickname), onSuccess: invalidate })
  const healMut = useMutation({ mutationFn: () => patch("HasWorkerSick", false), onSuccess: invalidate })
  const deleteMut = useMutation({
    mutationFn: () => deletePal(pal.instance_id),
    onSuccess: () => { invalidate(); onDeleted() },
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          {pal.display_name ?? pal.instance_id}
          {detail?.gender && <Badge variant="outline" className="text-xs">{String(detail.gender)}</Badge>}
          {detail?.is_fainted && <Badge variant="destructive" className="text-xs">Fainted</Badge>}
          {detail?.has_worker_sick && <Badge variant="destructive" className="text-xs">Sick</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* Stats */}
        <div>
          <StatRow label="Level" value={detail?.level} />
          <StatRow label="Stars (Rank)" value={detail?.rank} />
          <StatRow label="HP Rank" value={detail?.rank_hp} />
          <StatRow label="Attack Rank" value={detail?.rank_attack} />
          <StatRow label="Defence Rank" value={detail?.rank_defence} />
          <StatRow label="Craft Speed Rank" value={detail?.rank_craft_speed} />
        </div>

        <Separator />

        {/* Computed stats */}
        <div>
          <StatRow label="Max HP" value={detail?.computed_max_hp} />
          <StatRow label="Attack" value={detail?.computed_attack} />
          <StatRow label="Defense" value={detail?.computed_defense} />
        </div>

        <Separator />

        {/* Passive skills */}
        <div>
          <p className="text-xs text-slate-400 mb-1">Passive Skills</p>
          <div className="flex flex-wrap gap-1">
            {((detail?.passive_skills as string[]) ?? []).map((s) => (
              <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
            ))}
            {((detail?.passive_skills as string[]) ?? []).length === 0 && (
              <span className="text-xs text-slate-500">None</span>
            )}
          </div>
        </div>

        <Separator />

        {/* Nickname */}
        <div className="space-y-1">
          <Label className="text-sm">Nickname</Label>
          <div className="flex gap-2">
            <Input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              disabled={disabled}
              className="h-7 text-sm flex-1"
            />
            <Button
              size="sm"
              onClick={() => nicknameMut.mutate()}
              disabled={disabled || nicknameMut.isPending || nickname === pal.nickname}
            >
              Save
            </Button>
          </div>
        </div>

        <Separator />

        {/* Actions */}
        <div className="flex gap-2">
          {(detail?.has_worker_sick || detail?.is_fainted) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => healMut.mutate()}
              disabled={disabled || healMut.isPending}
            >
              Heal
            </Button>
          )}
          <Button
            variant="destructive"
            size="sm"
            onClick={() => { if (confirm(`Delete ${pal.display_name ?? "this pal"}?`)) deleteMut.mutate() }}
            disabled={disabled || deleteMut.isPending}
          >
            Delete Pal
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 3: Write frontend/src/pages/SavesPage.tsx**

```typescript
import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { getPlayers, getPals, commitSave } from "@/api/saves"
import { useServerStatus } from "@/hooks/useServerStatus"
import PalList from "@/components/saves/PalList"
import PalDetail from "@/components/saves/PalDetail"
import type { PalSummary } from "@/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function SavesPage() {
  const { data: status } = useServerStatus()
  const disabled = status?.state !== "stopped"
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null)
  const [selectedPal, setSelectedPal] = useState<PalSummary | null>(null)
  const qc = useQueryClient()

  const { data: playersData } = useQuery({ queryKey: ["players"], queryFn: getPlayers })

  const effectivePlayer = selectedPlayer ?? playersData?.players[0]?.uid ?? null

  const { data: pals = [] } = useQuery({
    queryKey: ["pals", effectivePlayer],
    queryFn: () => getPals(effectivePlayer!),
    enabled: effectivePlayer !== null,
  })

  const commitMut = useMutation({
    mutationFn: commitSave,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pals"] }),
  })

  return (
    <div className="space-y-4">
      {disabled && (
        <div className="rounded-md bg-amber-950 border border-amber-800 px-4 py-2 text-sm text-amber-200">
          Stop the server to edit saves.
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {playersData?.players.map((p) => (
          <Button
            key={p.uid}
            variant={effectivePlayer === p.uid ? "default" : "outline"}
            size="sm"
            onClick={() => { setSelectedPlayer(p.uid); setSelectedPal(null) }}
          >
            {p.nickname}
          </Button>
        ))}
        {playersData?.has_working_pals && (
          <Button
            variant={effectivePlayer === "PAL_BASE_WORKER_BTN" ? "default" : "outline"}
            size="sm"
            onClick={() => { setSelectedPlayer("PAL_BASE_WORKER_BTN"); setSelectedPal(null) }}
          >
            Base Workers
          </Button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-6">
        <Card className="col-span-1">
          <CardHeader><CardTitle className="text-sm">Pals ({pals.length})</CardTitle></CardHeader>
          <CardContent>
            <PalList
              pals={pals}
              selectedId={selectedPal?.instance_id ?? null}
              onSelect={setSelectedPal}
            />
          </CardContent>
        </Card>

        <div className="col-span-2">
          {selectedPal ? (
            <PalDetail
              pal={selectedPal}
              disabled={disabled}
              onDeleted={() => setSelectedPal(null)}
            />
          ) : (
            <p className="text-sm text-slate-500 pt-4">Select a pal to edit.</p>
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          variant="outline"
          onClick={() => commitMut.mutate()}
          disabled={disabled || commitMut.isPending}
        >
          Save to Disk
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Verify build**

```bash
cd frontend && npm run build && npm run test -- --run
```

Expected: Build succeeds, all tests pass.

- [ ] **Step 5: Commit**

```bash
cd ..
git add frontend/src/
git commit -m "feat: saves page with pal list and detail editor"
```

---

## Task 18: Docker Setup

**Files:**
- Create: `Dockerfile`
- Create: `entrypoint.sh`
- Create: `docker-compose.yml`

- [ ] **Step 1: Write entrypoint.sh**

```sh
#!/bin/sh
exec /app/venv/bin/uvicorn main:app \
  --host 0.0.0.0 \
  --port "${CONTROLLER_PORT:-8080}" \
  --app-dir /app/backend
```

Make it executable:

```bash
chmod +x entrypoint.sh
```

- [ ] **Step 2: Write Dockerfile**

```dockerfile
# Stage 1: build React SPA
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# Stage 2: runtime
FROM cm2network/steamcmd:latest AS runtime
USER root

RUN apt-get update && apt-get install -y \
    python3 python3-pip python3-venv git \
    && rm -rf /var/lib/apt/lists/*

# Python deps
WORKDIR /app/backend
COPY backend/requirements.txt .
RUN python3 -m venv /app/venv && \
    /app/venv/bin/pip install --no-cache-dir -r requirements.txt

# Backend source
COPY backend/ .

# Built frontend
COPY --from=frontend-builder /app/frontend/dist /app/backend/static

# Entrypoint
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 8080

ENTRYPOINT ["/app/entrypoint.sh"]
```

- [ ] **Step 3: Write docker-compose.yml**

```yaml
services:
  palworld:
    build: .
    ports:
      - "${CONTROLLER_PORT:-8080}:${CONTROLLER_PORT:-8080}"
      - "8211:8211/udp"
      - "27015:27015/udp"
    volumes:
      - palworld-data:/palworld
    environment:
      - CONTROLLER_PASSWORD=${CONTROLLER_PASSWORD:-}
      - CONTROLLER_PORT=${CONTROLLER_PORT:-8080}
      - PALWORLD_OPTS=${PALWORLD_OPTS:-}
    restart: unless-stopped

volumes:
  palworld-data:
```

- [ ] **Step 4: Build and verify**

```bash
docker compose build
```

Expected: Build succeeds in both stages with no errors.

- [ ] **Step 5: Smoke test**

```bash
docker compose up -d
sleep 5
curl -s http://localhost:8080/api/auth/status | python3 -m json.tool
docker compose down
```

Expected output:
```json
{"required": false}
```

- [ ] **Step 6: Commit**

```bash
git add Dockerfile entrypoint.sh docker-compose.yml
git commit -m "feat: Docker multi-stage build and compose setup"
```

---

## Self-Review Checklist

After all tasks complete, verify:

- [ ] `GET /api/server/status` returns `state` and `logs`
- [ ] `POST /api/server/start` auto-installs on first run (no binary present)
- [ ] `PUT /api/config` returns 409 when server is running
- [ ] `PATCH /api/saves/pals/:id` returns 409 when server is running
- [ ] `POST /api/saves/commit` returns 409 when server is running
- [ ] Auth: `/api/auth/status` returns `required: false` when `CONTROLLER_PASSWORD` unset
- [ ] Auth: all endpoints return 401 when password set and no session cookie
- [ ] Docker: `/palworld` volume persists across `docker compose down && up`
- [ ] Frontend: Config and Saves tabs have `pointer-events-none` when server not stopped
- [ ] Frontend: Log viewer auto-scrolls to bottom as lines arrive
