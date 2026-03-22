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
  private landingDustMaterial: THREE.ShaderMaterial | null = null
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
      vertexShader: `
        attribute float aSpeed;
        attribute float aSize;
        attribute float aPhase;
        attribute float aRise;
        uniform float uTime;
        varying float vAlpha;
        varying float vLife;

        void main() {
          float life = uTime / 4.0; // 0-1 over dust lifetime
          vLife = life;

          // Decelerate over time (fast burst then slow)
          float decel = 1.0 - life * life * 0.6;
          vec3 pos = position;
          float dist = length(pos.xz);
          vec2 dir = dist > 0.01 ? pos.xz / dist : vec2(1.0, 0.0);

          // Radial expansion with deceleration
          float radial = aSpeed * uTime * decel;
          pos.xz += dir * radial;

          // Turbulence — swirl and wobble
          float turb = sin(aPhase + uTime * 2.5) * 0.5 + cos(aPhase * 1.7 + uTime * 1.8) * 0.3;
          pos.x += turb * (0.3 + life * 0.8);
          pos.z += cos(aPhase + uTime * 3.0) * turb * 0.4;

          // Vertical rise with slight deceleration
          pos.y += aRise * uTime * (1.0 - life * 0.4);

          // Fade: quick appearance, slow fade out
          float fadeIn = smoothstep(0.0, 0.05, life);
          float fadeOut = 1.0 - smoothstep(0.3, 1.0, life);
          vAlpha = fadeIn * fadeOut * 0.7;

          // Size grows over time (billowing effect)
          float size = aSize * (1.0 + uTime * 1.5);

          vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
          gl_PointSize = size * (300.0 / -mvPos.z);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        varying float vAlpha;
        varying float vLife;

        void main() {
          // Soft circular falloff (no square edges)
          vec2 center = gl_PointCoord - 0.5;
          float dist = length(center) * 2.0;
          float circle = 1.0 - smoothstep(0.4, 1.0, dist);

          // Color: warm Mars dust, slightly darker at edges
          vec3 dustColor = mix(
            vec3(0.76, 0.58, 0.40),  // core: warm tan
            vec3(0.55, 0.40, 0.28),  // edge: darker brown
            dist * 0.6
          );

          // Slight color shift as particles age (cooler as they disperse)
          dustColor = mix(dustColor, vec3(0.60, 0.52, 0.45), vLife * 0.4);

          gl_FragColor = vec4(dustColor, vAlpha * circle);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    })

    this.landingDust = new THREE.Points(geo, this.landingDustMaterial)
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
