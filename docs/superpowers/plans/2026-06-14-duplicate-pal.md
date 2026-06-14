# Duplicate Selected Pal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Duplicate button to the Saves-tab pal editor that creates an in-memory copy of the selected pal in its owner's pal box.

**Architecture:** A new `SaveManager.duplicate_pal` service method wraps the PPE library's `add_pal(player_uid, pal_obj)` (which deep-copies a pal, assigns a new instance ID, and slots it into the owner's container). A new `POST /api/saves/pals/{instance_id}/duplicate` endpoint exposes it, returning a `PalSummary`. The frontend adds a Duplicate button beside Delete; the copy is in-memory until "Save to Disk" is clicked, like every other save edit.

**Tech Stack:** Python / FastAPI / pytest (backend); React / TypeScript / TanStack Query / vitest (frontend); palworld-pal-editor library.

**Reference spec:** `docs/superpowers/specs/2026-06-14-duplicate-pal-design.md`

---

## File Structure

- **Modify** `backend/services/save_manager.py` — add `duplicate_pal(player_uid, instance_id)`.
- **Modify** `backend/models/saves.py` — add `PalDuplicate` request model.
- **Modify** `backend/routers/saves.py` — add the `POST .../duplicate` endpoint.
- **Modify** `frontend/src/api/saves.ts` — add the `duplicatePal` fetch wrapper.
- **Modify** `frontend/src/components/saves/PalDetail.tsx` — add the duplicate mutation; pass `onDuplicate` + `isBaseWorker` to `ConditionCard`.
- **Modify** `frontend/src/components/saves/editor/ConditionCard.tsx` — render the Duplicate button.
- **Test** `tests/test_save_manager.py`, `tests/test_routers/test_saves.py`, `frontend/src/components/saves/editor/ConditionCard.test.tsx` (new).

---

## Task 1: `SaveManager.duplicate_pal` service method

**Files:**
- Modify: `backend/services/save_manager.py`
- Test: `tests/test_save_manager.py`

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_save_manager.py`:

```python
def _sm_for_duplicate(source_pal, add_pal_result):
    """SaveManager bypassing __init__, wired to a mock library manager."""
    sm = SaveManager.__new__(SaveManager)
    manager = MagicMock()
    player = MagicMock()
    player.get_pal.return_value = source_pal
    manager.get_player.return_value = player
    manager.add_pal.return_value = add_pal_result
    sm._manager = manager
    return sm, manager


def test_duplicate_pal_adds_copy_and_renames_with_nickname():
    source = MagicMock()
    source.NickName = "Sparky"
    source.DisplayName = "Foxparks"
    source._pal_obj = {"obj": "source"}
    new_pal = MagicMock()
    sm, manager = _sm_for_duplicate(source, new_pal)
    result = sm.duplicate_pal("uid-1", "pal-1")
    manager.add_pal.assert_called_once_with("uid-1", source._pal_obj)
    assert result is new_pal
    assert new_pal.NickName == "Sparky (copy)"


def test_duplicate_pal_uses_species_name_when_no_nickname():
    source = MagicMock()
    source.NickName = ""
    source.DisplayName = "Foxparks"
    source._pal_obj = {"obj": "source"}
    new_pal = MagicMock()
    sm, _ = _sm_for_duplicate(source, new_pal)
    sm.duplicate_pal("uid-1", "pal-1")
    assert new_pal.NickName == "Foxparks (copy)"


def test_duplicate_pal_base_worker_raises_pal_edit_error():
    sm = SaveManager.__new__(SaveManager)
    sm._manager = MagicMock()
    with pytest.raises(PalEditError):
        sm.duplicate_pal("PAL_BASE_WORKER_BTN", "pal-1")


def test_duplicate_pal_full_palbox_raises_pal_edit_error():
    source = MagicMock()
    source.NickName = "Sparky"
    source.DisplayName = "Foxparks"
    source._pal_obj = {"obj": "source"}
    sm, _ = _sm_for_duplicate(source, None)
    with pytest.raises(PalEditError, match="full"):
        sm.duplicate_pal("uid-1", "pal-1")


