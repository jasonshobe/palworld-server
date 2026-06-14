import type { PassiveOption } from "@/types"
import Chip from "./Chip"
import SkillCombobox from "./SkillCombobox"

interface PassiveSkillsEditorProps {
  current: string[]
  options: PassiveOption[]
  patch: (key: string, value: unknown) => void
  disabled?: boolean
}

export default function PassiveSkillsEditor({ current, options, patch, disabled }: PassiveSkillsEditorProps) {
  const labelOf = (name: string) =>
    options.find((o) => o.internal_name === name)?.label ?? name
  const available = options.filter((o) => !current.includes(o.internal_name))

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-400">Passive Skills ({current.length}/4)</p>
      <div className="flex flex-wrap gap-1">
        {current.map((name) => (
          <Chip
            key={name}
            label={labelOf(name)}
            disabled={disabled}
            onRemove={() => patch("pop_PassiveSkillList", name)}
          />
        ))}
        {current.length === 0 && <span className="text-xs text-slate-500">None</span>}
      </div>
      {current.length < 4 && (
        <SkillCombobox
          options={available.map((o) => ({ value: o.internal_name, label: `${o.label} (${o.rating})` }))}
          onAdd={(value) => patch("add_PassiveSkillList", value)}
          disabled={disabled}
          placeholder="Search passives…"
        />
      )}
    </div>
  )
}
