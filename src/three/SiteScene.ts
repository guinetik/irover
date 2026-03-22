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
  private waterIceIndex = 0
  private featureType: TerrainParams['featureType'] = 'plain'
  private roverLight: THREE.PointLight | null = null
  private sunRaycaster = new THREE.Raycaster()
  /** Whether the rover is currently in direct sunlight (not shadowed by terrain/rocks) */
  roverInSunlight = true

  async init(params: TerrainParams): Promise<void> {
    this.dustCover = params.dustCover
    this.waterIceIndex = params.waterIceIndex
    this.featureType = params.featureType

    // Choose base fog color based on site type
    let fogColor: number
    if (params.waterIceIndex > 0.7 || params.featureType === 'polar-cap') {
      fogColor = 0x8a9aaa  // cold blue-grey for polar/icy sites
    } else if (params.featureType === 'volcano') {
      fogColor = 0x1a1008  // very dark for volcanic sites
    } else {
      fogColor = 0x2a1508  // default warm brown
    }
    this.scene.fog = new THREE.FogExp2(fogColor, 0.003)

    // Sky with day/night cycle and lighting
    this.sky = new MarsSky(this.scene)

    // Terrain
    this.terrain.generate(params)
    this.scene.add(this.terrain.group)

    // Dust particles
    this.dust = new DustParticles({
      dustCover: params.dustCover,
      featureType: params.featureType,
      waterIceIndex: params.waterIceIndex,
      temperatureMinK: params.temperatureMinK,
    })
    this.scene.add(this.dust.mesh)

    // Tire trails
    this.trails = new RoverTrails((x, z) => this.terrain.heightAt(x, z))
    this.scene.add(this.trails.mesh)

    await this.loadRover()
  }

  update(elapsed: number, delta: number, cameraPosition: THREE.Vector3) {
    const roverPos = this.rover?.position
    this.sky?.update(delta, roverPos)
    this.dust?.update(elapsed, cameraPosition)

    // Sync terrain shader sun direction with sky
    if (this.sky && this.terrain.terrainMaterial) {
      this.terrain.terrainMaterial.uniforms.uSunDirection.value.copy(this.sky.sunDirection)
    }

    // Sunlight raycast — check if rover is in direct sunlight
    if (this.sky && roverPos && this.sky.sunDirection.y > 0) {
      const origin = roverPos.clone().add(new THREE.Vector3(0, 1, 0))
      this.sunRaycaster.set(origin, this.sky.sunDirection)
      this.sunRaycaster.far = 100
      const hits = this.sunRaycaster.intersectObjects(this.terrain.group.children, true)
      this.roverInSunlight = hits.length === 0
    } else {
      this.roverInSunlight = false // night = no sunlight
    }

    // Update fog color to match sky time of day, shifted by site type
    if (this.sky) {
      const sunUp = Math.max(0, this.sky.sunDirection.y)
      let r: number, g: number, b: number
      if (this.waterIceIndex > 0.7 || this.featureType === 'polar-cap') {
        // Polar: cool blue-grey fog — dim bluish night, cold pale-blue day
        r = 0.10 + sunUp * 0.38
        g = 0.12 + sunUp * 0.42
        b = 0.15 + sunUp * 0.50
      } else if (this.featureType === 'volcano') {
        // Volcanic: very dark, murky brown — barely lifts during day
        r = 0.10 + sunUp * 0.08
        g = 0.05 + sunUp * 0.04
        b = 0.02 + sunUp * 0.02
      } else {
        // Default warm Mars brown
        r = 0.16 + sunUp * 0.10
        g = 0.08 + sunUp * 0.05
        b = 0.03 + sunUp * 0.03
      }
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

    // Fill lights attached to rover so it's always visible
    // Main overhead fill — warm, wide range
    this.roverLight = new THREE.PointLight(0xffe0c0, 10.0, 40, 0.6)
    this.roverLight.position.set(0, 6, 0)
    this.rover.add(this.roverLight)

    // Secondary low fill — cooler, reduces harsh shadows underneath
    const lowFill = new THREE.PointLight(0xc0d0e0, 4.0, 20, 0.5)
    lowFill.position.set(0, 2, 2)
    this.rover.add(lowFill)
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
