import { useState } from "react"
import type { PalDetailData } from "@/types"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { GENDERS } from "@/lib/gender"

interface IdentityCardProps {
  detail: PalDetailData
  patch: (key: string, value: unknown) => void
  disabled?: boolean
}

const FLAGS: { key: string; label: string; field: keyof PalDetailData }[] = [
  { key: "IsFavoritePal", label: "Favorite", field: "is_favorite" },
  { key: "IsRarePal", label: "Lucky", field: "is_rare" },
  { key: "IsBOSS", label: "Boss", field: "is_boss" },
  { key: "IsTower", label: "Tower", field: "is_tower" },
]

export default function IdentityCard({ detail, patch, disabled }: IdentityCardProps) {
  const [nickname, setNickname] = useState(detail.nickname)
  // Resync the local input when the underlying pal changes. Adjusting state
  // during render is React's recommended alternative to calling setState in an
  // effect (see StatsEditor for the same pattern).
  const [lastNickname, setLastNickname] = useState(detail.nickname)
  if (detail.nickname !== lastNickname) {
    setLastNickname(detail.nickname)
    setNickname(detail.nickname)
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-sm">Nickname</Label>
        <div className="flex gap-2">
          <Input value={nickname} onChange={(e) => setNickname(e.target.value)}
            disabled={disabled} className="h-7 text-sm flex-1" />
          <Button size="sm" onClick={() => patch("NickName", nickname)}
            disabled={disabled || nickname === detail.nickname}>Save</Button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Label className="text-sm">Gender</Label>
        <select value={detail.gender ?? ""} disabled={disabled}
          onChange={(e) => patch("Gender", e.target.value)}
          className="h-7 bg-slate-800 border border-slate-600 rounded px-2 text-sm">
          {GENDERS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
        </select>
      </div>

      <div className="flex items-center justify-between">
        <Label className="text-sm">Friendship Level</Label>
        <Input type="number" min={0} max={10} defaultValue={detail.friendship_level}
          disabled={disabled}
          onBlur={(e) => patch("FriendshipLevel", Math.min(10, Math.max(0, Math.round(Number(e.target.value)))))}
          className="h-7 text-sm w-24" />
      </div>

      <div className="flex flex-wrap gap-4">
        {FLAGS.map((f) => (
          <label key={f.key} className="flex items-center gap-2 text-sm text-slate-300">
            <Switch checked={Boolean(detail[f.field])} disabled={disabled}
              onCheckedChange={(v) => patch(f.key, v)} />
            {f.label}
          </label>
        ))}
      </div>
    </div>
  )
}
