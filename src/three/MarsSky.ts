import * as THREE from 'three'
import skyVert from '@/three/shaders/mars-sky.vert.glsl?raw'
import skyFrag from '@/three/shaders/mars-sky.frag.glsl?raw'
import {
  MARS_TIME_OF_DAY_06_00,
  SOL_DURATION,
} from '@/lib/marsTimeConstants'

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
    this.sunLight.shadow.normalBias = 0.03
    scene.add(this.sunLight)

    // Ambient — warm Mars fill to soften shadow contrast
    this.ambientLight = new THREE.AmbientLight(0x9b6e4c, 0.55)
    scene.add(this.ambientLight)

    // Hemisphere — sky/ground gradient for natural bounce light
    this.hemiLight = new THREE.HemisphereLight(0xd4a57a, 0x4d3020, 0.45)
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
    this.nightFactor = 1.0 - THREE.MathUtils.smoothstep(elevation, -0.1, 0.2)

    // Sun intensity — multi-phase curve for dramatic day arc
    // Dawn/dusk ramp (elevation -0.1 to 0.1): 0 to 2.0
    // Morning (0.1-0.5): 2.0 to 4.0
    // Noon (0.5-1.0): 4.0 to 5.5
    const dawnRamp = THREE.MathUtils.smoothstep(elevation, -0.1, 0.1)
    const morningRamp = THREE.MathUtils.smoothstep(elevation, 0.1, 0.5)
    const noonRamp = THREE.MathUtils.smoothstep(elevation, 0.5, 1.0)
    this.sunLight.intensity = dawnRamp * 2.0 + morningRamp * 2.0 + noonRamp * 1.5

    // Ambient and hemisphere — higher daytime fill for softer shadows
    this.ambientLight.intensity = 0.1 + sunUp * 0.5
    this.hemiLight.intensity = 0.08 + sunUp * 0.4

    // Sun color temperature arc — smooth lerp through day phases
    // Dawn: warm orange -> Morning: soft gold -> Noon: bright warm white
    // Dusk mirrors dawn symmetrically (elevation follows sin curve)
    if (elevation < 0) {
      this.sunLight.color.copy(MarsSky.DAWN_COLOR)
    } else {
      const dayProgress = THREE.MathUtils.smoothstep(elevation, 0.0, 0.5)
      const noonProgress = THREE.MathUtils.smoothstep(elevation, 0.5, 1.0)
      this._scratchColor.copy(MarsSky.DAWN_COLOR).lerp(MarsSky.MORNING_COLOR, dayProgress)
      this._scratchColor.lerp(MarsSky.NOON_COLOR, noonProgress)
      this.sunLight.color.copy(this._scratchColor)
    }

    // Ambient color — smooth transition instead of hard toggle
    const ambientT = THREE.MathUtils.smoothstep(elevation, -0.1, 0.2)
    this.ambientLight.color.copy(MarsSky.AMBIENT_NIGHT).lerp(MarsSky.AMBIENT_DAY, ambientT)
  }

  dispose() {
    this.mesh.geometry.dispose()
    this.material.dispose()
  }
}
