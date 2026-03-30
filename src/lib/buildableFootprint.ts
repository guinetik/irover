export interface FootprintEntry {
  position: { x: number; z: number }
  footprint: { x: number; z: number }
  scale: number
  rotationY: number
}

export function isInsideBuildableFootprint(
  x: number,
  z: number,
  buildables: FootprintEntry[],
): boolean {
  for (const b of buildables) {
    const halfX = (b.footprint.x * b.scale) / 2
    const halfZ = (b.footprint.z * b.scale) / 2
    const dx = x - b.position.x
    const dz = z - b.position.z
    const cos = Math.cos(-b.rotationY)
    const sin = Math.sin(-b.rotationY)
    const localX = dx * cos - dz * sin
    const localZ = dx * sin + dz * cos
    if (Math.abs(localX) < halfX && Math.abs(localZ) < halfZ) return true
  }
  return false
}
