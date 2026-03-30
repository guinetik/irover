// src/three/buildables/BuildablePlacementPreview.ts
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { BuildableDef } from '@/types/buildables'

const VALID_COLOR = 0x00ff00
const INVALID_COLOR = 0xff0000
const PREVIEW_DISTANCE = 12

export class BuildablePlacementPreview {
  readonly group = new THREE.Group()
  readonly def: BuildableDef
  private scene: THREE.Scene | null = null
  private heightAt: (x: number, z: number) => number
  private slopeAt: (x: number, z: number) => number
  private wireframeMaterial = new THREE.MeshBasicMaterial({
    color: VALID_COLOR,
    wireframe: true,
    transparent: true,
    opacity: 0.6,
  })
  private _isValid = true
  private _position = new THREE.Vector3()
  private _rotationY = 0

  constructor(
    def: BuildableDef,
    heightAt: (x: number, z: number) => number,
    slopeAt: (x: number, z: number) => number,
  ) {
    this.def = def
    this.heightAt = heightAt
    this.slopeAt = slopeAt
  }

  get isValid(): boolean { return this._isValid }
  get position(): THREE.Vector3 { return this._position }
  get rotationY(): number { return this._rotationY }

  async init(scene: THREE.Scene): Promise<void> {
    this.scene = scene
    const loader = new GLTFLoader()
    const gltf = await loader.loadAsync(this.def.model)
    const model = gltf.scene
    model.scale.setScalar(this.def.scale)
    model.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        ;(child as THREE.Mesh).material = this.wireframeMaterial
      }
    })
    this.group.add(model)
    scene.add(this.group)
  }

  updatePosition(roverPosition: THREE.Vector3, roverHeading: number): void {
    const x = roverPosition.x + Math.sin(roverHeading) * PREVIEW_DISTANCE
    const z = roverPosition.z + Math.cos(roverHeading) * PREVIEW_DISTANCE
    const y = this.heightAt(x, z)
    const slope = this.slopeAt(x, z)
    this._position.set(x, y, z)
    this._rotationY = roverHeading
    this.group.position.set(x, y, z)
    this.group.rotation.y = roverHeading
    this._isValid = slope <= this.def.maxPlacementSlope
    this.wireframeMaterial.color.setHex(this._isValid ? VALID_COLOR : INVALID_COLOR)
  }

  dispose(): void {
    if (this.scene) {
      this.scene.remove(this.group)
    }
    this.wireframeMaterial.dispose()
    this.group.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        ;(child as THREE.Mesh).geometry?.dispose()
      }
    })
    this.scene = null
  }
}
