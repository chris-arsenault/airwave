import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, type LibraryItem, type TagUpdate } from '../../api/client'

interface TrackEditorProps {
  track: LibraryItem
  onClose: () => void
}

export function TrackEditor({ track, onClose }: TrackEditorProps) {
  const queryClient = useQueryClient()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [title, setTitle] = useState(track.title ?? '')
  const [artist, setArtist] = useState(track.artist ?? '')
  const [album, setAlbum] = useState(track.album ?? '')
  const [albumArtist, setAlbumArtist] = useState(track.album_artist ?? '')
  const [genre, setGenre] = useState(track.genre ?? '')
  const [trackNumber, setTrackNumber] = useState(track.track_number ?? '')
  const [discNumber, setDiscNumber] = useState('')

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    const update: TagUpdate = {}
    if (title !== (track.title ?? '')) update.title = title
    if (artist !== (track.artist ?? '')) update.artist = artist
    if (album !== (track.album ?? '')) update.album = album
    if (albumArtist !== (track.album_artist ?? '')) update.album_artist = albumArtist
    if (genre !== (track.genre ?? '')) update.genre = genre
    const tn = parseInt(trackNumber, 10)
    if (!isNaN(tn) && trackNumber !== (track.track_number ?? '')) update.track_number = tn
    const dn = parseInt(discNumber, 10)
    if (!isNaN(dn)) update.disc_number = dn

    if (Object.keys(update).length === 0) {
      onClose()
      return
    }

    try {
      await api.updateTrack(track.id, update)
      queryClient.invalidateQueries({ queryKey: ['library'] })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative bg-[var(--color-surface)] rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[85vh] overflow-y-auto p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Edit Track</h2>
          <button onClick={onClose} className="text-[var(--color-text-secondary)] p-1">
            <XIcon />
          </button>
        </div>

        {error && (
          <div className="text-sm text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</div>
        )}

        <Field label="Title" value={title} onChange={setTitle} />
        <Field label="Artist" value={artist} onChange={setArtist} />
        <Field label="Album" value={album} onChange={setAlbum} />
        <Field label="Album Artist" value={albumArtist} onChange={setAlbumArtist} />
        <Field label="Genre" value={genre} onChange={setGenre} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Track #" value={trackNumber} onChange={setTrackNumber} type="number" />
          <Field label="Disc #" value={discNumber} onChange={setDiscNumber} type="number" />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-white/10 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-[var(--color-accent)] text-white text-sm font-medium disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="block text-xs text-[var(--color-text-secondary)] mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-[var(--color-surface-elevated)] border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)] transition-colors"
      />
    </div>
  )
}

interface BulkAlbumArtistDialogProps {
  containerId: string
  currentArtist?: string
  onClose: () => void
}

export function BulkAlbumArtistDialog({ containerId, currentArtist, onClose }: BulkAlbumArtistDialogProps) {
  const queryClient = useQueryClient()
  const [value, setValue] = useState(currentArtist ?? '')
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<{ success: number; failed: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    if (!value.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await api.bulkSetAlbumArtist(containerId, value.trim())
      setResult({ success: res.success, failed: res.failed })
      queryClient.invalidateQueries({ queryKey: ['library'] })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative bg-[var(--color-surface)] rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">Set Album Artist</h2>
        <p className="text-sm text-[var(--color-text-secondary)]">
          Set album artist for all tracks in this container.
        </p>

        {error && (
          <div className="text-sm text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</div>
        )}

        {result ? (
          <>
            <div className="text-sm">
              Updated {result.success} track{result.success !== 1 ? 's' : ''}
              {result.failed > 0 && <span className="text-red-400"> ({result.failed} failed)</span>}
            </div>
            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-xl bg-[var(--color-accent)] text-white text-sm font-medium"
            >
              Done
            </button>
          </>
        ) : (
          <>
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Album artist name"
              className="w-full bg-[var(--color-surface-elevated)] border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)] transition-colors"
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-white/10 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !value.trim()}
                className="flex-1 py-2.5 rounded-xl bg-[var(--color-accent)] text-white text-sm font-medium disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Apply'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

interface RenameArtistDialogProps {
  initialFrom?: string
  onClose: () => void
}

export function RenameArtistDialog({ initialFrom, onClose }: RenameArtistDialogProps) {
  const queryClient = useQueryClient()
  const [from, setFrom] = useState(initialFrom ?? '')
  const [to, setTo] = useState('')
  const [field, setField] = useState<'both' | 'artist' | 'album_artist'>('both')
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<{ total: number; success: number; failed: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    if (!from.trim() || !to.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await api.bulkRenameArtist(from.trim(), to.trim(), field)
      setResult(res)
      queryClient.invalidateQueries({ queryKey: ['library'] })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative bg-[var(--color-surface)] rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">Rename Artist</h2>
        <p className="text-sm text-[var(--color-text-secondary)]">
          Find and replace artist names across all matching tracks.
        </p>

        {error && (
          <div className="text-sm text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</div>
        )}

        {result ? (
          <>
            <div className="text-sm">
              {result.total === 0
                ? 'No matching tracks found.'
                : <>Renamed {result.success} of {result.total} track{result.total !== 1 ? 's' : ''}
                  {result.failed > 0 && <span className="text-red-400"> ({result.failed} failed)</span>}
                </>
              }
            </div>
            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-xl bg-[var(--color-accent)] text-white text-sm font-medium"
            >
              Done
            </button>
          </>
        ) : (
          <>
            <div>
              <label className="block text-xs text-[var(--color-text-secondary)] mb-1">From</label>
              <input
                type="text"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                placeholder="Current artist name"
                className="w-full bg-[var(--color-surface-elevated)] border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)] transition-colors"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-secondary)] mb-1">To</label>
              <input
                type="text"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="New artist name"
                className="w-full bg-[var(--color-surface-elevated)] border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)] transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-secondary)] mb-1.5">Apply to</label>
              <div className="flex gap-2">
                {(['both', 'artist', 'album_artist'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setField(f)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      field === f
                        ? 'bg-[var(--color-accent)] text-white'
                        : 'bg-[var(--color-surface-elevated)] text-[var(--color-text-secondary)]'
                    }`}
                  >
                    {f === 'both' ? 'Both' : f === 'artist' ? 'Artist' : 'Album Artist'}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-white/10 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !from.trim() || !to.trim()}
                className="flex-1 py-2.5 rounded-xl bg-[var(--color-accent)] text-white text-sm font-medium disabled:opacity-50"
              >
                {saving ? 'Renaming...' : 'Rename'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function XIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}
