import * as THREE from 'three'

const MAX_RANGE = 2.5

export interface TargetResult {
  rock: THREE.Mesh
  point: THREE.Vector3
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

  depleteRock(rock: THREE.Mesh): void {
    this.depletedRocks.add(rock)
    const mat = (rock.material as THREE.MeshStandardMaterial).clone()
    mat.color.multiplyScalar(0.4)
    mat.roughness = Math.min(1.0, mat.roughness + 0.3)
    rock.material = mat
  }

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
      return { rock, point: hit.point }
    }
    return null
  }

  dispose(): void {
    this.depletedRocks.clear()
    this.smallRocks = []
  }
}
