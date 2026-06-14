# Full Pal Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Saves tab so a selected Pal's core stats, passive skills, active skills, work suitabilities, cosmetic/meta fields, and condition are all editable (not just nickname).

**Architecture:** Backend keeps the single generic `PATCH /api/saves/pals/{id}` endpoint but turns `SaveManager.set_pal_attr` into a dispatcher that mirrors the upstream `palworld-pal-editor` `match key:` logic (special-cased skill/suitability/heal ops, `setattr` fallback for scalars). Three new read-only GET endpoints serve dropdown reference data. The frontend decomposes `PalDetail` into focused editor sub-components that auto-apply changes (debounced for sliders) via a shared `usePalPatch` hook; persistence stays two-phase via the existing "Save to Disk" commit.

**Tech Stack:** FastAPI + Pydantic (backend), `palworld-pal-editor` library, React + TypeScript + Vite + TanStack Query + shadcn/ui (frontend), pytest + vitest.

**Spec:** `docs/superpowers/specs/2026-06-13-full-pal-editor-design.md`

---

## File Structure

**Backend**
- Modify `backend/services/save_manager.py` — add `PalEditError`; turn `set_pal_attr` into a dispatcher.
- Create `backend/services/pal_data.py` — cached reference-data accessors (passives, active skills, suitabilities) wrapping the library's `DataProvider`.
- Modify `backend/models/saves.py` — add `PassiveOption`, `ActiveSkillOption` response models.
- Modify `backend/routers/saves.py` — map `PalEditError`→409; expand `get_pal` response; add three `data/*` GET routes.
- Modify `tests/test_save_manager.py` — dispatcher unit tests.
- Modify `tests/test_routers/test_saves.py` — router tests for new behavior/endpoints.

**Frontend**
- Modify `frontend/src/types/index.ts` — `PalDetailData`, `PassiveOption`, `ActiveSkillOption`.
- Modify `frontend/src/api/saves.ts` — data endpoint wrappers; type `getPal`.
- Create `frontend/src/hooks/useReferenceData.ts` — react-query hooks for the three data lists.
- Create `frontend/src/hooks/usePalPatch.ts` — patch helper with invalidation + error state.
- Create `frontend/src/hooks/useDebouncedCallback.ts` — debounce utility.
- Create `frontend/src/components/saves/editor/Chip.tsx` — removable chip.
- Create `frontend/src/components/saves/editor/SkillCombobox.tsx` — searchable add-control (native select + text filter).
- Create `frontend/src/components/saves/editor/IdentityCard.tsx`
- Create `frontend/src/components/saves/editor/ConditionCard.tsx`
- Create `frontend/src/components/saves/editor/StatsEditor.tsx`
- Create `frontend/src/components/saves/editor/PassiveSkillsEditor.tsx`
- Create `frontend/src/components/saves/editor/ActiveSkillsEditor.tsx`
- Create `frontend/src/components/saves/editor/SuitabilitiesEditor.tsx`
- Modify `frontend/src/components/saves/PalDetail.tsx` — thin container composing the above.
- Create `frontend/src/components/saves/editor/StatsEditor.test.tsx` and `PassiveSkillsEditor.test.tsx` — vitest.

---

## Task 1: Backend — `set_pal_attr` dispatcher + `PalEditError`

**Files:**
- Modify: `backend/services/save_manager.py:55-65`
- Test: `tests/test_save_manager.py`

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_save_manager.py`:

```python
from unittest.mock import MagicMock
from backend.services.save_manager import SaveManager, PalEditError


def _sm_with_pal(pal):
    """Build a SaveManager bypassing __init__, wired to a mock library manager."""
    sm = SaveManager.__new__(SaveManager)
    manager = MagicMock()
    player = MagicMock()
    player.get_pal.return_value = pal
    manager.get_player.return_value = player
    manager.get_working_pal.return_value = pal
    sm._manager = manager
    return sm


def test_set_pal_attr_scalar_uses_setattr():
    pal = MagicMock()
    sm = _sm_with_pal(pal)
    sm.set_pal_attr("uid-1", "pal-1", "Level", 42)
    assert pal.Level == 42


def test_set_pal_attr_add_passive_calls_method():
    pal = MagicMock()
    pal.add_PassiveSkillList.return_value = True
    sm = _sm_with_pal(pal)
    sm.set_pal_attr("uid-1", "pal-1", "add_PassiveSkillList", "PassiveSkill_Legend")
    pal.add_PassiveSkillList.assert_called_once_with("PassiveSkill_Legend", True)


def test_set_pal_attr_add_passive_full_raises_pal_edit_error():
    pal = MagicMock()
    pal.add_PassiveSkillList.return_value = False
    sm = _sm_with_pal(pal)
    with pytest.raises(PalEditError):
        sm.set_pal_attr("uid-1", "pal-1", "add_PassiveSkillList", "PassiveSkill_Legend")


def test_set_pal_attr_pop_equip_waza_calls_method():
    pal = MagicMock()
    sm = _sm_with_pal(pal)
    sm.set_pal_attr("uid-1", "pal-1", "pop_EquipWaza", "EPalWazaID::Fire_FlareArrow")
    pal.pop_EquipWaza.assert_called_once_with(item="EPalWazaID::Fire_FlareArrow")


def test_set_pal_attr_set_suitability_calls_method():
    pal = MagicMock()
    sm = _sm_with_pal(pal)
    sm.set_pal_attr("uid-1", "pal-1", "set_Suitability", {"name": "Watering", "level": 3})
    pal.set_WorkSuitability.assert_called_once_with("Watering", 3)


def test_set_pal_attr_heal_calls_heal_pal():
    pal = MagicMock()
    sm = _sm_with_pal(pal)
    sm.set_pal_attr("uid-1", "pal-1", "IsFaintedPal", False)
    pal.heal_pal.assert_called_once()


