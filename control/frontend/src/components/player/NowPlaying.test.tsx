import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithProviders } from '../../test-utils'
import { NowPlaying } from './NowPlaying'
import { usePlayerStore } from '../../stores/playerStore'
import { useDeviceStore } from '../../stores/deviceStore'
import type { Device } from '../../api/client'

const { mockPause, mockResume } = vi.hoisted(() => ({
  mockPause: vi.fn(() => Promise.resolve()),
  mockResume: vi.fn(() => Promise.resolve()),
}))

vi.mock('../../api/client', () => ({
  api: {
    pause: mockPause,
    resume: mockResume,
    next: vi.fn(() => Promise.resolve()),
    prev: vi.fn(() => Promise.resolve()),
    seek: vi.fn(() => Promise.resolve()),
    setVolume: vi.fn(() => Promise.resolve()),
    setShuffle: vi.fn(() => Promise.resolve()),
    setRepeat: vi.fn(() => Promise.resolve()),
  },
}))

function makeDevice(overrides: Partial<Device> = {}): Device {
  return {
    id: 'dev-1', name: 'Living Room', ip: '192.168.1.10', model: 'WiiM Pro',
    firmware: '4.8.1', volume: 0.5, muted: false, source: 'wifi',
    group_id: null, is_master: false, ...overrides,
  }
}

describe('NowPlaying', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    usePlayerStore.setState({
      playing: false,
      currentTrack: {
        id: 't1', title: 'Test Song', artist: 'Test Artist', album: 'Test Album',
        duration: '4:30', stream_url: null,
      },
      elapsedSeconds: 60,
      durationSeconds: 270,
      shuffleMode: 'off',
      repeatMode: 'off',
    })
    useDeviceStore.setState({
      devices: [makeDevice()],
      activeDeviceId: 'dev-1',
    })
  })

  it('renders nothing when closed', () => {
    const { container } = renderWithProviders(<NowPlaying open={false} onClose={vi.fn()} />)
    expect(container.querySelector('[class*="fixed"]')).toBeNull()
  })

  it('shows track info when open', () => {
    renderWithProviders(<NowPlaying open={true} onClose={vi.fn()} />)
    expect(screen.getByText('Test Song')).toBeInTheDocument()
    expect(screen.getByText('Test Artist — Test Album')).toBeInTheDocument()
  })

  it('shows device name', () => {
    renderWithProviders(<NowPlaying open={true} onClose={vi.fn()} />)
    expect(screen.getByText('Living Room')).toBeInTheDocument()
  })

  it('shows formatted time', () => {
    renderWithProviders(<NowPlaying open={true} onClose={vi.fn()} />)
    expect(screen.getByText('1:00')).toBeInTheDocument() // 60s
    expect(screen.getByText('4:30')).toBeInTheDocument() // 270s
  })

  it('shows "Nothing playing" when no track', () => {
    usePlayerStore.setState({ currentTrack: null })
    renderWithProviders(<NowPlaying open={true} onClose={vi.fn()} />)
    expect(screen.getByText('Nothing playing')).toBeInTheDocument()
  })

  it('calls onClose when chevron is clicked', () => {
    const onClose = vi.fn()
    renderWithProviders(<NowPlaying open={true} onClose={onClose} />)
    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[0])
    expect(onClose).toHaveBeenCalled()
  })

  it('calls api.resume when play is clicked while paused', () => {
    usePlayerStore.setState({ playing: false })
    renderWithProviders(<NowPlaying open={true} onClose={vi.fn()} />)
    const bigButton = document.querySelector('button.w-16')!
    fireEvent.click(bigButton)
    expect(mockResume).toHaveBeenCalledWith('dev-1')
  })

  it('calls api.pause when pause is clicked while playing', () => {
    usePlayerStore.setState({ playing: true })
    renderWithProviders(<NowPlaying open={true} onClose={vi.fn()} />)
    const bigButton = document.querySelector('button.w-16')!
    fireEvent.click(bigButton)
    expect(mockPause).toHaveBeenCalledWith('dev-1')
  })

  it('shows volume percentage', () => {
    renderWithProviders(<NowPlaying open={true} onClose={vi.fn()} />)
    expect(screen.getByText('50')).toBeInTheDocument()
  })
})
