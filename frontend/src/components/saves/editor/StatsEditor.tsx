import { useState } from "react"
import type { PalDetailData } from "@/types"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback"

interface StatsEditorProps {
  detail: PalDetailData
  patch: (key: string, value: unknown) => void
  disabled?: boolean
}

interface NumField {
  key: string
  label: string
  value: number
  min: number
  max: number
}

function NumberRow({ field, patch, disabled }: { field: NumField; patch: (k: string, v: unknown) => void; disabled?: boolean }) {
  const [val, setVal] = useState(String(field.value))
  // Resync the local input when the underlying value changes (e.g. switching
  // pals). Adjusting state during render is React's recommended alternative to
  // calling setState inside an effect.
  const [lastValue, setLastValue] = useState(field.value)
  if (field.value !== lastValue) {
    setLastValue(field.value)
    setVal(String(field.value))
  }
  const debounced = useDebouncedCallback((n: number) => patch(field.key, n))

  return (
    <div className="flex items-center justify-between py-1">
      <Label htmlFor={field.key} className="text-sm text-slate-300">{field.label}</Label>
      <Input
        id={field.key}
        aria-label={field.label}
        type="number"
        min={field.min}
        max={field.max}
        value={val}
        disabled={disabled}
        onChange={(e) => {
          setVal(e.target.value)
          if (e.target.value === "") return
          const n = Math.min(field.max, Math.max(field.min, Math.round(Number(e.target.value))))
          debounced(n)
        }}
        className="h-7 text-sm w-24"
      />
    </div>
  )
}

export default function StatsEditor({ detail, patch, disabled }: StatsEditorProps) {
  const core: NumField[] = [
    { key: "Level", label: "Level", value: detail.level, min: 1, max: 60 },
    { key: "Rank", label: "Stars (Rank)", value: detail.rank, min: 1, max: 5 },
  ]
  const souls: NumField[] = [
    { key: "Rank_HP", label: "HP Soul", value: detail.rank_hp, min: 0, max: 20 },
    { key: "Rank_Attack", label: "Attack Soul", value: detail.rank_attack, min: 0, max: 20 },
    { key: "Rank_Defence", label: "Defence Soul", value: detail.rank_defence, min: 0, max: 20 },
    { key: "Rank_CraftSpeed", label: "Craft Speed Soul", value: detail.rank_craft_speed, min: 0, max: 20 },
  ]
  const ivs: NumField[] = [
    { key: "Talent_HP", label: "IV HP", value: detail.talent_hp, min: 0, max: 100 },
    { key: "Talent_Melee", label: "IV Melee", value: detail.talent_melee, min: 0, max: 100 },
    { key: "Talent_Shot", label: "IV Shot", value: detail.talent_shot, min: 0, max: 100 },
    { key: "Talent_Defense", label: "IV Defense", value: detail.talent_defense, min: 0, max: 100 },
  ]

  return (
    <div className="space-y-2">
      {core.map((f) => <NumberRow key={f.key} field={f} patch={patch} disabled={disabled} />)}
      <Separator />
      <p className="text-xs text-slate-400">Souls (0–20)</p>
      {souls.map((f) => <NumberRow key={f.key} field={f} patch={patch} disabled={disabled} />)}
      <Separator />
      <p className="text-xs text-slate-400">IVs (0–100)</p>
      {ivs.map((f) => <NumberRow key={f.key} field={f} patch={patch} disabled={disabled} />)}
      <Separator />
      <div className="text-xs text-slate-500 flex gap-4">
        <span>Max HP: {detail.computed_max_hp ?? "—"}</span>
        <span>Attack: {detail.computed_attack ?? "—"}</span>
        <span>Defense: {detail.computed_defense ?? "—"}</span>
      </div>
    </div>
  )
}
