import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import curiosityUrl from '@/assets/curiosity.glb?url'
import { TerrainGenerator, type TerrainParams } from './terrain/TerrainGenerator'

const ROVER_SCALE = 0.5

export class SiteScene {
  readonly scene = new THREE.Scene()
  readonly terrain = new TerrainGenerator()
  rover: THREE.Group | null = null

  async init(params: TerrainParams): Promise<void> {
    this.scene.background = new THREE.Color(0x1a0d08)
    this.scene.fog = new THREE.FogExp2(0x2a1508, 0.007)

    this.terrain.generate(params)
    this.scene.add(this.terrain.group)

    this.createLighting()
    await this.loadRover()
  }

  private createLighting() {
    const sun = new THREE.DirectionalLight(0xffe8d0, 1.8)
    sun.position.set(50, 80, 30)
    sun.castShadow = true
    sun.shadow.mapSize.width = 2048
    sun.shadow.mapSize.height = 2048
    sun.shadow.camera.near = 0.5
    sun.shadow.camera.far = 120
    const d = 30
    sun.shadow.camera.left = -d
    sun.shadow.camera.right = d
    sun.shadow.camera.top = d
    sun.shadow.camera.bottom = -d
    sun.shadow.bias = -0.0002
    this.scene.add(sun)

    this.scene.add(new THREE.AmbientLight(0x8b5e3c, 0.4))
    this.scene.add(new THREE.HemisphereLight(0xc4956a, 0x3d2817, 0.3))
  }

  private async loadRover(): Promise<void> {
    const loader = new GLTFLoader()
    const gltf = await loader.loadAsync(curiosityUrl)
    this.rover = gltf.scene
    this.rover.scale.setScalar(ROVER_SCALE)
    this.rover.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })
    // Find a clear spawn point (no rocks nearby)
    const { x: sx, z: sz } = this.findClearSpawn()
    const startY = this.terrain.heightAt(sx, sz)
    this.rover.position.set(sx, startY, sz)
    this.scene.add(this.rover)
  }

  private findClearSpawn(): { x: number; z: number } {
    const colliders = this.terrain.rockColliders
    const candidates = [
      { x: 0, z: 0 },
      { x: 10, z: 10 },
      { x: -10, z: -10 },
      { x: 20, z: 0 },
      { x: 0, z: -20 },
      { x: -15, z: 15 },
      { x: 25, z: -10 },
    ]
    for (const c of candidates) {
      const tooClose = colliders.some((r) => {
        if (r.radius < 0.6) return false // ignore small rocks
        const dx = c.x - r.x
        const dz = c.z - r.z
        return Math.sqrt(dx * dx + dz * dz) < r.radius + 1.5
      })
      if (!tooClose) return c
    }
    return { x: 0, z: 0 }
  }

  dispose() {
    this.terrain.dispose()
    this.rover?.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh
        mesh.geometry.dispose()
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose())
        } else {
          mesh.material.dispose()
        }
      }
    })
  }
}
