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
            onFocus={() => { setOpen(true); setHighlight(0) }}
            onKeyDown={onInputKeyDown}
            disabled={disabled}
            placeholder={placeholder ?? "Search…"}
            className="h-7 text-sm flex-1"
            role="combobox"
            aria-expanded={open}
            aria-activedescendant={open && filtered[highlight] ? `opt-${filtered[highlight].value}` : undefined}
          />
        </Popover.Anchor>
        <Popover.Portal>
          <Popover.Content
            role="listbox"
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
                  id={`opt-${o.value}`}
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
