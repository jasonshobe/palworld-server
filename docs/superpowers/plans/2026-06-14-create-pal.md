# Create a New Pal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a control to the Saves tab that creates a new pal of a user-chosen species (level 1, with the species' correct initial skill equipped) in the selected player's pal box.

**Architecture:** Reuse the PPE library's `add_pal(player_uid)` (which yields a blank Lamball), then set `CharacterID` to retarget the species — the setter auto-learns the level-1 skill and strips the previous species' unique mastered skills — and call `equip_all_pal_attacks()` to replace the leftover equipped Lamball roll with the correct level-1 skill. Expose this through a new `POST /api/saves/pals` endpoint and a species-list data endpoint, with an inline search+select+Add control in the Pals card header.

**Tech Stack:** Python/FastAPI + pytest (backend); React/TypeScript/Vite + vitest/testing-library (frontend); palworld-pal-editor library.

---

## File Structure

**Backend**
- Modify `backend/services/save_manager.py` — add `create_pal(player_uid, character_id)`.
- Modify `backend/services/pal_data.py` — add `get_species()`.
- Modify `backend/models/saves.py` — add `SpeciesOption`, `PalCreate`.
- Modify `backend/routers/saves.py` — add `GET /data/species` and `POST /pals`.
- Modify `tests/test_save_manager.py` — `create_pal` unit tests.
- Modify `tests/test_routers/test_saves.py` — species + create route tests.

**Frontend**
- Modify `frontend/src/types/index.ts` — add `SpeciesOption`.
- Modify `frontend/src/api/saves.ts` — add `getSpecies`, `createPal`.
- Create `frontend/src/components/saves/SpeciesCombobox.tsx` — the control.
- Create `frontend/src/components/saves/SpeciesCombobox.test.tsx` — component tests.
- Modify `frontend/src/pages/SavesPage.tsx` — render combobox, wire mutation.
- Modify `frontend/src/pages/SavesPage.test.tsx` — extend api mock + flow test.

---

### Task 1: `SaveManager.create_pal`

**Files:**
- Modify: `backend/services/save_manager.py`
- Test: `tests/test_save_manager.py`

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_save_manager.py`:

```python
def _sm_for_create(add_pal_result):
    """SaveManager bypassing __init__, wired to a mock library manager."""
    sm = SaveManager.__new__(SaveManager)
    manager = MagicMock()
    manager.get_player.return_value = MagicMock()
    manager.add_pal.return_value = add_pal_result
    sm._manager = manager
    return sm, manager


def test_create_pal_sets_species_equips_skill_and_clears_name():
    new_pal = MagicMock()
    sm, manager = _sm_for_create(new_pal)
    result = sm.create_pal("uid-1", "Foxparks")
    manager.add_pal.assert_called_once_with("uid-1")
    assert new_pal.CharacterID == "Foxparks"
    new_pal.equip_all_pal_attacks.assert_called_once()
    assert new_pal.NickName is None
    assert result is new_pal


def test_create_pal_full_palbox_raises_pal_edit_error():
    sm, _ = _sm_for_create(None)
    with pytest.raises(PalEditError, match="full"):
        sm.create_pal("uid-1", "Foxparks")


def test_create_pal_base_worker_raises_pal_edit_error():
    sm = SaveManager.__new__(SaveManager)
    sm._manager = MagicMock()
    with pytest.raises(PalEditError):
        sm.create_pal("PAL_BASE_WORKER_BTN", "Foxparks")


def test_create_pal_unknown_player_raises_value_error():
    sm = SaveManager.__new__(SaveManager)
    manager = MagicMock()
    manager.get_player.return_value = None
    sm._manager = manager
    with pytest.raises(ValueError, match="Player"):
        sm.create_pal("uid-x", "Foxparks")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_save_manager.py -k create_pal -v`
Expected: FAIL with `AttributeError: 'SaveManager' object has no attribute 'create_pal'`

- [ ] **Step 3: Implement `create_pal`**

In `backend/services/save_manager.py`, add this method to `SaveManager` immediately after `duplicate_pal` (before `set_pal_attr`):

```python
    def create_pal(self, player_uid: str, character_id: str) -> Any:
        if player_uid == "PAL_BASE_WORKER_BTN":
            raise PalEditError("Base Worker pals cannot be created")
        player = self._manager.get_player(player_uid)
        if player is None:
            raise ValueError(f"Player {player_uid} not found")
        # add_pal with no template yields a blank Lamball (SheepBall) with the
        # Lamball roll equipped. Retarget the species via the CharacterID setter,
        # which auto-learns the new species' level-1 mastered skill and strips
        # the previous species' unique mastered skills. equip_all_pal_attacks
        # then replaces the leftover equipped Lamball roll with the level-1 skill.
        new_pal = self._manager.add_pal(player_uid)
        if new_pal is None:
            raise PalEditError("Pal box is full")
        new_pal.CharacterID = character_id
        new_pal.equip_all_pal_attacks()
        new_pal.NickName = None
        return new_pal
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_save_manager.py -k create_pal -v`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/services/save_manager.py tests/test_save_manager.py
git commit -m "feat: SaveManager.create_pal creates a pal of a chosen species"
```

