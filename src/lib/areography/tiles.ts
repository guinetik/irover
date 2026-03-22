import { TILE_SERVICE_BASE, TILE_SIZE } from '@/three/constants'

export function tileUrl(z: number, y: number, x: number): string {
  return `${TILE_SERVICE_BASE}/${z}/${y}/${x}?blankTile=false`
}

export function tileGridSize(zoom: number): { cols: number; rows: number } {
  const cols = 2 * Math.pow(2, zoom)
  const rows = 1 * Math.pow(2, zoom)
  return { cols, rows }
}

export function latLonToTile(lat: number, lon: number, zoom: number): { x: number; y: number } {
  const { cols, rows } = tileGridSize(zoom)
  const tileLonDeg = 360 / cols
  const tileLatDeg = 180 / rows
  const x = Math.floor((lon + 180) / tileLonDeg)
  const y = Math.floor((90 - lat) / tileLatDeg)
  return {
    x: Math.max(0, Math.min(cols - 1, x)),
    y: Math.max(0, Math.min(rows - 1, y)),
  }
}

export async function compositeToCanvas(
  zoom: number,
  onProgress?: (loaded: number, total: number) => void,
): Promise<HTMLCanvasElement> {
  const { cols, rows } = tileGridSize(zoom)
  const canvas = document.createElement('canvas')
  canvas.width = cols * TILE_SIZE
  canvas.height = rows * TILE_SIZE
  const ctx = canvas.getContext('2d')!

  const total = cols * rows
  let loaded = 0

  const promises: Promise<void>[] = []
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const url = tileUrl(zoom, y, x)
      const tileX = x
      const tileY = y
      promises.push(
        loadImage(url)
          .then((img) => {
            ctx.drawImage(img, tileX * TILE_SIZE, tileY * TILE_SIZE, TILE_SIZE, TILE_SIZE)
          })
          .catch(() => {})
          .finally(() => {
            loaded++
            onProgress?.(loaded, total)
          })
      )
    }
  }

  await Promise.all(promises)
  return canvas
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}