def test_set_pal_attr_unknown_player_raises_value_error():
    sm = SaveManager.__new__(SaveManager)
    manager = MagicMock()
    manager.get_player.return_value = None
    sm._manager = manager
    with pytest.raises(ValueError, match="Player"):
        sm.set_pal_attr("uid-x", "pal-1", "Level", 1)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_save_manager.py -k "set_pal_attr" -v`
Expected: FAIL — `PalEditError` import error / methods not dispatched.

- [ ] **Step 3: Implement the dispatcher**

In `backend/services/save_manager.py`, add the exception near the top (after imports):

```python
class PalEditError(Exception):
    """Raised when a Pal edit is rejected by the library (list full, duplicate, unknown)."""
```

Replace the existing `set_pal_attr` method body (lines ~55-65) with:

```python
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

        match key:
            case "add_PassiveSkillList":
                if not pal.add_PassiveSkillList(value, True):
                    raise PalEditError(
                        f"Cannot add passive '{value}': already has 4, duplicate, or unknown skill."
                    )
            case "pop_PassiveSkillList":
                pal.pop_PassiveSkillList(item=value)
            case "add_EquipWaza":
                if not pal.add_EquipWaza(value, True):
                    raise PalEditError(
                        f"Cannot equip '{value}': already has 3 equipped, duplicate, or unknown skill."
                    )
            case "pop_EquipWaza":
                pal.pop_EquipWaza(item=value)
            case "add_MasteredWaza":
                if not pal.add_MasteredWaza(value):
                    raise PalEditError(
                        f"Cannot add mastered skill '{value}': duplicate or unknown skill."
                    )
            case "pop_MasteredWaza":
                pal.pop_MasteredWaza(item=value)
            case "set_Suitability":
                pal.set_WorkSuitability(value["name"], value["level"])
            case "HasWorkerSick" | "IsFaintedPal" | "heal_pal":
                pal.heal_pal()
            case _:
                setattr(pal, key, value)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_save_manager.py -k "set_pal_attr" -v`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/services/save_manager.py tests/test_save_manager.py
git commit -m "feat(saves): dispatch Pal edits to library skill/suitability/heal ops"
```

---

## Task 2: Backend — router error mapping + expanded `get_pal`

**Files:**
- Modify: `backend/routers/saves.py:71-118`
- Test: `tests/test_routers/test_saves.py`

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_routers/test_saves.py`:

```python
def _make_pal():
    pal = MagicMock()
    pal.InstanceId = "pal-1"
    pal.CharacterID = "Lamball"
    pal.DisplayName = "Lamball"
    pal.NickName = ""
    pal.Level = 5
    pal.Gender = MagicMock(value="Male")
    pal.Rank = 1
    pal.Rank_HP = 0
    pal.Rank_Attack = 0
    pal.Rank_Defence = 0
    pal.Rank_CraftSpeed = 0
    pal.Talent_HP = 50
    pal.Talent_Melee = 50
    pal.Talent_Shot = 50
    pal.Talent_Defense = 50
    pal.PassiveSkillList = ["PassiveSkill_Legend"]
    pal.MasteredWaza = []
    pal.EquipWaza = []
    pal.HasWorkerSick = False
    pal.IsFaintedPal = False
    pal.ComputedMaxHP = 100
    pal.ComputedAttack = 80
    pal.ComputedDefense = 70
    pal.FriendshipLevel = 2
    pal.SanityValue = 100.0
    pal.FullStomach = 150.0
    pal.IsRarePal = False
    pal.IsBOSS = False
    pal.IsTower = False
    pal.IsFavoritePal = True
    pal.WorkSuitabilities = {"Watering": 2}
    return pal


def test_get_pal_returns_extended_fields(client, mock_save_manager):
    pal = _make_pal()
    player = mock_save_manager.get_player.return_value
    player.get_pal.return_value = pal
    resp = client.get("/api/saves/pals/pal-1?player_uid=uid-1")
    assert resp.status_code == 200
    data = resp.json()
    assert data["friendship_level"] == 2
    assert data["sanity"] == 100.0
    assert data["full_stomach"] == 150.0
    assert data["is_favorite"] is True
    assert data["suitabilities"] == {"Watering": 2}


def test_patch_pal_maps_pal_edit_error_to_409(client, mock_save_manager):
    from backend.services.save_manager import PalEditError
    mock_save_manager.set_pal_attr.side_effect = PalEditError("list full")
    resp = client.patch(
        "/api/saves/pals/pal-1",
        json={"player_uid": "uid-1", "key": "add_PassiveSkillList", "value": "X"},
    )
    assert resp.status_code == 409
    assert resp.json()["detail"] == "list full"


def test_patch_pal_maps_value_error_to_404(client, mock_save_manager):
    mock_save_manager.set_pal_attr.side_effect = ValueError("Pal not found")
    resp = client.patch(
        "/api/saves/pals/pal-1",
        json={"player_uid": "uid-1", "key": "Level", "value": 5},
    )
    assert resp.status_code == 404
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_routers/test_saves.py -k "extended_fields or 409 or 404" -v`
Expected: FAIL — missing fields / 409 not mapped.

- [ ] **Step 3: Expand `get_pal` response**

In `backend/routers/saves.py`, in `get_pal`, add these keys to the returned dict (after `"is_fainted"` / computed block, before the closing brace):

```python
        "friendship_level": pal.FriendshipLevel or 0,
        "sanity": pal.SanityValue,
        "full_stomach": pal.FullStomach,
        "is_rare": pal.IsRarePal or False,
        "is_boss": pal.IsBOSS or False,
        "is_tower": pal.IsTower or False,
        "is_favorite": pal.IsFavoritePal or False,
        "suitabilities": pal.WorkSuitabilities or {},
```

- [ ] **Step 4: Map `PalEditError` to 409 in `patch_pal`**

Replace the body of `patch_pal` with:

```python
@router.patch("/pals/{instance_id}")
def patch_pal(instance_id: str, body: PalPatch):
    _assert_stopped()
    sm = _get_save_manager()
    from backend.services.save_manager import PalEditError
    try:
        sm.set_pal_attr(body.player_uid or "PAL_BASE_WORKER_BTN", instance_id, body.key, body.value)
    except PalEditError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"ok": True}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pytest tests/test_routers/test_saves.py -v`
Expected: PASS (existing + 3 new).

- [ ] **Step 6: Commit**

```bash
git add backend/routers/saves.py tests/test_routers/test_saves.py
git commit -m "feat(saves): expand pal detail fields and map edit errors to 409"
```

---

## Task 3: Backend — reference-data service + endpoints

**Files:**
- Create: `backend/services/pal_data.py`
- Modify: `backend/models/saves.py`
- Modify: `backend/routers/saves.py`
- Test: `tests/test_routers/test_saves.py`

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_routers/test_saves.py`:

