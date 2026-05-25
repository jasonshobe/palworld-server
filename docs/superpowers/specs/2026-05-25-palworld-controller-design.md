# Palworld Controller Design

**Date:** 2026-05-25  
**License:** GPL-3.0 (required by Palworld-Pal-Editor dependency)

## Overview

A single Docker container running two processes: a FastAPI controller web application (always running) and the Palworld dedicated game server (started/stopped on demand by the controller). The controller provides a unified web UI for server lifecycle management, server configuration editing, and save file (pal) editing.

**Source projects used as reference:**
- [pal-conf](https://github.com/Bluefissure/pal-conf) — MIT — server configuration UI reference
- [Palworld-Pal-Editor](https://github.com/KrisCris/Palworld-Pal-Editor) — GPL-3.0 — save file editing library (imported as Python dependency)
- [palworld-server-docker](https://github.com/thijsvanloef/palworld-server-docker) — MIT — reference for SteamCMD arguments and server configuration details

## Architecture

### Container layout

```
Container
├── FastAPI backend (always running, port 8080)
│   ├── Serves built React SPA as static files at /
│   ├── REST API at /api/
│   └── Spawns / kills Palworld server as a subprocess
└── Palworld server (subprocess, managed by FastAPI)
    ├── Game port: 8211/UDP
    └── Query port: 27015/UDP
```

The FastAPI app is the container entrypoint. The Palworld server is a child process launched and terminated by the controller on demand. The React SPA is built during the Docker image build (multi-stage) and served as static files by FastAPI — no separate web server.

### Server state machine

```
stopped → starting → running → stopping → stopped
stopped → updating → stopped
```

Configuration and save file editing are only permitted in the `stopped` state. The backend enforces this as a hard HTTP 409 guard on all write endpoints, independent of the frontend's visual enforcement.

### Key paths inside the container

| Path | Description |
|---|---|
| `/palworld/` | Full server installation (mounted as a volume) |
| `/palworld/PalServer.sh` | Server executable (absence triggers auto-install) |
| `/palworld/Pal/Saved/Config/LinuxServer/PalWorldSettings.ini` | Server configuration |
| `/palworld/Pal/Saved/SaveGames/0/<server-id>/` | Save files (auto-detected by UUID pattern) |

## Backend

### Module layout

```
backend/
├── main.py                  # App factory, mounts static files, includes routers
├── routers/
│   ├── auth.py              # POST /api/auth/login, POST /api/auth/logout
│   ├── server.py            # GET /api/server/status, POST /api/server/start,
│   │                        #   /api/server/stop, /api/server/update
│   ├── config.py            # GET /api/config, PUT /api/config
│   └── saves.py             # GET /api/saves/pals, PUT /api/saves/pals/{id},
│                            #   DELETE /api/saves/pals/{id}
├── services/
│   ├── server_manager.py    # Subprocess lifecycle, state machine, SteamCMD calls
│   ├── config_manager.py    # Reads/writes PalWorldSettings.ini
│   └── save_manager.py      # Wraps Palworld-Pal-Editor library, save auto-detection
├── middleware/
│   └── auth.py              # FastAPI dependency: enforces password when configured
└── models/
    └── (Pydantic models for config fields, pal data, server status)
```

### Server manager

`server_manager.py` owns the state machine and all subprocess interactions.

**Install / Update** — when the user clicks Start and `/palworld/PalServer.sh` does not exist, the manager runs an install before launching the server. Also invoked on-demand via the update endpoint when the server is stopped:

```python
await asyncio.create_subprocess_exec(
    "steamcmd", "+force_install_dir", "/palworld",
    "+login", "anonymous",
    "+app_update", "2394010", "validate",
    "+quit"
)
```

**Start** — transitions to `starting`, then launches:

```python
await asyncio.create_subprocess_exec(
    "/palworld/PalServer.sh",
    "-useperfthreads", "-NoAsyncLoadingThread", "-UseMultithreadForDS",
    stdout=PIPE, stderr=STDOUT
)
```

Transitions to `running` once the process is live. Unexpected process exit returns state to `stopped` with the exit code logged.

**Stop** — sends `SIGTERM`, waits up to 30 seconds for clean shutdown, then `SIGKILL`. Transitions `running → stopping → stopped`.

**Log ring buffer** — a fixed-size deque (1000 lines) in memory. stdout from SteamCMD and the Palworld server process is streamed into this buffer. The `/api/server/status` response includes the last 100 lines for the frontend log viewer.

### Config manager

Parses and writes `PalWorldSettings.ini`. Palworld uses a non-standard INI variant where all options are packed into a single `OptionSettings=(...)` value under `[/Script/Pal.PalGameWorldSettings]`. The manager handles this format specifically. All write operations check `server_manager.state == stopped` before proceeding.

### Save manager

Imports the Palworld-Pal-Editor Python package for save file parsing and editing. On startup, scans `/palworld/Pal/Saved/SaveGames/0/` for a directory matching the UUID pattern and uses that as the active save. No user selection screen. All write operations check `server_manager.state == stopped` before proceeding.

## Frontend

### Stack

React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui (Radix UI primitives)

### Module layout

```
frontend/
├── src/
│   ├── main.tsx
│   ├── App.tsx              # Router, auth gate, layout shell
│   ├── pages/
│   │   ├── LoginPage.tsx    # Shown only when password auth is enabled and user is not logged in
│   │   ├── ServerPage.tsx   # Server status, start/stop/update buttons, log tail
│   │   ├── ConfigPage.tsx   # Settings editor (disabled when server is not stopped)
│   │   └── SavesPage.tsx    # Pal editor (disabled when server is not stopped)
│   ├── components/
│   │   ├── ServerStatusBadge.tsx
│   │   ├── LogViewer.tsx
│   │   ├── config/          # Individual setting field components
│   │   └── saves/           # Pal list, pal detail editor
│   ├── api/                 # Typed fetch wrappers, one file per router
│   └── hooks/
│       ├── useServerStatus.ts   # Polls /api/server/status every 2 seconds
│       └── useAuth.ts
```

### Navigation and state gating

A persistent top navigation bar with three tabs: **Server**, **Configuration**, **Saves**. The Configuration and Saves tabs are visually disabled (greyed out, non-interactive) with a tooltip whenever the server is not in the `stopped` state.

Any API call returning HTTP 401 redirects to the login page (when auth is enabled).

### Pages

**Server page** — current state badge, context-appropriate action buttons (start when stopped, stop when running, update when stopped), and a scrolling log tail from the ring buffer. The log viewer auto-scrolls to the bottom as new lines arrive.

**Config page** — renders each `PalWorldSettings.ini` field as a typed input (number slider, toggle, text field, dropdown) grouped into logical sections (gameplay, combat, base building, etc.). Field definitions reference pal-conf's approach. Changes are saved explicitly via a Save button.

**Saves page** — searchable pal roster list. Selecting a pal opens a detail panel for editing stats, skills, and passive abilities. Pal deletion with confirmation. References Palworld-Pal-Editor's UI for field coverage.

### Data fetching

React Query for all server data (status, config, pal list) with automatic background refetch. Auth state held in React context, token persisted in `localStorage`.

## Authentication

### When `CONTROLLER_PASSWORD` is not set

The auth dependency is a no-op. All endpoints are open. The login page is never shown.

### When `CONTROLLER_PASSWORD` is set

- `POST /api/auth/login` accepts `{"password": "..."}`. On success returns a random 32-byte hex token and sets it as an `HttpOnly` cookie. Token stored in a server-side in-memory dict.
- All API endpoints inject the auth dependency, which validates the cookie token against the dict. Invalid or missing token → HTTP 401.
- `POST /api/auth/logout` removes the token from the dict and clears the cookie.
- Tokens have no expiry — they persist until logout or container restart.
- Single shared password; multiple simultaneous sessions are supported.
- No HTTPS enforcement — users needing TLS place a reverse proxy (Nginx, Caddy) in front.

## Docker Setup

### Dockerfile (multi-stage)

```dockerfile
# Stage 1: build the React SPA
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/ .
RUN npm install && npm run build

# Stage 2: runtime
FROM cm2network/steamcmd AS runtime
USER root

RUN apt-get update && apt-get install -y python3 python3-pip python3-venv

WORKDIR /app/backend
COPY backend/ .
RUN python3 -m venv /app/venv && \
    /app/venv/bin/pip install -r requirements.txt

COPY --from=frontend-builder /app/frontend/dist /app/backend/static
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 8080
ENTRYPOINT ["/app/entrypoint.sh"]
```

`entrypoint.sh` is a minimal shell script that reads `CONTROLLER_PORT` (defaulting to 8080) and passes it to uvicorn:

```sh
#!/bin/sh
exec /app/venv/bin/uvicorn main:app --host 0.0.0.0 --port "${CONTROLLER_PORT:-8080}"
```

### docker-compose.yml

```yaml
services:
  palworld:
    build: .
    ports:
      - "8080:8080"        # Controller web UI
      - "8211:8211/udp"    # Game traffic
      - "27015:27015/udp"  # Steam query
    volumes:
      - palworld-data:/palworld
    environment:
      - CONTROLLER_PASSWORD=   # leave blank for no auth

volumes:
  palworld-data:
```

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `CONTROLLER_PASSWORD` | _(unset)_ | Enables password auth when set |
| `CONTROLLER_PORT` | `8080` | Web UI port (read by `entrypoint.sh`, passed to uvicorn) |
| `PALWORLD_OPTS` | _(empty)_ | Extra arguments passed to PalServer.sh |

### Volumes and ports

The `/palworld` volume persists the server installation, save files, and configuration across container rebuilds and image updates. Palworld game ports (8211/UDP, 27015/UDP) are published directly from the container with no proxy layer.