---

### Task 2: `pal_data.get_species`

**Files:**
- Modify: `backend/services/pal_data.py`
- Test: `tests/test_save_manager.py` (co-locate with other service unit tests)

- [ ] **Step 1: Write the failing test**

Append to `tests/test_save_manager.py`:

```python
def test_get_species_excludes_humans_and_invalid_and_disambiguates():
    from backend.services import pal_data
    fake = MagicMock()
    fake.get_sorted_pals.return_value = [
        {"InternalName": "Foxparks"},
        {"InternalName": "NPC_Vixen"},
        {"InternalName": "Hexolite"},
        {"InternalName": "Anubis"},
        {"InternalName": "Boss_Anubis"},
    ]
    fake.is_pal_human.side_effect = lambda n: n == "NPC_Vixen"
    fake.is_pal_invalid.side_effect = lambda n: n == "Hexolite"
    i18n = {"Foxparks": "Foxparks", "Anubis": "Anubis", "Boss_Anubis": "Anubis"}
    fake.get_pal_i18n.side_effect = lambda n: i18n.get(n)

    pal_data.get_species.cache_clear()
    with patch.object(pal_data, "_provider", lambda: fake):
        result = pal_data.get_species()
    pal_data.get_species.cache_clear()

    names = [r["internal_name"] for r in result]
    assert names == ["Foxparks", "Anubis", "Boss_Anubis"]
    labels = {r["internal_name"]: r["label"] for r in result}
    # Unique display names are kept as-is; colliding ones get the internal name.
    assert labels["Foxparks"] == "Foxparks"
    assert labels["Anubis"] == "Anubis (Anubis)"
    assert labels["Boss_Anubis"] == "Anubis (Boss_Anubis)"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_save_manager.py -k get_species -v`
Expected: FAIL with `AttributeError: module 'backend.services.pal_data' has no attribute 'get_species'`

- [ ] **Step 3: Implement `get_species`**

In `backend/services/pal_data.py`, add after `get_active_skills`:

```python
@lru_cache(maxsize=1)
def get_species() -> list[dict]:
    dp = _provider()
    entries = []
    for item in dp.get_sorted_pals():
        name = item["InternalName"]
        if dp.is_pal_human(name) or dp.is_pal_invalid(name):
            continue
        entries.append({"internal_name": name, "label": dp.get_pal_i18n(name) or name})
    # Disambiguate species that share a display name (e.g. a pal and its boss
    # variant) by appending the internal name, so the picker has unique labels.
    counts: dict[str, int] = {}
    for e in entries:
        counts[e["label"]] = counts.get(e["label"], 0) + 1
    for e in entries:
        if counts[e["label"]] > 1:
            e["label"] = f"{e['label']} ({e['internal_name']})"
    return entries
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_save_manager.py -k get_species -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/services/pal_data.py tests/test_save_manager.py
git commit -m "feat: pal_data.get_species lists non-human, valid species"
```

---

### Task 3: Models + routes (`GET /data/species`, `POST /pals`)

**Files:**
- Modify: `backend/models/saves.py`
- Modify: `backend/routers/saves.py`
- Test: `tests/test_routers/test_saves.py`

- [ ] **Step 1: Write the failing route tests**

Append to `tests/test_routers/test_saves.py` (reuses the existing `_make_new_pal` helper and the autouse `mock_save_manager` fixture):

