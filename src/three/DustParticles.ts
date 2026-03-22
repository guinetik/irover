import * as THREE from 'three'
import dustVert from '@/three/shaders/dust.vert.glsl?raw'
import dustFrag from '@/three/shaders/dust.frag.glsl?raw'

const PARTICLE_COUNT = 3000

export class DustParticles {
  readonly mesh: THREE.Points
  private material: THREE.ShaderMaterial

  constructor(dustCover: number) {
    const positions = new Float32Array(PARTICLE_COUNT * 3)
    const sizes = new Float32Array(PARTICLE_COUNT)
    const speeds = new Float32Array(PARTICLE_COUNT)
    const phases = new Float32Array(PARTICLE_COUNT)

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 80
      positions[i * 3 + 1] = Math.random() * 15 + 0.5
      positions[i * 3 + 2] = (Math.random() - 0.5) * 80
      sizes[i] = 0.4 + Math.random() * 0.8
      speeds[i] = 0.3 + Math.random() * 0.7
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
        uWindDirection: { value: new THREE.Vector3(0.6, 0.05, 0.4).normalize() },
        uCameraPos: { value: new THREE.Vector3() },
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
