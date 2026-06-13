import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"

export type FieldMeta = {
  key: string
  label: string
  type: "float" | "int" | "bool" | "string" | "enum" | "number" | "multiselect"
  min?: number
  max?: number
  step?: number
  options?: string[]
}

// CrossplayPlatforms is stored as a parenthesized tuple, e.g. "(Steam,Xbox,PS5,Mac)".
function parseTuple(raw: unknown): string[] {
  const s = String(raw ?? "").trim()
  const inner = s.startsWith("(") && s.endsWith(")") ? s.slice(1, -1) : s
  return inner ? inner.split(",").map((v) => v.trim()).filter(Boolean) : []
}

function formatTuple(values: string[]): string {
  return `(${values.join(",")})`
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
        {type === "number" && (
          <Input
            type="number"
            value={String(value ?? "")}
            onChange={(e) => onChange(key, e.target.value === "" ? "" : Number(e.target.value))}
            disabled={disabled}
            className="h-7 text-sm"
          />
        )}
        {type === "string" && (
          <Input
            value={String(value ?? "")}
            onChange={(e) => onChange(key, e.target.value)}
            disabled={disabled}
            className="h-7 text-sm"
          />
        )}
        {type === "multiselect" && (
          <div className="flex flex-wrap justify-end gap-x-3 gap-y-1">
            {meta.options?.map((opt) => {
              const selected = parseTuple(value)
              const checked = selected.includes(opt)
              return (
                <label key={opt} className="flex items-center gap-1 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...selected, opt]
                        : selected.filter((v) => v !== opt)
                      // Preserve the declared option order for a stable serialization.
                      const ordered = meta.options?.filter((o) => next.includes(o)) ?? next
                      onChange(key, formatTuple(ordered))
                    }}
                  />
                  {opt}
                </label>
              )
            })}
          </div>
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
