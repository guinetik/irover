import * as THREE from 'three'
import type { SceneLayer } from './SceneLayer'
import {
  GLOBE_RADIUS,
  GLOBE_SEGMENTS,
  CAMERA_MIN_DISTANCE,
  CAMERA_MAX_DISTANCE,
  TILE_BASE_ZOOM,
} from './constants'
import { compositeToCanvas } from '@/lib/areography/tiles'

/**
 * Zoom level thresholds: when camera distance drops below the threshold,
 * upgrade to that tile zoom level. Sorted from closest to farthest.
 */
const DETAIL_LEVELS: { maxDistance: number; tileZoom: number }[] = [
  { maxDistance: GLOBE_RADIUS * 1.5, tileZoom: 5 },
  { maxDistance: GLOBE_RADIUS * 2.5, tileZoom: 4 },
]

export class MarsGlobe implements SceneLayer {
  readonly root: THREE.Mesh
  private readonly material: THREE.MeshStandardMaterial
  private texture: THREE.CanvasTexture | null = null
  private textureCanvas: HTMLCanvasElement | null = null
  private onProgress?: (loaded: number, total: number) => void
  private currentTileZoom = TILE_BASE_ZOOM
  private upgrading = false

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
    this.textureCanvas = await compositeToCanvas(TILE_BASE_ZOOM, this.onProgress)
    this.texture = new THREE.CanvasTexture(this.textureCanvas)
    this.texture.colorSpace = THREE.SRGBColorSpace
    this.material.map = this.texture
    this.material.color.set(0xffffff)
    this.material.needsUpdate = true
  }

  /**
   * Check if camera distance warrants a higher-res tile level.
   * Call from the render loop with current camera distance.
   */
  checkDetailLevel(cameraDistance: number): void {
    if (this.upgrading) return

    let targetZoom = TILE_BASE_ZOOM
    for (const level of DETAIL_LEVELS) {
      if (cameraDistance <= level.maxDistance) {
        targetZoom = level.tileZoom
        break
      }
    }

    if (targetZoom > this.currentTileZoom) {
      this.upgradeToZoom(targetZoom)
    }
  }

  private async upgradeToZoom(zoom: number): Promise<void> {
    this.upgrading = true
    try {
      const canvas = await compositeToCanvas(zoom)
      this.textureCanvas = canvas
      if (this.texture) {
        this.texture.image = canvas
        this.texture.needsUpdate = true
      }
      this.currentTileZoom = zoom
    } finally {
      this.upgrading = false
    }
  }

  update(_elapsed: number): void {}

  dispose(): void {
    this.root.geometry.dispose()
    this.material.dispose()
    this.texture?.dispose()
  }
}
