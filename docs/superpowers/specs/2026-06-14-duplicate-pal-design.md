# Duplicate Selected Pal — Design

**Date:** 2026-06-14
**Status:** Approved

## Overview

Add a **Duplicate** button to the pal editor on the Saves tab. It creates an
in-memory copy of the selected pal in its owner's pal box. Like every other
save edit, the copy is not written to disk until "Save to Disk" is clicked.

The copy's nickname becomes `"<name> (copy)"`. The button is disabled (with a
tooltip) for Base Worker pals, which have no player owner and therefore cannot
be duplicated by the underlying library.

## Decisions

- **Base Worker pals:** button shown but disabled, with a tooltip explaining
  duplication is only available for player-owned pals.
- **Copy nickname:** `"<original nickname or species name> (copy)"`, overriding
  the library's default `"!!!DUPED PAL!!!"`.
- **After a successful copy:** refresh the list (copy appears) but keep the
  original selected, so several copies can be made in a row. Show a success toast.
- **No confirmation dialog:** duplication is non-destructive (unlike Delete).

## Library mechanism

The PPE library already supports duplication:

```python
pal_obj = player.get_pal(pal_guid)._pal_obj
SaveManager().add_pal(player_uid, pal_obj)   # -> new PalEntity, or None
```

`add_pal(player_uid, pal_obj)` deep-copies the pal, assigns a new instance ID,
places it in the owner's otomo/pal-box container, clears `PlayerUId` (so the
game shows it), and sets the nickname to `"!!!DUPED PAL!!!"`. It returns `None`
when there is no empty slot (pal box full) or the player is not found.

## Backend

### `SaveManager.duplicate_pal(player_uid, instance_id)`
`backend/services/save_manager.py`

- Reject `player_uid == "PAL_BASE_WORKER_BTN"` (no owner) — raise `PalEditError`.
- Look up the player; raise `ValueError` if missing (→ 404).
- Look up the source pal on the player; raise `ValueError` if missing (→ 404).
- Call `self._manager.add_pal(player_uid, source_pal._pal_obj)`.
- If it returns `None`, raise `PalEditError("Pal box is full")` (→ 409).
- Override the copy's nickname with `"<original nickname or species name> (copy)"`.
- Return the new pal entity.

### `POST /api/saves/pals/{instance_id}/duplicate`
`backend/routers/saves.py`

- `_assert_stopped()` — 409 if the server is not stopped.
- `_get_save_manager()`.
- Request body carries `player_uid` (small request model, mirroring `PalPatch`).
- `PalEditError` → 409; `ValueError` → 404.
- Return a `PalSummary` for the new pal (same shape `get_pals` produces).

## Frontend

### API wrapper — `frontend/src/api/saves.ts`

```ts
export const duplicatePal = (instanceId: string, playerUid: string) =>
  apiFetch<PalSummary>(`/saves/pals/${instanceId}/duplicate`, {
    method: "POST",
    body: JSON.stringify({ player_uid: playerUid }),
  })
```

### Mutation — `frontend/src/components/saves/PalDetail.tsx`

Add next to the existing `deleteMut`, passed to `ConditionCard` as `onDuplicate`:

```tsx
const duplicateMut = useMutation({
  mutationFn: () => duplicatePal(pal.instance_id, playerUid),
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ["pals"] })   // copy appears in list
    toast.success("Pal duplicated")                  // original stays selected
  },
  onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to duplicate pal"),
})
```

### Button — `frontend/src/components/saves/editor/ConditionCard.tsx`

- Render a **Duplicate** button alongside Delete in the existing button row.
- Pass an `isBaseWorker` flag (`pal.player_uid == null`) from `PalDetail`.
- Disabled when `isBaseWorker` (tooltip: "Base Worker pals can't be
  duplicated"), when `disabled` (server running), or when the mutation is pending.
- No confirmation dialog.

## Data flow

```
ConditionCard "Duplicate" -> PalDetail duplicateMut -> POST /duplicate
  -> SaveManager.duplicate_pal -> PPE add_pal (in-memory)
  -> invalidate ["pals"] -> list refreshes, original stays selected, success toast
  -> (later) "Save to Disk" commits to disk
```

## Testing

### Backend (`tests/`)
- Duplicate succeeds and returns a new instance ID distinct from the source.
- Base Worker (`PAL_BASE_WORKER_BTN`) → 409.
- Pal box full (`add_pal` returns `None`) → 409.
- Unknown player or pal → 404.
- Server not stopped → 409.
- Mock `save_manager` per the existing `conftest.py` pattern.

### Frontend
- `ConditionCard`/`PalDetail` test: Duplicate button is disabled for base
  workers; clicking it for a player-owned pal fires the mutation.
- Match the coverage level of existing saves component tests.
