import Combobox from "@/components/ui/combobox"
import type { SpeciesOption } from "@/types"

interface SpeciesComboboxProps {
  options: SpeciesOption[]
  onCreate: (characterId: string) => void
  disabled?: boolean
}

// Type-to-filter create-control: pick a species, then Add creates a new pal of it.
export default function SpeciesCombobox({ options, onCreate, disabled }: SpeciesComboboxProps) {
  return (
    <Combobox
      options={options.map((o) => ({ value: o.internal_name, label: o.label }))}
      onAdd={onCreate}
      disabled={disabled}
      placeholder="Search species…"
    />
  )
}