def test_duplicate_pal_unknown_player_raises_value_error():
    sm = SaveManager.__new__(SaveManager)
    manager = MagicMock()
    manager.get_player.return_value = None
    sm._manager = manager
    with pytest.raises(ValueError, match="Player"):
        sm.duplicate_pal("uid-x", "pal-1")


def test_duplicate_pal_unknown_pal_raises_value_error():
    sm = SaveManager.__new__(SaveManager)
    manager = MagicMock()
    player = MagicMock()
    player.get_pal.return_value = None
    manager.get_player.return_value = player
    sm._manager = manager
    with pytest.raises(ValueError, match="Pal"):
        sm.duplicate_pal("uid-1", "pal-x")
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pytest tests/test_save_manager.py -k duplicate -v`
Expected: FAIL — `AttributeError: ... has no attribute 'duplicate_pal'`.

- [ ] **Step 3: Implement `duplicate_pal`**

In `backend/services/save_manager.py`, add this method to the `SaveManager` class (place it after `delete_pal`):

```python
    def duplicate_pal(self, player_uid: str, instance_id: str) -> Any:
        if player_uid == "PAL_BASE_WORKER_BTN":
            raise PalEditError("Base Worker pals cannot be duplicated")
        player = self._manager.get_player(player_uid)
        if player is None:
            raise ValueError(f"Player {player_uid} not found")
        source = player.get_pal(instance_id)
        if source is None:
            raise ValueError(f"Pal {instance_id} not found")
        new_pal = self._manager.add_pal(player_uid, source._pal_obj)
        if new_pal is None:
            raise PalEditError("Pal box is full")
        base = source.NickName or source.DisplayName
        new_pal.NickName = f"{base} (copy)"
        return new_pal
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pytest tests/test_save_manager.py -k duplicate -v`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/services/save_manager.py tests/test_save_manager.py
git commit -m "feat: add SaveManager.duplicate_pal"
```

---

## Task 2: Duplicate endpoint + request model

**Files:**
- Modify: `backend/models/saves.py`
- Modify: `backend/routers/saves.py`
- Test: `tests/test_routers/test_saves.py`

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_routers/test_saves.py`:

```python
def _make_new_pal():
    pal = MagicMock()
    pal.InstanceId = "pal-2"
    pal.DisplayName = "Foxparks"
    pal.NickName = "Sparky (copy)"
    pal.Level = 5
    pal.Gender = MagicMock(value="Male")
    pal.is_unreferenced_pal = False
    pal.in_owner_palbox = True
    return pal