```python
def test_data_species_returns_list(client, monkeypatch):
    from backend.services import pal_data
    monkeypatch.setattr(
        pal_data, "get_species",
        lambda: [{"internal_name": "Foxparks", "label": "Foxparks"}],
    )
    resp = client.get("/api/saves/data/species")
    assert resp.status_code == 200
    assert resp.json() == [{"internal_name": "Foxparks", "label": "Foxparks"}]


def test_create_pal_returns_new_summary(client, mock_save_manager):
    mock_save_manager.create_pal.return_value = _make_new_pal()
    resp = client.post("/api/saves/pals", json={"player_uid": "uid-1", "character_id": "Foxparks"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["instance_id"] == "pal-2"
    assert data["player_uid"] == "uid-1"
    mock_save_manager.create_pal.assert_called_once_with("uid-1", "Foxparks")


def test_create_pal_full_palbox_returns_409(client, mock_save_manager):
    from backend.services.save_manager import PalEditError
    mock_save_manager.create_pal.side_effect = PalEditError("Pal box is full")
    resp = client.post("/api/saves/pals", json={"player_uid": "uid-1", "character_id": "Foxparks"})
    assert resp.status_code == 409
    assert "full" in resp.json()["detail"].lower()


def test_create_pal_409_when_server_running(client):
    import backend.main as main_mod
    m = MagicMock()
    m.state = ServerState.RUNNING
    main_mod.server_manager = m
    resp = client.post("/api/saves/pals", json={"player_uid": "uid-1", "character_id": "Foxparks"})
    assert resp.status_code == 409
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_routers/test_saves.py -k "species or create_pal" -v`
Expected: FAIL — `data_species` returns 404 (route missing) / `create_pal` returns 404 or 405 (route missing)

- [ ] **Step 3: Add the models**

In `backend/models/saves.py`, add after `PalDuplicate`:

```python
class PalCreate(BaseModel):
    player_uid: str
    character_id: str


class SpeciesOption(BaseModel):
    internal_name: str
    label: str
```

- [ ] **Step 4: Add the routes**

In `backend/routers/saves.py`, update the model import block to include the new models:

```python
from backend.models.saves import (
    PlayersResponse,
    PlayerSummary,
    PalSummary,
    PalPatch,
    PalDuplicate,
    PalCreate,
    PassiveOption,
    ActiveSkillOption,
    SpeciesOption,
)
```

Add the species data route after `data_active_skills`:

```python
@router.get("/data/species", response_model=list[SpeciesOption])
def data_species():
    return pal_data.get_species()
```

Add the create route immediately after `get_pals` (so `POST /pals` sits with the other `/pals` handlers and before the `/pals/{instance_id}` routes):

```python
@router.post("/pals", response_model=PalSummary)
def create_pal(body: PalCreate):
    _assert_stopped()
    sm = _get_save_manager()
    from backend.services.save_manager import PalEditError
    try:
        pal = sm.create_pal(body.player_uid, body.character_id)
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

- [ ] **Step 5: Run tests to verify they pass**

Run: `pytest tests/test_routers/test_saves.py -k "species or create_pal" -v`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add backend/models/saves.py backend/routers/saves.py tests/test_routers/test_saves.py
git commit -m "feat: add GET /saves/data/species and POST /saves/pals endpoints"
```

---

### Task 4: Frontend types + API wrappers

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/api/saves.ts`

- [ ] **Step 1: Add the type**

In `frontend/src/types/index.ts`, add after the `ActiveSkillOption` interface:

```typescript
export interface SpeciesOption {
  internal_name: string
  label: string
}
```

- [ ] **Step 2: Add the API wrappers**

In `frontend/src/api/saves.ts`, update the type import to include `SpeciesOption`:

```typescript
import type { PlayersResponse, PalSummary, PalDetailData, PassiveOption, ActiveSkillOption, SpeciesOption } from "@/types"
```

Add the `createPal` wrapper after `duplicatePal`:

```typescript
export const createPal = (playerUid: string, characterId: string) =>
  apiFetch<PalSummary>(`/saves/pals`, {
    method: "POST",
    body: JSON.stringify({ player_uid: playerUid, character_id: characterId }),
  })
```

Add the `getSpecies` wrapper after `getSuitabilities`:

```typescript
export const getSpecies = () => apiFetch<SpeciesOption[]>("/saves/data/species")
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/api/saves.ts
git commit -m "feat: frontend SpeciesOption type and species/create-pal API wrappers"
```

---

### Task 5: `SpeciesCombobox` component

**Files:**
- Create: `frontend/src/components/saves/SpeciesCombobox.tsx`
- Test: `frontend/src/components/saves/SpeciesCombobox.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/saves/SpeciesCombobox.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"
import SpeciesCombobox from "./SpeciesCombobox"
import type { SpeciesOption } from "@/types"

