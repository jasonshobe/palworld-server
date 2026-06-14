import type { ActiveSkillOption } from "@/types"
import Chip from "./Chip"
import Combobox from "@/components/ui/combobox"

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
          <Combobox options={comboOptions(equipped)}
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
        <Combobox options={comboOptions(mastered)}
          onAdd={(v) => patch("add_MasteredWaza", v)} disabled={disabled}
          placeholder="Search active skills…" />
      </div>
    </div>
  )
}
