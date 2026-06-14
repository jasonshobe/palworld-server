import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import ModsPage from "./ModsPage"
import * as api from "@/api/mods"

vi.mock("@/api/mods")

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ModsPage />
    </QueryClientProvider>
  )
}

describe("ModsPage", () => {
  beforeEach(() => {
    vi.mocked(api.getMods).mockResolvedValue({
      mods: [{ path: "a.pak", size: 4, installed: true }],
    })
    vi.mocked(api.uploadMod).mockResolvedValue({ path: "b.pak", size: 2, installed: false })
    vi.mocked(api.deleteMod).mockResolvedValue({ ok: true })
  })

  it("shows the apply-on-restart note and the mod list", async () => {
    renderPage()
    expect(screen.getByText(/apply on the next server start/i)).toBeInTheDocument()
    expect(await screen.findByText("a.pak")).toBeInTheDocument()
  })

  it("uploads a selected file", async () => {
    renderPage()
    const file = new File([new Uint8Array([1, 2])], "b.pak")
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })
    fireEvent.click(screen.getByRole("button", { name: /upload/i }))
    await waitFor(() => expect(api.uploadMod).toHaveBeenCalledWith(file, ""))
  })

  it("deletes a mod", async () => {
    renderPage()
    await screen.findByText("a.pak")
    fireEvent.click(screen.getByRole("button", { name: /delete/i }))
    await waitFor(() => expect(api.deleteMod).toHaveBeenCalledWith("a.pak"))
  })
})
