import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import {
  phobosPosition,
  deimosPosition,
  moonDirFromAzEl,
  PHOBOS_VISIBILITY_LAT,
} from '@/lib/areography/moonOrbits'

const MOON_DISTANCE = 500
const PHOBOS_SCALE = 1.8
const DEIMOS_SCALE = 0.8

export class MarsMoons {
  private phobos: THREE.Object3D | null = null
  private deimos: THREE.Object3D | null = null
  private scene: THREE.Scene
  private latDeg = 0

  constructor(scene: THREE.Scene) {
    this.scene = scene
  }

  async init(latDeg?: number): Promise<void> {
    this.latDeg = latDeg ?? 0
    const loader = new GLTFLoader()

    const [phobosGltf, deimosGltf] = await Promise.all([
      loader.loadAsync('/phobos.glb'),
      loader.loadAsync('/deimos.glb'),
    ])

    this.phobos = phobosGltf.scene
    this.phobos.scale.setScalar(PHOBOS_SCALE)
    this.scene.add(this.phobos)

    this.deimos = deimosGltf.scene
    this.deimos.scale.setScalar(DEIMOS_SCALE)
    this.scene.add(this.deimos)
  }

  update(timeOfDay: number, sol: number, nightFactor: number, stormLevel: number) {
    const visibility = nightFactor * (1.0 - Math.min(1, stormLevel / 3))

    if (this.phobos) {
      const visible = visibility > 0.05 && Math.abs(this.latDeg) < PHOBOS_VISIBILITY_LAT
      this.phobos.visible = visible
      if (visible) {
        const pos = phobosPosition(timeOfDay, sol)
        const dir = moonDirFromAzEl(pos.azimuthRad, pos.elevationRad)
        this.phobos.position.set(dir.x * MOON_DISTANCE, dir.y * MOON_DISTANCE, dir.z * MOON_DISTANCE)
        this.phobos.lookAt(0, 0, 0)
        this.setOpacity(this.phobos, visibility * (pos.elevationRad > 0 ? 1 : 0))
      }
    }

    if (this.deimos) {
      const visible = visibility > 0.05
      this.deimos.visible = visible
      if (visible) {
        const pos = deimosPosition(timeOfDay, sol)
        const dir = moonDirFromAzEl(pos.azimuthRad, pos.elevationRad)
        this.deimos.position.set(dir.x * MOON_DISTANCE, dir.y * MOON_DISTANCE, dir.z * MOON_DISTANCE)
        this.deimos.lookAt(0, 0, 0)
        this.setOpacity(this.deimos, visibility * (pos.elevationRad > 0 ? 1 : 0))
      }
    }
  }

  private setOpacity(obj: THREE.Object3D, opacity: number) {
    obj.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        for (const mat of materials) {
          if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshBasicMaterial) {
            mat.transparent = opacity < 0.99
            mat.opacity = opacity
          }
        }
      }
    })
  }

  dispose() {
    const cleanup = (obj: THREE.Object3D | null) => {
      if (!obj) return
      obj.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh
          mesh.geometry.dispose()
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
          materials.forEach((m) => m.dispose())
        }
      })
      this.scene.remove(obj)
    }
    cleanup(this.phobos)
    cleanup(this.deimos)
  }
}
