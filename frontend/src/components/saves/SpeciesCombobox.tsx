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
