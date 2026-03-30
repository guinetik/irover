// src/three/buildables/HabitatController.ts
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { BuildableController } from './BuildableController'
import type { BuildableDef, BuildableFootprint } from '@/types/buildables'

/** Default interaction distance when not specified in the buildable definition. */
const DEFAULT_INTERACTION_DISTANCE = 12
/** Camera distance when viewing the rover inside the shelter. */
const INTERIOR_CAMERA_DISTANCE = 3.5
/** Camera pitch (radians) when viewing the rover inside the shelter. */
const INTERIOR_CAMERA_PITCH = 0.8

export class HabitatController implements BuildableController {
  readonly id: string
  readonly def: BuildableDef
  readonly position: THREE.Vector3
  readonly footprint: BuildableFootprint
  readonly features: string[]

  private group = new THREE.Group()
  private scene: THREE.Scene | null = null
  private heightAt: (x: number, z: number) => number
  readonly rotationY: number
  private _isRoverInside = false
  private interactionDistance: number

  constructor(
    def: BuildableDef,
    position: THREE.Vector3,
    rotationY: number,
    heightAt: (x: number, z: number) => number,
  ) {
    this.def = def
    this.id = def.id
    this.position = position.clone()
    this.footprint = def.footprint
    this.features = [...def.features]
    this.rotationY = rotationY
    this.heightAt = heightAt
    this.interactionDistance = def.interactionDistance ?? DEFAULT_INTERACTION_DISTANCE
  }

  get isRoverInside(): boolean {
    return this._isRoverInside
  }

  async init(scene: THREE.Scene): Promise<void> {
    this.scene = scene
    const loader = new GLTFLoader()
    const gltf = await loader.loadAsync(this.def.model)
    const model = gltf.scene
    model.scale.setScalar(this.def.scale)
    model.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true
        child.receiveShadow = true
        // Render both sides so interior walls are visible when camera is inside
        const mat = (child as THREE.Mesh).material
        if (Array.isArray(mat)) {
          mat.forEach((m) => { m.side = THREE.DoubleSide })
        } else if (mat) {
          mat.side = THREE.DoubleSide
        }
      }
    })
    this.group.add(model)
    const groundY = this.heightAt(this.position.x, this.position.z)
    this.group.position.set(this.position.x, groundY, this.position.z)
    this.group.rotation.y = this.rotationY
    this.position.y = groundY
    scene.add(this.group)
  }

  /** True when the rover is close enough to interact (press F to enter). */
  isNearby(roverPosition: THREE.Vector3): boolean {
    const dx = roverPosition.x - this.position.x
    const dz = roverPosition.z - this.position.z
    const dist = Math.sqrt(dx * dx + dz * dz)
    return dist < this.interactionDistance
  }

  /** Enter the shelter. Sets isRoverInside true and returns the center position. */
  enter(): THREE.Vector3 {
    this._isRoverInside = true
    return this.getCenterPosition()
  }

  /** Exit the shelter. Clears isRoverInside and returns the entrance position. */
  exit(): THREE.Vector3 {
    this._isRoverInside = false
    return this.getEntrancePosition()
  }

  /** World-space center of the shelter (at terrain height). */
  getCenterPosition(): THREE.Vector3 {
    return this.position.clone()
  }

  /** World-space position just outside the shelter entrance, at interaction distance along the shelter's forward axis. */
  getEntrancePosition(): THREE.Vector3 {
    const entranceOffset = this.interactionDistance * 0.9
    const ex = this.position.x + Math.sin(this.rotationY) * entranceOffset
    const ez = this.position.z + Math.cos(this.rotationY) * entranceOffset
    const ey = this.heightAt(ex, ez)
    return new THREE.Vector3(ex, ey, ez)
  }

  /** Fixed camera orbit parameters for the interior view. */
  getInteriorCameraOrbit(): { distance: number; pitch: number } {
    return { distance: INTERIOR_CAMERA_DISTANCE, pitch: INTERIOR_CAMERA_PITCH }
  }

  update(_roverPosition: THREE.Vector3, _dt: number): void {
    // No per-frame logic needed — proximity and enter/exit are handled externally.
  }

  dispose(): void {
    if (this.scene && this.group.parent) {
      this.scene.remove(this.group)
    }
    this.group.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh
        mesh.geometry?.dispose()
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose())
        } else {
          mesh.material?.dispose()
        }
      }
    })
  }
}
