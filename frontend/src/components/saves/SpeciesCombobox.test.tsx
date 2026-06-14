import { render, screen, fireEvent } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"
import SpeciesCombobox from "./SpeciesCombobox"
import type { SpeciesOption } from "@/types"

const options: SpeciesOption[] = [
  { internal_name: "Foxparks", label: "Foxparks" },
  { internal_name: "Lamball", label: "Lamball" },
]

describe("SpeciesCombobox", () => {
  it("creates the first filtered species on Add", () => {
    const onCreate = vi.fn()
    render(<SpeciesCombobox options={options} onCreate={onCreate} disabled={false} />)
    fireEvent.click(screen.getByText("Add"))
    expect(onCreate).toHaveBeenCalledWith("Foxparks")
  })

  it("filters by search text before creating", () => {
    const onCreate = vi.fn()
    render(<SpeciesCombobox options={options} onCreate={onCreate} disabled={false} />)
    fireEvent.change(screen.getByPlaceholderText("Search species…"), {
      target: { value: "lam" },
    })
    fireEvent.click(screen.getByText("Add"))
    expect(onCreate).toHaveBeenCalledWith("Lamball")
  })

  it("disables Add when disabled", () => {
    render(<SpeciesCombobox options={options} onCreate={vi.fn()} disabled={true} />)
    expect(screen.getByText("Add")).toBeDisabled()
  })
})
