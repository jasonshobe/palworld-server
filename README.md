# Palworld Server Controller

A self-hosted Docker container that runs a Palworld dedicated server alongside a web-based management UI. Start/stop the server, edit configuration, install mods, and modify save files (pals) — all from a browser.

## Features

- **Server lifecycle** — start, stop, and update the Palworld server via SteamCMD with one click
- **Live log viewer** — tail server output in real time from the browser
- **Configuration editor** — edit `PalWorldSettings.ini` through a typed UI (sliders, toggles, dropdowns) grouped by category
- **Pal editor** — browse your pal roster, view stats, rename pals, heal sick/fainted pals, and delete pals
- **Mod manager** — upload, list, and delete `.pak`/`.utoc`/`.ucas` mod files (subfolders supported); staged mods are mirrored into the game's `Paks` directory on each server start, so they can be managed at any time and take effect on the next restart
- **Optional password auth** — set `CONTROLLER_PASSWORD` to gate the UI behind a password
- **Single container** — one Docker image, one volume, one compose file

## Architecture

```
Container
├── FastAPI controller  (port 8080, always running)
│   ├── Serves React SPA at /
│   └── REST API at /api/
└── Palworld server  (child process, managed by controller)
    ├── Game port:  8211/UDP
    └── Query port: 27015/UDP
```

The controller owns the Palworld server process. Configuration and save editing are only available while the server is stopped — the backend enforces this with HTTP 409 on all write endpoints. Mods are the exception: they're staged separately and applied on start, so they can be uploaded or removed at any time.

## Quick Start

```bash
# 1. Clone
git clone https://github.com/jasonshobe/palworld-server.git
cd palworld-server

# 2. Configure (optional)
cp .env.example .env
# Edit .env — set CONTROLLER_PASSWORD to protect the UI

# 3. Run
docker compose up -d

# 4. Open
open http://localhost:8080
```

On first start the controller automatically downloads and installs the Palworld dedicated server via SteamCMD. This takes several minutes. Watch the log viewer on the Server page.

## Configuration

| Variable | Default | Description |
|---|---|---|
| `CONTROLLER_PASSWORD` | _(unset)_ | Enables password auth when set. Leave blank for open access (trusted network). |
| `CONTROLLER_PORT` | `8080` | Web UI port |
| `PALWORLD_OPTS` | _(empty)_ | Extra arguments passed to `PalServer.sh` (space-separated) |

## Ports

| Port | Protocol | Description |
|---|---|---|
| `8080` | TCP | Controller web UI (configurable via `CONTROLLER_PORT`) |
| `8211` | UDP | Palworld game traffic |
| `27015` | UDP | Steam query port |

## Data Persistence

All server data (game files, saves, configuration) is stored in the `palworld-data` Docker volume mounted at `/palworld`. This persists across container restarts, image updates, and `docker compose down`.

```bash
# Back up your saves
docker run --rm -v palworld-server_palworld-data:/data -v $(pwd):/backup \
  alpine tar czf /backup/palworld-backup.tar.gz /data/Pal/Saved
```

Mods are staged in a separate `mods-data` volume mounted at `/mods`. On each server start the controller mirrors it into the game's `Pal/Content/Paks` directory — copying new or changed mods and removing ones it previously installed but that are no longer present, without touching the base-game `.pak` files. Besides the Mods tab in the UI, you can drop files straight into the volume:

```bash
# Copy a mod into the staging volume directly
docker cp MyMod.pak palworld-server-palworld-1:/mods/
```

## Development

### Backend (Python / FastAPI)

```bash
cd backend
pip install -r requirements.txt
python3 -m pytest ../tests/ -v
```

### Frontend (React / TypeScript)

```bash
cd frontend
npm install
npm run dev       # dev server with HMR
npm run build     # production build
npm run test      # run tests
```

### Build the Docker image

```bash
docker compose build
docker compose up
```

## Server State Machine

```
stopped → starting → running → stopping → stopped
stopped → updating → stopped
```

Configuration and save editing are disabled in all states except `stopped`. Mod management is allowed in any state and is applied on the next start.

## License

GPL-3.0 — required by the [Palworld-Pal-Editor](https://github.com/KrisCris/Palworld-Pal-Editor) dependency.
