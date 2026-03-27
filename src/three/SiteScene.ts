import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { createTerrainGenerator, type ITerrainGenerator, type TerrainParams, type TerrainGeneratorType } from './terrain/TerrainGenerator'
import { DustParticles } from './DustParticles'
import { MarsSky } from './MarsSky'
import { MarsMoons } from './MarsMoons'
import { RoverTrails } from './RoverTrails'
import {
  getTouchdownReleaseProgress,
  getTouchdownTetherRetractProgress,
  getTouchdownTetherTension,
  isInTouchdownTetherWindow,
} from '@/lib/skyCraneTouchdown'
import landingDustVert from '@/three/shaders/landing-dust.vert.glsl?raw'
import landingDustFrag from '@/three/shaders/landing-dust.frag.glsl?raw'

const ROVER_SCALE = 0.5
const TOUCHDOWN_STAGE_HEIGHT = 3.8
const TOUCHDOWN_STAGE_FLYAWAY_RISE = 3.2
const TOUCHDOWN_STAGE_FLYAWAY_DRIFT = new THREE.Vector3(-0.8, 0, -2.4)
const TOUCHDOWN_TETHER_RADIUS = 0.022
const TOUCHDOWN_TETHER_STAGE_ANCHORS = [
  new THREE.Vector3(-0.6, -0.1, -0.6),
  new THREE.Vector3(0.6, -0.1, -0.6),
  new THREE.Vector3(-0.6, -0.1, 0.6),
  new THREE.Vector3(0.6, -0.1, 0.6),
]
const TOUCHDOWN_TETHER_ROVER_ANCHORS = [
  new THREE.Vector3(-1.1, 1.15, -1.0),
  new THREE.Vector3(1.1, 1.15, -1.0),
  new THREE.Vector3(-1.1, 1.15, 1.0),
  new THREE.Vector3(1.1, 1.15, 1.0),
]

interface TouchdownTether {
  mesh: THREE.Mesh
}

interface ThrusterPlume {
  root: THREE.Group
  core: THREE.Mesh
  glow: THREE.Mesh
}

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

/** Options for {@link SiteScene.init}. */
export interface SiteSceneInitOptions {
  /** If true, rover spawns deployed on the ground (no descent or deploy GLTF clip). */
  skipIntroSequence?: boolean
}

export class SiteScene {
  readonly scene = new THREE.Scene()
  readonly terrain: ITerrainGenerator
  sky: MarsSky | null = null
  moons: MarsMoons | null = null

  constructor(terrainType?: TerrainGeneratorType) {
    this.terrain = createTerrainGenerator(terrainType)
  }
  dust: DustParticles | null = null
  trails: RoverTrails | null = null
  rover: THREE.Group | null = null
  roverWheels: RoverWheels | null = null
  roverMast: RoverMast | null = null
  roverState: RoverState = 'descending'
  /** Cover bind-pose quaternions (closed state), captured before deployment animation */
  coverBindQuats: Map<string, THREE.Quaternion> = new Map()

  private mixer: THREE.AnimationMixer | null = null
  private deployAction: THREE.AnimationAction | null = null
  private deployDuration = 0

  // Descent state
  private descentStartY = 0
  private descentGroundY = 0
  private descentTime = 0
  private readonly DESCENT_DURATION = 10  // seconds — landing.mp3 continues into deploy
  private readonly DESCENT_HEIGHT = 25    // units above ground
  private landingDust: THREE.Points | null = null
  private landingDustMaterial: THREE.ShaderMaterial | null = null
  private landingDustTime = 0
  private touchdownRig: THREE.Group | null = null
  private touchdownStage: THREE.Group | null = null
  private touchdownTethers: TouchdownTether[] = []
  private touchdownReleaseElapsed = 0
  private touchdownReleaseActive = false
  private descentPlumes: ThrusterPlume[] = []
  private dustCover = 0.5
  private waterIceIndex = 0
  private featureType: TerrainParams['featureType'] = 'plain'
  private roverLight: THREE.PointLight | null = null
  private roverFillLow: THREE.PointLight | null = null
  private skipIntroSequence = false
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