def test_duplicate_pal_returns_new_summary(client, mock_save_manager):
    mock_save_manager.duplicate_pal.return_value = _make_new_pal()
    resp = client.post("/api/saves/pals/pal-1/duplicate", json={"player_uid": "uid-1"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["instance_id"] == "pal-2"
    assert data["nickname"] == "Sparky (copy)"
    assert data["player_uid"] == "uid-1"
    mock_save_manager.duplicate_pal.assert_called_once_with("uid-1", "pal-1")


def test_duplicate_pal_full_palbox_returns_409(client, mock_save_manager):
    from backend.services.save_manager import PalEditError
    mock_save_manager.duplicate_pal.side_effect = PalEditError("Pal box is full")
    resp = client.post("/api/saves/pals/pal-1/duplicate", json={"player_uid": "uid-1"})
    assert resp.status_code == 409
    assert "full" in resp.json()["detail"].lower()


def test_duplicate_pal_unknown_returns_404(client, mock_save_manager):
    mock_save_manager.duplicate_pal.side_effect = ValueError("Pal not found")
    resp = client.post("/api/saves/pals/pal-1/duplicate", json={"player_uid": "uid-1"})
    assert resp.status_code == 404


def test_duplicate_pal_409_when_server_running(client):
    import backend.main as main_mod
    m = MagicMock()
    m.state = ServerState.RUNNING
    main_mod.server_manager = m
    resp = client.post("/api/saves/pals/pal-1/duplicate", json={"player_uid": "uid-1"})
    assert resp.status_code == 409
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pytest tests/test_routers/test_saves.py -k duplicate -v`
Expected: FAIL — 404/405 (route not defined yet).

- [ ] **Step 3: Add the request model**

In `backend/models/saves.py`, add after the `PalPatch` class:

```python
class PalDuplicate(BaseModel):
    player_uid: str
```

- [ ] **Step 4: Add the endpoint**

In `backend/routers/saves.py`, add `PalDuplicate` to the model import block at the top:

```python
from backend.models.saves import (
    PlayersResponse,
    PlayerSummary,
    PalSummary,
    PalPatch,
    PalDuplicate,
    PassiveOption,
    ActiveSkillOption,
)
```

Then add this endpoint after `patch_pal`:

```python
@router.post("/pals/{instance_id}/duplicate", response_model=PalSummary)
def duplicate_pal(instance_id: str, body: PalDuplicate):
    _assert_stopped()
    sm = _get_save_manager()
    from backend.services.save_manager import PalEditError
    try:
        pal = sm.duplicate_pal(body.player_uid, instance_id)
    except PalEditError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return PalSummary(
        instance_id=str(pal.InstanceId),
        player_uid=body.player_uid,
        display_name=pal.DisplayName,
        nickname=pal.NickName or "",
        level=pal.Level or 1,
        gender=pal.Gender.value if pal.Gender else None,
        is_unref=pal.is_unreferenced_pal,
        in_owner_palbox=pal.in_owner_palbox,
    )
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pytest tests/test_routers/test_saves.py -k duplicate -v`
Expected: PASS (4 tests).

- [ ] **Step 6: Run the full backend suite**

Run: `pytest tests/ -q`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add backend/models/saves.py backend/routers/saves.py tests/test_routers/test_saves.py
git commit -m "feat: add POST /api/saves/pals/{id}/duplicate endpoint"
```

---

## Task 3: Frontend Duplicate button

**Files:**
- Modify: `frontend/src/api/saves.ts`
- Modify: `frontend/src/components/saves/PalDetail.tsx`
- Modify: `frontend/src/components/saves/editor/ConditionCard.tsx`
- Test: `frontend/src/components/saves/editor/ConditionCard.test.tsx` (new)

All commands in this task run from the `frontend/` directory (Node 22; `nvm use 22` if needed).

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/saves/editor/ConditionCard.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"
import ConditionCard from "./ConditionCard"
import type { PalDetailData } from "@/types"

const detail = {
  display_name: "Foxparks",
  sanity: 100,
  full_stomach: 150,
  max_full_stomach: 300,
  has_worker_sick: false,
  is_fainted: false,
} as PalDetailData

describe("ConditionCard duplicate", () => {
  it("fires onDuplicate when the Duplicate button is clicked", () => {
    const onDuplicate = vi.fn()
    render(
      <ConditionCard detail={detail} patch={vi.fn()} onDelete={vi.fn()}
        onDuplicate={onDuplicate} isBaseWorker={false} disabled={false} />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Duplicate" }))
    expect(onDuplicate).toHaveBeenCalled()
  })

  it("disables the Duplicate button for base workers", () => {
    render(
      <ConditionCard detail={detail} patch={vi.fn()} onDelete={vi.fn()}
        onDuplicate={vi.fn()} isBaseWorker={true} disabled={false} />,
    )
    expect(screen.getByRole("button", { name: "Duplicate" })).toBeDisabled()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/saves/editor/ConditionCard.test.tsx`
Expected: FAIL — `ConditionCard` does not accept `onDuplicate`/`isBaseWorker`; no "Duplicate" button found.

- [ ] **Step 3: Add the Duplicate button to `ConditionCard`**

Replace the entire contents of `frontend/src/components/saves/editor/ConditionCard.tsx` with:

```tsx
import type { PalDetailData } from "@/types"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"

interface ConditionCardProps {
  detail: PalDetailData
  patch: (key: string, value: unknown) => void
  onDelete: () => void
  onDuplicate: () => void
  isBaseWorker: boolean
  disabled?: boolean
  duplicating?: boolean
}

export default function ConditionCard({
  detail, patch, onDelete, onDuplicate, isBaseWorker, disabled, duplicating,
}: ConditionCardProps) {
  const needsHeal = detail.has_worker_sick || detail.is_fainted

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm">Sanity</Label>
        <Input type="number" min={0} max={100} defaultValue={detail.sanity ?? 0} disabled={disabled}
          onBlur={(e) => patch("SanityValue", Math.min(100, Math.max(0, Number(e.target.value))))}
          className="h-7 text-sm w-24" />
      </div>
      <div className="flex items-center justify-between">
        <Label className="text-sm">Full Stomach</Label>
        <Input type="number" min={0} max={detail.max_full_stomach} defaultValue={detail.full_stomach ?? 0} disabled={disabled}
          onBlur={(e) => patch("FullStomach", Math.min(detail.max_full_stomach, Math.max(0, Number(e.target.value))))}
          className="h-7 text-sm w-24" />
      </div>
      <div className="flex gap-2">
        {needsHeal && (
          <Button variant="outline" size="sm" disabled={disabled}
            onClick={() => patch("heal_pal", true)}>Heal</Button>
        )}
        <Button variant="outline" size="sm"
          disabled={disabled || isBaseWorker || duplicating}
          title={isBaseWorker ? "Base Worker pals can't be duplicated" : undefined}
          onClick={onDuplicate}>
          Duplicate
        </Button>
        <Button variant="destructive" size="sm" disabled={disabled}
          onClick={() => { if (confirm(`Delete ${detail.display_name ?? "this pal"}?`)) onDelete() }}>
          Delete Pal
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/saves/editor/ConditionCard.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Add the `duplicatePal` API wrapper**

In `frontend/src/api/saves.ts`, add after the `deletePal` line:

```ts
export const duplicatePal = (instanceId: string, playerUid: string) =>
  apiFetch<PalSummary>(`/saves/pals/${instanceId}/duplicate`, {
    method: "POST",
    body: JSON.stringify({ player_uid: playerUid }),
  })
```

- [ ] **Step 6: Wire the mutation into `PalDetail`**

In `frontend/src/components/saves/PalDetail.tsx`:

Update the saves import to include `duplicatePal`:

```tsx
import { getPal, deletePal, duplicatePal } from "@/api/saves"
```

Add the sonner import near the other imports:

```tsx
import { toast } from "sonner"
```

Add the duplicate mutation immediately after the existing `deleteMut` block:

```tsx
  const duplicateMut = useMutation({
    mutationFn: () => duplicatePal(pal.instance_id, playerUid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pals"] })
      toast.success("Pal duplicated")
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to duplicate pal"),
  })
```

Update the `ConditionCard` usage at the bottom of the component to pass the new props:

```tsx
        <ConditionCard
          detail={detail}
          patch={patch}
          onDelete={() => deleteMut.mutate()}
          onDuplicate={() => duplicateMut.mutate()}
          isBaseWorker={pal.player_uid == null}
          duplicating={duplicateMut.isPending}
          disabled={disabled}
        />
```

- [ ] **Step 7: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 8: Run the full frontend test suite**

Run: `npm run test`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/api/saves.ts frontend/src/components/saves/PalDetail.tsx \
  frontend/src/components/saves/editor/ConditionCard.tsx \
  frontend/src/components/saves/editor/ConditionCard.test.tsx
git commit -m "feat: add Duplicate button to pal editor"
```

---

## Final Verification

- [ ] **Backend:** `pytest tests/ -q` — all pass.
- [ ] **Frontend:** from `frontend/`, `npm run test && npx tsc --noEmit && npm run lint` — all pass.
- [ ] **Manual smoke (optional):** with the server stopped, select a player-owned pal, click **Duplicate** → a `"<name> (copy)"` pal appears in the list and the original stays selected; the button is disabled on the Base Workers tab; "Save to Disk" persists the copy.
