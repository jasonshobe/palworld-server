import { render, screen, fireEvent } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Toaster } from "sonner"
import SavesPage from "./SavesPage"
import { commitSave } from "@/api/saves"

vi.mock("@/hooks/useServerStatus", () => ({
  useServerStatus: () => ({ data: { state: "stopped" } }),
}))

vi.mock("@/api/saves", () => ({
  getPlayers: vi.fn(() => Promise.resolve({ players: [], has_working_pals: false })),
  getPals: vi.fn(() => Promise.resolve([])),
  commitSave: vi.fn(),
}))

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <SavesPage />
      <Toaster />
    </QueryClientProvider>,
  )
}

describe("SavesPage commit feedback", () => {
  beforeEach(() => vi.clearAllMocks())

  it("shows a success toast when Save to Disk succeeds", async () => {
    vi.mocked(commitSave).mockResolvedValue({ ok: true })
    renderPage()
    fireEvent.click(screen.getByRole("button", { name: /save to disk/i }))
    expect(await screen.findByText(/changes saved to disk/i)).toBeInTheDocument()
  })

  it("shows an error toast with the failure detail when Save to Disk fails", async () => {
    vi.mocked(commitSave).mockRejectedValue(new Error("Failed to write save to disk"))
    renderPage()
    fireEvent.click(screen.getByRole("button", { name: /save to disk/i }))
    expect(await screen.findByText(/failed to write save to disk/i)).toBeInTheDocument()
  })
})