  async init(params: TerrainParams, options?: SiteSceneInitOptions): Promise<void> {
    this.skipIntroSequence = options?.skipIntroSequence ?? false
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
    this.sky.setTerrain(params.waterIceIndex)

    // Moons (Phobos & Deimos)
    this.moons = new MarsMoons(this.scene)
    await this.moons.init(params.latDeg)

    // Terrain
    await this.terrain.generate(params)
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

  /**
   * @param simElapsed — Accumulated simulation time (freezes when game clock paused).
   * @param delta — Scene / rover / deployment step (use 0 when paused).
   * @param skyDelta — Sky / sol advance only (0 until rover ready, or 0 when paused).
   */
  update(
    simElapsed: number,
    delta: number,
    cameraPosition: THREE.Vector3,
    skyDelta: number,
  ) {
    // Sky crane descent
    if (this.roverState === 'descending' && this.rover) {
      if (!this.touchdownReleaseActive) {
        this.descentTime += delta
        const t = Math.min(1, this.descentTime / this.DESCENT_DURATION)
        // Ease-in curve — starts slow, accelerates like gravity
        const eased = t * t * (3 - 2 * t)
        this.rover.position.y = this.descentStartY + (this.descentGroundY - this.descentStartY) * eased

        // Subtle sway during descent
        this.rover.rotation.z = Math.sin(this.descentTime * 2.5) * 0.015 * (1 - t)
        this.rover.rotation.x = Math.cos(this.descentTime * 1.8) * 0.01 * (1 - t)
        this.updateTouchdownRig(t, 0)
        this.updateDescentPlumes(t, 0, 0)

        if (t >= 1) {
          this.rover.position.y = this.descentGroundY
          this.touchdownReleaseActive = true
          this.touchdownReleaseElapsed = 0
          this.spawnLandingDust()
        }
      } else {
        this.touchdownReleaseElapsed += delta
        this.rover.position.y = this.descentGroundY
        this.rover.rotation.z = 0
        this.rover.rotation.x = 0
        this.updateTouchdownRig(1, this.touchdownReleaseElapsed)
        const retractProgress = getTouchdownTetherRetractProgress(this.touchdownReleaseElapsed)
        const releaseProgress = getTouchdownReleaseProgress(this.touchdownReleaseElapsed)
        this.updateDescentPlumes(1, releaseProgress, retractProgress)

        if (getTouchdownTetherRetractProgress(this.touchdownReleaseElapsed) >= 1) {
          this.hideTouchdownRig()
          this.touchdownReleaseActive = false
          this.roverState = 'deploying'
          this.deployAction?.play()
        }
      }
    }

    // Tick deployment animation
    this.mixer?.update(delta)

    // Animate landing dust
    if (this.landingDust && this.landingDustMaterial) {
      this.landingDustTime += delta
      const dustLife = 4.0
      const dt = this.landingDustTime / dustLife
      if (dt >= 1) {
        this.scene.remove(this.landingDust)
        this.landingDust.geometry.dispose()
        this.landingDustMaterial.dispose()
        this.landingDust = null
        this.landingDustMaterial = null
      } else {
        this.landingDustMaterial.uniforms.uTime.value = this.landingDustTime
      }
    }

    const roverPos = this.rover?.position
    this.sky?.update(skyDelta, roverPos)
    this.dust?.update(simElapsed, cameraPosition)

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

    // Modulate rover fill lights by time of day:
    // Day — sun is key light, fills stay low so material colors read clearly
    // Night — fills rise to keep the rover visible without the sun
    if (this.sky && this.roverLight && this.roverFillLow) {
      const night = this.sky.nightFactor          // 0 = full day, 1 = full night
      const sunUp = Math.max(0, this.sky.sunDirection.y)

      // Main overhead: low during day (0.6), rises at night (2.5)
      this.roverLight.intensity = 0.6 + night * 1.9
      // Shift color cooler at night (moonlight feel)
      this.roverLight.color.setRGB(
        1.0 - night * 0.25,   // less red at night
        0.94 - night * 0.12,
        0.88 + night * 0.12,  // bluer at night
      )

      // Low fill: subtle during day (0.3), moderate at night (1.2)
      this.roverFillLow.intensity = 0.3 + night * 0.9
      // At high noon, drop fill even further so sun contrast pops
      if (sunUp > 0.5) {
        const noonDim = (sunUp - 0.5) * 2.0 // 0..1 as sun climbs to zenith
        this.roverLight.intensity *= (1.0 - noonDim * 0.4)
        this.roverFillLow.intensity *= (1.0 - noonDim * 0.5)
      }
    }

    // Update fog color to match sky time of day, shifted by site type
    if (this.sky) {
      const sunUp = Math.max(0, this.sky.sunDirection.y)
      let r: number, g: number, b: number
      if (this.waterIceIndex > 0.7 || this.featureType === 'polar-cap') {
        // Polar: cool blue-grey fog — brighter cold blue during day
        r = 0.10 + sunUp * 0.48
        g = 0.12 + sunUp * 0.52
        b = 0.15 + sunUp * 0.57
      } else if (this.featureType === 'volcano') {
        // Volcanic: dark murky brown — lifts more visibly during day
        r = 0.10 + sunUp * 0.18
        g = 0.05 + sunUp * 0.10
        b = 0.02 + sunUp * 0.06
      } else {
        // Default warm Mars brown — much warmer/brighter day fog
        r = 0.16 + sunUp * 0.29
        g = 0.08 + sunUp * 0.17
        b = 0.03 + sunUp * 0.09
      }
      if (this.scene.fog) (this.scene.fog as THREE.FogExp2).color.setRGB(r, g, b)
    }
  }

  /** Update fog density and color from weather state. */
  setAtmosphere(windMs: number, stormLevel: number) {
    if (!this.scene.fog || !(this.scene.fog instanceof THREE.FogExp2)) return

    const windFactor = windMs / 5
    // L0 calm: ~0.003 (subtle haze). L3: ~0.06 (reduced visibility). L5: ~0.14 (near whiteout)
    const density = Math.max(0, windFactor * 0.003 + stormLevel * 0.024 + stormLevel * stormLevel * 0.002)
    this.scene.fog.density = density

    // Sync fog color with sky horizon for seamless blend
    if (this.sky) {
      this.scene.fog.color.copy(this.sky.horizonColor)
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

    // Capture cover bind-pose quaternions (closed state) before animation touches them
    for (const name of ['cover_01', 'cover_02', 'cover_03']) {
      const node = this.rover.getObjectByName(name)
      if (node) this.coverBindQuats.set(name, node.quaternion.clone())
    }

    // Prepare deployment animation (will start after descent)
    if (gltf.animations.length > 0) {
      this.mixer = new THREE.AnimationMixer(this.rover)
      const clip = gltf.animations[0]
      this.deployDuration = clip.duration
      this.deployAction = this.mixer.clipAction(clip)
      this.deployAction.setLoop(THREE.LoopOnce, 1)
      this.deployAction.clampWhenFinished = true

      this.mixer.addEventListener('finished', () => {
        this.bakeDeployedPoseAndStopMixer()
      })
    }

    const { x: sx, z: sz } = this.findClearSpawn()
    this.descentGroundY = this.terrain.heightAt(sx, sz)
    this.descentStartY = this.descentGroundY + this.DESCENT_HEIGHT
    this.descentTime = 0

    if (this.skipIntroSequence) {
      this.rover.position.set(sx, this.descentGroundY, sz)
    } else {
      this.roverState = 'descending'
      this.rover.position.set(sx, this.descentStartY, sz)
    }
    this.scene.add(this.rover)
    if (!this.skipIntroSequence) {
      this.createTouchdownRig()
    }
    if (this.skipIntroSequence) {
      this.applySkippedIntroDeployedState()
    }

    // Fill lights attached to rover — kept subtle so the sun is the key light.
    // Intensities are modulated by time of day in update().
    // Main overhead fill — neutral warm, softens top shadows
    this.roverLight = new THREE.PointLight(0xfff0e0, 1.5, 30, 1.0)
    this.roverLight.position.set(0, 5, 0)
    this.rover.add(this.roverLight)

    // Secondary low fill — cool bounce, lifts shadow detail underneath
    this.roverFillLow = new THREE.PointLight(0xd0dce8, 0.8, 15, 1.0)
    this.roverFillLow.position.set(0, 1.5, 2)
    this.rover.add(this.roverFillLow)
  }

  private spawnLandingDust(): void {
    if (!this.rover) return
    const count = 350
    const positions = new Float32Array(count * 3)
    const aSpeed = new Float32Array(count)      // per-particle radial speed
    const aSize = new Float32Array(count)       // per-particle base size
    const aPhase = new Float32Array(count)      // random phase offset for turbulence
    const aRise = new Float32Array(count)       // vertical rise speed

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2
      // Spawn in a tight ring under the rover
      const radius = 0.2 + Math.random() * 0.8
      positions[i * 3] = Math.cos(angle) * radius
      positions[i * 3 + 1] = Math.random() * 0.15
      positions[i * 3 + 2] = Math.sin(angle) * radius
      // Fast ground particles vs slow rising cloud
      const isGroundRing = Math.random() < 0.6
      aSpeed[i] = isGroundRing
        ? 3.0 + Math.random() * 4.0   // fast radial burst
        : 0.5 + Math.random() * 1.5   // slow drift
      aSize[i] = isGroundRing
        ? 0.15 + Math.random() * 0.25 // smaller ground spray
        : 0.4 + Math.random() * 0.8   // bigger billowing clouds
      aPhase[i] = Math.random() * Math.PI * 2
      aRise[i] = isGroundRing
        ? 0.2 + Math.random() * 0.5   // ground particles barely rise
        : 1.5 + Math.random() * 2.5   // cloud particles billow up
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geo.setAttribute('aSpeed', new THREE.Float32BufferAttribute(aSpeed, 1))
    geo.setAttribute('aSize', new THREE.Float32BufferAttribute(aSize, 1))
    geo.setAttribute('aPhase', new THREE.Float32BufferAttribute(aPhase, 1))
    geo.setAttribute('aRise', new THREE.Float32BufferAttribute(aRise, 1))

    this.landingDustMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
      },
      vertexShader: landingDustVert,
      fragmentShader: landingDustFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    })

