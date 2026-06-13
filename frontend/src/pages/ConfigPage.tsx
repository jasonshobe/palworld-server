import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { getConfig, putConfig } from "@/api/config"
import { useServerStatus } from "@/hooks/useServerStatus"
import ConfigField, { type FieldMeta } from "@/components/config/ConfigField"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const SECTIONS: { title: string; fields: FieldMeta[] }[] = [
  {
    title: "Difficulty",
    fields: [
      { key: "Difficulty", label: "Difficulty Preset", type: "enum", options: ["None", "Casual", "Normal", "Hard"] },
      { key: "DeathPenalty", label: "Death Penalty", type: "enum", options: ["None", "Item", "ItemAndEquipment", "All"] },
      { key: "bEnableInvaderEnemy", label: "Enable Raid Events", type: "bool" },
      { key: "EnablePredatorBossPal", label: "Enable Predator Boss Pals", type: "bool" },
      { key: "bEnableNonLoginPenalty", label: "Non-Login Penalty", type: "bool" },
      { key: "AutoSaveSpan", label: "Auto Save Interval (min)", type: "int", min: 1, max: 60 },
      { key: "SupplyDropSpan", label: "Supply Drop Interval (min)", type: "int", min: 0, max: 720, step: 10 },
    ],
  },
  {
    title: "Server",
    fields: [
      { key: "ServerName", label: "Server Name", type: "string" },
      { key: "ServerDescription", label: "Description", type: "string" },
      { key: "ServerPassword", label: "Server Password", type: "string" },
      { key: "AdminPassword", label: "Admin Password", type: "string" },
      { key: "ServerPlayerMaxNum", label: "Max Players", type: "int", min: 1, max: 32 },
      { key: "CoopPlayerMaxNum", label: "Co-op Max Players", type: "int", min: 1, max: 4 },
      { key: "PublicPort", label: "Game Port", type: "number" },
    ],
  },
  {
    title: "Time & Rates",
    fields: [
      { key: "DayTimeSpeedRate", label: "Day Speed", type: "float", min: 0.1, max: 5, step: 0.1 },
      { key: "NightTimeSpeedRate", label: "Night Speed", type: "float", min: 0.1, max: 5, step: 0.1 },
      { key: "ExpRate", label: "EXP Rate", type: "float", min: 0.1, max: 20, step: 0.1 },
      { key: "WorkSpeedRate", label: "Work Speed", type: "float", min: 0.1, max: 5, step: 0.1 },
    ],
  },
  {
    title: "Pals",
    fields: [
      { key: "PalCaptureRate", label: "Capture Rate", type: "float", min: 0.1, max: 2, step: 0.1 },
      { key: "PalSpawnNumRate", label: "Spawn Rate", type: "float", min: 0.1, max: 3, step: 0.1 },
      { key: "PalDamageRateAttack", label: "Damage from Pals", type: "float", min: 0.1, max: 5, step: 0.1 },
      { key: "PalDamageRateDefense", label: "Damage to Pals", type: "float", min: 0.1, max: 5, step: 0.1 },
      { key: "PalStomachDecreaceRate", label: "Hunger Depletion Rate", type: "float", min: 0.1, max: 5, step: 0.1 },
      { key: "PalStaminaDecreaceRate", label: "Stamina Depletion Rate", type: "float", min: 0.1, max: 5, step: 0.1 },
      { key: "PalAutoHPRegeneRate", label: "Health Regen Rate", type: "float", min: 0.1, max: 5, step: 0.1 },
      { key: "PalAutoHpRegeneRateInSleep", label: "Sleep Health Regen Rate", type: "float", min: 0.1, max: 5, step: 0.1 },
      { key: "PalEggDefaultHatchingTime", label: "Egg Hatching Time (hrs)", type: "int", min: 0, max: 240 },
    ],
  },
  {
    title: "Players",
    fields: [
      { key: "PlayerDamageRateAttack", label: "Damage from Players", type: "float", min: 0.1, max: 5, step: 0.1 },
      { key: "PlayerDamageRateDefense", label: "Damage to Players", type: "float", min: 0.1, max: 5, step: 0.1 },
      { key: "PlayerStomachDecreaceRate", label: "Hunger Depletion Rate", type: "float", min: 0.1, max: 5, step: 0.1 },
      { key: "PlayerStaminaDecreaceRate", label: "Stamina Depletion Rate", type: "float", min: 0.1, max: 5, step: 0.1 },
      { key: "PlayerAutoHPRegeneRate", label: "Health Regen Rate", type: "float", min: 0.1, max: 5, step: 0.1 },
      { key: "PlayerAutoHpRegeneRateInSleep", label: "Sleep Health Regen Rate", type: "float", min: 0.1, max: 5, step: 0.1 },
    ],
  },
  {
    title: "World & Items",
    fields: [
      { key: "CollectionDropRate", label: "Gatherable Items Rate", type: "float", min: 0, max: 5, step: 0.1 },
      { key: "CollectionObjectHpRate", label: "Gatherable Object HP", type: "float", min: 0.1, max: 3, step: 0.1 },
      { key: "CollectionObjectRespawnSpeedRate", label: "Object Respawn Speed", type: "float", min: 0.5, max: 3, step: 0.1 },
      { key: "EnemyDropItemRate", label: "Enemy Drop Rate", type: "float", min: 0, max: 5, step: 0.1 },
      { key: "DropItemMaxNum", label: "Max Dropped Items in World", type: "int", min: 0, max: 5000, step: 50 },
      { key: "DropItemAliveMaxHours", label: "Item Despawn Time (hrs)", type: "float", min: 0, max: 168, step: 0.5 },
      { key: "ItemWeightRate", label: "Item Weight", type: "float", min: 0, max: 5, step: 0.1 },
      { key: "EquipmentDurabilityDamageRate", label: "Equipment Durability Loss", type: "float", min: 0, max: 5, step: 0.1 },
      { key: "ItemCorruptionMultiplier", label: "Item Corruption Speed", type: "float", min: 0, max: 5, step: 0.1 },
    ],
  },
  {
    title: "Building & Bases",
    fields: [
      { key: "BuildObjectDamageRate", label: "Building Damage Rate", type: "float", min: 0.1, max: 5, step: 0.1 },
      { key: "BuildObjectDeteriorationDamageRate", label: "Building Deterioration Rate", type: "float", min: 0, max: 5, step: 0.1 },
      { key: "BaseCampWorkerMaxNum", label: "Max Workers per Base", type: "int", min: 1, max: 50 },
      { key: "BaseCampMaxNumInGuild", label: "Max Bases per Guild", type: "int", min: 1, max: 10 },
      { key: "MaxBuildingLimitNum", label: "Max Structures per Base (0 = no limit)", type: "int", min: 0, max: 10000, step: 50 },
    ],
  },
  {
    title: "Multiplayer",
    fields: [
      { key: "bIsMultiplay", label: "Multiplayer", type: "bool" },
      { key: "bIsPvP", label: "PvP", type: "bool" },
      { key: "bEnablePlayerToPlayerDamage", label: "Player Damage", type: "bool" },
      { key: "bEnableFriendlyFire", label: "Friendly Fire", type: "bool" },
      { key: "bEnableDefenseOtherGuildPlayer", label: "Defense of Other Guild Players", type: "bool" },
      { key: "GuildPlayerMaxNum", label: "Max Guild Members", type: "int", min: 1, max: 100 },
      { key: "bEnableFastTravel", label: "Fast Travel", type: "bool" },
      { key: "bIsStartLocationSelectByMap", label: "Select Start Location on Map", type: "bool" },
      { key: "bExistPlayerAfterLogout", label: "Player Exists After Logout", type: "bool" },
      { key: "bCanPickupOtherGuildDeathPenaltyDrop", label: "Pick Up Other Guild Death Drops", type: "bool" },
      { key: "bAutoResetGuildNoOnlinePlayers", label: "Auto-Reset Empty Guilds", type: "bool" },
      { key: "bAllowGlobalPalboxExport", label: "Allow Global Palbox Export", type: "bool" },
      { key: "bAllowGlobalPalboxImport", label: "Allow Global Palbox Import", type: "bool" },
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
