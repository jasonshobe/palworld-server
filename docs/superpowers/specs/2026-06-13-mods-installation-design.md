# Mods installation — design

## Overview

A new **Mods** tab and `/api/mods` API let users upload, list, and delete Palworld
mod files staged in a `/mods` volume. On every server start, the controller
**mirrors** `/mods` into `Pal/Content/Paks`: it copies new/changed mod files in
(preserving subfolder structure) and removes mod files it previously installed
but that are no longer present in `/mods` — without ever touching base-game paks.

Mod files are accepted as `.pak` plus optional IoStore companions `.utoc` /
`.ucas`. Mod management is allowed in any server state; changes only take effect
on the next server start.

## Volume & container

- New named volume `mods-data` mounted at `/mods` in `docker-compose.yml`.
- `/mods` is pre-created with `steam` ownership in the `Dockerfile` (same pattern
  as `/palworld`) so named-volume init inherits the correct owner.
- Paths (constants in `mod_manager.py`):
  - `MODS_DIR = "/mods"`
  - `PAKS_DIR = "/palworld/Pal/Content/Paks"`
  - `MANIFEST_PATH = "/palworld/.mods_manifest.json"`

## Backend

### `backend/services/mod_manager.py` — `ModManager`

Stateless service (no in-memory caching), constructed where needed or used via
module functions. Responsibilities:

- **Accepted extensions:** `.pak`, `.utoc`, `.ucas` (case-insensitive). Any other
  file under `/mods` is ignored by sync and excluded from listings.
- **Manifest:** `/palworld/.mods_manifest.json`, a JSON list of POSIX relative
  paths (e.g. `LogicMods/foo.pak`) that the controller installed into Paks. Stored
  on the persistent `/palworld` volume so it survives container restarts. A missing
  or unreadable manifest is treated as an empty list.
- **`list_mods()`** → list of `{ path, size, installed }` for every accepted file
  under `/mods` (recursive). `installed` is true when `path` is in the manifest.
- **`sync()`** — called from `ServerManager.start()` before launching the binary,
  after the install check:
  1. `desired` = all accepted files under `/mods`, keyed by POSIX relative path.
  2. For each `desired` file, copy into `PAKS_DIR/<relpath>` (creating parent dirs),
     overwriting when the destination is missing or differs by size/mtime.
  3. For each path in the previous manifest **not** in `desired`, delete it from
     `PAKS_DIR` if present, then prune any now-empty mod subdirectories. Base-game
     paks are never in the manifest, so they are never removed.
  4. Write the new manifest = sorted `desired` paths.
  5. Push `[controller] Synced N mod file(s).` to the server log.
  - On any IO error, raise so `start()` aborts with a clear failure (mirrors the
    existing start error handling that resets state to `STOPPED`).

### `ServerManager.start()` hook

In `backend/services/server_manager.py`, after the `if not Path(PALWORLD_BINARY)…`
install check and before building `args` / launching the process, call the mod
sync and log its result. A sync failure aborts the start.

### `backend/routers/mods.py` — prefix `/api/mods`, auth-protected

No server-stopped gate; all endpoints work in any server state.

- `GET /api/mods` → `{ mods: [{ path, size, installed }] }` from `list_mods()`.
- `POST /api/mods/upload` → multipart form upload.
  - Fields: `file` (the upload), optional `subfolder` (e.g. `LogicMods`).
  - Validate extension is one of `.pak` / `.utoc` / `.ucas` → 400 otherwise.
  - Reject path traversal: no `..` segments, no absolute paths, in either the
    filename or `subfolder` → 400.
  - Write to `/mods/<subfolder>/<filename>`, creating dirs. Returns the stored
    `{ path, size, installed: false }`.
- `DELETE /api/mods/{path:path}` → delete the file from `/mods` (relative path,
  traversal-checked → 400; missing → 404). Does **not** touch Paks; the actual
  uninstall happens on next start via mirror sync.

Wire the router in `backend/main.py` alongside the others with `_protected`.

## Frontend

### `src/api/mods.ts`

Typed wrappers for the three endpoints. Upload uses `FormData`, so it calls
`fetch` directly rather than `apiFetch` (which forces
`Content-Type: application/json`). The direct call still sends
`credentials: "include"` and dispatches the global `"unauthorized"` event on a
401, matching `client.ts` behavior. List and delete may use `apiFetch`.

### `src/pages/ModsPage.tsx`

- Lists accepted mod files grouped by subfolder (a simple tree).
- Upload control: file picker plus an optional subfolder text field.
- Per-file delete action.
- A persistent note: **"Mod changes apply on the next server start."**
- Uses React Query like the other pages. No `useServerStatus` gating — mod edits
  are always allowed regardless of server state.

### `src/components/mods/`

Small presentational components (e.g. `ModList`, `UploadForm`) to keep the page
focused and independently testable.

### Routing & nav

- Add a `mods` route in `src/App.tsx`.
- Add a **Mods** tab in `src/components/NavBar.tsx`.

## Error handling

- Sync IO errors abort `start()` and surface in the server log / start failure.
- Upload rejects bad extensions and path traversal with 400; the UI shows the
  error detail.
- Delete returns 404 for a missing file.
- A corrupt/missing manifest is treated as empty rather than failing sync.

## Testing

### Backend

- `tests/test_mod_manager.py`:
  - sync copies new files into Paks (with subfolders preserved),
  - sync overwrites a changed file,
  - sync removes a mod that was de-listed from `/mods`,
  - sync never deletes a non-manifest (base-game) pak,
  - sync prunes empty mod subdirectories,
  - manifest round-trips; missing manifest treated as empty,
  - non-accepted extensions are ignored.
- `tests/test_mods_router.py`:
  - upload accepts valid extensions, rejects others (400),
  - upload rejects path traversal (400),
  - list reports correct `installed` flags,
  - delete removes file (200) and 404s when missing.

### Frontend

- `ModsPage` test: renders the file tree, upload calls the API, delete calls the
  API, and the "applies on next start" note is present.
