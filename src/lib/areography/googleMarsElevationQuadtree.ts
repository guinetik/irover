/**
 * Google Mars elevation tiles use a quadtree path (not the same index scheme as MDIM XYZ).
 * Each character after the root `t` selects a quadrant: q, r, s, t.
 *
 * @see `three/terrain/marsElevationTiles.ts` — fetches `/mars-elevation/{path}.jpg`
 */

/**
 * Converts latitude/longitude (degrees) to a Google Maps-style quadtree path for Mars elevation tiles.
 *
 * @param lat - Latitude in degrees [-90, 90]
 * @param lon - Longitude in degrees [-180, 180]
 * @param zoom - Number of subdivision levels (path length = 1 + zoom)
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
