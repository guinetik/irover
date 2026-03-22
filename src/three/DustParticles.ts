import * as THREE from 'three'
import dustVert from '@/three/shaders/dust.vert.glsl?raw'
import dustFrag from '@/three/shaders/dust.frag.glsl?raw'

const PARTICLE_COUNT = 3000

export interface DustConfig {
  dustCover: number
  featureType: string
  waterIceIndex: number
  temperatureMinK: number
}

export class DustParticles {
  readonly mesh: THREE.Points
  private material: THREE.ShaderMaterial

  constructor(config: DustConfig) {
    const { dustCover, featureType, waterIceIndex } = config

    const isPolar = waterIceIndex > 0.7
    const isVolcano = featureType === 'volcano'
    const isCanyon = featureType === 'canyon'

    // Determine per-type visual properties
    let particleColor: THREE.Vector3
    let speedMultiplier: number
    let sizeMultiplier: number
    let windDirection: THREE.Vector3
    let verticalDrift: number

    if (isPolar) {
      particleColor = new THREE.Vector3(0.85, 0.90, 0.95)
      speedMultiplier = 0.4
      sizeMultiplier = 0.6
      windDirection = new THREE.Vector3(0.2, -0.15, 0.3).normalize()
      verticalDrift = -0.3
    } else if (isVolcano) {
      particleColor = new THREE.Vector3(0.35, 0.32, 0.30)
      speedMultiplier = 1.0
      sizeMultiplier = 1.0
      windDirection = new THREE.Vector3(0.6, 0.05, 0.4).normalize()
      verticalDrift = 0.0
    } else if (isCanyon) {
      particleColor = new THREE.Vector3(0.75, 0.50, 0.35)
      speedMultiplier = 1.0
      sizeMultiplier = 1.0
      windDirection = new THREE.Vector3(0.8, 0.02, 0.2).normalize()
      verticalDrift = 0.0
    } else {
      // plains, basin, landing-site, default
      particleColor = new THREE.Vector3(0.82, 0.62, 0.42)
      speedMultiplier = 1.0
      sizeMultiplier = 1.0
      windDirection = new THREE.Vector3(0.6, 0.05, 0.4).normalize()
      verticalDrift = 0.0
    }

    const positions = new Float32Array(PARTICLE_COUNT * 3)
    const sizes = new Float32Array(PARTICLE_COUNT)
    const speeds = new Float32Array(PARTICLE_COUNT)
    const phases = new Float32Array(PARTICLE_COUNT)

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 80
      positions[i * 3 + 1] = Math.random() * 15 + 0.5
      positions[i * 3 + 2] = (Math.random() - 0.5) * 80
      sizes[i] = (0.4 + Math.random() * 0.8) * sizeMultiplier
      speeds[i] = (0.3 + Math.random() * 0.7) * speedMultiplier
      phases[i] = Math.random()
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
    geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1))
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1))

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uDustCover: { value: dustCover },
        uWindDirection: { value: windDirection },
        uCameraPos: { value: new THREE.Vector3() },
        uParticleColor: { value: particleColor },
        uVerticalDrift: { value: verticalDrift },
      },
      vertexShader: dustVert,
      fragmentShader: dustFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })

    this.mesh = new THREE.Points(geometry, this.material)
  }

  update(elapsed: number, cameraPosition: THREE.Vector3) {
    this.material.uniforms.uTime.value = elapsed
    this.material.uniforms.uCameraPos.value.copy(cameraPosition)
  }

  dispose() {
    this.mesh.geometry.dispose()
    this.material.dispose()
  }
}
