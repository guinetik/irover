import * as THREE from 'three'
import type { RockTypeId } from '@/three/terrain/RockTypes'

const MAX_RANGE = 2.5
/** Max distance from drill head to rock center for proximity targeting */
const DRILL_HEAD_RANGE = 1.5

export interface TargetResult {
  rock: THREE.Mesh
  point: THREE.Vector3
  rockType: RockTypeId
}

export class RockTargeting {
  private raycaster = new THREE.Raycaster()
  private screenCenter = new THREE.Vector2(0, 0)
  private depletedRocks = new Set<THREE.Mesh>()
  private smallRocks: THREE.Mesh[] = []
  private roverPosition = new THREE.Vector3()
  private readonly rockWorldScratch = new THREE.Vector3()

  setRocks(rocks: THREE.Mesh[]): void {
    this.smallRocks = rocks
  }

  setRoverPosition(pos: THREE.Vector3): void {
    this.roverPosition.copy(pos)
  }

  isDepleted(rock: THREE.Mesh): boolean {
    return this.depletedRocks.has(rock)
  }

  /**
   * Marks a rock as mined out — MastCam drops the floating tag and survey highlight;
   * ChemCam/APXS targeting already skip `userData.depleted`.
   */
  depleteRock(rock: THREE.Mesh): void {
    this.depletedRocks.add(rock)
    rock.userData.depleted = true
    const mat = (rock.material as THREE.MeshStandardMaterial).clone()
    mat.color.multiplyScalar(0.4)
    mat.roughness = Math.min(1.0, mat.roughness + 0.3)
    rock.material = mat
  }

  /**
   * Camera-based targeting (legacy fallback / UI crosshair feedback).
   */
  cast(camera: THREE.PerspectiveCamera): TargetResult | null {
    this.raycaster.setFromCamera(this.screenCenter, camera)
    const hits = this.raycaster.intersectObjects(this.smallRocks, false)

    for (const hit of hits) {
      const rock = hit.object as THREE.Mesh
      if (this.depletedRocks.has(rock)) continue
      rock.getWorldPosition(this.rockWorldScratch)
      const dx = this.rockWorldScratch.x - this.roverPosition.x
      const dz = this.rockWorldScratch.z - this.roverPosition.z
      if (Math.sqrt(dx * dx + dz * dz) > MAX_RANGE) continue
      const rockType = (rock.userData.rockType as RockTypeId) ?? 'basalt'
      return { rock, point: hit.point, rockType }
    }
    return null
  }

  /**
   * Proximity targeting from drill head position.
   * Finds the nearest non-depleted rock within DRILL_HEAD_RANGE of the given position.
   * Returns the rock surface point closest to the drill head.
   */
  castFromDrillHead(drillHeadPos: THREE.Vector3): TargetResult | null {
    let bestRock: THREE.Mesh | null = null
    let bestDist = DRILL_HEAD_RANGE
    let bestPos = new THREE.Vector3()

    for (const rock of this.smallRocks) {
      if (this.depletedRocks.has(rock)) continue
      rock.getWorldPosition(this.rockWorldScratch)

      // Also check rover range
      const dx = this.rockWorldScratch.x - this.roverPosition.x
      const dz = this.rockWorldScratch.z - this.roverPosition.z
      if (Math.sqrt(dx * dx + dz * dz) > MAX_RANGE) continue

      const dist = drillHeadPos.distanceTo(this.rockWorldScratch)
      if (dist < bestDist) {
        bestDist = dist
        bestRock = rock
        bestPos = this.rockWorldScratch.clone()
      }
    }

    if (!bestRock) return null

    // Raycast from drill head toward rock to get surface hit point
    const dir = new THREE.Vector3().subVectors(bestPos, drillHeadPos).normalize()
    this.raycaster.set(drillHeadPos, dir)
    this.raycaster.far = DRILL_HEAD_RANGE
    const hits = this.raycaster.intersectObject(bestRock, false)
    const hitPoint = hits.length > 0 ? hits[0].point : bestPos

    const rockType = (bestRock.userData.rockType as RockTypeId) ?? 'basalt'
    return { rock: bestRock, point: hitPoint, rockType }
  }

  dispose(): void {
    this.depletedRocks.clear()
    this.smallRocks = []
  }
}
