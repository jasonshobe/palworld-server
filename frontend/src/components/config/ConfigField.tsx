import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"

export type FieldMeta = {
  key: string
  label: string
  type: "float" | "int" | "bool" | "string" | "enum"
  min?: number
  max?: number
  step?: number
  options?: string[]
}

interface ConfigFieldProps {
  meta: FieldMeta
  value: unknown
  onChange: (key: string, value: unknown) => void
  disabled?: boolean
}

export default function ConfigField({ meta, value, onChange, disabled }: ConfigFieldProps) {
  const { key, label, type } = meta

  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0">
      <Label className="text-sm text-slate-300 flex-1">{label}</Label>
      <div className="w-48">
        {type === "bool" && (
          <Switch
            checked={Boolean(value)}
            onCheckedChange={(v) => onChange(key, v)}
            disabled={disabled}
          />
        )}
        {(type === "float" || type === "int") && meta.min !== undefined && (
          <div className="flex items-center gap-2">
            <Slider
              min={meta.min}
              max={meta.max ?? 10}
              step={meta.step ?? (type === "int" ? 1 : 0.1)}
              value={[Number(value ?? meta.min)]}
              onValueChange={([v]) => onChange(key, type === "int" ? Math.round(v) : v)}
              disabled={disabled}
              className="flex-1"
            />
            <span className="text-xs w-10 text-right">{Number(value ?? meta.min).toFixed(type === "float" ? 1 : 0)}</span>
          </div>
        )}
        {type === "string" && (
          <Input
            value={String(value ?? "")}
            onChange={(e) => onChange(key, e.target.value)}
            disabled={disabled}
            className="h-7 text-sm"
          />
        )}
        {type === "enum" && (
          <select
            value={String(value ?? "")}
            onChange={(e) => onChange(key, e.target.value)}
            disabled={disabled}
            className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm"
          >
            {meta.options?.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        )}
      </div>
    </div>
  )
}
