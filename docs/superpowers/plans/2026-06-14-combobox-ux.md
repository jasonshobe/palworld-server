# Combobox UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "text input + native `<select>` + Add button" pickers for species and skills with a single compact type-to-filter combobox (the shadcn Radix "Basic" example UX) plus an Add button.

**Architecture:** Build one reusable `Combobox` component in `components/ui/` on the already-installed `radix-ui` `Popover` (no new runtime dependency). It pairs a type-to-filter input + popover list with an explicit Add button. `SpeciesCombobox` becomes a thin adapter around it; the two skill editors use it directly and the old `SkillCombobox` is deleted.

**Tech Stack:** React 19, TypeScript, `radix-ui` (Popover), Tailwind v4, Vitest + Testing Library (jsdom).

---

## Background for the implementer

Read the spec first: `docs/superpowers/specs/2026-06-14-combobox-ux-design.md`.

Key facts about this codebase:
- All frontend commands run from `frontend/` (`cd frontend` first). Node 22 required.
- `radix-ui` is a single unified package: `import { Popover } from "radix-ui"` gives `Popover.Root`, `Popover.Anchor`, `Popover.Portal`, `Popover.Content`.
- `cn` lives at `@/lib/utils`. `Input` is at `@/components/ui/input`.
- Tests run with `npm run test` (vitest). `src/test-setup.ts` already stubs `ResizeObserver`, which Radix needs in jsdom.
- The two "add to a list" semantics already in place: skill editors map their domain options to `{ value, label }` and call `patch("add_…", value)`; the species picker calls `onCreate(internal_name)`.

The new `Combobox` behavior contract:
- Type in the input → opens the popover, filters options by case-insensitive substring on `label`.
- Arrow Up/Down move a highlight (the first filtered row is highlighted by default).
- Click a row **or** press Enter → selects the highlighted row: fills the input with its label, records it as the pending selection, closes the popover. (Click and Enter are identical.)
- Escape closes the popover.
- The Add button commits the pending selection via `onAdd`, falling back to the first filtered match when nothing was explicitly selected. Add is disabled when there are no filtered matches.
- After a successful Add, the input and selection reset.
- `disabled` disables both the input and the Add button.

---

## Task 1: Shared `Combobox` ui component

**Files:**
- Create: `frontend/src/components/ui/combobox.tsx`
- Test: `frontend/src/components/ui/combobox.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/ui/combobox.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"
import Combobox from "./combobox"

const options = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Bravo" },
  { value: "c", label: "Charlie" },
]

describe("Combobox", () => {
  it("filters options by query", () => {
    render(<Combobox options={options} onAdd={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText("Search…"), { target: { value: "bra" } })
    expect(screen.getByText("Bravo")).toBeInTheDocument()
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument()
  })

  it("commits the clicked option on Add", () => {
    const onAdd = vi.fn()
    render(<Combobox options={options} onAdd={onAdd} />)
    fireEvent.focus(screen.getByPlaceholderText("Search…"))
    fireEvent.click(screen.getByText("Charlie"))
    fireEvent.click(screen.getByText("Add"))
    expect(onAdd).toHaveBeenCalledWith("c")
  })

  it("selects the highlighted option with Enter, then Add commits it", () => {
    const onAdd = vi.fn()
    render(<Combobox options={options} onAdd={onAdd} />)
    const input = screen.getByPlaceholderText("Search…")
    fireEvent.focus(input)
    fireEvent.keyDown(input, { key: "ArrowDown" }) // move highlight from Alpha to Bravo
    fireEvent.keyDown(input, { key: "Enter" })
    fireEvent.click(screen.getByText("Add"))
    expect(onAdd).toHaveBeenCalledWith("b")
  })

  it("Add falls back to the first filtered match when nothing is selected", () => {
    const onAdd = vi.fn()
    render(<Combobox options={options} onAdd={onAdd} />)
    fireEvent.change(screen.getByPlaceholderText("Search…"), { target: { value: "char" } })
    fireEvent.click(screen.getByText("Add"))
    expect(onAdd).toHaveBeenCalledWith("c")
  })

  it("disables Add when no options match", () => {
    render(<Combobox options={options} onAdd={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText("Search…"), { target: { value: "zzz" } })
    expect(screen.getByText("Add")).toBeDisabled()
  })

  it("disables the input and Add when disabled", () => {
    render(<Combobox options={options} onAdd={vi.fn()} disabled />)
    expect(screen.getByPlaceholderText("Search…")).toBeDisabled()
    expect(screen.getByText("Add")).toBeDisabled()
  })

  it("uses a custom placeholder and add label", () => {
    render(<Combobox options={options} onAdd={vi.fn()} placeholder="Search species…" addLabel="Create" />)
    expect(screen.getByPlaceholderText("Search species…")).toBeInTheDocument()
    expect(screen.getByText("Create")).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npm run test -- src/components/ui/combobox.test.tsx`
