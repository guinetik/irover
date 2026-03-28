// src/lib/terrain/mapColors.ts

/** A stop in a color ramp: t in [0,1], r/g/b in [0,255]. */
interface ColorStop { t: number; r: number; g: number; b: number }

/** Terracotta (low) → latte → white (high). */
export const MARS_COLOR_RAMP: ColorStop[] = [
  { t: 0.00, r: 122, g: 74, b: 48 },
  { t: 0.12, r: 139, g: 90, b: 58 },
  { t: 0.25, r: 160, g: 104, b: 64 },
  { t: 0.40, r: 192, g: 128, b: 80 },
  { t: 0.55, r: 216, g: 160, b: 112 },
  { t: 0.68, r: 224, g: 184, b: 136 },
  { t: 0.80, r: 236, g: 208, b: 160 },
  { t: 0.92, r: 245, g: 224, b: 192 },
  { t: 1.00, r: 255, g: 255, b: 255 },
]

/** Blue (low) → green → yellow → red (high). */
export const HYPSOMETRIC_RAMP: ColorStop[] = [
  { t: 0.00, r: 0, g: 0, b: 170 },
  { t: 0.15, r: 0, g: 68, b: 204 },
  { t: 0.25, r: 0, g: 170, b: 204 },
  { t: 0.35, r: 0, g: 204, b: 102 },
  { t: 0.45, r: 68, g: 221, b: 0 },
  { t: 0.55, r: 204, g: 221, b: 0 },
  { t: 0.65, r: 255, g: 204, b: 0 },
  { t: 0.75, r: 255, g: 136, b: 0 },
  { t: 0.85, r: 255, g: 51, b: 0 },
  { t: 0.95, r: 204, g: 0, b: 0 },
  { t: 1.00, r: 136, g: 0, b: 0 },
]

/** Linearly interpolate a color from a ramp at normalized t ∈ [0,1]. */
function sampleRamp(ramp: ColorStop[], t: number): [number, number, number] {
  if (t <= ramp[0].t) return [ramp[0].r, ramp[0].g, ramp[0].b]
  if (t >= ramp[ramp.length - 1].t) {
    const last = ramp[ramp.length - 1]
    return [last.r, last.g, last.b]
  }
  for (let i = 0; i < ramp.length - 1; i++) {
    const lo = ramp[i], hi = ramp[i + 1]
    if (t >= lo.t && t <= hi.t) {
      const f = (t - lo.t) / (hi.t - lo.t)
      return [
        Math.round(lo.r + (hi.r - lo.r) * f),
        Math.round(lo.g + (hi.g - lo.g) * f),
        Math.round(lo.b + (hi.b - lo.b) * f),
      ]
    }
  }
  return [0, 0, 0]
}

/**
 * Generate a colored map canvas from a heightmap grid.
 * @param heightmap - Float32Array of gridSize*gridSize height values
 * @param gridSize  - width/height of the square grid
 * @param hMin      - minimum height value
 * @param hMax      - maximum height value
 * @param ramp      - color ramp to use
 * @returns An HTMLCanvasElement with the colored map
 */
export function generateMapCanvas(
  heightmap: Float32Array,
  gridSize: number,
  hMin: number,
  hMax: number,
  ramp: ColorStop[],
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = gridSize
  canvas.height = gridSize
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(gridSize, gridSize)
  const range = hMax - hMin || 1

  for (let i = 0; i < heightmap.length; i++) {
    const t = (heightmap[i] - hMin) / range
    const [r, g, b] = sampleRamp(ramp, t)
    const p = i * 4
    img.data[p] = r
    img.data[p + 1] = g
    img.data[p + 2] = b
    img.data[p + 3] = 255
  }

  ctx.putImageData(img, 0, 0)
  return canvas
}
