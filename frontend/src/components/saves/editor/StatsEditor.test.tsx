import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"
import StatsEditor from "./StatsEditor"
import type { PalDetailData } from "@/types"

const detail = {
  level: 5, rank: 1, rank_hp: 0, rank_attack: 0, rank_defence: 0, rank_craft_speed: 0,
  talent_hp: 50, talent_melee: 50, talent_shot: 50, talent_defense: 50,
  computed_max_hp: 100, computed_attack: 80, computed_defense: 70,
} as PalDetailData

describe("StatsEditor", () => {
  it("patches Level when the level input changes (debounced)", async () => {
    const patch = vi.fn()
    render(<StatsEditor detail={detail} patch={patch} disabled={false} />)
    const level = screen.getByLabelText("Level") as HTMLInputElement
    fireEvent.change(level, { target: { value: "42" } })
    await waitFor(() => expect(patch).toHaveBeenCalledWith("Level", 42), { timeout: 1000 })
  })

  it("disables inputs when disabled", () => {
    render(<StatsEditor detail={detail} patch={vi.fn()} disabled={true} />)
    expect(screen.getByLabelText("Level")).toBeDisabled()
  })
})
