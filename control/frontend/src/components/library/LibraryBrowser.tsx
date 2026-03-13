import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, type LibraryItem, type ContainerInfo } from '../../api/client'
import { useDeviceStore } from '../../stores/deviceStore'
import { usePlayerStore } from '../../stores/playerStore'

const CATEGORY_ICONS: Record<string, string> = {
  Artists: '\uD83C\uDFA4',
  'Album Artists': '\uD83C\uDFB6',
  Albums: '\uD83D\uDCBF',
  Genres: '\uD83C\uDFB5',
  'All Tracks': '\u266B',
}

interface BreadcrumbEntry {
  id: string
  title: string
}

export function LibraryBrowser() {
  const [path, setPath] = useState<BreadcrumbEntry[]>([{ id: '0', title: 'Library' }])
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)

  const currentId = path[path.length - 1].id

  const browseQuery = useQuery({
    queryKey: ['library', 'browse', currentId],
    queryFn: () => api.browse(currentId),
    enabled: !searching,
  })

  const searchQueryResult = useQuery({
    queryKey: ['library', 'search', searchQuery],
    queryFn: () => api.search(searchQuery),
    enabled: searching && searchQuery.length >= 2,
  })

  const containerInfo = browseQuery.data?.container
  const items = searching ? searchQueryResult.data?.items : browseQuery.data?.items
  const isLoading = searching ? searchQueryResult.isLoading : browseQuery.isLoading

  const navigateTo = (item: LibraryItem) => {
    if (item.type === 'container') {
      setPath([...path, { id: item.id, title: item.title ?? 'Unknown' }])
      setSearching(false)
      setSearchQuery('')
    }
  }

  const navigateBack = () => {
    if (path.length > 1) {
      setPath(path.slice(0, -1))
    }
  }

  const navigateToBreadcrumb = (index: number) => {
    setPath(path.slice(0, index + 1))
    setSearching(false)
    setSearchQuery('')
  }

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    setSearching(value.length > 0)
  }

  return (
    <div className="space-y-3">
      {/* Search bar */}
      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)]" />
        <input
          type="text"
          placeholder="Search tracks, artists, albums..."
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="w-full bg-[var(--color-surface-elevated)] border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none focus:border-[var(--color-accent)] transition-colors placeholder:text-[var(--color-text-secondary)]"
        />
        {searchQuery && (
          <button
            onClick={() => handleSearchChange('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          >
            <XIcon />
          </button>
        )}
      </div>

      {/* Breadcrumbs */}
      {!searching && path.length > 1 && (
        <div className="flex items-center gap-1 text-sm overflow-x-auto">
          <button onClick={navigateBack} className="text-[var(--color-text-secondary)] shrink-0 p-1">
            <ChevronLeftIcon />
          </button>
          {path.map((entry, i) => (
            <span key={entry.id} className="flex items-center gap-1 shrink-0">
              {i > 0 && <span className="text-[var(--color-text-secondary)]">/</span>}
              <button
                onClick={() => navigateToBreadcrumb(i)}
                className={i === path.length - 1
                  ? 'text-[var(--color-text-primary)] font-medium'
                  : 'text-[var(--color-text-secondary)]'
                }
              >
                {entry.title}
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Container header with artist/album info and queue-all button */}
      {!searching && containerInfo && (containerInfo.artist || containerInfo.album) && (
        <ContainerHeader info={containerInfo} />
      )}

      {/* Content */}
      {isLoading ? (
        <div className="text-center py-12 text-[var(--color-text-secondary)] text-sm">Loading...</div>
      ) : !items?.length ? (
        <div className="text-center py-12 text-[var(--color-text-secondary)] text-sm">
          {searching ? 'No results found' : 'Empty'}
        </div>
      ) : currentId === '0' && !searching ? (
        <CategoryGrid items={items} onSelect={navigateTo} />
      ) : (
        <ItemList items={items} onSelect={navigateTo} />
      )}
    </div>
  )
}

function ContainerHeader({ info }: { info: ContainerInfo }) {
  const activeDeviceId = useDeviceStore((s) => s.activeDeviceId)
  const setPlaying = usePlayerStore((s) => s.setPlaying)

  const isAlbum = info.class === 'object.container.album.musicAlbum'
  const isArtist = info.class === 'object.container.person.musicArtist'

  const handleQueueAll = async () => {
    if (!activeDeviceId) return
    await api.play(activeDeviceId, { container_id: info.id })
    setPlaying(true)
  }

  return (
    <div className="bg-[var(--color-surface-elevated)] rounded-xl px-4 py-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        {isArtist && (
          <div className="text-base font-semibold truncate">{info.artist}</div>
        )}
        {isAlbum && (
          <>
            <div className="text-base font-semibold truncate">{info.album}</div>
            {info.artist && (
              <div className="text-sm text-[var(--color-text-secondary)] truncate">{info.artist}</div>
            )}
          </>
        )}
      </div>
      {activeDeviceId && (isArtist || isAlbum) && (
        <button
          onClick={handleQueueAll}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--color-accent)] text-white text-xs font-medium active:scale-95 transition-transform"
          title="Play all"
        >
          <PlayIcon />
          Play All
        </button>
      )}
    </div>
  )
}

