import { useState } from "react"
import type { PalSummary } from "@/types"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface PalListProps {
  pals: PalSummary[]
  selectedId: string | null
  onSelect: (pal: PalSummary) => void
}

export default function PalList({ pals, selectedId, onSelect }: PalListProps) {
  const [search, setSearch] = useState("")

  const filtered = pals.filter((p) => {
    const name = (p.display_name ?? p.instance_id).toLowerCase()
    const nick = p.nickname.toLowerCase()
    const q = search.toLowerCase()
    return name.includes(q) || nick.includes(q)
  })

  return (
    <div className="flex flex-col gap-2">
      <Input
        placeholder="Search pals..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="h-8 text-sm"
      />
      <div className="overflow-y-auto max-h-[calc(100vh-280px)] space-y-1">
        {filtered.map((pal) => (
          <button
            key={pal.instance_id}
            onClick={() => onSelect(pal)}
            className={cn(
              "w-full text-left px-3 py-2 rounded text-sm transition-colors",
              selectedId === pal.instance_id ? "bg-slate-700" : "hover:bg-slate-800"
            )}
          >
            <div className="flex items-center gap-2">
              <span className="flex-1 truncate">{pal.display_name ?? pal.instance_id}</span>
              {pal.nickname && <span className="text-xs text-slate-400 truncate">"{pal.nickname}"</span>}
              <Badge variant="outline" className="text-xs">Lv {pal.level}</Badge>
            </div>
          </button>
        ))}
        {filtered.length === 0 && <p className="text-sm text-slate-500 p-2">No pals found.</p>}
      </div>
    </div>
  )
}
