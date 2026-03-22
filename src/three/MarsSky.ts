import * as THREE from 'three'
import skyVert from '@/three/shaders/mars-sky.vert.glsl?raw'
import skyFrag from '@/three/shaders/mars-sky.frag.glsl?raw'

// Full day cycle in seconds (accelerated — 1 real minute = 1 sol)
const SOL_DURATION = 60
const SKY_RADIUS = 900

export class MarsSky {
  readonly mesh: THREE.Mesh
  private material: THREE.ShaderMaterial
  private sunLight: THREE.DirectionalLight
  private ambientLight: THREE.AmbientLight
  private hemiLight: THREE.HemisphereLight

  // Exposed for other systems (terrain shader, dust)
  readonly sunDirection = new THREE.Vector3()
  timeOfDay = 0.35 // start mid-morning

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

  update(delta: number) {
    this.timeOfDay = (this.timeOfDay + delta / SOL_DURATION) % 1.0
    this.updateSun()
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
    const isDusk = elevation > -0.2 && elevation < 0.1

    // Sunlight intensity
    this.sunLight.intensity = sunUp * 2.0
    this.ambientLight.intensity = 0.05 + sunUp * 0.4
    this.hemiLight.intensity = 0.05 + sunUp * 0.3

    // Color shift at dawn/dusk
    if (isDusk) {
      this.sunLight.color.setHex(0xffaa66)
    } else {
      this.sunLight.color.setHex(0xffe8d0)
    }

    // Night ambient color shift
    if (elevation < 0) {
      this.ambientLight.color.setHex(0x1a1018)
    } else {
      this.ambientLight.color.setHex(0x8b5e3c)
    }
  }

  dispose() {
    this.mesh.geometry.dispose()
    this.material.dispose()
  }
}
