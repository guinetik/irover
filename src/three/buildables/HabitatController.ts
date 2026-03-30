// src/three/buildables/HabitatController.ts
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { BuildableController } from './BuildableController'
import type { BuildableDef, BuildableFootprint } from '@/types/buildables'

export class HabitatController implements BuildableController {
  readonly id: string
  readonly def: BuildableDef
  readonly position: THREE.Vector3
  readonly footprint: BuildableFootprint
  readonly features: string[]

  private group = new THREE.Group()
  private doorMesh: THREE.Object3D | null = null
  private doorOpen = 0
  private scene: THREE.Scene | null = null
  private heightAt: (x: number, z: number) => number
  readonly rotationY: number
  private _isRoverInside = false

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
  }

  get isRoverInside(): boolean {
    return this._isRoverInside
  }

  get doorOpenFraction(): number {
    return this.doorOpen
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
      }
    })
    if (this.def.door) {
      this.doorMesh = model.getObjectByName(this.def.door.meshName) ?? null
    }
    this.group.add(model)
    const groundY = this.heightAt(this.position.x, this.position.z)
    this.group.position.set(this.position.x, groundY, this.position.z)
    this.group.rotation.y = this.rotationY
    this.position.y = groundY
    scene.add(this.group)
  }

  update(roverPosition: THREE.Vector3, dt: number): void {
    const halfX = (this.footprint.x * this.def.scale) / 2
    const halfZ = (this.footprint.z * this.def.scale) / 2
    const dx = roverPosition.x - this.position.x
    const dz = roverPosition.z - this.position.z
    const cos = Math.cos(-this.rotationY)
    const sin = Math.sin(-this.rotationY)
    const localX = dx * cos - dz * sin
    const localZ = dx * sin + dz * cos
    this._isRoverInside = Math.abs(localX) < halfX && Math.abs(localZ) < halfZ

    if (this.doorMesh && this.def.door) {
      const distToShelter = Math.sqrt(dx * dx + dz * dz)
      const shouldOpen = distToShelter < this.def.door.triggerDistance
      const target = shouldOpen ? 1 : 0
      const step = (this.def.door.speed / this.def.door.openAngle) * dt
      if (this.doorOpen < target) {
        this.doorOpen = Math.min(this.doorOpen + step, target)
      } else if (this.doorOpen > target) {
        this.doorOpen = Math.max(this.doorOpen - step, target)
      }
      const angle = this.doorOpen * this.def.door.openAngle
      const axis = this.def.door.axis
      if (axis === 'x') this.doorMesh.rotation.x = angle
      else if (axis === 'y') this.doorMesh.rotation.y = angle
      else if (axis === 'z') this.doorMesh.rotation.z = angle
    }
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