    this.landingDust = new THREE.Points(geo, this.landingDustMaterial)
    this.landingDust.position.copy(this.rover.position)
    this.landingDustTime = 0
    this.scene.add(this.landingDust)
  }

  /**
   * Samples the current animated pose, stops the deploy mixer, and reapplies transforms
   * so the rover stays in the deployed configuration (bind pose would otherwise show stowed parts).
   */
  private bakeDeployedPoseAndStopMixer(): void {
    if (!this.rover || !this.deployAction || !this.mixer) return
    this.roverState = 'ready'
    const saved = new Map<THREE.Object3D, {
      pos: THREE.Vector3
      quat: THREE.Quaternion
      scale: THREE.Vector3
    }>()
    this.rover.traverse((node) => {
      saved.set(node, {
        pos: node.position.clone(),
        quat: node.quaternion.clone(),
        scale: node.scale.clone(),
      })
    })
    this.deployAction.stop()
    this.mixer.uncacheRoot(this.rover)
    this.mixer = null
    this.deployAction = null
    saved.forEach(({ pos, quat, scale }, node) => {
      node.position.copy(pos)
      node.quaternion.copy(quat)
      node.scale.copy(scale)
    })
    this.extractWheelNodes()
  }

  /** Jumps the deploy clip to the end and bakes pose (used when intro sequence is skipped). */
  private applySkippedIntroDeployedState(): void {
    if (!this.rover) return
    if (this.mixer && this.deployAction && this.deployDuration > 0) {
      this.deployAction.reset()
      this.deployAction.play()
      this.deployAction.time = this.deployDuration
      this.mixer.update(0)
      this.bakeDeployedPoseAndStopMixer()
    } else {
      this.roverState = 'ready'
      this.extractWheelNodes()
    }
  }

  /**
   * Builds the temporary descent-stage rig used only during the final touchdown beat.
   */
  private createTouchdownRig(): void {
    if (this.touchdownRig) return

    const rig = new THREE.Group()
    rig.visible = false

    const stage = new THREE.Group()
    const stageMaterial = new THREE.MeshStandardMaterial({
      color: 0x5d6771,
      roughness: 0.85,
      metalness: 0.25,
      emissive: new THREE.Color(0x110804),
      emissiveIntensity: 0.08,
    })

    const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.18, 1.5), stageMaterial)
    stage.add(body)

    for (const [x, z] of [[0, -0.85], [0, 0.85], [-0.85, 0], [0.85, 0]] as const) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.7), stageMaterial)
      beam.position.set(x, 0.02, z)
      if (x !== 0) beam.rotation.y = Math.PI / 2
      stage.add(beam)

      const thruster = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.16, 0.3, 8), stageMaterial)
      thruster.position.set(x * 0.95, -0.22, z * 0.95)
      stage.add(thruster)

      // Thruster plume (core + glow cone, same visual as orbital drop)
      const plumeRoot = new THREE.Group()
      plumeRoot.position.set(x * 0.95, -0.37, z * 0.95)
      plumeRoot.visible = false
      const coreMat = new THREE.MeshBasicMaterial({
        color: 0xfff1b8, transparent: true, opacity: 0.9,
        depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      })
      const plumeCore = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.42, 10, 1, true), coreMat)
      plumeCore.rotation.x = Math.PI
      plumeCore.position.y = -0.21
      plumeRoot.add(plumeCore)
      const glowMat = new THREE.MeshBasicMaterial({
        color: 0xff8a3a, transparent: true, opacity: 0.45,
        depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      })
      const plumeGlow = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.68, 10, 1, true), glowMat)
      plumeGlow.rotation.x = Math.PI
      plumeGlow.position.y = -0.34
      plumeRoot.add(plumeGlow)
      stage.add(plumeRoot)
      this.descentPlumes.push({ root: plumeRoot, core: plumeCore, glow: plumeGlow })
    }

    rig.add(stage)

    const tetherMaterial = new THREE.MeshStandardMaterial({
      color: 0x161a1f,
      roughness: 0.85,
      metalness: 0.08,
      emissive: new THREE.Color(0x050607),
      transparent: true,
      opacity: 0.95,
    })
    const tetherGeometry = new THREE.CylinderGeometry(
      TOUCHDOWN_TETHER_RADIUS,
      TOUCHDOWN_TETHER_RADIUS,
      1,
      10,
      1,
      false,
    )

    this.touchdownTethers = TOUCHDOWN_TETHER_STAGE_ANCHORS.map(() => {
      const mesh = new THREE.Mesh(tetherGeometry, tetherMaterial)
      mesh.castShadow = true
      mesh.receiveShadow = true
      rig.add(mesh)
      return { mesh }
    })

    this.touchdownRig = rig
    this.touchdownStage = stage
    this.scene.add(rig)
  }

  /**
   * Updates the temporary descent stage and tether meshes during descent and release.
   */
  private updateTouchdownRig(descentProgress: number, releaseElapsed: number): void {
    if (!this.rover || !this.touchdownRig || !this.touchdownStage) return

    const showRig = isInTouchdownTetherWindow(descentProgress) || releaseElapsed > 0
    this.touchdownRig.visible = showRig
    if (!showRig) return

    const releaseProgress = getTouchdownReleaseProgress(releaseElapsed)
    const retractProgress = getTouchdownTetherRetractProgress(releaseElapsed)
    const tension = getTouchdownTetherTension(releaseElapsed)
    const stageFlightProgress = Math.min(1, releaseProgress * 0.35 + retractProgress * 0.65)
    const flyaway = TOUCHDOWN_STAGE_FLYAWAY_DRIFT.clone().multiplyScalar(stageFlightProgress)
    const swayScale = 1 - stageFlightProgress

    this.touchdownStage.position.set(
      this.rover.position.x + Math.sin(this.descentTime * 1.4) * 0.1 * swayScale + flyaway.x,
      this.rover.position.y + TOUCHDOWN_STAGE_HEIGHT + TOUCHDOWN_STAGE_FLYAWAY_RISE * stageFlightProgress * stageFlightProgress,
      this.rover.position.z + Math.cos(this.descentTime * 1.1) * 0.08 * swayScale + flyaway.z,
    )
    this.touchdownStage.rotation.x = this.rover.rotation.x * 0.45
    this.touchdownStage.rotation.z = this.rover.rotation.z * 0.45 - stageFlightProgress * 0.18
    this.touchdownStage.rotation.y = stageFlightProgress * 0.35

    const material = this.touchdownTethers[0]?.mesh.material
    if (material instanceof THREE.MeshStandardMaterial) {
      material.opacity = Math.max(0.1, 1 - retractProgress * 0.9)
      material.emissiveIntensity = 0.03 + retractProgress * 0.03
    }

    for (let i = 0; i < this.touchdownTethers.length; i++) {
      const start = this.touchdownStage.localToWorld(TOUCHDOWN_TETHER_STAGE_ANCHORS[i].clone())
      const end = this.rover.localToWorld(TOUCHDOWN_TETHER_ROVER_ANCHORS[i].clone())
      this.updateTouchdownTetherMesh(this.touchdownTethers[i], start, end, tension, releaseProgress, retractProgress)
    }
  }

  /**
   * Updates a single tether mesh so it reads as a thick physical cable.
   */
  private updateTouchdownTetherMesh(
    tether: TouchdownTether,
    start: THREE.Vector3,
    end: THREE.Vector3,
    tension: number,
    releaseProgress: number,
    retractProgress: number,
  ): void {
    const offsetEnd = end.clone()
    offsetEnd.y -= releaseProgress * 0.18
    offsetEnd.z -= releaseProgress * 0.2
    const retractTarget = start.clone()
    retractTarget.y -= 0.15
    retractTarget.z -= 0.1
    offsetEnd.lerp(retractTarget, retractProgress)

    const direction = offsetEnd.clone().sub(start)
    const length = direction.length()
    if (length <= 0.001) {
      tether.mesh.visible = false
      return
    }

    const midpoint = start.clone().addScaledVector(direction, 0.5)
    tether.mesh.position.copy(midpoint)
    tether.mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.clone().normalize(),
    )
    tether.mesh.scale.setScalar(1)
    tether.mesh.scale.y = length

    const material = tether.mesh.material as THREE.MeshStandardMaterial
    material.opacity = Math.max(0.1, 1 - retractProgress * 0.9)
    tether.mesh.visible = retractProgress < 0.995 && (tension > 0.01 || retractProgress > 0)
  }

  /**
   * Hides the temporary touchdown rig after the descent stage flyaway is complete.
   */
  private hideTouchdownRig(): void {
    if (!this.touchdownRig) return
    this.touchdownRig.visible = false
    for (const tether of this.touchdownTethers) {
      tether.mesh.visible = false
    }
    for (const plume of this.descentPlumes) {
      plume.root.visible = false
    }
  }

  /**
   * Animates thruster plume intensity during descent and fades during release/flyaway.
   * Same visual logic as OrbitalDropController thruster plumes.
   */
  private updateDescentPlumes(
    descentProgress: number,
    releaseProgress: number,
    retractProgress: number,
  ): void {
    const active = retractProgress < 0.995
    const fade = (1 - releaseProgress) * (1 - retractProgress)
    const descentBoost = 0.55 + (1 - Math.min(1, descentProgress)) * 0.45

    for (let i = 0; i < this.descentPlumes.length; i++) {
      const plume = this.descentPlumes[i]
      plume.root.visible = active && fade > 0.02
      if (!plume.root.visible) continue

      const flicker = 0.88 + Math.sin(this.descentTime * 28 + i * 1.7) * 0.12
      const intensity = fade * descentBoost * flicker
      plume.core.scale.set(1, 0.7 + intensity * 0.9, 1)
      plume.glow.scale.set(1.1, 0.8 + intensity * 1.2, 1.1)

      const coreMat = plume.core.material as THREE.MeshBasicMaterial
      const glowMat = plume.glow.material as THREE.MeshBasicMaterial
      coreMat.opacity = Math.min(0.98, 0.35 + intensity * 0.7)
      glowMat.opacity = Math.min(0.65, 0.16 + intensity * 0.42)
    }
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
    if (this.touchdownRig) {
      this.scene.remove(this.touchdownRig)
      this.touchdownRig.traverse((child) => {
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
    this.terrain.dispose()
    this.moons?.dispose()
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
