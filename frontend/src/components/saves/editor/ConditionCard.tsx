import type { PalDetailData } from "@/types"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"

interface ConditionCardProps {
  detail: PalDetailData
  patch: (key: string, value: unknown) => void
  onDelete: () => void
  onDuplicate: () => void
  isBaseWorker: boolean
  disabled?: boolean
  duplicating?: boolean
}

export default function ConditionCard({
  detail, patch, onDelete, onDuplicate, isBaseWorker, disabled, duplicating,
}: ConditionCardProps) {
  const needsHeal = detail.has_worker_sick || detail.is_fainted

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm">Sanity</Label>
        <Input type="number" min={0} max={100} defaultValue={detail.sanity ?? 0} disabled={disabled}
          onBlur={(e) => patch("SanityValue", Math.min(100, Math.max(0, Number(e.target.value))))}
          className="h-7 text-sm w-24" />
      </div>
      <div className="flex items-center justify-between">
        <Label className="text-sm">Full Stomach</Label>
        <Input type="number" min={0} max={detail.max_full_stomach} defaultValue={detail.full_stomach ?? 0} disabled={disabled}
          onBlur={(e) => patch("FullStomach", Math.min(detail.max_full_stomach, Math.max(0, Number(e.target.value))))}
          className="h-7 text-sm w-24" />
      </div>
      <div className="flex gap-2">
        {needsHeal && (
          <Button variant="outline" size="sm" disabled={disabled}
            onClick={() => patch("heal_pal", true)}>Heal</Button>
        )}
        <Button variant="outline" size="sm"
          disabled={disabled || isBaseWorker || duplicating}
          title={isBaseWorker ? "Base Worker pals can't be duplicated" : undefined}
          onClick={onDuplicate}>
          Duplicate
        </Button>
        <Button variant="destructive" size="sm" disabled={disabled}
          onClick={() => { if (confirm(`Delete ${detail.display_name ?? "this pal"}?`)) onDelete() }}>
          Delete Pal
        </Button>
      </div>
    </div>
  )
}
