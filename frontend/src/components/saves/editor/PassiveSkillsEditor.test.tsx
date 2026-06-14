import { render, screen, fireEvent } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"
import PassiveSkillsEditor from "./PassiveSkillsEditor"
import type { PassiveOption } from "@/types"

const options: PassiveOption[] = [
  { internal_name: "PassiveSkill_Legend", label: "Legend", rating: 3 },
  { internal_name: "PassiveSkill_Swift", label: "Swift", rating: 2 },
]

describe("PassiveSkillsEditor", () => {
  it("removes a current passive via the chip", () => {
    const patch = vi.fn()
    render(
      <PassiveSkillsEditor
        current={["PassiveSkill_Legend"]}
        options={options}
        patch={patch}
        disabled={false}
      />,
    )
    fireEvent.click(screen.getByLabelText("Remove Legend"))
    expect(patch).toHaveBeenCalledWith("pop_PassiveSkillList", "PassiveSkill_Legend")
  })

  it("adds a passive via the combobox", () => {
    const patch = vi.fn()
    render(
      <PassiveSkillsEditor current={[]} options={options} patch={patch} disabled={false} />,
    )
    fireEvent.click(screen.getByText("Add"))
    expect(patch).toHaveBeenCalledWith("add_PassiveSkillList", "PassiveSkill_Legend")
  })

  it("hides the add control when 4 passives are present", () => {
    render(
      <PassiveSkillsEditor
        current={["a", "b", "c", "d"]}
        options={options}
        patch={vi.fn()}
        disabled={false}
      />,
    )
    expect(screen.queryByText("Add")).not.toBeInTheDocument()
  })
})
