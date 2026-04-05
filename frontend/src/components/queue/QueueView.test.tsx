import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../test-utils'
import { QueueView } from './QueueView'
import { useDeviceStore } from '../../stores/deviceStore'
import { usePlayerStore } from '../../stores/playerStore'

const { mockGetQueue } = vi.hoisted(() => ({
  mockGetQueue: vi.fn(),
}))

vi.mock('../../api/client', () => ({
  api: {
    getQueue: mockGetQueue,
    removeFromQueue: vi.fn(() => Promise.resolve()),
    clearQueue: vi.fn(() => Promise.resolve()),
  },
}))

describe('QueueView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useDeviceStore.setState({ devices: [], activeDeviceId: null })
    usePlayerStore.setState({ playing: false, currentTrack: null })
  })

  it('shows "No device selected" when no active device', () => {
    renderWithProviders(<QueueView />)
    expect(screen.getByText('No device selected')).toBeInTheDocument()
  })

  it('shows empty queue message when queue has no tracks', async () => {
    useDeviceStore.setState({ activeDeviceId: 'dev-1' })
    mockGetQueue.mockResolvedValue({ tracks: [], position: 0 })
    renderWithProviders(<QueueView />)
    await waitFor(() => {
      expect(screen.getByText('Queue is empty')).toBeInTheDocument()
    })
  })

  it('renders tracks in the queue', async () => {
    useDeviceStore.setState({ activeDeviceId: 'dev-1' })
    mockGetQueue.mockResolvedValue({
      tracks: [
        { id: 't1', title: 'Song One', artist: 'Artist A', album: 'Album X', duration: '3:30', stream_url: null },
        { id: 't2', title: 'Song Two', artist: 'Artist B', album: null, duration: '4:15', stream_url: null },
      ],
      position: 0,
    })
    renderWithProviders(<QueueView />)
    await waitFor(() => {
      expect(screen.getByText('Song One')).toBeInTheDocument()
      expect(screen.getByText('Song Two')).toBeInTheDocument()
    })
  })

  it('shows track count footer', async () => {
    useDeviceStore.setState({ activeDeviceId: 'dev-1' })
    mockGetQueue.mockResolvedValue({
      tracks: [
        { id: 't1', title: 'Song One', artist: null, album: null, duration: null, stream_url: null },
        { id: 't2', title: 'Song Two', artist: null, album: null, duration: null, stream_url: null },
        { id: 't3', title: 'Song Three', artist: null, album: null, duration: null, stream_url: null },
      ],
      position: 0,
    })
    renderWithProviders(<QueueView />)
    await waitFor(() => {
      expect(screen.getByText('3 tracks in queue')).toBeInTheDocument()
    })
  })

  it('singular "track" for single-track queue', async () => {
    useDeviceStore.setState({ activeDeviceId: 'dev-1' })
    mockGetQueue.mockResolvedValue({
      tracks: [
        { id: 't1', title: 'Solo Song', artist: null, album: null, duration: null, stream_url: null },
      ],
      position: 0,
    })
    renderWithProviders(<QueueView />)
    await waitFor(() => {
      expect(screen.getByText('1 track in queue')).toBeInTheDocument()
    })
  })

  it('shows "Clear all" button when queue has tracks', async () => {
    useDeviceStore.setState({ activeDeviceId: 'dev-1' })
    mockGetQueue.mockResolvedValue({
      tracks: [
        { id: 't1', title: 'Song', artist: null, album: null, duration: null, stream_url: null },
      ],
      position: 0,
    })
    renderWithProviders(<QueueView />)
    await waitFor(() => {
      expect(screen.getByText('Clear all')).toBeInTheDocument()
    })
  })
})