```python
def test_data_passives_endpoint(client, monkeypatch):
    from backend.services import pal_data
    monkeypatch.setattr(
        pal_data, "get_passives",
        lambda: [{"internal_name": "PassiveSkill_Legend", "label": "Legend", "rating": 3}],
    )
    resp = client.get("/api/saves/data/passives")
    assert resp.status_code == 200
    assert resp.json()[0]["internal_name"] == "PassiveSkill_Legend"
    assert resp.json()[0]["rating"] == 3


def test_data_active_skills_endpoint(client, monkeypatch):
    from backend.services import pal_data
    monkeypatch.setattr(
        pal_data, "get_active_skills",
        lambda: [{
            "internal_name": "EPalWazaID::Fire_FlareArrow", "label": "Flare Arrow",
            "element": "Fire", "power": 35, "has_fruit": True, "is_unique": False, "invalid": False,
        }],
    )
    resp = client.get("/api/saves/data/active-skills")
    assert resp.status_code == 200
    assert resp.json()[0]["element"] == "Fire"


def test_data_suitabilities_endpoint(client, monkeypatch):
    from backend.services import pal_data
    monkeypatch.setattr(pal_data, "get_suitabilities", lambda: ["Watering", "Mining"])
    resp = client.get("/api/saves/data/suitabilities")
    assert resp.status_code == 200
    assert resp.json() == ["Watering", "Mining"]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_routers/test_saves.py -k "data_" -v`
Expected: FAIL — 404 (routes not defined).

- [ ] **Step 3: Create the reference-data service**

Create `backend/services/pal_data.py`:

```python
from functools import lru_cache

# Fixed set of Palworld work suitabilities (PalSuitability enum names upstream).
SUITABILITIES = [
    "EmitFlame", "Watering", "Seeding", "GenerateElectricity", "Handcraft",
    "Collection", "Deforest", "Mining", "OilExtraction", "ProductMedicine",
    "Cool", "Transport", "MonsterFarm",
]


def _provider():
    from palworld_pal_editor.utils import DataProvider
    return DataProvider


@lru_cache(maxsize=1)
def get_passives() -> list[dict]:
    dp = _provider()
    out = []
    for p in dp.get_sorted_passives():
        name = p["InternalName"]
        i18n = dp.get_passive_i18n(name)
        out.append({
            "internal_name": name,
            "label": i18n[0] if i18n else name,
            "rating": p["Rating"],
        })
    return out


@lru_cache(maxsize=1)
def get_active_skills() -> list[dict]:
    dp = _provider()
    out = []
    for a in dp.get_sorted_attacks():
        name = a["InternalName"]
        i18n = dp.get_attack_i18n(name)
        out.append({
            "internal_name": name,
            "label": i18n[0] if i18n else name,
            "element": a["Element"],
            "power": a["Power"],
            "has_fruit": dp.has_skill_fruit(name),
            "is_unique": dp.is_unique_attacks(name),
            "invalid": a.get("Invalid", False),
        })
    return out


def get_suitabilities() -> list[str]:
    return list(SUITABILITIES)
```

- [ ] **Step 4: Add response models**

Append to `backend/models/saves.py`:

```python
class PassiveOption(BaseModel):
    internal_name: str
    label: str
    rating: int


class ActiveSkillOption(BaseModel):
    internal_name: str
    label: str
    element: str
    power: int
    has_fruit: bool
    is_unique: bool
    invalid: bool
```

- [ ] **Step 5: Add the routes**

In `backend/routers/saves.py`, update the models import and add routes. Change the import line:

```python
from backend.models.saves import (
    PlayersResponse, PlayerSummary, PalSummary, PalPatch,
    PassiveOption, ActiveSkillOption,
)
from backend.services import pal_data
```

Add these routes (place them above `patch_pal` so the static `/data/...` paths are registered clearly; FastAPI matching is unambiguous regardless):

```python
@router.get("/data/passives", response_model=list[PassiveOption])
def data_passives():
    return pal_data.get_passives()


@router.get("/data/active-skills", response_model=list[ActiveSkillOption])
def data_active_skills():
    return pal_data.get_active_skills()


@router.get("/data/suitabilities", response_model=list[str])
def data_suitabilities():
    return pal_data.get_suitabilities()
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pytest tests/test_routers/test_saves.py -k "data_" -v`
Expected: PASS (3 tests).

- [ ] **Step 7: Run the full backend suite**

Run: `pytest tests/ -v`
Expected: PASS (all).

- [ ] **Step 8: Commit**

```bash
git add backend/services/pal_data.py backend/models/saves.py backend/routers/saves.py tests/test_routers/test_saves.py
git commit -m "feat(saves): serve passive/active-skill/suitability reference data"
```

---

## Task 4: Frontend — types + api wrappers

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/api/saves.ts`

- [ ] **Step 1: Add types**

Append to `frontend/src/types/index.ts`:

```ts
export interface PalDetailData {
  instance_id: string
  character_id: string | null
  display_name: string | null
  nickname: string
  level: number
  gender: string | null
  rank: number
  rank_hp: number
  rank_attack: number
  rank_defence: number
  rank_craft_speed: number
  talent_hp: number
  talent_melee: number
  talent_shot: number
  talent_defense: number
  passive_skills: string[]
  mastered_waza: string[]
  equip_waza: string[]
  has_worker_sick: boolean
  is_fainted: boolean
  computed_max_hp: number | null
  computed_attack: number | null
  computed_defense: number | null
  friendship_level: number
  sanity: number | null
  full_stomach: number | null
  is_rare: boolean
  is_boss: boolean
  is_tower: boolean
  is_favorite: boolean
  suitabilities: Record<string, number>
}