function CategoryGrid({ items, onSelect }: { items: LibraryItem[]; onSelect: (item: LibraryItem) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => onSelect(item)}
          className="bg-[var(--color-surface-elevated)] rounded-xl p-5 text-left hover:bg-[var(--color-surface-hover)] transition-colors active:scale-[0.98]"
        >
          <div className="text-2xl mb-2">{CATEGORY_ICONS[item.title ?? ''] ?? '\uD83D\uDCC1'}</div>
          <div className="text-sm font-medium">{item.title}</div>
          {item.child_count != null && (
            <div className="text-xs text-[var(--color-text-secondary)] mt-0.5">
              {item.child_count} {item.child_count === 1 ? 'item' : 'items'}
            </div>
          )}
        </button>
      ))}
    </div>
  )
}

function ItemList({ items, onSelect }: { items: LibraryItem[]; onSelect: (item: LibraryItem) => void }) {
  const activeDeviceId = useDeviceStore((s) => s.activeDeviceId)
  const setCurrentTrack = usePlayerStore((s) => s.setCurrentTrack)
  const setPlaying = usePlayerStore((s) => s.setPlaying)

  const handleTrackPlay = async (item: LibraryItem) => {
    if (!activeDeviceId) return
    // Play only this single track
    await api.play(activeDeviceId, { track_id: item.id })
    setCurrentTrack({
      id: item.id,
      title: item.title ?? 'Unknown',
      artist: item.artist ?? null,
      album: item.album ?? null,
      duration: item.duration ?? null,
      stream_url: item.stream_url ?? null,
    })
    setPlaying(true)
  }

  const handleAddToQueue = async (item: LibraryItem) => {
    if (!activeDeviceId) return
    await api.addToQueue(activeDeviceId, [item.id])
  }

  const handlePlayContainer = async (item: LibraryItem) => {
    if (!activeDeviceId) return
    await api.play(activeDeviceId, { container_id: item.id })
    setPlaying(true)
  }

  return (
    <div className="space-y-0.5">
      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[var(--color-surface-hover)] transition-colors group"
        >
          {item.type === 'container' ? (
            <button
              onClick={() => onSelect(item)}
              className="flex items-center gap-3 flex-1 min-w-0 text-left"
            >
              <div className="w-10 h-10 rounded-lg bg-[var(--color-surface-elevated)] flex items-center justify-center text-[var(--color-text-secondary)] shrink-0">
                <FolderIcon />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{item.title ?? 'Unknown'}</div>
                <div className="text-xs text-[var(--color-text-secondary)] truncate">
                  {item.artist && item.album
                    ? `${item.artist} \u2014 ${item.child_count ?? 0} tracks`
                    : `${item.child_count ?? 0} items`
                  }
                </div>
              </div>
              <ChevronRightIcon className="text-[var(--color-text-secondary)] shrink-0" />
            </button>
          ) : (
            <>
              <button
                onClick={() => handleTrackPlay(item)}
                className="flex items-center gap-3 flex-1 min-w-0 text-left"
                title="Play"
              >
                <div className="w-10 h-10 rounded-lg bg-[var(--color-accent)]/10 flex items-center justify-center shrink-0 group-hover:bg-[var(--color-accent)]/20 transition-colors">
                  <PlayIcon />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {item.track_number && (
                      <span className="text-[var(--color-text-secondary)] mr-1.5">{item.track_number}.</span>
                    )}
                    {item.title ?? 'Unknown'}
                  </div>
                  <div className="text-xs text-[var(--color-text-secondary)] truncate">
                    {[item.artist, item.album].filter(Boolean).join(' \u2014 ') || '\u00A0'}
                  </div>
                </div>
              </button>
              {item.duration && (
                <span className="text-xs text-[var(--color-text-secondary)] shrink-0">
                  {item.duration}
                </span>
              )}
              <button
                onClick={() => handleAddToQueue(item)}
                className="shrink-0 p-1.5 rounded-full text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 transition-colors opacity-0 group-hover:opacity-100"
                title="Add to queue"
              >
                <PlusIcon />
              </button>
            </>
          )}
          {/* Play all button for containers */}
          {item.type === 'container' && activeDeviceId && (
            <button
              onClick={() => handlePlayContainer(item)}
              className="shrink-0 p-1.5 rounded-full text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 transition-colors opacity-0 group-hover:opacity-100"
              title="Play all"
            >
              <PlayIcon />
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

// Icons
function SearchIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function ChevronLeftIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <polyline points="15,18 9,12 15,6" />
    </svg>
  )
}

function ChevronRightIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <polyline points="9,18 15,12 9,6" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--color-accent)" stroke="none">
      <polygon points="5,3 19,12 5,21" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function FolderIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  )
}
