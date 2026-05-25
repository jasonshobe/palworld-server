import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { getConfig, putConfig } from "@/api/config"
import { useServerStatus } from "@/hooks/useServerStatus"
import ConfigField, { type FieldMeta } from "@/components/config/ConfigField"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const SECTIONS: { title: string; fields: FieldMeta[] }[] = [
  {
    title: "Server",
    fields: [
      { key: "ServerName", label: "Server Name", type: "string" },
      { key: "ServerDescription", label: "Description", type: "string" },
      { key: "ServerPassword", label: "Server Password", type: "string" },
      { key: "AdminPassword", label: "Admin Password", type: "string" },
      { key: "ServerPlayerMaxNum", label: "Max Players", type: "int", min: 1, max: 32 },
      { key: "PublicPort", label: "Port", type: "int", min: 1024, max: 65535 },
    ],
  },
  {
    title: "Gameplay",
    fields: [
      { key: "DayTimeSpeedRate", label: "Day Speed", type: "float", min: 0.1, max: 5, step: 0.1 },
      { key: "NightTimeSpeedRate", label: "Night Speed", type: "float", min: 0.1, max: 5, step: 0.1 },
      { key: "ExpRate", label: "EXP Rate", type: "float", min: 0.1, max: 20, step: 0.1 },
      { key: "PalCaptureRate", label: "Pal Capture Rate", type: "float", min: 0.1, max: 5, step: 0.1 },
      { key: "PalSpawnNumRate", label: "Pal Spawn Rate", type: "float", min: 0.1, max: 3, step: 0.1 },
      { key: "CollectionDropRate", label: "Collection Drop Rate", type: "float", min: 0, max: 5, step: 0.1 },
      { key: "EnemyDropItemRate", label: "Enemy Drop Rate", type: "float", min: 0, max: 5, step: 0.1 },
      { key: "WorkSpeedRate", label: "Work Speed", type: "float", min: 0.1, max: 5, step: 0.1 },
      { key: "DeathPenalty", label: "Death Penalty", type: "enum", options: ["None", "Item", "ItemAndEquipment", "All"] },
    ],
  },
  {
    title: "Multiplayer",
    fields: [
      { key: "bIsMultiplay", label: "Multiplayer", type: "bool" },
      { key: "bIsPvP", label: "PvP", type: "bool" },
      { key: "bEnablePlayerToPlayerDamage", label: "Player Damage", type: "bool" },
      { key: "bEnableFriendlyFire", label: "Friendly Fire", type: "bool" },
      { key: "GuildPlayerMaxNum", label: "Max Guild Members", type: "int", min: 1, max: 20 },
    ],
  },
]

export default function ConfigPage() {
  const { data: status } = useServerStatus()
  const qc = useQueryClient()
  const disabled = status?.state !== "stopped"

  const { data: config } = useQuery({ queryKey: ["config"], queryFn: getConfig })
  const [edits, setEdits] = useState<Record<string, unknown>>({})

  const saveMut = useMutation({
    mutationFn: () => putConfig({ ...(config ?? {}), ...edits }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["config"] }); setEdits({}) },
  })

  const merged = { ...(config ?? {}), ...edits }

  function handleChange(key: string, value: unknown) {
    setEdits((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="space-y-6">
      {disabled && (
        <div className="rounded-md bg-amber-950 border border-amber-800 px-4 py-2 text-sm text-amber-200">
          Stop the server to edit configuration.
        </div>
      )}
      {SECTIONS.map((section) => (
        <Card key={section.title}>
          <CardHeader><CardTitle className="text-base">{section.title}</CardTitle></CardHeader>
          <CardContent>
            {section.fields.map((field) => (
              <ConfigField
                key={field.key}
                meta={field}
                value={merged[field.key]}
                onChange={handleChange}
                disabled={disabled}
              />
            ))}
          </CardContent>
        </Card>
      ))}
      <div className="flex justify-end">
        <Button
          onClick={() => saveMut.mutate()}
          disabled={disabled || Object.keys(edits).length === 0 || saveMut.isPending}
        >
          Save Configuration
        </Button>
      </div>
    </div>
  )
}
