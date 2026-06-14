import { Label } from "@/components/ui/label"

interface SuitabilitiesEditorProps {
  names: string[]
  current: Record<string, number>
  patch: (key: string, value: unknown) => void
  disabled?: boolean
}

// In-game display names, keyed by the internal suitability name used for patching.
const LABELS: Record<string, string> = {
  EmitFlame: "Kindling",
  Watering: "Watering",
  Seeding: "Planting",
  GenerateElectricity: "Generating Electricity",
  Handcraft: "Handiwork",
  Collection: "Gathering",
  Deforest: "Lumbering",
  Mining: "Mining",
  ProductMedicine: "Medicine Production",
  Cool: "Cooling",
  Transport: "Transportation",
  MonsterFarm: "Farming",
}

// Each suitability is a 0–5 stepper. The value sent is the desired absolute level;
// the backend library converts it to the stored delta over the species base.
export default function SuitabilitiesEditor({ names, current, patch, disabled }: SuitabilitiesEditorProps) {
  const set = (name: string, level: number) =>
    patch("set_Suitability", { name, level: Math.min(5, Math.max(0, level)) })

  return (
    <div className="space-y-1">
      <p className="text-xs text-slate-400">Work Suitabilities (0–5)</p>
      {names.map((name) => {
        const level = current[name] ?? 0
        const label = LABELS[name] ?? name
        return (
          <div key={name} className="flex items-center justify-between py-0.5">
            <Label className="text-sm text-slate-300">{label}</Label>
            <div className="flex items-center gap-2">
              <button type="button" disabled={disabled || level <= 0}
                onClick={() => set(name, level - 1)}
                className="h-6 w-6 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-40"
                aria-label={`Decrease ${label}`}>−</button>
              <span className="w-4 text-center text-sm">{level}</span>
              <button type="button" disabled={disabled || level >= 5}
                onClick={() => set(name, level + 1)}
                className="h-6 w-6 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-40"
                aria-label={`Increase ${label}`}>+</button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