const options: SpeciesOption[] = [
  { internal_name: "Foxparks", label: "Foxparks" },
  { internal_name: "Lamball", label: "Lamball" },
]

describe("SpeciesCombobox", () => {
  it("creates the first filtered species on Add", () => {
    const onCreate = vi.fn()
    render(<SpeciesCombobox options={options} onCreate={onCreate} disabled={false} />)
    fireEvent.click(screen.getByText("Add"))
    expect(onCreate).toHaveBeenCalledWith("Foxparks")
  })

  it("filters by search text before creating", () => {
    const onCreate = vi.fn()
    render(<SpeciesCombobox options={options} onCreate={onCreate} disabled={false} />)
    fireEvent.change(screen.getByPlaceholderText("Search species…"), {
      target: { value: "lam" },
    })
    fireEvent.click(screen.getByText("Add"))
    expect(onCreate).toHaveBeenCalledWith("Lamball")
  })

  it("disables Add when disabled", () => {
    render(<SpeciesCombobox options={options} onCreate={vi.fn()} disabled={true} />)
    expect(screen.getByText("Add")).toBeDisabled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- SpeciesCombobox`
Expected: FAIL — cannot resolve `./SpeciesCombobox`

- [ ] **Step 3: Implement the component**

Create `frontend/src/components/saves/SpeciesCombobox.tsx` (modeled on `editor/SkillCombobox.tsx`):

```tsx
import { useState } from "react"
import { Input } from "@/components/ui/input"
import type { SpeciesOption } from "@/types"

interface SpeciesComboboxProps {
  options: SpeciesOption[]
  onCreate: (characterId: string) => void
  disabled?: boolean
}

// Searchable create-control: a text filter narrowing a native select, plus an
// Add action that creates a new pal of the chosen species.
export default function SpeciesCombobox({ options, onCreate, disabled }: SpeciesComboboxProps) {
  const [filter, setFilter] = useState("")
  const [selected, setSelected] = useState("")

  const filtered = filter
    ? options.filter((o) => o.label.toLowerCase().includes(filter.toLowerCase()))
    : options

  const add = () => {
    const value = selected || filtered[0]?.internal_name
    if (value) onCreate(value)
    setFilter("")
    setSelected("")
  }

  return (
    <div className="flex gap-2 items-center">
      <Input
        value={filter}
        onChange={(e) => { setFilter(e.target.value); setSelected("") }}
        disabled={disabled}
        placeholder="Search species…"
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
          <option key={o.internal_name} value={o.internal_name}>{o.label}</option>
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

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm run test -- SpeciesCombobox`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/saves/SpeciesCombobox.tsx frontend/src/components/saves/SpeciesCombobox.test.tsx
git commit -m "feat: SpeciesCombobox search+select+Add control"
```

---

### Task 6: Wire `SpeciesCombobox` into `SavesPage`

**Files:**
- Modify: `frontend/src/pages/SavesPage.tsx`
- Test: `frontend/src/pages/SavesPage.test.tsx`

- [ ] **Step 1: Extend the existing api mock and write the failing flow test**

In `frontend/src/pages/SavesPage.test.tsx`, replace the `vi.mock("@/api/saves", ...)` block with one that also mocks the new functions, and stub `PalDetail` so selecting the new pal doesn't pull in the full editor:

```tsx
vi.mock("@/api/saves", () => ({
  getPlayers: vi.fn(() => Promise.resolve({ players: [], has_working_pals: false })),
  getPals: vi.fn(() => Promise.resolve([])),
  getSpecies: vi.fn(() => Promise.resolve([])),
  createPal: vi.fn(),
  commitSave: vi.fn(),
}))

vi.mock("@/components/saves/PalDetail", () => ({
  default: ({ pal }: { pal: { nickname: string; display_name: string | null } }) => (
    <div>Detail: {pal.nickname || pal.display_name}</div>
  ),
}))
```

Update the import line at the top to pull in the functions the flow test drives:

```tsx
import { commitSave, getPlayers, getPals, getSpecies, createPal } from "@/api/saves"
```

Add this test inside the file (new `describe` block):

```tsx
describe("SavesPage create pal", () => {
  beforeEach(() => vi.clearAllMocks())

  it("creates a pal, selects it, and shows a toast", async () => {
    vi.mocked(getPlayers).mockResolvedValue({
      players: [{ uid: "uid-1", nickname: "Player1", level: 10 }],
      has_working_pals: false,
    })
    vi.mocked(getPals).mockResolvedValue([])
    vi.mocked(getSpecies).mockResolvedValue([{ internal_name: "Foxparks", label: "Foxparks" }])
    vi.mocked(createPal).mockResolvedValue({
      instance_id: "pal-new",
      player_uid: "uid-1",
      display_name: "Foxparks",
      nickname: "",
      level: 1,
      gender: "Female",
      is_unref: false,
      in_owner_palbox: true,
    })
    renderPage()

    // Wait until the species option has loaded so the control is enabled.
    await screen.findByRole("option", { name: "Foxparks" })
    fireEvent.click(screen.getByText("Add"))

    expect(createPal).toHaveBeenCalledWith("uid-1", "Foxparks")
    expect(await screen.findByText(/pal created/i)).toBeInTheDocument()
    expect(await screen.findByText(/Detail: Foxparks/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- SavesPage`
Expected: FAIL — no "Foxparks" option / `createPal` not called (combobox not yet rendered)

- [ ] **Step 3: Wire the page**

In `frontend/src/pages/SavesPage.tsx`:

Update the api import:

```tsx
import { getPlayers, getPals, getSpecies, createPal, commitSave } from "@/api/saves"
```

Add the `SpeciesCombobox` import next to the other component imports:

```tsx
import SpeciesCombobox from "@/components/saves/SpeciesCombobox"
```

After the `pals` query, add the species query and create mutation:

```tsx
  const { data: species = [] } = useQuery({ queryKey: ["species"], queryFn: getSpecies })

  const createMut = useMutation({
    mutationFn: (characterId: string) => createPal(effectivePlayer!, characterId),
    onSuccess: (newPal) => {
      qc.invalidateQueries({ queryKey: ["pals"] })
      setSelectedPal(newPal)
      toast.success("Pal created")
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Failed to create pal")
    },
  })
```

Replace the Pals `CardHeader` with one that includes the combobox:

```tsx
          <CardHeader className="space-y-2">
            <CardTitle className="text-sm">Pals ({pals.length})</CardTitle>
            <SpeciesCombobox
              options={species}
              onCreate={(id) => createMut.mutate(id)}
              disabled={
                disabled ||
                !effectivePlayer ||
                effectivePlayer === "PAL_BASE_WORKER_BTN" ||
                createMut.isPending
              }
            />
          </CardHeader>
```

- [ ] **Step 4: Run the SavesPage tests to verify they pass**

Run: `cd frontend && npm run test -- SavesPage`
Expected: PASS (existing commit-feedback tests + the new create test)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/SavesPage.tsx frontend/src/pages/SavesPage.test.tsx
git commit -m "feat: create-pal control in the Saves tab Pals header"
```

---

### Task 7: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full backend test suite**

Run: `pytest tests/ -v`
Expected: PASS (all tests, including the new create_pal / get_species / route tests)

- [ ] **Step 2: Run the full frontend test suite**

Run: `cd frontend && npm run test`
Expected: PASS (all suites)

- [ ] **Step 3: Type-check and lint the frontend**

Run: `cd frontend && npx tsc --noEmit && npm run lint`
Expected: no errors

- [ ] **Step 4: If anything failed, fix it and re-run before continuing.**

Only proceed past this step once Steps 1–3 all pass with clean output.

---

## Notes for the implementer

- **Why `add_pal(player_uid)` then set `CharacterID`:** the library hardcodes a blank pal to Lamball (`SheepBall`) with the Lamball roll equipped. Setting `CharacterID` runs the library's `learn_attacks()` (adds the new species' level-1 mastered skill) and `remove_unique_attacks()` (strips Lamball's unique from *mastered* skills) automatically — but it does **not** clear `EquipWaza`, so the Lamball roll stays *equipped*. `equip_all_pal_attacks()` clears `EquipWaza` and equips the level-appropriate skills (just the initial skill at level 1). This is the codified version of the manual "remove Roly Poly, add the right skill" workflow.
- **Base Workers:** both the backend (`create_pal` rejects `PAL_BASE_WORKER_BTN`) and the frontend (combobox `disabled`) prevent creating base-worker pals, which have no player owner.
- **Absolute imports only** in backend code (`from backend.X import ...`).
- **Never cache `save_manager`** — the route goes through `_get_save_manager()`, which is already in place.
```
