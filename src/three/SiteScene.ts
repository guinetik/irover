import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { TerrainGenerator, type TerrainParams } from './terrain/TerrainGenerator'
import { DustParticles } from './DustParticles'
import { MarsSky } from './MarsSky'
import { RoverTrails } from './RoverTrails'

const ROVER_SCALE = 0.5

export interface RoverWheels {
  wheels: THREE.Object3D[]       // all 6 wheels for spin
  steerFL: THREE.Object3D | null // front-left steering pivot
  steerFR: THREE.Object3D | null // front-right steering pivot
  steerBL: THREE.Object3D | null // rear-left steering pivot
  steerBR: THREE.Object3D | null // rear-right steering pivot
}

export interface RoverMast {
  pan: THREE.Object3D   // mast_03 — horizontal pan (Y axis)
  tilt: THREE.Object3D  // mast_02 — vertical tilt (X axis)
  panBaseQuat: THREE.Quaternion   // deployed-pose quaternion for pan node
  tiltBaseQuat: THREE.Quaternion  // deployed-pose quaternion for tilt node
}

export type RoverState = 'descending' | 'deploying' | 'ready'

export class SiteScene {
  readonly scene = new THREE.Scene()
  readonly terrain = new TerrainGenerator()
  sky: MarsSky | null = null
  dust: DustParticles | null = null
  trails: RoverTrails | null = null
  rover: THREE.Group | null = null
  roverWheels: RoverWheels | null = null
  roverMast: RoverMast | null = null
  roverState: RoverState = 'descending'

  private mixer: THREE.AnimationMixer | null = null
  private deployAction: THREE.AnimationAction | null = null
  private deployDuration = 0

  // Descent state
  private descentStartY = 0
  private descentGroundY = 0
  private descentTime = 0
  private readonly DESCENT_DURATION = 3.5 // seconds
  private readonly DESCENT_HEIGHT = 8     // units above ground
  private landingDust: THREE.Points | null = null
  private landingDustTime = 0
  private dustCover = 0.5
  private waterIceIndex = 0
  private featureType: TerrainParams['featureType'] = 'plain'
  private roverLight: THREE.PointLight | null = null
  private sunRaycaster = new THREE.Raycaster()
  /** Whether the rover is currently in direct sunlight (not shadowed by terrain/rocks) */
  roverInSunlight = true

  /** Deployment progress 0..1 (descent phase is separate, not included) */
  get deployProgress(): number {
    if (this.roverState === 'ready') return 1
    if (this.roverState === 'descending') return 0
    if (!this.deployAction || this.deployDuration <= 0) return 0
    return Math.min(1, this.deployAction.time / this.deployDuration)
  }

  /** Descent progress 0..1 */
  get descentProgress(): number {
    if (this.roverState !== 'descending') return 1
    return Math.min(1, this.descentTime / this.DESCENT_DURATION)
  }

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
    this.trails = new RoverTrails((x, z) => this.terrain.terrainHeightAt(x, z))
    this.scene.add(this.trails.mesh)

