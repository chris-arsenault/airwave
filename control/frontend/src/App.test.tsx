import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithProviders } from './test-utils'
import App from './App'
import { useDeviceStore } from './stores/deviceStore'
import { usePlayerStore } from './stores/playerStore'

// Mock api
vi.mock('./api/client', () => ({
  api: {
    getDevices: vi.fn(() => Promise.resolve([])),
    browse: vi.fn(() => Promise.resolve({ items: [], total: 0 })),
    getQueue: vi.fn(() => Promise.resolve({ tracks: [], position: 0 })),
    pause: vi.fn(() => Promise.resolve()),
    resume: vi.fn(() => Promise.resolve()),
  },
}))

// Mock SSE
vi.mock('./hooks/useSSE', () => ({
  useSSE: vi.fn(),
}))

// Mock playback polling
vi.mock('./hooks/usePlaybackPolling', () => ({
  usePlaybackPolling: vi.fn(),
}))

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  },
}))

describe('App', () => {
  beforeEach(() => {
    useDeviceStore.setState({ devices: [], activeDeviceId: null })
    usePlayerStore.setState({ playing: false, currentTrack: null })
  })

  it('renders the app header', () => {
    renderWithProviders(<App />)
    expect(screen.getByText('WiiM Control')).toBeInTheDocument()
  })

  it('renders bottom navigation', () => {
    renderWithProviders(<App />)
    expect(screen.getByText('Library')).toBeInTheDocument()
    expect(screen.getByText('Queue')).toBeInTheDocument()
    expect(screen.getByText('Rooms')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('shows Library tab by default', async () => {
    renderWithProviders(<App />)
    // Library search bar should be visible
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search tracks, artists, albums...')).toBeInTheDocument()
    })
  })

  it('navigates to Queue tab', async () => {
    renderWithProviders(<App />)
    fireEvent.click(screen.getByText('Queue'))
    await waitFor(() => {
      expect(screen.getAllByText('No device selected').length).toBeGreaterThanOrEqual(1)
    })
  })

  it('navigates to Rooms tab', () => {
    renderWithProviders(<App />)
    fireEvent.click(screen.getByText('Rooms'))
    expect(screen.getByText('Discovering devices...')).toBeInTheDocument()
  })

  it('navigates to Settings tab', () => {
    renderWithProviders(<App />)
    fireEvent.click(screen.getByText('Settings'))
    expect(screen.getAllByText('No device selected').length).toBeGreaterThanOrEqual(1)
  })
})
