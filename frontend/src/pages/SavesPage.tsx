import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { getPlayers, getPals, commitSave } from "@/api/saves"
import { useServerStatus } from "@/hooks/useServerStatus"
import PalList from "@/components/saves/PalList"
import PalDetail from "@/components/saves/PalDetail"
import type { PalSummary } from "@/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function SavesPage() {
  const { data: status } = useServerStatus()
  const disabled = status?.state !== "stopped"
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null)
  const [selectedPal, setSelectedPal] = useState<PalSummary | null>(null)
  const qc = useQueryClient()

  const { data: playersData } = useQuery({ queryKey: ["players"], queryFn: getPlayers })

  const effectivePlayer = selectedPlayer ?? playersData?.players[0]?.uid ?? null

  const { data: pals = [] } = useQuery({
    queryKey: ["pals", effectivePlayer],
    queryFn: () => getPals(effectivePlayer!),
    enabled: effectivePlayer !== null,
  })

  const commitMut = useMutation({
    mutationFn: commitSave,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pals"] }),
  })

  return (
    <div className="space-y-4">
      {disabled && (
        <div className="rounded-md bg-amber-950 border border-amber-800 px-4 py-2 text-sm text-amber-200">
          Stop the server to edit saves.
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {playersData?.players.map((p) => (
          <Button
            key={p.uid}
            variant={effectivePlayer === p.uid ? "default" : "outline"}
            size="sm"
            onClick={() => { setSelectedPlayer(p.uid); setSelectedPal(null) }}
          >
            {p.nickname}
          </Button>
        ))}
        {playersData?.has_working_pals && (
          <Button
            variant={effectivePlayer === "PAL_BASE_WORKER_BTN" ? "default" : "outline"}
            size="sm"
            onClick={() => { setSelectedPlayer("PAL_BASE_WORKER_BTN"); setSelectedPal(null) }}
          >
            Base Workers
          </Button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-6">
        <Card className="col-span-1">
          <CardHeader><CardTitle className="text-sm">Pals ({pals.length})</CardTitle></CardHeader>
          <CardContent>
            <PalList
              pals={pals}
              selectedId={selectedPal?.instance_id ?? null}
              onSelect={setSelectedPal}
            />
          </CardContent>
        </Card>

        <div className="col-span-2">
          {selectedPal ? (
            <PalDetail
              pal={selectedPal}
              disabled={disabled}
              onDeleted={() => setSelectedPal(null)}
            />
          ) : (
            <p className="text-sm text-slate-500 pt-4">Select a pal to edit.</p>
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          variant="outline"
          onClick={() => commitMut.mutate()}
          disabled={disabled || commitMut.isPending}
        >
          Save to Disk
        </Button>
      </div>
    </div>
  )
}
