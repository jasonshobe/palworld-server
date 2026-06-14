// Gender is stored as the game's internal enum code (e.g. "EPalGenderType::Male").
// That code is the value the backend returns and the value the editor library
// accepts when setting Gender — so it stays the source of truth, with friendly
// labels/symbols derived only for display.
export const GENDERS = [
  { value: "EPalGenderType::Male", label: "Male", symbol: "♂" },
  { value: "EPalGenderType::Female", label: "Female", symbol: "♀" },
] as const

export function genderLabel(code: string | null | undefined): string {
  return GENDERS.find((g) => g.value === code)?.label ?? ""
}

export function genderSymbol(code: string | null | undefined): string {
  return GENDERS.find((g) => g.value === code)?.symbol ?? ""
}
