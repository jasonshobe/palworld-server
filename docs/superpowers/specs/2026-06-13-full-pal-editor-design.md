# Full Pal Editor — Design

**Date:** 2026-06-13
**Status:** Approved (pending written-spec review)

## Problem

The Saves tab currently lets the user edit only a selected Pal's nickname (plus a
limited Heal action). The original intent was to mirror the per-Pal editing surface of
[KrisCris/Palworld-Pal-Editor](https://github.com/KrisCris/Palworld-Pal-Editor). This
project extends the Saves tab so a selected Pal's core stats, skills, suitabilities, and
condition are all editable.

## Goals

Make the following Pal attribute groups editable from the Saves tab:

- **Core stats:** Level (1–60), Rank/stars (1–5), soul ranks (Rank_HP / Rank_Attack /
  Rank_Defence / Rank_CraftSpeed, 0–20), IVs (Talent_HP / Talent_Melee / Talent_Shot /
  Talent_Defense, 0–100).
- **Passive skills:** add/remove from the bundled list (max 4), ratings shown.
- **Active skills (waza):** add/remove Equipped (max 3) and Mastered, from the bundled list.
- **Work suitabilities:** set each of the 13 suitabilities to an absolute level (0–5).
- **Cosmetic/meta:** Gender, Friendship level, and the Lucky (IsRarePal) / Boss / Tower /
  Favorite flags.
- **Condition:** Sanity and Full Stomach values, plus a Heal action (cures sick/fainted).

## Non-Goals (explicitly out of scope)

- Adding, duplicating, or moving Pals between containers.
- Changing a Pal's species (`CharacterID`) — risky (can desync stats/skills).
- Editing `SkinName`.
- Delete Pal is unchanged (already exists).

## Constraints (existing, preserved)

- **Server must be stopped** to mutate saves — enforced by `_assert_stopped()` → HTTP 409.
- **Two-phase persistence:** field edits mutate the library's in-memory save immediately;
  the existing **Save to Disk** button calls `POST /api/saves/commit` to write the file.
- **Absolute imports only** (`backend.X`).
- **SaveManager lifecycle:** always go through `backend.main.save_manager` /
  `_get_save_manager()`; never cache locally.
- Tests mock `SaveManager` with `MagicMock` and never import the real
  `palworld-pal-editor` library.

## Interaction model

Auto-apply on change. Sliders/number inputs apply as the user adjusts (debounced ~400 ms);
skill chips and suitability steppers apply immediately on add/remove/change; switches apply
immediately. There are no per-field Save buttons. Nothing persists to disk until **Save to
Disk** is clicked. All inputs are disabled when the server is not stopped.

## Backend design

Chosen approach: **extend the existing generic PATCH dispatch** (rather than typed
sub-resource endpoints), because it is the smallest new surface, fits the auto-apply flow
(one operation per request), and mirrors the upstream reference's `match key:` dispatch
almost line-for-line, making correctness easy to verify.

### 1. `set_pal_attr` becomes a dispatcher

In [backend/services/save_manager.py](../../../backend/services/save_manager.py), after
resolving `pal` (unchanged player / `PAL_BASE_WORKER_BTN` working-pal logic), dispatch on
`key`, mirroring upstream `api/pal.py::patch_paldata`:

| key | action |
| --- | --- |
| `add_PassiveSkillList` | `pal.add_PassiveSkillList(value, True)` → bool |
| `pop_PassiveSkillList` | `pal.pop_PassiveSkillList(item=value)` |
| `add_EquipWaza` | `pal.add_EquipWaza(value, True)` → bool |
| `pop_EquipWaza` | `pal.pop_EquipWaza(item=value)` |
| `add_MasteredWaza` | `pal.add_MasteredWaza(value)` → bool |
| `pop_MasteredWaza` | `pal.pop_MasteredWaza(item=value)` |
| `set_Suitability` | `pal.set_WorkSuitability(value["name"], value["level"])` |
| `HasWorkerSick` / `IsFaintedPal` / `heal_pal` | `pal.heal_pal()` |
| _default_ | `setattr(pal, key, value)` |

The `setattr` fallback covers all scalar attributes: `NickName`, `Level`, `Rank`,
`Rank_HP/Attack/Defence/CraftSpeed`, `Talent_HP/Melee/Shot/Defense`, `Gender`,
`FriendshipLevel`, `IsRarePal`, `IsBOSS`, `IsTower`, `IsFavoritePal`, `SanityValue`,
`FullStomach`.

**Capacity/duplicate errors:** the `add_*` methods return `False` when the list is full, the
item is a duplicate, or the item is unknown. On `False`, raise a dedicated exception
(e.g. `PalEditError`) carrying a human-readable message. This is distinct from the
"not found" `ValueError` so the router can map them to different status codes.

### 2. Router changes

In [backend/routers/saves.py](../../../backend/routers/saves.py):

- `patch_pal`: keep `_assert_stopped()`. Map `PalEditError` → **HTTP 409** with its message;
  keep "player/pal not found" `ValueError` → **HTTP 404**.
- `get_pal`: extend the response with the additional fields the editor renders:
  `friendship_level` (`pal.FriendshipLevel`), `sanity` (`pal.SanityValue`),
  `full_stomach` (`pal.FullStomach`), `is_rare` (`pal.IsRarePal`), `is_boss`
  (`pal.IsBOSS`), `is_tower` (`pal.IsTower`), `is_favorite` (`pal.IsFavoritePal`), and
  `suitabilities` (`pal.WorkSuitabilities` → dict of name→effective level). Keep all
  existing fields.

### 3. New read-only data endpoints (dropdown sources)

Static reference data from `palworld_pal_editor.utils.DataProvider`, computed once and
cached at module level. These do **not** require the server stopped (read-only, no save
access). New Pydantic models in
[backend/models/saves.py](../../../backend/models/saves.py).

- `GET /api/saves/data/passives` → `[{ internal_name, label, rating }]`
  (from `DataProvider.get_sorted_passives()` + `get_passive_i18n()`).
- `GET /api/saves/data/active-skills` →
  `[{ internal_name, label, element, power, has_fruit, is_unique, invalid }]`
  (from `DataProvider.get_sorted_attacks()` + `get_attack_i18n()`).
- `GET /api/saves/data/suitabilities` → the 13 `PalSuitability` names (static list:
  EmitFlame, Watering, Seeding, GenerateElectricity, Handcraft, Collection, Deforest,
  Mining, OilExtraction, ProductMedicine, Cool, Transport, MonsterFarm).

## Frontend design

[PalDetail.tsx](../../../frontend/src/components/saves/PalDetail.tsx) becomes a thin
container: it fetches the pal detail and renders focused sub-components under
`frontend/src/components/saves/editor/`, each owning one attribute group:

- `IdentityCard` — nickname (text), gender (select), Favorite/Lucky/Boss/Tower flags
  (switches), friendship level (number).
- `StatsEditor` — Level (1–60), Rank/stars (1–5), soul ranks (0–20), IVs (0–100) as
  sliders with paired numeric input; read-only computed Max HP / Attack / Defense shown
  alongside.
- `PassiveSkillsEditor` — current passives as removable chips + an "add" combobox from the
  passives list; add disabled at 4.
- `ActiveSkillsEditor` — two sections, Equipped (max 3) and Mastered, each chips-with-remove
  + add-combobox from the active-skills list.
- `SuitabilitiesEditor` — the 13 suitabilities, each a 0–5 stepper showing current level.
- `ConditionCard` — Sanity and Full Stomach (numbers); Heal button (shown when sick/fainted);
  Delete Pal (unchanged behavior).

### Shared plumbing

- `usePalPatch(pal)` hook — wraps the existing `patchPal`, centralizes react-query
  invalidation of `["pal", id]` and `["pals"]`, and surfaces a backend 409 `detail` as a
  toast (e.g. "Max 4 passives reached").
- Debounce (~400 ms) on slider/number changes so auto-apply doesn't fire a PATCH per pixel;
  chips, steppers, and switches fire immediately.
- New api wrappers in [frontend/src/api/saves.ts](../../../frontend/src/api/saves.ts) for
  the three data endpoints; fetched via react-query with a long `staleTime` (static) and
  cached app-wide.
- All inputs honor the existing `disabled` (server-not-stopped) prop.
  [SavesPage.tsx](../../../frontend/src/pages/SavesPage.tsx) (player/pal nav, Save to Disk)
  is unchanged.

### Combobox

Passive/active-skill lists are long (hundreds of entries), so the "add" control is a
searchable combobox (filter by label). Use shadcn `command`/`popover` primitives if already
present; otherwise a filtered `<select>` + text filter is an acceptable fallback rather than
adding new dependencies.

## Testing

Following the existing MagicMock-based approach (the real library is never imported in
tests):

- **Router tests** ([tests/test_routers/test_saves.py](../../../tests/test_routers/test_saves.py)):
  - `get_pal` returns the new fields (suitabilities, friendship, sanity, flags).
  - PATCH dispatch wiring: special keys (`add_PassiveSkillList`, `pop_EquipWaza`,
    `set_Suitability`, `heal_pal`) and a scalar key (`Level`) call `set_pal_attr` with the
    right args.
  - 409 when a capacity/duplicate `PalEditError` is raised; 404 when "not found".
  - The three `data/*` endpoints return the expected list shape (DataProvider mocked).
- **Dispatcher unit tests** ([tests/test_save_manager.py](../../../tests/test_save_manager.py)):
  construct a `SaveManager` via `object.__new__` with a fake `_manager` + fake pal; assert
  each `key` routes to the correct pal method (`add_PassiveSkillList`, `set_WorkSuitability`,
  `heal_pal`, and the `setattr` fallback).
- **Frontend tests** (vitest, api mocked): a slider change fires a debounced PATCH with the
  right key/value; removing a passive chip calls PATCH `pop_PassiveSkillList`; adding when
  full surfaces the 409 toast; inputs disabled when the server is not stopped.

## Edge cases / decisions

- **409 reuse:** "edit while running" and "skill list full" both return 409; the UI
  distinguishes by the response `detail` text. Both are legitimately conflicts.
- **Suitability semantics:** upstream `set_WorkSuitability` treats the value as the desired
  *absolute* level and internally stores only the delta above the species base. The UI sends
  `{name, level}` (absolute 0–5); the library does the math. The UI displays
  `pal.WorkSuitabilities` (effective levels) as the source of truth after each patch.
- **Computed stats** (Max HP / Attack / Defense) are read-only and refresh from the
  re-fetched detail after any stat patch (the library recomputes them; e.g. setting Level
  also resets Exp/HP and re-learns attacks).
