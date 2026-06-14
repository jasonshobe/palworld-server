import { render, screen, fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Toaster } from "sonner"
import SavesPage from "./SavesPage"
import { commitSave, getPlayers, getPals, getSpecies, createPal } from "@/api/saves"

vi.mock("@/hooks/useServerStatus", () => ({
  useServerStatus: () => ({ data: { state: "stopped" } }),
}))

vi.mock("@/api/saves", () => ({
  getPlayers: vi.fn(() => Promise.resolve({ players: [], has_working_pals: false })),
  getPals: vi.fn(() => Promise.resolve([])),
  getSpecies: vi.fn(() => Promise.resolve([])),
  createPal: vi.fn(),
  commitSave: vi.fn(),
}))

vi.mock("@/components/saves/PalDetail", () => ({
  default: ({ pal }: { pal: { nickname: string; display_name: string | null } }) => (
    <div>Detail: {pal.nickname || pal.display_name}</div>
  ),
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

describe("SavesPage create pal", () => {
  beforeEach(() => vi.clearAllMocks())

  it("creates a pal, selects it, and shows a toast", async () => {
    vi.mocked(getPlayers).mockResolvedValue({
      players: [{ uid: "uid-1", nickname: "Player1", level: 10 }],
      has_working_pals: false,
    })
    vi.mocked(getPals).mockResolvedValue([])
    vi.mocked(getSpecies).mockResolvedValue([{ internal_name: "Foxparks", label: "Foxparks" }])
    vi.mocked(createPal).mockResolvedValue({
      instance_id: "pal-new",
      player_uid: "uid-1",
      display_name: "Foxparks",
      nickname: "",
      level: 1,
      gender: "Female",
      is_unref: false,
      in_owner_palbox: true,
    })
    renderPage()

    // Wait until the species option has loaded so the control is enabled.
    await screen.findByRole("button", { name: "Player1" })
    await screen.findByRole("option", { name: "Foxparks" })
    await userEvent.click(screen.getByText("Add"))

    expect(createPal).toHaveBeenCalledWith("uid-1", "Foxparks")
    expect(await screen.findByText(/pal created/i)).toBeInTheDocument()
    expect(await screen.findByText(/Detail: Foxparks/)).toBeInTheDocument()
  })
})
