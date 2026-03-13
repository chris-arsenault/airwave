import { create } from 'zustand'
import type { QueueTrack } from '../api/client'

interface PlayerState {
  playing: boolean
  currentTrack: QueueTrack | null
  elapsedSeconds: number
  durationSeconds: number
  shuffleMode: string
  repeatMode: string
  setPlaying: (playing: boolean) => void
  setCurrentTrack: (track: QueueTrack | null) => void
  setElapsed: (seconds: number) => void
  setDuration: (seconds: number) => void
  setShuffleMode: (mode: string) => void
  setRepeatMode: (mode: string) => void
}

export const usePlayerStore = create<PlayerState>((set) => ({
  playing: false,
  currentTrack: null,
  elapsedSeconds: 0,
  durationSeconds: 0,
  shuffleMode: 'off',
  repeatMode: 'off',
  setPlaying: (playing) => set({ playing }),
  setCurrentTrack: (track) => set({ currentTrack: track }),
  setElapsed: (seconds) => set({ elapsedSeconds: seconds }),
  setDuration: (seconds) => set({ durationSeconds: seconds }),
  setShuffleMode: (mode) => set({ shuffleMode: mode }),
  setRepeatMode: (mode) => set({ repeatMode: mode }),
}))
