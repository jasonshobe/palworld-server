# Create a New Pal — Design

**Date:** 2026-06-14
**Status:** Approved

## Overview

Add a **create-a-pal** control to the Saves tab. The user picks a species and
clicks Add; a new pal of that species is created in the currently-selected
player's pal box, at level 1, with the species' correct level-1 active skill
both learned and equipped. Like every other save edit, the new pal is held in
memory until "Save to Disk" is clicked.

This improves on the underlying library's behavior, which always creates a
Lamball (`SheepBall`) with Lamball's unique "Roly Poly" skill equipped. The
typical manual workaround — create, change species, remove Roly Poly, add the
right skill — is collapsed into a single action.

## Decisions

- **UI:** an inline control in the **Pals card header**, reusing the existing
  `SkillCombobox` idiom (search input + native `<select>` + Add button). No new
  UI dependency (the app has no Dialog component).
- **Species scope:** all pal species and their variants (bosses, tower/raid),
  **excluding** humans/NPCs (`is_pal_human`) and `Invalid`-flagged entries.
- **Base Worker pals:** the control is **disabled** when the Base Workers tab is
  selected (and when there is no player), because the library's `add_pal`
  requires a real player owner — same constraint as duplicate.
- **New pal defaults:** level 1; gender Female (the library default); **no
  nickname** (cleared from the library's `"!!!NEW PAL!!!"` placeholder) so the
  list shows the species display name. The level-1 initial skill is both
  *learned* (MasteredWaza) and *equipped* (EquipWaza).
- **After a successful create:** refresh the list (the new pal appears), select
  the new pal in the detail pane, and show a success toast.
- **No confirmation dialog:** creation is non-destructive (unlike Delete).

## Library mechanism

`add_pal(player_uid)` with no template returns a blank pal whose
`PalObjects.PalSaveParameter` default is hardcoded to `CharacterID = "SheepBall"`
with `EquipWaza = ["Unique_SheepBall_Roll"]` and an empty `MasteredWaza`. This
is the source of the always-Lamball behavior.

The lever is the `CharacterID` setter (`core/pal_entity.py`). Setting it to a new
species runs, automatically:

- `remove_unique_attacks()` — strips the previous species' unique skills from
  **MasteredWaza** (not EquipWaza).
- `learn_attacks()` — adds the new species' level-≤`Level` attacks to
  MasteredWaza via `DataProvider.get_attacks_to_learn(DataAccessKey, level)`. At
  level 1 this is the species' initial skill(s).
- suitability/gender normalization for the new species.

**Gap:** the setter does **not** touch `EquipWaza`, so the blank pal's leftover
`Unique_SheepBall_Roll` remains *equipped*. `equip_all_pal_attacks()` closes
this: it clears `EquipWaza` and equips the level-appropriate attacks (the level-1
initial skill for a new pal). This is the codified "remove Roly Poly, add the
right skill" step.

Species enumeration uses `DataProvider.get_sorted_pals()`, filtered with
`is_pal_human` / `is_pal_invalid`.

## Backend

### `SaveManager.create_pal(player_uid, character_id)`
`backend/services/save_manager.py`

- Reject `player_uid == "PAL_BASE_WORKER_BTN"` — raise `PalEditError`.
- Look up the player; raise `ValueError` if missing (→ 404).
- `new_pal = self._manager.add_pal(player_uid)`; `None` → raise
  `PalEditError("Pal box is full")` (→ 409).
- `new_pal.CharacterID = character_id` (triggers learn/cleanup as above).
- `new_pal.equip_all_pal_attacks()` (drops the Lamball roll, equips level-1 skill).
- `new_pal.NickName = None` (clear the `"!!!NEW PAL!!!"` placeholder).
- Return the new pal entity.

### `pal_data.get_species()`
`backend/services/pal_data.py`

- From `DataProvider.get_sorted_pals()`, drop entries where `is_pal_human` or
  `is_pal_invalid`.
- Emit `{internal_name, label}` where `label` is the i18n display name, with a
  short variant tag (e.g. boss/tower) appended when the bare name would be
  ambiguous between variants.
- `@lru_cache(maxsize=1)`, matching the other data getters.

### Endpoints & models
`backend/routers/saves.py`, `backend/models/saves.py`

- `GET /api/saves/data/species` → `list[SpeciesOption]` (`internal_name`,
  `label`).
- `POST /api/saves/pals` with body `PalCreate { player_uid, character_id }`:
  - `_assert_stopped()` — 409 if the server is not stopped.
  - `_get_save_manager()`.
  - `create_pal(player_uid, character_id)`.
  - `PalEditError` → 409; `ValueError` → 404 (same mapping as duplicate).
  - Return a `PalSummary` for the new pal (same shape `get_pals` produces).

## Frontend

### API & types
`frontend/src/api/saves.ts`, `frontend/src/types`

- `getSpecies()` → `GET /saves/data/species`.
- `createPal(playerUid, characterId)` → `POST /saves/pals`.
- New `SpeciesOption` type (`internal_name`, `label`).

### `SpeciesCombobox`
`frontend/src/components/saves/` (modeled on `editor/SkillCombobox.tsx`)

- Search input + native `<select>` (filtered, capped) + Add button.
- Loads species via a `["species"]` query.
- `disabled` when the server is not stopped, no player is selected, or the Base
  Workers tab is active.

### `SavesPage`
`frontend/src/pages/SavesPage.tsx`

- Render `SpeciesCombobox` in the Pals `CardHeader`, alongside the `Pals (N)`
  title.
- `useMutation(createPal)`: on success invalidate `["pals"]`, select the new pal
  (set `selectedPal` from the returned `PalSummary`), and toast success; on
  error toast the message.

## Testing

### Backend
- `create_pal` retargets the species, learns and **equips** the correct level-1
  skill, drops `Unique_SheepBall_Roll`, and clears the placeholder nickname.
- `create_pal` → `PalEditError` when the pal box is full (`add_pal` returns
  `None`).
- `create_pal` rejects `PAL_BASE_WORKER_BTN`.
- `get_species` excludes humans and Invalid entries.
- Router: `POST /api/saves/pals` returns 200 with a `PalSummary`; 409 when the
  server is running; 409 when the pal box is full.

### Frontend
- `SpeciesCombobox` renders, filters by search text, fires `createPal` on Add,
  and respects its disabled states.
- `SavesPage` create→select flow: after a successful create the new pal becomes
  selected and the list refreshes.

## Out of scope

- Choosing level, gender, IVs, or extra skills at creation time (edit the pal
  after creating it).
- Creating Base Worker pals.
- Bulk creation.
