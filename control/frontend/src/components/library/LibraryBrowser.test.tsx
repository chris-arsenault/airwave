import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import { renderWithProviders } from '../../test-utils'
import { LibraryBrowser } from './LibraryBrowser'
import { useDeviceStore } from '../../stores/deviceStore'

const { mockBrowse, mockSearch } = vi.hoisted(() => ({
  mockBrowse: vi.fn(),
  mockSearch: vi.fn(),
}))

vi.mock('../../api/client', () => ({
  api: {
    browse: mockBrowse,
    search: mockSearch,
    play: vi.fn(() => Promise.resolve()),
  },
}))

describe('LibraryBrowser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useDeviceStore.setState({ devices: [], activeDeviceId: 'dev-1' })
  })

  it('renders search bar', () => {
    mockBrowse.mockResolvedValue({ items: [], total: 0 })
    renderWithProviders(<LibraryBrowser />)
    expect(screen.getByPlaceholderText('Search tracks, artists, albums...')).toBeInTheDocument()
  })

  it('shows root categories as a grid', async () => {
    mockBrowse.mockResolvedValue({
      items: [
        { type: 'container', id: '1', parent_id: '0', title: 'Artists', class: null, child_count: 50 },
        { type: 'container', id: '2', parent_id: '0', title: 'Albums', class: null, child_count: 30 },
        { type: 'container', id: '3', parent_id: '0', title: 'Genres', class: null, child_count: 10 },
        { type: 'container', id: '4', parent_id: '0', title: 'All Tracks', class: null, child_count: 200 },
      ],
      total: 4,
    })
    renderWithProviders(<LibraryBrowser />)
    await waitFor(() => {
      expect(screen.getByText('Artists')).toBeInTheDocument()
      expect(screen.getByText('Albums')).toBeInTheDocument()
      expect(screen.getByText('Genres')).toBeInTheDocument()
      expect(screen.getByText('All Tracks')).toBeInTheDocument()
    })
  })

  it('shows child count for containers', async () => {
    mockBrowse.mockResolvedValue({
      items: [
        { type: 'container', id: '1', parent_id: '0', title: 'Artists', class: null, child_count: 50 },
      ],
      total: 1,
    })
    renderWithProviders(<LibraryBrowser />)
    await waitFor(() => {
      expect(screen.getByText('50 items')).toBeInTheDocument()
    })
  })

  it('shows "Empty" when browse returns no items', async () => {
    mockBrowse.mockResolvedValue({ items: [], total: 0 })
    renderWithProviders(<LibraryBrowser />)
    await waitFor(() => {
      expect(screen.getByText('Empty')).toBeInTheDocument()
    })
  })

  it('navigates into a container on click', async () => {
    mockBrowse
      .mockResolvedValueOnce({
        items: [
          { type: 'container', id: '1', parent_id: '0', title: 'Artists', class: null, child_count: 2 },
        ],
        total: 1,
      })
      .mockResolvedValueOnce({
        items: [
          { type: 'container', id: '10', parent_id: '1', title: 'Pink Floyd', class: null, child_count: 5 },
          { type: 'container', id: '11', parent_id: '1', title: 'Led Zeppelin', class: null, child_count: 8 },
        ],
        total: 2,
      })
    renderWithProviders(<LibraryBrowser />)
    await waitFor(() => screen.getByText('Artists'))
    fireEvent.click(screen.getByText('Artists'))
    await waitFor(() => {
      expect(screen.getByText('Pink Floyd')).toBeInTheDocument()
      expect(screen.getByText('Led Zeppelin')).toBeInTheDocument()
    })
  })

  it('shows breadcrumbs after navigating', async () => {
    mockBrowse
      .mockResolvedValueOnce({
        items: [
          { type: 'container', id: '1', parent_id: '0', title: 'Artists', class: null },
        ],
        total: 1,
      })
      .mockResolvedValueOnce({ items: [], total: 0 })
    renderWithProviders(<LibraryBrowser />)
    await waitFor(() => screen.getByText('Artists'))
    fireEvent.click(screen.getByText('Artists'))
    await waitFor(() => {
      expect(screen.getByText('Library')).toBeInTheDocument()
      // "Artists" appears both in breadcrumb — just check it exists
      expect(screen.getByText('Artists')).toBeInTheDocument()
    })
  })
})
