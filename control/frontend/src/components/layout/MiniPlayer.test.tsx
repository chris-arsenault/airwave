import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MiniPlayer } from './MiniPlayer'
import { usePlayerStore } from '../../stores/playerStore'
import { useDeviceStore } from '../../stores/deviceStore'

vi.mock('../../api/client', () => ({
  api: {
    pause: vi.fn(() => Promise.resolve()),
    resume: vi.fn(() => Promise.resolve()),
  },
}))

describe('MiniPlayer', () => {
  beforeEach(() => {
    usePlayerStore.setState({
      playing: false,
      currentTrack: null,
    })
    useDeviceStore.setState({
      devices: [],
      activeDeviceId: null,
    })
  })

  it('renders nothing when no track is playing', () => {
    const { container } = render(<MiniPlayer onExpand={vi.fn()} />)
    expect(container.innerHTML).toBe('')
  })

  it('shows track info when a track is set', () => {
    usePlayerStore.setState({
      currentTrack: {
        id: 't1',
        title: 'Test Song',
        artist: 'Test Artist',
        album: null,
        duration: null,
        stream_url: null,
      },
    })
    render(<MiniPlayer onExpand={vi.fn()} />)
    expect(screen.getByText('Test Song')).toBeInTheDocument()
    expect(screen.getByText('Test Artist')).toBeInTheDocument()
  })

  it('calls onExpand when clicked', () => {
    usePlayerStore.setState({
      currentTrack: {
        id: 't1', title: 'Song', artist: null, album: null, duration: null, stream_url: null,
      },
    })
    const onExpand = vi.fn()
    render(<MiniPlayer onExpand={onExpand} />)
    fireEvent.click(screen.getByText('Song'))
    expect(onExpand).toHaveBeenCalled()
  })
})
