import { useEffect, useState } from 'react'

interface ArtColors {
  dominant: string
  muted: string
}

const DEFAULT_COLORS: ArtColors = { dominant: '#6366f1', muted: '#2d2b55' }
const cache = new Map<string, ArtColors>()

export function useArtColor(trackId: string | null): ArtColors {
  const [colors, setColors] = useState<ArtColors>(
    (trackId && cache.get(trackId)) || DEFAULT_COLORS
  )

  useEffect(() => {
    if (!trackId) {
      setColors(DEFAULT_COLORS)
      return
    }

    const cached = cache.get(trackId)
    if (cached) {
      setColors(cached)
      return
    }

    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = `/api/art/${trackId}`

    let cancelled = false

    img.onload = () => {
      if (cancelled) return
      try {
        const canvas = document.createElement('canvas')
        const size = 32
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0, size, size)
        const data = ctx.getImageData(0, 0, size, size).data

        // Simple dominant color: average of non-dark pixels
        let r = 0, g = 0, b = 0, count = 0
        for (let i = 0; i < data.length; i += 16) { // sample every 4th pixel
          const pr = data[i], pg = data[i + 1], pb = data[i + 2]
          // Skip very dark and very light pixels
          const brightness = pr * 0.299 + pg * 0.587 + pb * 0.114
          if (brightness > 30 && brightness < 220) {
            r += pr; g += pg; b += pb; count++
          }
        }

        if (count > 0) {
          r = Math.round(r / count)
          g = Math.round(g / count)
          b = Math.round(b / count)
          const result: ArtColors = {
            dominant: `rgb(${r}, ${g}, ${b})`,
            muted: `rgb(${Math.round(r * 0.3)}, ${Math.round(g * 0.3)}, ${Math.round(b * 0.3)})`,
          }
          cache.set(trackId, result)
          setColors(result)
        }
      } catch {
        // CORS or other issue, keep defaults
      }
    }

    img.onerror = () => {
      if (!cancelled) setColors(DEFAULT_COLORS)
    }

    return () => { cancelled = true }
  }, [trackId])

  return colors
}