Expected: FAIL — cannot resolve `./combobox` (module does not exist).

- [ ] **Step 3: Implement the component**

Create `frontend/src/components/ui/combobox.tsx`:

```tsx
import { useMemo, useState } from "react"
import { Popover } from "radix-ui"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export interface ComboOption {
  value: string
  label: string
}

interface ComboboxProps {
  options: ComboOption[]
  onAdd: (value: string) => void
  disabled?: boolean
  placeholder?: string
  addLabel?: string
}

export default function Combobox({
  options,
  onAdd,
  disabled,
  placeholder,
  addLabel = "Add",
}: ComboboxProps) {
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState("")
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)

  const filtered = useMemo(
    () =>
      query
        ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
        : options,
    [options, query],
  )

  const select = (option: ComboOption) => {
    setSelected(option.value)
    setQuery(option.label)
    setOpen(false)
  }

  const add = () => {
    const value = selected || filtered[0]?.value
    if (!value) return
    onAdd(value)
    setSelected("")
    setQuery("")
    setOpen(false)
  }

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setOpen(true)
      setHighlight((h) => Math.min(h + 1, filtered.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      const option = filtered[highlight]
      if (option) select(option)
    } else if (e.key === "Escape") {
      setOpen(false)
    }
  }

  return (
    <div className="flex gap-2 items-center">
      <Popover.Root open={open && !disabled} onOpenChange={setOpen}>
        <Popover.Anchor asChild>
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelected("")
              setHighlight(0)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onInputKeyDown}
            disabled={disabled}
            placeholder={placeholder ?? "Search…"}
            className="h-7 text-sm flex-1"
            role="combobox"
            aria-expanded={open}
          />
        </Popover.Anchor>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={4}
            onOpenAutoFocus={(e) => e.preventDefault()}
            className="z-50 max-h-60 w-[var(--radix-popover-trigger-width)] overflow-y-auto rounded-lg border border-border bg-popover p-1 text-sm shadow-md"
          >
            {filtered.length === 0 ? (
              <div className="px-2 py-1.5 text-muted-foreground">No matches</div>
            ) : (
              filtered.slice(0, 100).map((o, i) => (
                <div
                  key={o.value}
                  role="option"
                  aria-selected={i === highlight}
                  onClick={() => select(o)}
                  onMouseEnter={() => setHighlight(i)}
                  className={cn(
                    "cursor-pointer rounded px-2 py-1.5",
                    i === highlight && "bg-muted",
                  )}
                >
                  {o.label}
                </div>
              ))
            )}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <button
        type="button"
        onClick={add}
        disabled={disabled || filtered.length === 0}
        className="h-7 px-3 text-sm rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-40"
      >
        {addLabel}
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npm run test -- src/components/ui/combobox.test.tsx`
Expected: PASS (7 tests).

- [ ] **Step 5: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ui/combobox.tsx frontend/src/components/ui/combobox.test.tsx
git commit -m "feat: add reusable type-to-filter Combobox ui component"
```

---

## Task 2: Convert `SpeciesCombobox` to wrap `Combobox`

The public props (`options`, `onCreate`, `disabled`) stay identical, so `SavesPage` is untouched and the existing `SpeciesCombobox.test.tsx` keeps passing.

**Files:**
- Modify: `frontend/src/components/saves/SpeciesCombobox.tsx` (full rewrite)
- Test (existing, expected to keep passing): `frontend/src/components/saves/SpeciesCombobox.test.tsx`

- [ ] **Step 1: Rewrite the component**

Replace the entire contents of `frontend/src/components/saves/SpeciesCombobox.tsx` with:

```tsx
import Combobox from "@/components/ui/combobox"
import type { SpeciesOption } from "@/types"

interface SpeciesComboboxProps {
  options: SpeciesOption[]
  onCreate: (characterId: string) => void
  disabled?: boolean
}

// Type-to-filter create-control: pick a species, then Add creates a new pal of it.
export default function SpeciesCombobox({ options, onCreate, disabled }: SpeciesComboboxProps) {
  return (
    <Combobox
      options={options.map((o) => ({ value: o.internal_name, label: o.label }))}
      onAdd={onCreate}
      disabled={disabled}
      placeholder="Search species…"
    />
  )
}
```

- [ ] **Step 2: Run the existing test to verify it still passes**

Run: `cd frontend && npm run test -- src/components/saves/SpeciesCombobox.test.tsx`
Expected: PASS (3 tests — first-match Add, filter-then-Add, disabled).

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/saves/SpeciesCombobox.tsx
git commit -m "refactor: make SpeciesCombobox use the shared Combobox"
```

