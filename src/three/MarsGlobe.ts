import * as THREE from 'three'
import type { SceneLayer } from './SceneLayer'
import {
  GLOBE_RADIUS,
  GLOBE_SEGMENTS,
  TILE_BASE_ZOOM,
} from './constants'
import { compositeToCanvas } from '@/lib/areography/tiles'

export class MarsGlobe implements SceneLayer {
  readonly root: THREE.Mesh
  private readonly material: THREE.MeshStandardMaterial
  private texture: THREE.CanvasTexture | null = null
  private onProgress?: (loaded: number, total: number) => void

  constructor(onProgress?: (loaded: number, total: number) => void) {
    this.onProgress = onProgress

    this.material = new THREE.MeshStandardMaterial({
      roughness: 0.9,
      metalness: 0.0,
      color: 0x886655,
    })

    const geometry = new THREE.SphereGeometry(GLOBE_RADIUS, GLOBE_SEGMENTS, GLOBE_SEGMENTS)
    this.root = new THREE.Mesh(geometry, this.material)
  }

  async init(): Promise<void> {
    const canvas = await compositeToCanvas(TILE_BASE_ZOOM, this.onProgress)
    this.texture = new THREE.CanvasTexture(canvas)
    this.texture.colorSpace = THREE.SRGBColorSpace
    this.material.map = this.texture
    this.material.color.set(0xffffff)
    this.material.needsUpdate = true
  }

  update(_elapsed: number): void {}

  dispose(): void {
    this.root.geometry.dispose()
    this.material.dispose()
    this.texture?.dispose()
  }
}
