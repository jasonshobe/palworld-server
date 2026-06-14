import { render, screen, fireEvent } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"
import ConditionCard from "./ConditionCard"
import type { PalDetailData } from "@/types"

const detail = {
  display_name: "Foxparks",
  sanity: 100,
  full_stomach: 150,
  max_full_stomach: 300,
  has_worker_sick: false,
  is_fainted: false,
} as PalDetailData

describe("ConditionCard duplicate", () => {
  it("fires onDuplicate when the Duplicate button is clicked", () => {
    const onDuplicate = vi.fn()
    render(
      <ConditionCard detail={detail} patch={vi.fn()} onDelete={vi.fn()}
        onDuplicate={onDuplicate} isBaseWorker={false} disabled={false} />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Duplicate" }))
    expect(onDuplicate).toHaveBeenCalled()
  })

  it("disables the Duplicate button for base workers", () => {
    render(
      <ConditionCard detail={detail} patch={vi.fn()} onDelete={vi.fn()}
        onDuplicate={vi.fn()} isBaseWorker={true} disabled={false} />,
    )
    expect(screen.getByRole("button", { name: "Duplicate" })).toBeDisabled()
  })

  it("disables the Duplicate button while a duplicate is in flight", () => {
    render(
      <ConditionCard detail={detail} patch={vi.fn()} onDelete={vi.fn()}
        onDuplicate={vi.fn()} isBaseWorker={false} disabled={false} duplicating={true} />,
    )
    expect(screen.getByRole("button", { name: "Duplicate" })).toBeDisabled()
  })
})
