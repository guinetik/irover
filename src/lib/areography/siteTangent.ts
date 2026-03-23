/**
 * Small-offset lat/lon from a Mars site origin using a flat tangent plane.
 * Scene convention: +X = east, +Z = north (adjust with sign if your level differs).
 *
 * @param baseLatDeg - Landmark / site reference latitude
 * @param baseLonDeg - Landmark / site reference longitude
 * @param deltaEast - Eastward offset from spawn in scene units
 * @param deltaNorth - Northward offset from spawn in scene units
 * @param unitsPerMeter - Scale if one world unit ≠ one meter (default 1)
 */
export function approximateLatLonFromTangentOffset(
  baseLatDeg: number,
  baseLonDeg: number,
  deltaEast: number,
  deltaNorth: number,
  unitsPerMeter = 1,
): { latitudeDeg: number; longitudeDeg: number } {
  const eastM = deltaEast * unitsPerMeter
  const northM = deltaNorth * unitsPerMeter
  const mPerDegLat = 111_320
  const cosLat = Math.cos((baseLatDeg * Math.PI) / 180)
  const mPerDegLon = 111_320 * Math.max(0.08, Math.abs(cosLat))
  return {
    latitudeDeg: baseLatDeg + northM / mPerDegLat,
    longitudeDeg: baseLonDeg + eastM / mPerDegLon,
  }
}
