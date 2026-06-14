import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { PalSummary, PalDetailData } from "@/types"
import { getPal, deletePal } from "@/api/saves"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { usePalPatch } from "@/hooks/usePalPatch"
import { usePassives, useActiveSkills, useSuitabilities } from "@/hooks/useReferenceData"
import IdentityCard from "./editor/IdentityCard"
import StatsEditor from "./editor/StatsEditor"
import PassiveSkillsEditor from "./editor/PassiveSkillsEditor"
import ActiveSkillsEditor from "./editor/ActiveSkillsEditor"
import SuitabilitiesEditor from "./editor/SuitabilitiesEditor"
import ConditionCard from "./editor/ConditionCard"

interface PalDetailProps {
  pal: PalSummary
  disabled?: boolean
  onDeleted: () => void
}

export default function PalDetail({ pal, disabled, onDeleted }: PalDetailProps) {
  const qc = useQueryClient()
  const playerUid = pal.player_uid ?? "PAL_BASE_WORKER_BTN"

  const { data: detail } = useQuery<PalDetailData>({
    queryKey: ["pal", pal.instance_id],
    queryFn: () => getPal(pal.instance_id, playerUid),
  })
  const passives = usePassives()
  const activeSkills = useActiveSkills()
  const suitabilities = useSuitabilities()

  const { patch, error } = usePalPatch(pal.instance_id, playerUid)

  const deleteMut = useMutation({
    mutationFn: () => deletePal(pal.instance_id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pals"] })
      onDeleted()
    },
  })

  if (!detail) {
    return <Card><CardContent className="pt-4 text-sm text-slate-500">Loading…</CardContent></Card>
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          {detail.display_name ?? detail.instance_id}
          {!!detail.gender && <Badge variant="outline" className="text-xs">{detail.gender}</Badge>}
          {detail.is_fainted && <Badge variant="destructive" className="text-xs">Fainted</Badge>}
          {detail.has_worker_sick && <Badge variant="destructive" className="text-xs">Sick</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-md bg-red-950 border border-red-800 px-3 py-2 text-xs text-red-200">
            {error}
          </div>
        )}

        <IdentityCard detail={detail} patch={patch} disabled={disabled} />
        <Separator />
        <StatsEditor detail={detail} patch={patch} disabled={disabled} />
        <Separator />
        <PassiveSkillsEditor
          current={detail.passive_skills}
          options={passives.data ?? []}
          patch={patch}
          disabled={disabled}
        />
        <Separator />
        <ActiveSkillsEditor
          equipped={detail.equip_waza}
          mastered={detail.mastered_waza}
          options={activeSkills.data ?? []}
          patch={patch}
          disabled={disabled}
        />
        <Separator />
        <SuitabilitiesEditor
          names={suitabilities.data ?? []}
          current={detail.suitabilities}
          patch={patch}
          disabled={disabled}
        />
        <Separator />
        <ConditionCard
          detail={detail}
          patch={patch}
          onDelete={() => deleteMut.mutate()}
          disabled={disabled}
        />
      </CardContent>
    </Card>
  )
}
