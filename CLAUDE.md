# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Backend (Python / FastAPI)

```bash
# Install dependencies (uses a venv in development)
pip install -r backend/requirements.txt

# Run tests
pytest tests/ -v

# Run a single test file
pytest tests/test_config_manager.py -v

# Run a single test
pytest tests/test_config_manager.py::test_round_trip -v

# Run the dev server (from repo root)
uvicorn backend.main:app --reload --port 8080
```

### Frontend (React / TypeScript / Vite)

**Node 22 is required.** The system default may be v14 which fails to build.

```bash
cd frontend

# If using nvm:
nvm use 22

npm install
npm run dev        # dev server on :5173 (proxies /api to :8080)
npm run build      # production build → frontend/dist/
npm run test       # vitest (jsdom)
npm run lint       # eslint
npx tsc --noEmit   # type-check without building
```

### Docker

```bash
# Build and run (also rebuilds when source changes)
docker compose up --build

# Run in background
docker compose up -d --build
```

## Architecture

### Request flow

```
Browser → FastAPI (port 8080)
           ├── /api/auth       — login / logout (no auth required)
           ├── /api/server     — start, stop, update, status, logs (auth required)
           ├── /api/config     — read/write PalWorldSettings.ini (auth required)
           ├── /api/saves      — read/write pal save data (auth required)
           └── /*              — React SPA served from backend/static/ (production)
```

In development, Vite's dev server proxies `/api` to FastAPI. In production (Docker), FastAPI serves the built frontend as static files from `backend/static/`.

### Backend globals (`backend/main.py`)

Three module-level singletons are central to the backend:

- `auth: AuthMiddleware` — in-memory token store; `CONTROLLER_PASSWORD` env var enables it
- `server_manager: ServerManager` — owns the Palworld child process, tracks server state
- `save_manager: SaveManager | None` — wraps palworld-pal-editor; `None` when no save exists or after server stop; retried lazily by `_get_save_manager()` in the saves router

Tests monkeypatch these directly (see `tests/conftest.py`). The `require_auth()` dependency uses a lazy import (`from backend.main import auth`) so monkeypatching `main.auth` works without passing an explicit instance.

### Auth

`AuthMiddleware` stores session tokens in memory. Auth is disabled when `CONTROLLER_PASSWORD` is unset. The session token is an HttpOnly cookie named `session`.

`require_auth()` returns a FastAPI `Depends` dependency applied at router-include time in `main.py`. Pass an explicit `AuthMiddleware` instance only in tests that construct their own app; all production code uses the no-arg form.

### Server state machine

`ServerManager` transitions: `stopped → starting → running → stopping → stopped` and `stopped → updating → stopped`. All config and save mutation endpoints return 409 when the server is not stopped — enforced by `_assert_stopped()` helpers in `routers/config.py` and `routers/saves.py`.

After the server stops, `main.save_manager` is set to `None` (saves on disk have changed). `_get_save_manager()` retries initialization from disk on the next request.

### Config format

`PalWorldSettings.ini` uses a non-standard single-line format:

```
[/Script/Pal.PalGameWorldSettings]
OptionSettings=(Key=Value,Key="quoted",...)
```

`backend/services/config_manager.py` implements a state-machine parser. Fields in `STRING_FIELDS` are written with surrounding double-quotes; booleans are written as `True`/`False`; floats as `%.6f`; ints as plain integers; enum values (e.g. `None`, `All`, `ItemAndEquipment`) are written unquoted.

### Save editing

`SaveManager` wraps the third-party `palworld-pal-editor` library (installed from GitHub). It loads a save directory (found by scanning for a UUID-named subdir under `/palworld/Pal/Saved/SaveGames/0`). Mutations via `set_pal_attr` are in-memory until `commit()` is called.

### Frontend structure

- `src/api/` — typed fetch wrappers using `apiFetch` from `client.ts`; 401 responses dispatch a global `"unauthorized"` event
- `src/hooks/useServerStatus.ts` — polls `/api/server/status` every 2 s; used by all pages to disable editing when server is not stopped
- `src/pages/ConfigPage.tsx` — owns the `SECTIONS` array (field definitions with type, min, max, step); `ConfigField.tsx` renders typed inputs (slider, switch, text input, select, number input)
- `src/pages/SavesPage.tsx` + `src/components/saves/` — pal browser; key prop on `PalDetail` resets local state on pal switch
- Dark theme is activated via `class="dark"` on `<html>` in `index.html` (shadcn/ui `.dark` CSS vars)

### Docker

Multi-stage build: `node:22-alpine` builds the frontend, `cm2network/steamcmd` is the runtime. The container runs as the `steam` user. The `/palworld` volume holds all game data (install, saves, config). `/palworld` is pre-created with steam ownership in the Dockerfile so named-volume init inherits the correct owner.

## Key constraints

- **Absolute imports only**: all backend code uses `backend.X` imports (e.g. `from backend.models.server import ServerState`). Relative imports break the production layout where `backend/` is the working directory root.
- **Config and save writes require server stopped**: enforced by 409 responses — do not bypass this in the UI.
- **SaveManager lifecycle**: never cache `save_manager` locally; always go through `backend.main.save_manager` so invalidation after server stop is respected.
