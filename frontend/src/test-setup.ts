import '@testing-library/jest-dom'

// jsdom lacks ResizeObserver, which Radix UI (e.g. Slider) relies on.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver
