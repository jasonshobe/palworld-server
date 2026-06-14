import { Badge } from "@/components/ui/badge"

interface ChipProps {
  label: string
  onRemove?: () => void
  disabled?: boolean
}

export default function Chip({ label, onRemove, disabled }: ChipProps) {
  return (
    <Badge variant="secondary" className="text-xs gap-1">
      {label}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          className="ml-0.5 text-slate-400 hover:text-slate-100 disabled:opacity-40"
          aria-label={`Remove ${label}`}
        >
          ×
        </button>
      )}
    </Badge>
  )
}
