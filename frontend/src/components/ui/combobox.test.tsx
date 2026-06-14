import { render, screen, fireEvent } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"
import Combobox from "./combobox"

const options = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Bravo" },
  { value: "c", label: "Charlie" },
]

describe("Combobox", () => {
  it("filters options by query", () => {
    render(<Combobox options={options} onAdd={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText("Search…"), { target: { value: "bra" } })
    expect(screen.getByText("Bravo")).toBeInTheDocument()
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument()
  })

  it("commits the clicked option on Add", () => {
    const onAdd = vi.fn()
    render(<Combobox options={options} onAdd={onAdd} />)
    fireEvent.focus(screen.getByPlaceholderText("Search…"))
    fireEvent.click(screen.getByText("Charlie"))
    fireEvent.click(screen.getByText("Add"))
    expect(onAdd).toHaveBeenCalledWith("c")
  })

  it("selects the highlighted option with Enter, then Add commits it", () => {
    const onAdd = vi.fn()
    render(<Combobox options={options} onAdd={onAdd} />)
    const input = screen.getByPlaceholderText("Search…")
    fireEvent.focus(input)
    fireEvent.keyDown(input, { key: "ArrowDown" }) // move highlight from Alpha to Bravo
    fireEvent.keyDown(input, { key: "Enter" })
    fireEvent.click(screen.getByText("Add"))
    expect(onAdd).toHaveBeenCalledWith("b")
  })

  it("Add falls back to the first filtered match when nothing is selected", () => {
    const onAdd = vi.fn()
    render(<Combobox options={options} onAdd={onAdd} />)
    fireEvent.change(screen.getByPlaceholderText("Search…"), { target: { value: "char" } })
    fireEvent.click(screen.getByText("Add"))
    expect(onAdd).toHaveBeenCalledWith("c")
  })

  it("opens the full list via the toggle button without typing, and can browse to add", () => {
    const onAdd = vi.fn()
    render(<Combobox options={options} onAdd={onAdd} />)
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument()
    fireEvent.click(screen.getByLabelText("Toggle options"))
    expect(screen.getByText("Alpha")).toBeInTheDocument()
    expect(screen.getByText("Bravo")).toBeInTheDocument()
    fireEvent.click(screen.getByText("Charlie"))
    fireEvent.click(screen.getByText("Add"))
    expect(onAdd).toHaveBeenCalledWith("c")
  })

  it("disables Add when no options match", () => {
    render(<Combobox options={options} onAdd={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText("Search…"), { target: { value: "zzz" } })
    expect(screen.getByText("Add")).toBeDisabled()
  })

  it("disables the input and Add when disabled", () => {
    render(<Combobox options={options} onAdd={vi.fn()} disabled />)
    expect(screen.getByPlaceholderText("Search…")).toBeDisabled()
    expect(screen.getByText("Add")).toBeDisabled()
  })

  it("uses a custom placeholder and add label", () => {
    render(<Combobox options={options} onAdd={vi.fn()} placeholder="Search species…" addLabel="Create" />)
    expect(screen.getByPlaceholderText("Search species…")).toBeInTheDocument()
    expect(screen.getByText("Create")).toBeInTheDocument()
  })

  it("keeps the highlight within the rendered options when the list exceeds 100", () => {
    const many = Array.from({ length: 150 }, (_, i) => ({
      value: `v${i}`,
      label: `Item ${String(i).padStart(3, "0")}`,
    }))
    render(<Combobox options={many} onAdd={vi.fn()} />)
    const input = screen.getByPlaceholderText("Search…")
    fireEvent.focus(input)
    // Only the first 100 options are rendered.
    expect(screen.getAllByRole("option")).toHaveLength(100)
    // Arrowing past the rendered window keeps the highlight on a rendered row.
    for (let i = 0; i < 120; i++) {
      fireEvent.keyDown(input, { key: "ArrowDown" })
    }
    const highlighted = screen
      .getAllByRole("option")
      .filter((el) => el.getAttribute("aria-selected") === "true")
    expect(highlighted).toHaveLength(1)
  })
})
