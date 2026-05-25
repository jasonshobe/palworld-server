import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { PalSummary } from "@/types"
import { getPal, patchPal, deletePal } from "@/api/saves"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

interface PalDetailProps {
  pal: PalSummary
  disabled?: boolean
  onDeleted: () => void
}

type PalDetail = Record<string, unknown>

function StatRow({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="flex justify-between text-sm py-0.5">
      <span className="text-slate-400">{label}</span>
      <span>{String(value ?? "—")}</span>
    </div>
  )
}

export default function PalDetail({ pal, disabled, onDeleted }: PalDetailProps) {
  const qc = useQueryClient()
  const playerUid = pal.player_uid ?? "PAL_BASE_WORKER_BTN"

  const { data: detail } = useQuery<PalDetail>({
    queryKey: ["pal", pal.instance_id],
    queryFn: () => getPal(pal.instance_id, playerUid),
  })

  const [nickname, setNickname] = useState(pal.nickname)

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["pals"] })
    qc.invalidateQueries({ queryKey: ["pal", pal.instance_id] })
  }

  const patch = (key: string, value: unknown) =>
    patchPal(pal.instance_id, playerUid, key, value)

  const nicknameMut = useMutation({ mutationFn: () => patch("NickName", nickname), onSuccess: invalidate })
  const healMut = useMutation({
    mutationFn: async () => {
      await patch("HasWorkerSick", false)
      await patch("IsFaintedPal", false)
    },
    onSuccess: invalidate,
  })
  const deleteMut = useMutation({
    mutationFn: () => deletePal(pal.instance_id),
    onSuccess: () => { invalidate(); onDeleted() },
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          {pal.display_name ?? pal.instance_id}
          {!!detail?.gender && <Badge variant="outline" className="text-xs">{String(detail.gender)}</Badge>}
          {!!detail?.is_fainted && <Badge variant="destructive" className="text-xs">Fainted</Badge>}
          {!!detail?.has_worker_sick && <Badge variant="destructive" className="text-xs">Sick</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* Stats */}
        <div>
          <StatRow label="Level" value={detail?.level} />
          <StatRow label="Stars (Rank)" value={detail?.rank} />
          <StatRow label="HP Rank" value={detail?.rank_hp} />
          <StatRow label="Attack Rank" value={detail?.rank_attack} />
          <StatRow label="Defence Rank" value={detail?.rank_defence} />
          <StatRow label="Craft Speed Rank" value={detail?.rank_craft_speed} />
        </div>

        <Separator />

        {/* Computed stats */}
        <div>
          <StatRow label="Max HP" value={detail?.computed_max_hp} />
          <StatRow label="Attack" value={detail?.computed_attack} />
          <StatRow label="Defense" value={detail?.computed_defense} />
        </div>

        <Separator />

        {/* Passive skills */}
        <div>
          <p className="text-xs text-slate-400 mb-1">Passive Skills</p>
          <div className="flex flex-wrap gap-1">
            {((detail?.passive_skills as string[]) ?? []).map((s) => (
              <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
            ))}
            {((detail?.passive_skills as string[]) ?? []).length === 0 && (
              <span className="text-xs text-slate-500">None</span>
            )}
          </div>
        </div>

        <Separator />

        {/* Nickname */}
        <div className="space-y-1">
          <Label className="text-sm">Nickname</Label>
          <div className="flex gap-2">
            <Input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              disabled={disabled}
              className="h-7 text-sm flex-1"
            />
            <Button
              size="sm"
              onClick={() => nicknameMut.mutate()}
              disabled={disabled || nicknameMut.isPending || nickname === pal.nickname}
            >
              Save
            </Button>
          </div>
        </div>

        <Separator />

        {/* Actions */}
        <div className="flex gap-2">
          {(!!detail?.has_worker_sick || !!detail?.is_fainted) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => healMut.mutate()}
              disabled={disabled || healMut.isPending}
            >
              Heal
            </Button>
          )}
          <Button
            variant="destructive"
            size="sm"
            onClick={() => { if (confirm(`Delete ${pal.display_name ?? "this pal"}?`)) deleteMut.mutate() }}
            disabled={disabled || deleteMut.isPending}
          >
            Delete Pal
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
