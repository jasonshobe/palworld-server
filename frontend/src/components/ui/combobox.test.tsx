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
})
