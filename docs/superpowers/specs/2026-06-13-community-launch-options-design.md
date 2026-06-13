# Community / Launch-Option Settings — Design

**Date:** 2026-06-13
**Status:** Approved (pending final spec review)

## Summary

Add server **launch-time command-line options** to the controller UI, surfaced in the
"Server" section of the Configuration tab. These are options that the upstream
`thijsvanloef/palworld-server-docker` project exposes as environment variables which map to
`PalServer.sh` command-line arguments — *not* to `PalWorldSettings.ini` values.

Scope (decided): two options.

| Option | Launch arg | Type | Default | Notes |
|---|---|---|---|---|
| `community` | `-publiclobby` | bool | `false` | Lists the server in the in-game Community Servers browser. Best used with a server password. |
| `query_port` | `-queryport=<N>` | int (optional) | unset (blank) | Steam query port (community browser uses it; conventionally 27015). Blank ⇒ flag omitted, server uses its own default. |

Upstream maps exactly four env vars to launch args. The other two were **excluded**:

- `PORT` → `-port=N`: overlaps the existing `PublicPort` ("Game Port") `.ini` field; two
  disagreeing port inputs would confuse.
- `MULTITHREADING` → perf-thread flags: this project already hardcodes
  `-useperfthreads -NoAsyncLoadingThread -UseMultithreadForDS` unconditionally in
  `server_manager.start()`; only the worker-thread count differs, a niche knob not worth surfacing.

## Why this isn't just a new `SECTIONS` entry

Every field in the Configuration tab's "Server" section is a `PalWorldSettings.ini` value
round-tripped through `config_manager` (`GET /api/config` reads the `.ini`; `PUT` writes the
whole settings dict back via `write_config`). A launch argument has no `.ini` home — if
`community` were passed through `body.settings` unchanged, the current
`current.update(body.settings); write_config(current)` flow would write `community=False`
into `OptionSettings(...)`, polluting the `.ini` with a key the game ignores.

So these options need their own small persistent store, and the config router becomes the
seam that merges that store into the same UI payload.

## Architecture

### New service: `backend/services/controller_settings.py`

Plain module functions with an injectable `path` argument, mirroring the style of
`config_manager.py` (no class/singleton). Storage is a JSON file on the persistent
`/palworld` volume.

```python
CONTROLLER_SETTINGS_PATH = Path("/palworld/controller-settings.json")

# Keys owned by this store (used by the config router to split them out of the .ini payload)
CONTROLLER_KEYS = {"community", "query_port"}

DEFAULTS = {"community": False, "query_port": None}

def read_settings(path: Path = CONTROLLER_SETTINGS_PATH) -> dict:
    """Return DEFAULTS merged with on-disk values. Missing/corrupt file ⇒ DEFAULTS."""

def write_settings(settings: dict, path: Path = CONTROLLER_SETTINGS_PATH) -> None:
    """Persist only recognized CONTROLLER_KEYS as JSON."""

def build_launch_args(settings: dict) -> list[str]:
    """Translate settings into PalServer.sh CLI args."""
    args = []
    if settings.get("community"):
        args.append("-publiclobby")
    qp = settings.get("query_port")
    if qp not in (None, ""):
        args.append(f"-queryport={int(qp)}")
    return args
```

Notes:
- `read_settings` always returns every key (seeded from `DEFAULTS`) so the UI shows a value.
- `write_settings` filters to `CONTROLLER_KEYS` so stray keys can't be persisted.
- `query_port` is stored as an int or `None`; blank input from the UI is normalized to `None`.

### `backend/routers/config.py` — composition layer

`GET /api/config`:
```python
return {**DEFAULT_SETTINGS, **read_config(), **read_settings()}
```
The controller keys appear alongside the `.ini` fields in the single payload the page already
consumes.

`PUT /api/config`:
```python
_assert_stopped()
body = dict(body.settings)
controller = {k: body.pop(k) for k in CONTROLLER_KEYS if k in body}
if controller:
    merged = {**read_settings(), **controller}
    write_settings(merged)
current = read_config()
current.update(body)          # body no longer contains controller keys
write_config(current)
return {"ok": True}
```
This guarantees `community`/`query_port` never reach `write_config`, and `.ini` fields never
reach `write_settings`.

### `backend/routers/server.py` — apply at start

`start` reads the store, builds args, and passes them to the manager (which already accepts
`extra_args` and places them ahead of `PALWORLD_OPTS`):

```python
from backend.services.controller_settings import read_settings, build_launch_args
...
extra_args = build_launch_args(read_settings())
background_tasks.add_task(mgr.start, extra_args)
```

No change to `server_manager.py` — `start(self, extra_args=None)` already supports this.

### Backend globals

No new `main.py` singleton needed: the store is file-based functions (like `config_manager`),
read fresh on each request/start. This matches the existing config pattern and avoids
stale-cache concerns.

## Frontend

Two entries added to the "Server" section of `SECTIONS` in `frontend/src/pages/ConfigPage.tsx`:

```ts
{ key: "community",  label: "List in Community Server Browser", type: "bool" },
{ key: "query_port", label: "Steam Query Port",                 type: "number" },
```

No changes to `api/config.ts` or `ConfigField.tsx`:
- The page already round-trips the entire config object (`putConfig({ ...config, ...edits })`),
  so the controller keys travel back to the server automatically.
- `bool` renders as the existing Switch; `number` as the existing numeric input.
- Editing remains gated behind "server stopped" (the page already disables fields unless the
  state is `stopped`). Launch args only apply at start, so this gating is correct.

The `number` field yields an empty string when cleared; the `PUT` handler / `build_launch_args`
treat empty as "unset" so no `-queryport` flag is emitted.

## Testing

`tests/test_controller_settings.py`:
- round-trip write→read of `community` and `query_port` (via `tmp_path`).
- missing file ⇒ `DEFAULTS`.
- `write_settings` drops unrecognized keys.
- `build_launch_args`: `{}` ⇒ `[]`; `{community: True}` ⇒ `["-publiclobby"]`;
  `{query_port: 27015}` ⇒ `["-queryport=27015"]`; blank/None query_port ⇒ no flag;
  both set ⇒ both args.

`tests/test_routers/test_config.py` (extend, following the existing
`patch("backend.routers.config.read_config"/"write_config")` style):
- `GET` includes `community`/`query_port` from a patched `read_settings`.
- `PUT` with a controller key calls `write_settings` with it and does **not** pass it to
  `write_config` (assert the split on both mocks).

`tests/test_routers/test_server.py` (extend):
- `start` with community on / query_port set passes the expected `extra_args` to
  `mgr.start` (patch `read_settings`/`build_launch_args`, assert `mock_manager.start`
  call args).

## Out of scope (YAGNI)

- No password-required enforcement for community mode (upstream only warns).
- No `PORT` / `MULTITHREADING` options (rationale above).
- No general free-form "extra launch args" editor — the store is structured to grow by adding
  keys if needed later.
