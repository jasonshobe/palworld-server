import type { ModInfo } from "@/types"
import { Button } from "@/components/ui/button"

interface Props {
  mods: ModInfo[]
  onDelete: (path: string) => void
}

export default function ModList({ mods, onDelete }: Props) {
  if (mods.length === 0) {
    return <p className="text-sm text-slate-400">No mods uploaded yet.</p>
  }
  return (
    <ul className="divide-y rounded border">
      {mods.map((m) => (
        <li key={m.path} className="flex items-center justify-between px-3 py-2 text-sm">
          <span className="font-mono">{m.path}</span>
          <span className="flex items-center gap-3">
            <span className="text-xs text-slate-400">
              {m.installed ? "installed" : "pending"}
            </span>
            <Button variant="ghost" size="sm" onClick={() => onDelete(m.path)}>
              Delete
            </Button>
          </span>
        </li>
      ))}
    </ul>
  )
}
