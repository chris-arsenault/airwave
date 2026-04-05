const BASE = '/api'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  const text = await res.text()
  if (!text) return undefined as T
  return JSON.parse(text)
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
  renameDevice: (id: string, name: string) =>
    request('/devices/' + id + '/name', { method: 'POST', body: JSON.stringify({ name }) }),
  getChannel: (id: string) => request<{ channel: string }>(`/devices/${id}/channel`),
  setChannel: (id: string, channel: string) =>
    request('/devices/' + id + '/channel', { method: 'POST', body: JSON.stringify({ channel }) }),

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
  seekForward: (targetId: string) =>
    request(`/playback/${targetId}/seek-forward`, { method: 'POST' }),
  seekBackward: (targetId: string) =>
    request(`/playback/${targetId}/seek-backward`, { method: 'POST' }),
  rateTrack: (targetId: string, trackId: string, rating: number) =>
    request(`/playback/${targetId}/rate`, { method: 'POST', body: JSON.stringify({ track_id: trackId, rating }) }),
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
  moveInQueue: (targetId: string, fromIndex: number, toIndex: number) =>
    request(`/playback/${targetId}/queue/move`, { method: 'POST', body: JSON.stringify({ from_index: fromIndex, to_index: toIndex }) }),

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

  // Group presets
  getPresets: () => request<{ presets: Record<string, GroupDefinition[] | null> }>('/presets'),
  savePreset: (slot: number) => request('/presets/' + slot, { method: 'POST' }),
  loadPreset: (slot: number) => request('/presets/' + slot + '/load', { method: 'POST' }),
  deletePreset: (slot: number) => request('/presets/' + slot, { method: 'DELETE' }),

  // Metadata editing
  updateTrack: (trackId: string, update: TagUpdate) =>
    request(`/library/tracks/${trackId}`, { method: 'PATCH', body: JSON.stringify(update) }),
  bulkSetAlbumArtist: (containerId: string, albumArtist: string) =>
    request<BulkResult>('/library/bulk/album-artist', { method: 'POST', body: JSON.stringify({ container_id: containerId, album_artist: albumArtist }) }),
  bulkRenameArtist: (from: string, to: string, field = 'both') =>
    request<BulkResult>('/library/bulk/rename-artist', { method: 'POST', body: JSON.stringify({ from, to, field }) }),

  // Sleep timer
  setSleepTimer: (id: string, minutes: number) =>
    request('/devices/' + id + '/sleep-timer', { method: 'POST', body: JSON.stringify({ minutes }) }),
  getSleepTimer: (id: string) => request<SleepTimerState>(`/devices/${id}/sleep-timer`),
  cancelSleepTimer: (id: string) =>
    request('/devices/' + id + '/sleep-timer', { method: 'DELETE' }),

  // Device settings (HTTPS API)
  switchSource: (id: string, source: string) =>
    request('/devices/' + id + '/source', { method: 'POST', body: JSON.stringify({ source }) }),
  getWifiStatus: (id: string) => request<WifiStatus>(`/devices/${id}/wifi`),

  // EQ
  getEqState: (id: string) => request<EqState>(`/eq/${id}/state`),
  getEqPresets: (id: string) => request<{ presets: string[] }>(`/eq/${id}/presets`),
  loadEqPreset: (id: string, preset: string) =>
    request<EqState>(`/eq/${id}/load`, { method: 'POST', body: JSON.stringify({ preset }) }),
  enableEq: (id: string) =>
    request(`/eq/${id}/enable`, { method: 'POST' }),
  disableEq: (id: string) =>
    request(`/eq/${id}/disable`, { method: 'POST' }),
  setEqBand: (id: string, index: number, value: number) =>
    request(`/eq/${id}/band`, { method: 'POST', body: JSON.stringify({ index, value }) }),
  saveEqPreset: (id: string, name: string) =>
    request(`/eq/${id}/save`, { method: 'POST', body: JSON.stringify({ name }) }),
  deleteEqPreset: (id: string, name: string) =>
    request(`/eq/${id}/presets/${encodeURIComponent(name)}`, { method: 'DELETE' }),
  getBalance: (id: string) => request<{ balance: number }>(`/eq/${id}/balance`),
  setBalance: (id: string, balance: number) =>
    request(`/eq/${id}/balance`, { method: 'POST', body: JSON.stringify({ balance }) }),
  getCrossfade: (id: string) => request<{ enabled: boolean }>(`/eq/${id}/crossfade`),
  setCrossfade: (id: string, enabled: boolean) =>
    request(`/eq/${id}/crossfade`, { method: 'POST', body: JSON.stringify({ enabled }) }),

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
  https_api: boolean
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
  channel: string | null
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
  allowed_actions?: string[] | null
}

export interface SleepTimerState {
  remaining_seconds: number | null
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

export interface TagUpdate {
  title?: string
  artist?: string
  album?: string
  album_artist?: string
  genre?: string
  track_number?: number
  disc_number?: number
}

export interface BulkResult {
  total: number
  success: number
  failed: number
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

export interface EqBand {
  index: number
  param_name: string
  value: number
}

export interface EqState {
  enabled: boolean
  preset_name: string
  bands: EqBand[]
  channel_mode: string | null
  source_name: string | null
}

export interface WifiStatus {
  source: string | null
  rssi: number | null
  ssid: string | null
}

export interface GroupDefinition {
  master_id: string
  slave_ids: string[]
}
