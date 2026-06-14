import { render, screen, fireEvent } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Toaster } from "sonner"
import ConfigPage from "./ConfigPage"
import { getConfig, putConfig } from "@/api/config"

vi.mock("@/hooks/useServerStatus", () => ({
  useServerStatus: () => ({ data: { state: "stopped" } }),
}))

vi.mock("@/api/config", () => ({
  getConfig: vi.fn(),
  putConfig: vi.fn(),
}))

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <ConfigPage />
      <Toaster />
    </QueryClientProvider>,
  )
}

async function makeAnEditAndSave() {
  // Wait for config to load, then change a field to enable the Save button.
  const input = await screen.findByDisplayValue("MyServer")
  fireEvent.change(input, { target: { value: "MyServer2" } })
  fireEvent.click(screen.getByRole("button", { name: /save configuration/i }))
}

describe("ConfigPage save feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getConfig).mockResolvedValue({ ServerName: "MyServer" })
  })

  it("shows a success toast when saving succeeds", async () => {
    vi.mocked(putConfig).mockResolvedValue({ ok: true })
    renderPage()
    await makeAnEditAndSave()
    expect(await screen.findByText(/configuration saved/i)).toBeInTheDocument()
  })

  it("shows an error toast with the failure detail when saving fails", async () => {
    vi.mocked(putConfig).mockRejectedValue(new Error("Failed to write configuration"))
    renderPage()
    await makeAnEditAndSave()
    expect(await screen.findByText(/failed to write configuration/i)).toBeInTheDocument()
  })
})
