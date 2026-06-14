# Combobox UX redesign

## Problem

The save editor uses a clunky "search + native `<select>` + Add button" trio for
picking species and skills. The user types into a text input to filter a native
`<select>`, picks an option, then clicks Add. Two separate controls side by side
is wide and unnatural.

We want the compact UX of the shadcn Radix Combobox "Basic" example
(https://ui.shadcn.com/docs/components/radix/combobox): a single input that you
type into to filter, with a popover list beneath it that you pick from.

Affected call sites (all "pick one to add to a list" controls):

- Species picker — `SavesPage` (creates a new pal).
- Passive skills — `PassiveSkillsEditor`.
- Equipped + mastered active skills — `ActiveSkillsEditor`.

## Goals

- Replace the input + native `<select>` pair with a single type-to-filter
  combobox matching the Basic-example look and feel.
- Keep an explicit **Add** button (these add to a collection / create a pal —
  there is no single persistent selection).
- One shared, reusable component; existing call sites change as little as
  possible.

## Non-goals

- No multi-select chips inside the combobox, clear button, or selected-value
  checkmark (these are add-to-list controls, not single-select bindings).
- No change to the chips/list rendering, the create-pal flow, or the
  server-stopped gating.
- No unrelated refactoring of the saves editor.

## Implementation note

The exact underlying component is flexible (the user's stated preference). The
installed `radix-ui` (1.4.3) ships `Popover` but no `Combobox` primitive. Use the
shadcn Radix Combobox component if it drops into `components/ui/` cleanly;
otherwise build a faithful equivalent on the already-installed `radix-ui`
`Popover`. Either way the UX contract below is what matters — no new runtime
dependency should be required to achieve it.

## Architecture

A shared primitive `frontend/src/components/ui/combobox.tsx`:

```ts
interface ComboOption { value: string; label: string }

interface ComboboxProps {
  options: ComboOption[]
  onAdd: (value: string) => void
  disabled?: boolean
  placeholder?: string
  addLabel?: string        // defaults to "Add"
}
```

Call-site changes:

- `SpeciesCombobox.tsx` stays as a thin adapter: maps `SpeciesOption` →
  `{ value: internal_name, label }` and `onCreate` → `onAdd`, renders `Combobox`.
  Its public props (`options`, `onCreate`, `disabled`) are unchanged, so
  `SavesPage` is untouched.
- `SkillCombobox.tsx` is removed. `PassiveSkillsEditor` and `ActiveSkillsEditor`
  already build `{ value, label }` option arrays, so they import and render
  `Combobox` directly with the same `onAdd`/`placeholder` props they pass today.

## Behavior

State: a `query` string (the input text / filter) and a `selected` value (the
pending, not-yet-committed choice), mirroring today's two-state model.

- **Type** in the input → opens the popover and filters `options` by
  case-insensitive substring match on `label`. Typing clears any pending
  `selected`.
- **Arrow Up/Down** move the highlight within the filtered list.
- **Click a row** or press **Enter** → selects the highlighted item: sets
  `selected` to its value, sets `query` to its label, and closes the popover.
  Click and Enter are identical actions.
- **Escape** closes the popover without changing the selection.
- **Add button** commits via `onAdd(value)` where `value` is `selected`, falling
  back to the first filtered match when nothing was explicitly selected (preserves
  today's "type then Add" convenience). Add is disabled when there are no
  filtered matches.
- After a successful Add, `query` and `selected` reset to empty. In the skill
  editors the just-added item drops out of `options` via the existing exclude
  logic, so the list naturally shrinks.
- **Empty state**: when the filter matches nothing, the popover shows a
  "No matches" row and Add is disabled.
- **Disabled**: both the input and the Add button are disabled; the popover does
  not open.

Layout: the input is `flex-1` with the Add button beside it, keeping the control
compact and consistent with the existing `h-7 text-sm` sizing.

## Testing

New `frontend/src/components/ui/combobox.test.tsx`:

- Typing filters the visible rows.
- Clicking a row selects it; Add then commits that value.
- Enter on the highlighted row selects it; Add commits it.
- Add with text typed but no row chosen commits the first filtered match.
- Add is disabled when the filter matches nothing.
- `disabled` disables the input and Add button.

Update existing tests for the popover (no native `<select>`):

- `SpeciesCombobox.test.tsx` — existing assertions (placeholder "Search species…",
  filter by "lam" then Add → Lamball, Add with empty filter → Foxparks, disabled
  Add) carry over against the new control; adjust queries as needed.
- `PassiveSkillsEditor.test.tsx` — chip removal and "Add → first match" carry
  over; the "hides add control at 4 passives" assertion is unchanged.

All of `npm run test`, `npm run lint`, and `npx tsc --noEmit` must pass.
