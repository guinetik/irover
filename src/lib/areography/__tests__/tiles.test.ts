import { afterEach, describe, expect, it, vi } from 'vitest'
import { compositeToCanvas, latLonToTile, tileGridSize, tileUrl } from '../tiles'
import { MDIM_TILE_PIXEL_SIZE } from '../mdimTileService'

describe('tileUrl', () => {
  it('builds correct ArcGIS tile URL', () => {
    const url = tileUrl(5, 23, 22)
    expect(url).toBe(
      'https://astro.arcgis.com/arcgis/rest/services/OnMars/MDIM/MapServer/tile/5/23/22?blankTile=false'
    )
  })
})

describe('tileGridSize', () => {
  it('returns 2x1 at zoom 0', () => {
    const { cols, rows } = tileGridSize(0)
    expect(cols).toBe(2)
    expect(rows).toBe(1)
  })

  it('returns 8x4 at zoom 2', () => {
    const { cols, rows } = tileGridSize(2)
    expect(cols).toBe(8)
    expect(rows).toBe(4)
  })

  it('returns 16x8 at zoom 3', () => {
    const { cols, rows } = tileGridSize(3)
    expect(cols).toBe(16)
    expect(rows).toBe(8)
  })
})

describe('latLonToTile', () => {
  it('maps north-west corner to tile (0, 0)', () => {
    const { x, y } = latLonToTile(89, -179, 2)
    expect(x).toBe(0)
    expect(y).toBe(0)
  })

  it('maps equator/prime meridian to correct tile', () => {
    const { x, y } = latLonToTile(0, 0, 2)
    expect(x).toBe(4)
    expect(y).toBe(2)
  })
})

describe('compositeToCanvas', () => {
  const OriginalImage = globalThis.Image
  const originalDocument = globalThis.document

  afterEach(() => {
    globalThis.Image = OriginalImage
    if (originalDocument === undefined) {
      delete (globalThis as { document?: Document }).document
    } else {
      globalThis.document = originalDocument
    }
  })

  it('composites all tiles at zoom 0 and reports progress', async () => {
    const drawImage = vi.fn()
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage })),
    }
    globalThis.document = {
      createElement: (tag: string) => {
        if (tag !== 'canvas') throw new Error(`unexpected element: ${tag}`)
        return canvas as unknown as HTMLCanvasElement
      },
    } as unknown as Document

    class MockImage {
      crossOrigin = ''
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_: string) {
        queueMicrotask(() => this.onload?.())
      }
    }
    globalThis.Image = MockImage as unknown as typeof Image

    const progress = vi.fn()
    const { cols, rows } = tileGridSize(0)
    const out = await compositeToCanvas(0, progress)

    expect(out).toBe(canvas as unknown as HTMLCanvasElement)
    expect(canvas.width).toBe(cols * MDIM_TILE_PIXEL_SIZE)
    expect(canvas.height).toBe(rows * MDIM_TILE_PIXEL_SIZE)
    expect(drawImage).toHaveBeenCalledTimes(cols * rows)
    expect(progress).toHaveBeenCalledWith(cols * rows, cols * rows)
  })

  it('continues when a tile image fails to load', async () => {
    const drawImage = vi.fn()
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage })),
    }
    globalThis.document = {
      createElement: (tag: string) => {
        if (tag !== 'canvas') throw new Error(`unexpected element: ${tag}`)
        return canvas as unknown as HTMLCanvasElement
      },
    } as unknown as Document

    let loads = 0
    class FlakyImage {
      crossOrigin = ''
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_: string) {
        queueMicrotask(() => {
          loads++
          if (loads % 2 === 0) this.onerror?.()
          else this.onload?.()
        })
      }
    }
    globalThis.Image = FlakyImage as unknown as typeof Image

    const { cols, rows } = tileGridSize(0)
    await compositeToCanvas(0)
    expect(drawImage).toHaveBeenCalledTimes(Math.ceil((cols * rows) / 2))
  })
})
