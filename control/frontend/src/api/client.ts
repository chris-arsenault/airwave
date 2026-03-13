const BASE = '/api'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

export const api = {
  // Devices
  getDevices: () => request<Device[]>('/devices'),
  getDevice: (id: string) => request<Device>(`/devices/${id}`),
  setVolume: (id: string, volume: number) =>
    request('/devices/' + id + '/volume', { method: 'POST', body: JSON.stringify({ volume }) }),
  toggleMute: (id: string) =>
    request('/devices/' + id + '/mute', { method: 'POST' }),
  setEnabled: (id: string, enabled: boolean) =>
    request('/devices/' + id + '/enabled', { method: 'POST', body: JSON.stringify({ enabled }) }),

  // Library
  browse: (id = '0', start = 0, count = 0) =>
    request<BrowseResult>(`/library/browse?id=${id}&start=${start}&count=${count}`),
  search: (q: string, start = 0, count = 0) =>
    request<BrowseResult>(`/library/search?q=${encodeURIComponent(q)}&start=${start}&count=${count}`),

  // Playback
  getPlaybackState: (targetId: string) => request<PlaybackState>(`/playback/${targetId}`),
  play: (targetId: string, body: PlayRequest) =>
    request(`/playback/${targetId}/play`, { method: 'POST', body: JSON.stringify(body) }),
  pause: (targetId: string) =>
    request(`/playback/${targetId}/pause`, { method: 'POST' }),
  resume: (targetId: string) =>
    request(`/playback/${targetId}/resume`, { method: 'POST' }),
  next: (targetId: string) =>
    request(`/playback/${targetId}/next`, { method: 'POST' }),
  prev: (targetId: string) =>
    request(`/playback/${targetId}/prev`, { method: 'POST' }),
  seek: (targetId: string, positionSeconds: number) =>
    request(`/playback/${targetId}/seek`, { method: 'POST', body: JSON.stringify({ position_seconds: positionSeconds }) }),
  setShuffle: (targetId: string, mode: string) =>
    request(`/playback/${targetId}/shuffle`, { method: 'POST', body: JSON.stringify({ mode }) }),
  setRepeat: (targetId: string, mode: string) =>
    request(`/playback/${targetId}/repeat`, { method: 'POST', body: JSON.stringify({ mode }) }),

  // Session-based playback
  sessionPlay: (targetId: string, body: SessionPlayRequest) =>
    request(`/playback/${targetId}/session/play`, { method: 'POST', body: JSON.stringify(body) }),
  sessionNext: (targetId: string) =>
    request(`/playback/${targetId}/session/next`, { method: 'POST' }),
  sessionPrev: (targetId: string) =>
    request(`/playback/${targetId}/session/prev`, { method: 'POST' }),
  sessionSetShuffle: (targetId: string, mode: string) =>
    request(`/playback/${targetId}/session/shuffle`, { method: 'POST', body: JSON.stringify({ mode }) }),
  sessionSetRepeat: (targetId: string, mode: string) =>
    request(`/playback/${targetId}/session/repeat`, { method: 'POST', body: JSON.stringify({ mode }) }),

  // Queue
  getQueue: (targetId: string) => request<QueueState>(`/playback/${targetId}/queue`),
  addToQueue: (targetId: string, trackIds: string[], position = 'end') =>
    request(`/playback/${targetId}/queue/add`, { method: 'POST', body: JSON.stringify({ track_ids: trackIds, position }) }),
  removeFromQueue: (targetId: string, index: number) =>
    request(`/playback/${targetId}/queue/${index}`, { method: 'DELETE' }),
  clearQueue: (targetId: string) =>
    request(`/playback/${targetId}/queue`, { method: 'DELETE' }),

  // Playlists
  getPlaylists: () => request<Playlist[]>('/playlists'),
  getPlaylist: (id: number) => request<PlaylistDetail>(`/playlists/${id}`),
  createPlaylist: (name: string, trackIds: string[] = []) =>
    request('/playlists', { method: 'POST', body: JSON.stringify({ name, track_ids: trackIds }) }),
  deletePlaylist: (id: number) =>
    request(`/playlists/${id}`, { method: 'DELETE' }),

  // Groups
  createGroup: (masterId: string, slaveIds: string[]) =>
    request('/groups', { method: 'POST', body: JSON.stringify({ master_id: masterId, slave_ids: slaveIds }) }),
  dissolveGroup: (masterId: string) =>
    request(`/groups/${masterId}`, { method: 'DELETE' }),

  // Health
  health: () => request<{ status: string }>('/health'),

  // Art (returns image URL, not a JSON request)
  artUrl: (trackId: string) => `${BASE}/art/${trackId}`,
}

// Types
export interface DeviceCapabilities {
  av_transport: boolean
  rendering_control: boolean
  wiim_extended: boolean
}

export interface Device {
  id: string
  name: string
  ip: string
  model: string | null
  firmware: string | null
  device_type: string
  enabled: boolean
  capabilities: DeviceCapabilities
  volume: number
  muted: boolean
  source: string | null
  group_id: string | null
  is_master: boolean
}

export interface LibraryItem {
  type: 'container' | 'track'
  id: string
  parent_id: string | null
  title: string | null
  artist?: string | null
  album?: string | null
  album_artist?: string | null
  genre?: string | null
  track_number?: string | null
  class: string | null
  child_count?: number
  duration?: string | null
  stream_url?: string | null
  mime_type?: string | null
  sample_rate?: string | null
  bit_depth?: string | null
}

export interface ContainerInfo {
  id: string
  title: string
  class?: string
  artist?: string
  album?: string
}

export interface BrowseResult {
  container?: ContainerInfo
  items: LibraryItem[]
  total: number
}

export interface QueueTrack {
  id: string
  title: string
  artist: string | null
  album: string | null
  duration: string | null
  stream_url: string | null
}

export interface SessionInfo {
  source_id: string
  label: string
  class?: string
  artist?: string
  album?: string
  shuffle_mode: string
  repeat_mode: string
  total_tracks: number
  position: number
}

export interface PlaybackState {
  target_id: string
  playing: boolean
  current_track: QueueTrack | null
  position: number
  queue_length: number
  shuffle_mode: string
  repeat_mode: string
  elapsed_seconds: number
  duration_seconds: number
  session?: SessionInfo | null
}

export interface QueueState {
  tracks: QueueTrack[]
  position: number
}

export interface PlayRequest {
  track_id?: string
  track_ids?: string[]
  container_id?: string
  start_index?: number
}

export interface SessionPlayRequest {
  source_id: string
  start_track_id?: string
}

export interface Playlist {
  id: number
  name: string
  track_count: number
  created_at: string | null
  updated_at: string | null
}

export interface PlaylistDetail extends Playlist {
  tracks: { track_id: string; position: number }[]
}