export interface PassiveOption {
  internal_name: string
  label: string
  rating: number
}

export interface ActiveSkillOption {
  internal_name: string
  label: string
  element: string
  power: number
  has_fruit: boolean
  is_unique: boolean
  invalid: boolean
}
```

- [ ] **Step 2: Add api wrappers**

In `frontend/src/api/saves.ts`, update imports and `getPal`'s type, and add the data wrappers:

```ts
import { apiFetch } from "./client"
import type { PlayersResponse, PalSummary, PalDetailData, PassiveOption, ActiveSkillOption } from "@/types"

export const getPlayers = () => apiFetch<PlayersResponse>("/saves/players")
export const getPals = (playerUid: string) =>
  apiFetch<PalSummary[]>(`/saves/pals?player_uid=${encodeURIComponent(playerUid)}`)
export const patchPal = (instanceId: string, playerUid: string, key: string, value: unknown) =>
  apiFetch<{ ok: boolean }>(`/saves/pals/${instanceId}`, {
    method: "PATCH",
    body: JSON.stringify({ player_uid: playerUid, key, value }),
  })
export const getPal = (instanceId: string, playerUid: string) =>
  apiFetch<PalDetailData>(`/saves/pals/${instanceId}?player_uid=${encodeURIComponent(playerUid)}`)
export const deletePal = (instanceId: string) =>
  apiFetch<{ ok: boolean }>(`/saves/pals/${instanceId}`, { method: "DELETE" })
export const commitSave = () => apiFetch<{ ok: boolean }>("/saves/commit", { method: "POST" })

export const getPassives = () => apiFetch<PassiveOption[]>("/saves/data/passives")
export const getActiveSkills = () => apiFetch<ActiveSkillOption[]>("/saves/data/active-skills")
export const getSuitabilities = () => apiFetch<string[]>("/saves/data/suitabilities")
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS (no errors). (`PalDetail.tsx` still uses `Record<string, unknown>` for now — unaffected.)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/api/saves.ts
git commit -m "feat(saves): add pal-detail and reference-data types and api wrappers"
```

---

## Task 5: Frontend — shared hooks (reference data, patch, debounce)

**Files:**
- Create: `frontend/src/hooks/useReferenceData.ts`
- Create: `frontend/src/hooks/usePalPatch.ts`
- Create: `frontend/src/hooks/useDebouncedCallback.ts`

- [ ] **Step 1: Create the reference-data hooks**

Create `frontend/src/hooks/useReferenceData.ts`:

```ts
import { useQuery } from "@tanstack/react-query"
import { getPassives, getActiveSkills, getSuitabilities } from "@/api/saves"

// Reference data is static for a build; cache it for the session.
const STATIC = { staleTime: Infinity, gcTime: Infinity }

export const usePassives = () =>
  useQuery({ queryKey: ["ref", "passives"], queryFn: getPassives, ...STATIC })

export const useActiveSkills = () =>
  useQuery({ queryKey: ["ref", "active-skills"], queryFn: getActiveSkills, ...STATIC })

export const useSuitabilities = () =>
  useQuery({ queryKey: ["ref", "suitabilities"], queryFn: getSuitabilities, ...STATIC })
```

- [ ] **Step 2: Create the patch hook**

Create `frontend/src/hooks/usePalPatch.ts`:

```ts
import { useState, useCallback } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { patchPal } from "@/api/saves"

// Centralizes a Pal field PATCH: applies the change in-memory on the backend,
// invalidates the detail/list queries, and exposes the last error (e.g. 409 "list full").
export function usePalPatch(instanceId: string, playerUid: string) {
  const qc = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const patch = useCallback(
    async (key: string, value: unknown) => {
      setError(null)
      try {
        await patchPal(instanceId, playerUid, key, value)
        qc.invalidateQueries({ queryKey: ["pal", instanceId] })
        qc.invalidateQueries({ queryKey: ["pals"] })
      } catch (e) {
        setError(e instanceof Error ? e.message : "Edit failed")
      }
    },
    [instanceId, playerUid, qc],
  )

  return { patch, error, clearError: () => setError(null) }
}
```

- [ ] **Step 3: Create the debounce hook**

Create `frontend/src/hooks/useDebouncedCallback.ts`:

```ts
import { useEffect, useRef, useCallback } from "react"

// Returns a stable callback that defers invoking `fn` until `delay` ms after the
// last call. Used so slider/number drags fire one PATCH instead of many.
export function useDebouncedCallback<A extends unknown[]>(
  fn: (...args: A) => void,
  delay = 400,
) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  return useCallback(
    (...args: A) => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => fnRef.current(...args), delay)
    },
    [delay],
  )
}
```

- [ ] **Step 4: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useReferenceData.ts frontend/src/hooks/usePalPatch.ts frontend/src/hooks/useDebouncedCallback.ts
git commit -m "feat(saves): add reference-data, patch, and debounce hooks"
```

---

## Task 6: Frontend — shared editor primitives (Chip, SkillCombobox)

**Files:**
- Create: `frontend/src/components/saves/editor/Chip.tsx`
- Create: `frontend/src/components/saves/editor/SkillCombobox.tsx`

- [ ] **Step 1: Create the Chip**

Create `frontend/src/components/saves/editor/Chip.tsx`:

```tsx
import { Badge } from "@/components/ui/badge"

interface ChipProps {
  label: string
  onRemove?: () => void
  disabled?: boolean
}

export default function Chip({ label, onRemove, disabled }: ChipProps) {
  return (
    <Badge variant="secondary" className="text-xs gap-1">
      {label}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          className="ml-0.5 text-slate-400 hover:text-slate-100 disabled:opacity-40"
          aria-label={`Remove ${label}`}
        >
          ×
        </button>
      )}
    </Badge>
  )
}
```

- [ ] **Step 2: Create the SkillCombobox**

Create `frontend/src/components/saves/editor/SkillCombobox.tsx`. A text filter over a native `<select>` (no new deps; matches the `enum` pattern in `ConfigField.tsx`):

