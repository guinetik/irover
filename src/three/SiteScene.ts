import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import curiosityUrl from '@/assets/curiosity.glb?url'
import { TerrainGenerator, type TerrainParams } from './terrain/TerrainGenerator'
import { DustParticles } from './DustParticles'
import { MarsSky } from './MarsSky'
import { RoverTrails } from './RoverTrails'

const ROVER_SCALE = 0.5

export class SiteScene {
  readonly scene = new THREE.Scene()
  readonly terrain = new TerrainGenerator()
  sky: MarsSky | null = null
  dust: DustParticles | null = null
  trails: RoverTrails | null = null
  rover: THREE.Group | null = null

  private dustCover = 0.5
  private roverLight: THREE.PointLight | null = null

  async init(params: TerrainParams): Promise<void> {
    this.dustCover = params.dustCover
    this.scene.fog = new THREE.FogExp2(0x2a1508, 0.003)

    // Sky with day/night cycle and lighting
    this.sky = new MarsSky(this.scene)

    // Terrain
    this.terrain.generate(params)
    this.scene.add(this.terrain.group)

    // Dust particles
    this.dust = new DustParticles(params.dustCover)
    this.scene.add(this.dust.mesh)

    // Tire trails
    this.trails = new RoverTrails((x, z) => this.terrain.heightAt(x, z))
    this.scene.add(this.trails.mesh)

    await this.loadRover()
  }

  update(elapsed: number, delta: number, cameraPosition: THREE.Vector3) {
    this.sky?.update(delta)
    this.dust?.update(elapsed, cameraPosition)

    // Update fog color to match sky time of day
    if (this.sky) {
      const sunUp = Math.max(0, this.sky.sunDirection.y)
      const r = 0.16 + sunUp * 0.10
      const g = 0.08 + sunUp * 0.05
      const b = 0.03 + sunUp * 0.03
      ;(this.scene.fog as THREE.FogExp2).color.setRGB(r, g, b)
    }
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
    const { x: sx, z: sz } = this.findClearSpawn()
    const startY = this.terrain.heightAt(sx, sz)
    this.rover.position.set(sx, startY, sz)
    this.scene.add(this.rover)

    // Soft fill light attached to rover so it's always visible
    this.roverLight = new THREE.PointLight(0xffe0c0, 6.0, 25, 0.8)
    this.roverLight.position.set(0, 5, 0)
    this.rover.add(this.roverLight)
  }

  private findClearSpawn(): { x: number; z: number } {
    // Sample a grid of candidates and pick the flattest, rock-free spot
    const colliders = this.terrain.rockColliders
    let bestSpot = { x: 0, z: 0 }
    let bestSlope = Infinity

    for (let x = -40; x <= 40; x += 10) {
      for (let z = -40; z <= 40; z += 10) {
        const slope = this.terrain.slopeAt(x, z)
        if (slope >= bestSlope) continue

        const tooClose = colliders.some((r) => {
          if (r.radius < 0.6) return false
          const dx = x - r.x
          const dz = z - r.z
          return Math.sqrt(dx * dx + dz * dz) < r.radius + 1.5
        })
        if (tooClose) continue

        bestSlope = slope
        bestSpot = { x, z }
      }
    }
    return bestSpot
  }

  dispose() {
    this.terrain.dispose()
    this.sky?.dispose()
    this.dust?.dispose()
    this.trails?.dispose()
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
