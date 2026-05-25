import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import ServerStatusBadge from './ServerStatusBadge'

describe('ServerStatusBadge', () => {
  it('shows Stopped for stopped state', () => {
    render(<ServerStatusBadge state="stopped" />)
    expect(screen.getByText('Stopped')).toBeInTheDocument()
  })

  it('shows Running for running state', () => {
    render(<ServerStatusBadge state="running" />)
    expect(screen.getByText('Running')).toBeInTheDocument()
  })
})