```tsx
import { useState } from "react"
import { Input } from "@/components/ui/input"

export interface ComboOption {
  value: string
  label: string
}

interface SkillComboboxProps {
  options: ComboOption[]
  onAdd: (value: string) => void
  disabled?: boolean
  placeholder?: string
}

// Searchable add-control: a text filter narrowing a native select, plus an Add action.
export default function SkillCombobox({ options, onAdd, disabled, placeholder }: SkillComboboxProps) {
  const [filter, setFilter] = useState("")
  const [selected, setSelected] = useState("")

  const filtered = filter
    ? options.filter((o) => o.label.toLowerCase().includes(filter.toLowerCase()))
    : options

  const add = () => {
    const value = selected || filtered[0]?.value
    if (value) onAdd(value)
    setFilter("")
    setSelected("")
  }

  return (
    <div className="flex gap-2 items-center">
      <Input
        value={filter}
        onChange={(e) => { setFilter(e.target.value); setSelected("") }}
        disabled={disabled}
        placeholder={placeholder ?? "Search…"}
        className="h-7 text-sm flex-1"
      />
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        disabled={disabled}
        className="h-7 max-w-[10rem] bg-slate-800 border border-slate-600 rounded px-2 text-sm"
      >
        <option value="">{filtered.length ? "Select…" : "No matches"}</option>
        {filtered.slice(0, 100).map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <button
        type="button"
        onClick={add}
        disabled={disabled || filtered.length === 0}
        className="h-7 px-3 text-sm rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-40"
      >
        Add
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/saves/editor/Chip.tsx frontend/src/components/saves/editor/SkillCombobox.tsx
git commit -m "feat(saves): add Chip and SkillCombobox editor primitives"
```

---

## Task 7: Frontend — StatsEditor (with test)

**Files:**
- Create: `frontend/src/components/saves/editor/StatsEditor.tsx`
- Test: `frontend/src/components/saves/editor/StatsEditor.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/saves/editor/StatsEditor.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"
import StatsEditor from "./StatsEditor"
import type { PalDetailData } from "@/types"

const detail = {
  level: 5, rank: 1, rank_hp: 0, rank_attack: 0, rank_defence: 0, rank_craft_speed: 0,
  talent_hp: 50, talent_melee: 50, talent_shot: 50, talent_defense: 50,
  computed_max_hp: 100, computed_attack: 80, computed_defense: 70,
} as PalDetailData

describe("StatsEditor", () => {
  it("patches Level when the level input changes (debounced)", async () => {
    const patch = vi.fn()
    render(<StatsEditor detail={detail} patch={patch} disabled={false} />)
    const level = screen.getByLabelText("Level") as HTMLInputElement
    fireEvent.change(level, { target: { value: "42" } })
    await waitFor(() => expect(patch).toHaveBeenCalledWith("Level", 42), { timeout: 1000 })
  })

  it("disables inputs when disabled", () => {
    render(<StatsEditor detail={detail} patch={vi.fn()} disabled={true} />)
    expect(screen.getByLabelText("Level")).toBeDisabled()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/components/saves/editor/StatsEditor.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement StatsEditor**

Create `frontend/src/components/saves/editor/StatsEditor.tsx`:

```tsx
import { useEffect, useState } from "react"
import type { PalDetailData } from "@/types"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback"

interface StatsEditorProps {
  detail: PalDetailData
  patch: (key: string, value: unknown) => void
  disabled?: boolean
}

interface NumField {
  key: string
  label: string
  value: number
  min: number
  max: number
}

function NumberRow({ field, patch, disabled }: { field: NumField; patch: (k: string, v: unknown) => void; disabled?: boolean }) {
  const [val, setVal] = useState(String(field.value))
  useEffect(() => { setVal(String(field.value)) }, [field.value])
  const debounced = useDebouncedCallback((n: number) => patch(field.key, n))

  return (
    <div className="flex items-center justify-between py-1">
      <Label htmlFor={field.key} className="text-sm text-slate-300">{field.label}</Label>
      <Input
        id={field.key}
        aria-label={field.label}
        type="number"
        min={field.min}
        max={field.max}
        value={val}
        disabled={disabled}
        onChange={(e) => {
          setVal(e.target.value)
          if (e.target.value === "") return
          const n = Math.min(field.max, Math.max(field.min, Math.round(Number(e.target.value))))
          debounced(n)
        }}
        className="h-7 text-sm w-24"
      />
    </div>
  )
}

export default function StatsEditor({ detail, patch, disabled }: StatsEditorProps) {
  const core: NumField[] = [
    { key: "Level", label: "Level", value: detail.level, min: 1, max: 60 },
    { key: "Rank", label: "Stars (Rank)", value: detail.rank, min: 1, max: 5 },
  ]
  const souls: NumField[] = [
    { key: "Rank_HP", label: "HP Soul", value: detail.rank_hp, min: 0, max: 20 },
    { key: "Rank_Attack", label: "Attack Soul", value: detail.rank_attack, min: 0, max: 20 },
    { key: "Rank_Defence", label: "Defence Soul", value: detail.rank_defence, min: 0, max: 20 },
    { key: "Rank_CraftSpeed", label: "Craft Speed Soul", value: detail.rank_craft_speed, min: 0, max: 20 },
  ]
  const ivs: NumField[] = [
    { key: "Talent_HP", label: "IV HP", value: detail.talent_hp, min: 0, max: 100 },
    { key: "Talent_Melee", label: "IV Melee", value: detail.talent_melee, min: 0, max: 100 },
    { key: "Talent_Shot", label: "IV Shot", value: detail.talent_shot, min: 0, max: 100 },
    { key: "Talent_Defense", label: "IV Defense", value: detail.talent_defense, min: 0, max: 100 },
  ]

  return (
    <div className="space-y-2">
      {core.map((f) => <NumberRow key={f.key} field={f} patch={patch} disabled={disabled} />)}
      <Separator />
      <p className="text-xs text-slate-400">Souls (0–20)</p>
      {souls.map((f) => <NumberRow key={f.key} field={f} patch={patch} disabled={disabled} />)}
      <Separator />
      <p className="text-xs text-slate-400">IVs (0–100)</p>
      {ivs.map((f) => <NumberRow key={f.key} field={f} patch={patch} disabled={disabled} />)}
      <Separator />
      <div className="text-xs text-slate-500 flex gap-4">
        <span>Max HP: {detail.computed_max_hp ?? "—"}</span>
        <span>Attack: {detail.computed_attack ?? "—"}</span>
        <span>Defense: {detail.computed_defense ?? "—"}</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/components/saves/editor/StatsEditor.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/saves/editor/StatsEditor.tsx frontend/src/components/saves/editor/StatsEditor.test.tsx
git commit -m "feat(saves): add StatsEditor with debounced numeric stat fields"
```

---

## Task 8: Frontend — PassiveSkillsEditor + ActiveSkillsEditor (with test)

**Files:**
- Create: `frontend/src/components/saves/editor/PassiveSkillsEditor.tsx`
- Create: `frontend/src/components/saves/editor/ActiveSkillsEditor.tsx`
- Test: `frontend/src/components/saves/editor/PassiveSkillsEditor.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/saves/editor/PassiveSkillsEditor.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"
import PassiveSkillsEditor from "./PassiveSkillsEditor"
import type { PassiveOption } from "@/types"

const options: PassiveOption[] = [
  { internal_name: "PassiveSkill_Legend", label: "Legend", rating: 3 },
  { internal_name: "PassiveSkill_Swift", label: "Swift", rating: 2 },
]

describe("PassiveSkillsEditor", () => {
  it("removes a current passive via the chip", () => {
    const patch = vi.fn()
    render(
      <PassiveSkillsEditor
        current={["PassiveSkill_Legend"]}
        options={options}
        patch={patch}
        disabled={false}
      />,
    )
    fireEvent.click(screen.getByLabelText("Remove Legend"))
    expect(patch).toHaveBeenCalledWith("pop_PassiveSkillList", "PassiveSkill_Legend")
  })

  it("adds a passive via the combobox", () => {
    const patch = vi.fn()
    render(
      <PassiveSkillsEditor current={[]} options={options} patch={patch} disabled={false} />,
    )
    fireEvent.click(screen.getByText("Add"))
    expect(patch).toHaveBeenCalledWith("add_PassiveSkillList", "PassiveSkill_Legend")
  })

  it("hides the add control when 4 passives are present", () => {
    render(
      <PassiveSkillsEditor
        current={["a", "b", "c", "d"]}
        options={options}
        patch={vi.fn()}
        disabled={false}
      />,
    )
    expect(screen.queryByText("Add")).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/components/saves/editor/PassiveSkillsEditor.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement PassiveSkillsEditor**

Create `frontend/src/components/saves/editor/PassiveSkillsEditor.tsx`:

```tsx
import type { PassiveOption } from "@/types"
import Chip from "./Chip"
import SkillCombobox from "./SkillCombobox"

interface PassiveSkillsEditorProps {
  current: string[]
  options: PassiveOption[]
  patch: (key: string, value: unknown) => void
  disabled?: boolean
}

export default function PassiveSkillsEditor({ current, options, patch, disabled }: PassiveSkillsEditorProps) {
  const labelOf = (name: string) =>
    options.find((o) => o.internal_name === name)?.label ?? name
  const available = options.filter((o) => !current.includes(o.internal_name))

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-400">Passive Skills ({current.length}/4)</p>
      <div className="flex flex-wrap gap-1">
        {current.map((name) => (
          <Chip
            key={name}
            label={labelOf(name)}
            disabled={disabled}
            onRemove={() => patch("pop_PassiveSkillList", name)}
          />
        ))}
        {current.length === 0 && <span className="text-xs text-slate-500">None</span>}
      </div>
      {current.length < 4 && (
        <SkillCombobox
          options={available.map((o) => ({ value: o.internal_name, label: `${o.label} (${o.rating})` }))}
          onAdd={(value) => patch("add_PassiveSkillList", value)}
          disabled={disabled}
          placeholder="Search passives…"
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Implement ActiveSkillsEditor**

Create `frontend/src/components/saves/editor/ActiveSkillsEditor.tsx`:

```tsx
import type { ActiveSkillOption } from "@/types"
import Chip from "./Chip"
import SkillCombobox from "./SkillCombobox"

interface ActiveSkillsEditorProps {
  equipped: string[]
  mastered: string[]
  options: ActiveSkillOption[]
  patch: (key: string, value: unknown) => void
  disabled?: boolean
}

export default function ActiveSkillsEditor({ equipped, mastered, options, patch, disabled }: ActiveSkillsEditorProps) {
  const labelOf = (name: string) =>
    options.find((o) => o.internal_name === name)?.label ?? name
  const comboOptions = (exclude: string[]) =>
    options
      .filter((o) => !exclude.includes(o.internal_name))
      .map((o) => ({ value: o.internal_name, label: `[${o.element}] ${o.label}` }))

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <p className="text-xs text-slate-400">Equipped ({equipped.length}/3)</p>
        <div className="flex flex-wrap gap-1">
          {equipped.map((name) => (
            <Chip key={name} label={labelOf(name)} disabled={disabled}
              onRemove={() => patch("pop_EquipWaza", name)} />
          ))}
          {equipped.length === 0 && <span className="text-xs text-slate-500">None</span>}
        </div>
        {equipped.length < 3 && (
          <SkillCombobox options={comboOptions(equipped)}
            onAdd={(v) => patch("add_EquipWaza", v)} disabled={disabled}
            placeholder="Search active skills…" />
        )}
      </div>

      <div className="space-y-2">
        <p className="text-xs text-slate-400">Mastered ({mastered.length})</p>
        <div className="flex flex-wrap gap-1">
          {mastered.map((name) => (
            <Chip key={name} label={labelOf(name)} disabled={disabled}
              onRemove={() => patch("pop_MasteredWaza", name)} />
          ))}
          {mastered.length === 0 && <span className="text-xs text-slate-500">None</span>}
        </div>
        <SkillCombobox options={comboOptions(mastered)}
          onAdd={(v) => patch("add_MasteredWaza", v)} disabled={disabled}
          placeholder="Search active skills…" />
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/components/saves/editor/PassiveSkillsEditor.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/saves/editor/PassiveSkillsEditor.tsx frontend/src/components/saves/editor/ActiveSkillsEditor.tsx frontend/src/components/saves/editor/PassiveSkillsEditor.test.tsx
git commit -m "feat(saves): add passive and active skill editors"
```

---

## Task 9: Frontend — SuitabilitiesEditor

**Files:**
- Create: `frontend/src/components/saves/editor/SuitabilitiesEditor.tsx`

- [ ] **Step 1: Implement SuitabilitiesEditor**

Create `frontend/src/components/saves/editor/SuitabilitiesEditor.tsx`:

```tsx
import { Label } from "@/components/ui/label"

interface SuitabilitiesEditorProps {
  names: string[]
  current: Record<string, number>
  patch: (key: string, value: unknown) => void
  disabled?: boolean
}

// Each suitability is a 0–5 stepper. The value sent is the desired absolute level;
// the backend library converts it to the stored delta over the species base.
export default function SuitabilitiesEditor({ names, current, patch, disabled }: SuitabilitiesEditorProps) {
  const set = (name: string, level: number) =>
    patch("set_Suitability", { name, level: Math.min(5, Math.max(0, level)) })

  return (
    <div className="space-y-1">
      <p className="text-xs text-slate-400">Work Suitabilities (0–5)</p>
      {names.map((name) => {
        const level = current[name] ?? 0
        return (
          <div key={name} className="flex items-center justify-between py-0.5">
            <Label className="text-sm text-slate-300">{name}</Label>
            <div className="flex items-center gap-2">
              <button type="button" disabled={disabled || level <= 0}
                onClick={() => set(name, level - 1)}
                className="h-6 w-6 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-40"
                aria-label={`Decrease ${name}`}>−</button>
              <span className="w-4 text-center text-sm">{level}</span>
              <button type="button" disabled={disabled || level >= 5}
                onClick={() => set(name, level + 1)}
                className="h-6 w-6 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-40"
                aria-label={`Increase ${name}`}>+</button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/saves/editor/SuitabilitiesEditor.tsx
git commit -m "feat(saves): add work suitabilities editor"
```

---

## Task 10: Frontend — IdentityCard + ConditionCard

**Files:**
- Create: `frontend/src/components/saves/editor/IdentityCard.tsx`
- Create: `frontend/src/components/saves/editor/ConditionCard.tsx`

- [ ] **Step 1: Implement IdentityCard**

Create `frontend/src/components/saves/editor/IdentityCard.tsx`:

```tsx
import { useEffect, useState } from "react"
import type { PalDetailData } from "@/types"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"

interface IdentityCardProps {
  detail: PalDetailData
  patch: (key: string, value: unknown) => void
  disabled?: boolean
}

const FLAGS: { key: string; label: string; field: keyof PalDetailData }[] = [
  { key: "IsFavoritePal", label: "Favorite", field: "is_favorite" },
  { key: "IsRarePal", label: "Lucky", field: "is_rare" },
  { key: "IsBOSS", label: "Boss", field: "is_boss" },
  { key: "IsTower", label: "Tower", field: "is_tower" },
]

export default function IdentityCard({ detail, patch, disabled }: IdentityCardProps) {
  const [nickname, setNickname] = useState(detail.nickname)
  useEffect(() => { setNickname(detail.nickname) }, [detail.nickname])

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-sm">Nickname</Label>
        <div className="flex gap-2">
          <Input value={nickname} onChange={(e) => setNickname(e.target.value)}
            disabled={disabled} className="h-7 text-sm flex-1" />
          <Button size="sm" onClick={() => patch("NickName", nickname)}
            disabled={disabled || nickname === detail.nickname}>Save</Button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Label className="text-sm">Gender</Label>
        <select value={detail.gender ?? ""} disabled={disabled}
          onChange={(e) => patch("Gender", e.target.value)}
          className="h-7 bg-slate-800 border border-slate-600 rounded px-2 text-sm">
          <option value="Male">Male</option>
          <option value="Female">Female</option>
        </select>
      </div>

      <div className="flex items-center justify-between">
        <Label className="text-sm">Friendship Level</Label>
        <Input type="number" min={0} defaultValue={detail.friendship_level}
          disabled={disabled}
          onBlur={(e) => patch("FriendshipLevel", Math.max(0, Math.round(Number(e.target.value))))}
          className="h-7 text-sm w-24" />
      </div>

      <div className="flex flex-wrap gap-4">
        {FLAGS.map((f) => (
          <label key={f.key} className="flex items-center gap-2 text-sm text-slate-300">
            <Switch checked={Boolean(detail[f.field])} disabled={disabled}
              onCheckedChange={(v) => patch(f.key, v)} />
            {f.label}
          </label>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Implement ConditionCard**

Create `frontend/src/components/saves/editor/ConditionCard.tsx`:

```tsx
import type { PalDetailData } from "@/types"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"

interface ConditionCardProps {
  detail: PalDetailData
  patch: (key: string, value: unknown) => void
  onDelete: () => void
  disabled?: boolean
}

export default function ConditionCard({ detail, patch, onDelete, disabled }: ConditionCardProps) {
  const needsHeal = detail.has_worker_sick || detail.is_fainted

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm">Sanity</Label>
        <Input type="number" defaultValue={detail.sanity ?? 0} disabled={disabled}
          onBlur={(e) => patch("SanityValue", Number(e.target.value))}
          className="h-7 text-sm w-24" />
      </div>
      <div className="flex items-center justify-between">
        <Label className="text-sm">Full Stomach</Label>
        <Input type="number" defaultValue={detail.full_stomach ?? 0} disabled={disabled}
          onBlur={(e) => patch("FullStomach", Number(e.target.value))}
          className="h-7 text-sm w-24" />
      </div>
      <div className="flex gap-2">
        {needsHeal && (
          <Button variant="outline" size="sm" disabled={disabled}
            onClick={() => patch("heal_pal", true)}>Heal</Button>
        )}
        <Button variant="destructive" size="sm" disabled={disabled}
          onClick={() => { if (confirm(`Delete ${detail.display_name ?? "this pal"}?`)) onDelete() }}>
          Delete Pal
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/saves/editor/IdentityCard.tsx frontend/src/components/saves/editor/ConditionCard.tsx
git commit -m "feat(saves): add identity and condition editor cards"
```

---

## Task 11: Frontend — compose PalDetail container

**Files:**
- Modify: `frontend/src/components/saves/PalDetail.tsx`

- [ ] **Step 1: Rewrite PalDetail as a thin composing container**

Replace the entire contents of `frontend/src/components/saves/PalDetail.tsx`:

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { PalSummary, PalDetailData } from "@/types"
import { getPal, deletePal } from "@/api/saves"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { usePalPatch } from "@/hooks/usePalPatch"
import { usePassives, useActiveSkills, useSuitabilities } from "@/hooks/useReferenceData"
import IdentityCard from "./editor/IdentityCard"
import StatsEditor from "./editor/StatsEditor"
import PassiveSkillsEditor from "./editor/PassiveSkillsEditor"
import ActiveSkillsEditor from "./editor/ActiveSkillsEditor"
import SuitabilitiesEditor from "./editor/SuitabilitiesEditor"
import ConditionCard from "./editor/ConditionCard"

interface PalDetailProps {
  pal: PalSummary
  disabled?: boolean
  onDeleted: () => void
}

export default function PalDetail({ pal, disabled, onDeleted }: PalDetailProps) {
  const qc = useQueryClient()
  const playerUid = pal.player_uid ?? "PAL_BASE_WORKER_BTN"

  const { data: detail } = useQuery<PalDetailData>({
    queryKey: ["pal", pal.instance_id],
    queryFn: () => getPal(pal.instance_id, playerUid),
  })
  const passives = usePassives()
  const activeSkills = useActiveSkills()
  const suitabilities = useSuitabilities()

  const { patch, error } = usePalPatch(pal.instance_id, playerUid)

  const deleteMut = useMutation({
    mutationFn: () => deletePal(pal.instance_id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pals"] })
      onDeleted()
    },
  })

  if (!detail) {
    return <Card><CardContent className="pt-4 text-sm text-slate-500">Loading…</CardContent></Card>
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          {detail.display_name ?? detail.instance_id}
          {!!detail.gender && <Badge variant="outline" className="text-xs">{detail.gender}</Badge>}
          {detail.is_fainted && <Badge variant="destructive" className="text-xs">Fainted</Badge>}
          {detail.has_worker_sick && <Badge variant="destructive" className="text-xs">Sick</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-md bg-red-950 border border-red-800 px-3 py-2 text-xs text-red-200">
            {error}
          </div>
        )}

        <IdentityCard detail={detail} patch={patch} disabled={disabled} />
        <Separator />
        <StatsEditor detail={detail} patch={patch} disabled={disabled} />
        <Separator />
        <PassiveSkillsEditor
          current={detail.passive_skills}
          options={passives.data ?? []}
          patch={patch}
          disabled={disabled}
        />
        <Separator />
        <ActiveSkillsEditor
          equipped={detail.equip_waza}
          mastered={detail.mastered_waza}
          options={activeSkills.data ?? []}
          patch={patch}
          disabled={disabled}
        />
        <Separator />
        <SuitabilitiesEditor
          names={suitabilities.data ?? []}
          current={detail.suitabilities}
          patch={patch}
          disabled={disabled}
        />
        <Separator />
        <ConditionCard
          detail={detail}
          patch={patch}
          onDelete={() => deleteMut.mutate()}
          disabled={disabled}
        />
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Run the full frontend test + lint + build**

Run: `cd frontend && npx vitest run && npm run lint && npm run build`
Expected: PASS — all tests green, no lint errors, build succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/saves/PalDetail.tsx
git commit -m "feat(saves): compose full Pal editor in PalDetail container"
```

---

## Task 12: Full verification

- [ ] **Step 1: Backend suite**

Run: `pytest tests/ -v`
Expected: PASS (all).

- [ ] **Step 2: Frontend suite + type-check + build**

Run: `cd frontend && npx tsc --noEmit && npx vitest run && npm run build`
Expected: PASS.

- [ ] **Step 3: Manual smoke (optional, requires a real save + library installed)**

With the server stopped: select a Pal, change Level/IVs (computed stats update on refetch), add/remove a passive and an active skill, bump a suitability, toggle Favorite, then click **Save to Disk** and confirm a 200. Re-open the Pal and confirm the values persisted.

- [ ] **Step 4: Final commit (if any docs/cleanup remain)**

```bash
git add -A
git commit -m "chore(saves): finalize full Pal editor" || echo "nothing to commit"
```

---

## Self-Review Notes

- **Spec coverage:** Core stats → Task 7. Passives → Task 8. Active skills → Task 8. Suitabilities → Task 9. Cosmetic/meta (gender, friendship, flags) → Task 10 (IdentityCard). Condition (sanity, stomach, heal) → Task 10 (ConditionCard). Backend dispatcher → Task 1. 409/404 mapping + expanded get_pal → Task 2. Data endpoints → Task 3. Auto-apply + debounce → Tasks 5/7. Two-phase commit preserved (Save to Disk untouched in `SavesPage.tsx`).
- **Non-goals respected:** no species/CharacterID, skin, add/dupe/move pal. Delete Pal preserved.
- **Type consistency:** `PalDetailData`, `PassiveOption`, `ActiveSkillOption` defined in Task 4 and consumed unchanged in Tasks 7–11. `patch(key, value)` signature consistent across all editors. Backend keys (`add_PassiveSkillList`, `pop_PassiveSkillList`, `add_EquipWaza`, `pop_EquipWaza`, `add_MasteredWaza`, `pop_MasteredWaza`, `set_Suitability`, `heal_pal`, scalar setattrs) match between Task 1 dispatcher and the frontend `patch` calls in Tasks 7–10.
- **`heal_pal` key:** frontend sends `patch("heal_pal", true)`; backend matches `"heal_pal"` → `pal.heal_pal()`. (The legacy `HasWorkerSick`/`IsFaintedPal` keys also route to heal, kept for compatibility.)
