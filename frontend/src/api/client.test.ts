import { describe, it, expect, vi, beforeEach } from 'vitest'
import { apiFetch } from './client'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

describe('apiFetch', () => {
  it('returns parsed JSON on success', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ state: 'stopped' }),
    } as Response)

    const result = await apiFetch('/server/status')
    expect(result).toEqual({ state: 'stopped' })
  })

  it('dispatches unauthorized event on 401', async () => {
    const listener = vi.fn()
    window.addEventListener('unauthorized', listener)
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
    } as Response)

    await apiFetch('/protected').catch(() => {})
    expect(listener).toHaveBeenCalled()
    window.removeEventListener('unauthorized', listener)
  })
})
