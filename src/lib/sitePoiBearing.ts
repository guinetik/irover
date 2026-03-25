/**
 * Compass / POI bearing math for the Martian site scene (XZ ground plane, Y up).
 * Matches {@link SiteCompass} heading: rover forward at heading 0 is world −Z (“north” on the HUD).
 */

/** Normalize degrees to [0, 360). */
export function normalizeCompassDeg(d: number): number {
  return ((d % 360) + 360) % 360
}

/**
 * Converts rover yaw (radians, Y axis) to the same compass degree ring as the HUD (0 = N = −Z, 90 = E = +X).
 */
export function roverHeadingRadToCompassDeg(headingRad: number): number {
  return normalizeCompassDeg((-headingRad * 180) / Math.PI)
}

/**
 * Absolute compass bearing from the rover to a ground point (world XZ), same convention as the HUD.
 *
 * Rover coordinate system:
 * - Forward = +Z (model rotated PI), heading 0 faces +Z
 * - Heading increases CCW (KeyA = left = +heading)
 * - Compass convention: (-heading * 180/PI) converts to CW degrees
 *
 * We need the bearing angle in the same CW-degree space as the compass heading.
 */
export function worldBearingDegToPoi(
  roverX: number,
  roverZ: number,
  poiX: number,
  poiZ: number,
): number {
  const dx = poiX - roverX
  const dz = poiZ - roverZ
  // atan2(-dx, dz) gives CW angle from +Z toward -X.
  // Negating converts to the same CW-degree space as roverHeadingRadToCompassDeg.
  const rad = Math.atan2(-dx, dz)
  return normalizeCompassDeg(-rad * 180 / Math.PI)
}

/**
 * Shortest signed difference from compass heading `fromDeg` to `toDeg`, in (−180, 180].
 * Use with {@link roverHeadingRadToCompassDeg} for “relative to nose” offsets on the compass strip.
 */
export function signedRelativeBearingDeg(fromDeg: number, toDeg: number): number {
  const a = normalizeCompassDeg(fromDeg)
  const b = normalizeCompassDeg(toDeg)
  let d = b - a
  if (d > 180) d -= 360
  if (d <= -180) d += 360
  return d
}
