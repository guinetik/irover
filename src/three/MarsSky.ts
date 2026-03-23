import * as THREE from 'three'
import skyVert from '@/three/shaders/mars-sky.vert.glsl?raw'
import skyFrag from '@/three/shaders/mars-sky.frag.glsl?raw'

// Full day cycle in seconds (accelerated — 3 real minutes = 1 sol)
export const SOL_DURATION = 180

/** Martian sol length in minutes — must match `SolClock` display math. */
export const MARS_SOL_CLOCK_MINUTES = 24 * 60 + 37

/**
 * `timeOfDay` in 0..1 that corresponds to 06:00 on the HUD sol clock.
 */
export const MARS_TIME_OF_DAY_06_00 = (6 * 60) / MARS_SOL_CLOCK_MINUTES

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}
const SKY_RADIUS = 900

export class MarsSky {
  // Color temperature stops (hoisted to avoid per-frame allocations)
  private static readonly DAWN_COLOR = new THREE.Color(0xffaa66)
  private static readonly MORNING_COLOR = new THREE.Color(0xffd0a0)
  private static readonly NOON_COLOR = new THREE.Color(0xfff0d8)
  private static readonly AMBIENT_DAY = new THREE.Color(0x8b5e3c)
  private static readonly AMBIENT_NIGHT = new THREE.Color(0x1a1018)
  private readonly _scratchColor = new THREE.Color()

  readonly mesh: THREE.Mesh
  private material: THREE.ShaderMaterial
  private sunLight: THREE.DirectionalLight
  private ambientLight: THREE.AmbientLight
  private hemiLight: THREE.HemisphereLight

  // Exposed for other systems (terrain shader, dust)
  readonly sunDirection = new THREE.Vector3()
  timeOfDay = MARS_TIME_OF_DAY_06_00
  /** 0 = full day, 1 = full night */
  nightFactor = 0

  constructor(scene: THREE.Scene) {
    this.material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        uSunDirection: { value: new THREE.Vector3() },
        uTimeOfDay: { value: this.timeOfDay },
      },
      vertexShader: skyVert,
      fragmentShader: skyFrag,
    })

    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(SKY_RADIUS, 32, 32), this.material)
    scene.add(this.mesh)

    // Sun
    this.sunLight = new THREE.DirectionalLight(0xffe8d0, 1.8)
    this.sunLight.castShadow = true
    this.sunLight.shadow.mapSize.width = 2048
    this.sunLight.shadow.mapSize.height = 2048
    this.sunLight.shadow.camera.near = 0.5
    this.sunLight.shadow.camera.far = 120
    const d = 40
    this.sunLight.shadow.camera.left = -d
    this.sunLight.shadow.camera.right = d
    this.sunLight.shadow.camera.top = d
    this.sunLight.shadow.camera.bottom = -d
    this.sunLight.shadow.bias = -0.0002
    scene.add(this.sunLight)

    // Ambient
    this.ambientLight = new THREE.AmbientLight(0x8b5e3c, 0.4)
    scene.add(this.ambientLight)

    // Hemisphere
    this.hemiLight = new THREE.HemisphereLight(0xc4956a, 0x3d2817, 0.3)
    scene.add(this.hemiLight)

    this.updateSun()
  }

  update(delta: number, roverPosition?: THREE.Vector3) {
    this.timeOfDay = (this.timeOfDay + delta / SOL_DURATION) % 1.0
    this.updateSun()

    // Shadow camera follows the rover so cast shadows are always visible
    if (roverPosition) {
      this.sunLight.target.position.copy(roverPosition)
      this.sunLight.position.copy(this.sunDirection).multiplyScalar(80).add(roverPosition)
      this.sunLight.target.updateMatrixWorld()
    }
  }

  private updateSun() {
    // Sun path: rises in east, arcs overhead, sets in west
    const angle = this.timeOfDay * Math.PI * 2 - Math.PI * 0.5
    const elevation = Math.sin(angle)
    const azimuth = Math.cos(angle)

    this.sunDirection.set(azimuth * 0.8, elevation, 0.3).normalize()
    this.sunLight.position.copy(this.sunDirection).multiplyScalar(80)

    // Update shader uniforms
    this.material.uniforms.uSunDirection.value.copy(this.sunDirection)
    this.material.uniforms.uTimeOfDay.value = this.timeOfDay

    // Adjust light intensity/color based on sun elevation
    const sunUp = Math.max(0, elevation)
    this.nightFactor = 1.0 - smoothstep(-0.1, 0.2, elevation)

    // Sun intensity — multi-phase curve for dramatic day arc
    // Dawn/dusk ramp (elevation -0.1 to 0.1): 0 to 2.0
    // Morning (0.1-0.5): 2.0 to 4.0
    // Noon (0.5-1.0): 4.0 to 5.5
    const dawnRamp = smoothstep(-0.1, 0.1, elevation)
    const morningRamp = smoothstep(0.1, 0.5, elevation)
    const noonRamp = smoothstep(0.5, 1.0, elevation)
    this.sunLight.intensity = dawnRamp * 2.0 + morningRamp * 2.0 + noonRamp * 1.5

    // Ambient and hemisphere — higher daytime fill
    this.ambientLight.intensity = 0.05 + sunUp * 0.35
    this.hemiLight.intensity = 0.05 + sunUp * 0.25

    // Sun color temperature arc — smooth lerp through day phases
    // Dawn: warm orange -> Morning: soft gold -> Noon: bright warm white
    // Dusk mirrors dawn symmetrically (elevation follows sin curve)
    if (elevation < 0) {
      this.sunLight.color.copy(MarsSky.DAWN_COLOR)
    } else {
      const dayProgress = smoothstep(0.0, 0.5, elevation)
      const noonProgress = smoothstep(0.5, 1.0, elevation)
      this._scratchColor.copy(MarsSky.DAWN_COLOR).lerp(MarsSky.MORNING_COLOR, dayProgress)
      this._scratchColor.lerp(MarsSky.NOON_COLOR, noonProgress)
      this.sunLight.color.copy(this._scratchColor)
    }

    // Ambient color — smooth transition instead of hard toggle
    const ambientT = smoothstep(-0.1, 0.2, elevation)
    this.ambientLight.color.copy(MarsSky.AMBIENT_NIGHT).lerp(MarsSky.AMBIENT_DAY, ambientT)
  }

  dispose() {
    this.mesh.geometry.dispose()
    this.material.dispose()
  }
}
