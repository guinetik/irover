import { describe, it, expect } from 'vitest'
import { tileUrl, tileGridSize, latLonToTile } from '../tiles'

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
