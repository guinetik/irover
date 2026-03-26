import { describe, expect, it } from 'vitest'
import { MDIM_TILE_PIXEL_SIZE, MDIM_TILE_SERVICE_BASE } from '@/lib/areography/mdimTileService'
import { tileUrl } from '@/lib/areography/tiles'

describe('mdimTileService', () => {
  it('uses the expected ArcGIS On Mars MDIM REST path and tile size', () => {
    expect(MDIM_TILE_SERVICE_BASE).toContain('OnMars/MDIM')
    expect(MDIM_TILE_PIXEL_SIZE).toBe(512)
  })

  it('tileUrl composes z/y/x under the base with blankTile=false', () => {
    expect(tileUrl(2, 1, 3)).toBe(`${MDIM_TILE_SERVICE_BASE}/2/1/3?blankTile=false`)
  })
})