---

## Task 3: Move skill editors to `Combobox` and delete `SkillCombobox`

`SkillCombobox`'s props (`options`, `onAdd`, `disabled`, `placeholder`) are a subset of `Combobox`'s, so the call sites only need an import swap and a tag rename.

**Files:**
- Modify: `frontend/src/components/saves/editor/PassiveSkillsEditor.tsx:3,32` (import + tag)
- Modify: `frontend/src/components/saves/editor/ActiveSkillsEditor.tsx:3,33,48` (import + tags)
- Delete: `frontend/src/components/saves/editor/SkillCombobox.tsx`
- Test (existing, expected to keep passing): `frontend/src/components/saves/editor/PassiveSkillsEditor.test.tsx`

- [ ] **Step 1: Update `PassiveSkillsEditor` import**

In `frontend/src/components/saves/editor/PassiveSkillsEditor.tsx`, change line 3:

```tsx
import SkillCombobox from "./SkillCombobox"
```

to:

```tsx
import Combobox from "@/components/ui/combobox"
```

- [ ] **Step 2: Update `PassiveSkillsEditor` JSX tag**

In the same file, change the `<SkillCombobox …>` element (around line 32) to `<Combobox …>`:

```tsx
        <Combobox
          options={available.map((o) => ({ value: o.internal_name, label: `${o.label} (${o.rating})` }))}
          onAdd={(value) => patch("add_PassiveSkillList", value)}
          disabled={disabled}
          placeholder="Search passives…"
        />
```

- [ ] **Step 3: Update `ActiveSkillsEditor` import**

In `frontend/src/components/saves/editor/ActiveSkillsEditor.tsx`, change line 3:

```tsx
import SkillCombobox from "./SkillCombobox"
```

to:

```tsx
import Combobox from "@/components/ui/combobox"
```

- [ ] **Step 4: Update `ActiveSkillsEditor` JSX tags**

In the same file, rename both `<SkillCombobox …>` elements to `<Combobox …>` (equipped, ~line 33; mastered, ~line 48). The props are unchanged:

```tsx
          <Combobox options={comboOptions(equipped)}
            onAdd={(v) => patch("add_EquipWaza", v)} disabled={disabled}
            placeholder="Search active skills…" />
```

```tsx
        <Combobox options={comboOptions(mastered)}
          onAdd={(v) => patch("add_MasteredWaza", v)} disabled={disabled}
          placeholder="Search active skills…" />
```

- [ ] **Step 5: Delete the obsolete component**

```bash
git rm frontend/src/components/saves/editor/SkillCombobox.tsx
```

- [ ] **Step 6: Run the existing editor test to verify it still passes**

Run: `cd frontend && npm run test -- src/components/saves/editor/PassiveSkillsEditor.test.tsx`
Expected: PASS (3 tests — chip removal, Add → first match, hides control at 4 passives).

- [ ] **Step 7: Type-check (catches any lingering `SkillCombobox` reference)**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/saves/editor/PassiveSkillsEditor.tsx frontend/src/components/saves/editor/ActiveSkillsEditor.tsx
git commit -m "refactor: skill editors use shared Combobox; drop SkillCombobox"
```

---

## Task 4: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full frontend test suite**

Run: `cd frontend && npm run test -- --run`
Expected: all suites PASS.

- [ ] **Step 2: Lint**

Run: `cd frontend && npm run lint`
Expected: no errors.

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Production build**

Run: `cd frontend && npm run build`
Expected: build succeeds, output to `frontend/dist/`.

- [ ] **Step 5: Manual smoke test (optional but recommended)**

Run the dev server (`cd frontend && npm run dev`, with the backend on :8080). On the Saves tab with the server stopped, confirm for the species picker and each skill picker: typing filters the list in a popover, arrow keys + Enter or a click selects an item into the input, and the Add button adds the chip / creates the pal. Confirm all controls are disabled when the server is running.

---

## Self-review notes

- **Spec coverage:** shared `Combobox` (Task 1) ✓; SpeciesCombobox adapter, SavesPage untouched (Task 2) ✓; SkillCombobox removed and skill editors use `Combobox` directly (Task 3) ✓; behavior contract — type-to-filter, arrow highlight, click/Enter selects, Add commits with first-match fallback, reset after add, empty state, disabled (Task 1 component + tests) ✓; tests for combobox + carried-over existing tests (Tasks 1–3) ✓; lint/tsc/test all green (Task 4) ✓.
- **No new dependency:** built on `radix-ui` `Popover`, already installed.
- **Type consistency:** `ComboOption { value, label }` defined in Task 1 is the same shape the skill editors already produce and the species adapter maps to; `onAdd: (value: string) => void` matches both `onCreate` and `patch("add_…", value)` call sites.