    await this.loadRover()
  }

  update(elapsed: number, delta: number, cameraPosition: THREE.Vector3) {
    // Sky crane descent
    if (this.roverState === 'descending' && this.rover) {
      this.descentTime += delta
      const t = Math.min(1, this.descentTime / this.DESCENT_DURATION)
      // Ease-in curve — starts slow, accelerates like gravity
      const eased = t * t * (3 - 2 * t)
      this.rover.position.y = this.descentStartY + (this.descentGroundY - this.descentStartY) * eased

      // Subtle sway during descent
      this.rover.rotation.z = Math.sin(this.descentTime * 2.5) * 0.015 * (1 - t)
      this.rover.rotation.x = Math.cos(this.descentTime * 1.8) * 0.01 * (1 - t)

      if (t >= 1) {
        this.rover.position.y = this.descentGroundY
        this.rover.rotation.z = 0
        this.rover.rotation.x = 0
        this.roverState = 'deploying'
        // Spawn landing dust cloud
        this.spawnLandingDust()
        // Start the deployment animation
        this.deployAction?.play()
      }
    }

    // Tick deployment animation
    this.mixer?.update(delta)

    // Animate landing dust
    if (this.landingDust) {
      this.landingDustTime += delta
      const dustLife = 2.5
      const dt = this.landingDustTime / dustLife
      if (dt >= 1) {
        this.scene.remove(this.landingDust)
        this.landingDust.geometry.dispose()
        ;(this.landingDust.material as THREE.PointsMaterial).dispose()
        this.landingDust = null
      } else {
        // Expand outward and fade
        const positions = this.landingDust.geometry.getAttribute('position') as THREE.BufferAttribute
        for (let i = 0; i < positions.count; i++) {
          const vx = positions.getX(i)
          const vy = positions.getY(i)
          const vz = positions.getZ(i)
          // Radial expansion + slight upward drift
          const dist = Math.sqrt(vx * vx + vz * vz) || 0.1
          const speed = 1.5 + dist * 0.3
          positions.setX(i, vx + (vx / dist) * speed * delta)
          positions.setY(i, vy + 0.8 * delta)
          positions.setZ(i, vz + (vz / dist) * speed * delta)
        }
        positions.needsUpdate = true
        const mat = this.landingDust.material as THREE.PointsMaterial
        mat.opacity = 0.6 * (1 - dt * dt)
        mat.size = 0.3 + dt * 0.5
      }
    }

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
    const gltf = await loader.loadAsync('/nasa_curiosity_clean.glb')
    this.rover = gltf.scene
    this.rover.scale.setScalar(ROVER_SCALE)
    this.rover.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })

    // Prepare deployment animation (will start after descent)
    if (gltf.animations.length > 0) {
      this.mixer = new THREE.AnimationMixer(this.rover)
      const clip = gltf.animations[0]
      this.deployDuration = clip.duration
      this.deployAction = this.mixer.clipAction(clip)
      this.deployAction.setLoop(THREE.LoopOnce, 1)
      this.deployAction.clampWhenFinished = true

      this.mixer.addEventListener('finished', () => {
        this.roverState = 'ready'
        // Snapshot every node's deployed-pose transforms before killing the mixer
        const saved = new Map<THREE.Object3D, {
          pos: THREE.Vector3, quat: THREE.Quaternion, scale: THREE.Vector3
        }>()
        this.rover!.traverse((node) => {
          saved.set(node, {
            pos: node.position.clone(),
            quat: node.quaternion.clone(),
            scale: node.scale.clone(),
          })
        })
        // Kill the mixer (this resets nodes to bind pose)
        this.deployAction!.stop()
        this.mixer!.uncacheRoot(this.rover!)
        this.mixer = null
        this.deployAction = null
        // Restore the deployed pose from our snapshot
        saved.forEach(({ pos, quat, scale }, node) => {
          node.position.copy(pos)
          node.quaternion.copy(quat)
          node.scale.copy(scale)
        })
        // Extract wheel/mast nodes from the baked deployed pose
        this.extractWheelNodes()
      })
    }

    const { x: sx, z: sz } = this.findClearSpawn()
    this.descentGroundY = this.terrain.heightAt(sx, sz)
    this.descentStartY = this.descentGroundY + this.DESCENT_HEIGHT
    this.descentTime = 0
    this.roverState = 'descending'
    this.rover.position.set(sx, this.descentStartY, sz)
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

  private spawnLandingDust(): void {
    if (!this.rover) return
    const count = 120
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2
      const radius = 0.3 + Math.random() * 1.2
      positions[i * 3] = Math.cos(angle) * radius
      positions[i * 3 + 1] = Math.random() * 0.3
      positions[i * 3 + 2] = Math.sin(angle) * radius
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    const mat = new THREE.PointsMaterial({
      color: 0xc4956a,
      size: 0.3,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      blending: THREE.NormalBlending,
    })
    this.landingDust = new THREE.Points(geo, mat)
    this.landingDust.position.copy(this.rover.position)
    this.landingDustTime = 0
    this.scene.add(this.landingDust)
  }

  private extractWheelNodes(): void {
    if (!this.rover) return
    const wheelNames = [
      'wheel_01_L', 'wheel_01_R',
      'wheel_02_L', 'wheel_02_R',
      'wheel_03_L', 'wheel_03_R',
    ]
    const wheels: THREE.Object3D[] = []
    for (const name of wheelNames) {
      const node = this.rover.getObjectByName(name)
      if (node) wheels.push(node)
    }
    this.roverWheels = {
      wheels,
      steerFL: this.rover.getObjectByName('suspension_steer_F_L') ?? null,
      steerFR: this.rover.getObjectByName('suspension_steer_F_R') ?? null,
      steerBL: this.rover.getObjectByName('suspension_steer_B_L') ?? null,
      steerBR: this.rover.getObjectByName('suspension_steer_B_R') ?? null,
    }

    // Extract mast camera head nodes and save their deployed-pose quaternions
    // Node names lose dots after pose bake (e.g. "mast_03.001" → "mast_03001")
    const pan = this.rover.getObjectByName('mast_03001') ?? this.rover.getObjectByName('mast_03.001')
    const tilt = this.rover.getObjectByName('mast_02001') ?? this.rover.getObjectByName('mast_02.001')
    if (pan && tilt) {
      this.roverMast = {
        pan, tilt,
        panBaseQuat: pan.quaternion.clone(),
        tiltBaseQuat: tilt.quaternion.clone(),
      }
    }
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
