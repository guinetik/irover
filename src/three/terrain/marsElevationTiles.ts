/**
 * Google Mars elevation tile fetcher.
 *
 * Fetches color-coded elevation tiles from Google's Mars tile service and
 * decodes them into heightmap data for terrain displacement.
 *
 * Tile URL: http://mw1.google.com/mw-planetary/mars/elevation/{quadtree_path}.jpg
 * Tiles are 256×256 JPEG, color-coded: blue=low, green=mid, yellow/red=high
 */

const TILE_BASE = '/mars-elevation/'
const TILE_PIXELS = 256

/**
 * Converts lat/lon to a Google Maps quadtree tile path.
 * Each character after the root 't' selects a quadrant:
 * q=top-left, r=top-right, s=bottom-left, t=bottom-right
 */
export function latLonToQuadtree(lat: number, lon: number, zoom: number): string {
  let path = 't'
  let latMin = -90, latMax = 90, lonMin = -180, lonMax = 180

  for (let i = 0; i < zoom; i++) {
    const latMid = (latMin + latMax) / 2
    const lonMid = (lonMin + lonMax) / 2

    if (lat >= latMid) {
      if (lon < lonMid) { path += 'q'; lonMax = lonMid }
      else { path += 'r'; lonMin = lonMid }
      latMin = latMid
    } else {
      if (lon < lonMid) { path += 's'; lonMax = lonMid }
      else { path += 't'; lonMin = lonMid }
      latMax = latMid
    }
  }
  return path
}

/**
 * Fetches the elevation tile for a lat/lon at the given zoom level.
 * Returns a Float32Array heightmap (TILE_PIXELS × TILE_PIXELS) normalized 0–1.
 */
export async function fetchElevationTile(
  lat: number,
  lon: number,
  zoom: number = 7,
): Promise<{ heightmap: Float32Array; size: number } | null> {
  const path = latLonToQuadtree(lat, lon, zoom)
  const url = `${TILE_BASE}${path}.jpg`

  console.log(`[MarsElevation] fetching ${url}`)

  try {
    const img = await loadImage(url)

    // Draw to canvas to read pixel data
    const canvas = document.createElement('canvas')
    canvas.width = TILE_PIXELS
    canvas.height = TILE_PIXELS
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0, TILE_PIXELS, TILE_PIXELS)
    const imageData = ctx.getImageData(0, 0, TILE_PIXELS, TILE_PIXELS)
    const pixels = imageData.data // RGBA

    // Decode color → height using hue-based mapping
    // The Google Mars elevation colormap goes:
    //   blue (low) → cyan → green → yellow → orange → red (high)
    // This is a rainbow/HSV ramp where hue goes from ~240° (blue) down to ~0° (red)
    const heightmap = new Float32Array(TILE_PIXELS * TILE_PIXELS)

    for (let i = 0; i < TILE_PIXELS * TILE_PIXELS; i++) {
      const r = pixels[i * 4] / 255
      const g = pixels[i * 4 + 1] / 255
      const b = pixels[i * 4 + 2] / 255

      heightmap[i] = colorToHeight(r, g, b)
    }

    // Normalize to 0–1 range
    let hMin = Infinity, hMax = -Infinity
    for (let i = 0; i < heightmap.length; i++) {
      if (heightmap[i] < hMin) hMin = heightmap[i]
      if (heightmap[i] > hMax) hMax = heightmap[i]
    }
    const range = hMax - hMin || 1
    for (let i = 0; i < heightmap.length; i++) {
      heightmap[i] = (heightmap[i] - hMin) / range
    }

    console.log(`[MarsElevation] tile loaded: ${TILE_PIXELS}x${TILE_PIXELS}, raw height range: ${hMin.toFixed(3)}–${hMax.toFixed(3)}`)

    return { heightmap, size: TILE_PIXELS }
  } catch (e) {
    console.warn('[MarsElevation] failed to fetch tile:', e)
    return null
  }
}

/**
 * Fetches a 3×3 grid of elevation tiles centered on the given lat/lon,
 * composited into a single heightmap for larger terrain coverage.
 */
export async function fetchElevationGrid(
  lat: number,
  lon: number,
  zoom: number = 7,
): Promise<{ heightmap: Float32Array; size: number } | null> {
  // Compute tile extent at this zoom level
  const tileLatSpan = 180 / Math.pow(2, zoom)
  const tileLonSpan = 360 / Math.pow(2, zoom)

  const gridSize = TILE_PIXELS * 3
  const fullHeightmap = new Float32Array(gridSize * gridSize)

  const promises: Promise<void>[] = []
  let anyLoaded = false

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const tileLat = lat + dy * tileLatSpan
      const tileLon = lon + dx * tileLonSpan
      const offsetX = (dx + 1) * TILE_PIXELS
      const offsetY = (-dy + 1) * TILE_PIXELS // flip Y: top row = high lat

      promises.push(
        fetchElevationTile(tileLat, tileLon, zoom).then((tile) => {
          if (!tile) return
          anyLoaded = true
          // Copy into the full grid
          for (let ty = 0; ty < TILE_PIXELS; ty++) {
            for (let tx = 0; tx < TILE_PIXELS; tx++) {
              const srcIdx = ty * TILE_PIXELS + tx
              const dstIdx = (offsetY + ty) * gridSize + (offsetX + tx)
              fullHeightmap[dstIdx] = tile.heightmap[srcIdx]
            }
          }
        })
      )
    }
  }

  await Promise.all(promises)

  if (!anyLoaded) return null

  // Re-normalize the composited grid
  let hMin = Infinity, hMax = -Infinity
  for (let i = 0; i < fullHeightmap.length; i++) {
    if (fullHeightmap[i] < hMin) hMin = fullHeightmap[i]
    if (fullHeightmap[i] > hMax) hMax = fullHeightmap[i]
  }
  const range = hMax - hMin || 1
  for (let i = 0; i < fullHeightmap.length; i++) {
    fullHeightmap[i] = (fullHeightmap[i] - hMin) / range
  }

  console.log(`[MarsElevation] 3x3 grid composited: ${gridSize}x${gridSize}`)

  return { heightmap: fullHeightmap, size: gridSize }
}

/**
 * Converts an RGB color from the Google Mars elevation colormap to a
 * relative height value. The colormap is a rainbow ramp:
 *   blue (low) → cyan → green → yellow → orange → red/white (high)
 *
 * We convert to HSV and map hue to height:
 *   Hue ~240° (blue) = 0.0 (lowest)
 *   Hue ~60° (yellow) = 0.75 (high)
 *   Hue ~0°/360° (red) = 1.0 (highest)
 *
 * For very bright/white pixels (high saturation low), use luminance.
 */
function colorToHeight(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min

  // Very low saturation (grey/white) = high elevation peaks
  const saturation = max > 0 ? delta / max : 0
  if (saturation < 0.1) {
    return 0.9 + (r + g + b) / 3 * 0.1 // near-white = highest
  }

  // Compute hue in degrees
  let hue: number
  if (delta === 0) {
    hue = 0
  } else if (max === r) {
    hue = 60 * (((g - b) / delta) % 6)
  } else if (max === g) {
    hue = 60 * ((b - r) / delta + 2)
  } else {
    hue = 60 * ((r - g) / delta + 4)
  }
  if (hue < 0) hue += 360

  // Map hue to height:
  // 240 (blue) → 0.0
  // 180 (cyan) → 0.25
  // 120 (green) → 0.5
  // 60 (yellow) → 0.75
  // 0/360 (red) → 1.0
  if (hue >= 240) {
    // Blue to violet (240-360): low elevations
    return (360 - hue) / 120 * 0.25  // 240→0.25, 360→0.0
  } else {
    // Cyan through red (0-240): mid to high
    return 1.0 - hue / 240 * 0.75  // 0→1.0, 240→0.25
  }
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
