import * as THREE from 'three'
import type { SceneLayer } from './SceneLayer'
import { STAR_SPHERE_RADIUS } from './constants'

const STAR_COUNT = 14000
const POINT_SIZE = 1.4

export class BackgroundStars implements SceneLayer {
  readonly root: THREE.Points

  constructor() {
    const positions = new Float32Array(STAR_COUNT * 3)
    const sizes = new Float32Array(STAR_COUNT)
    const opacities = new Float32Array(STAR_COUNT)
    const colors = new Float32Array(STAR_COUNT * 3)
    const phases = new Float32Array(STAR_COUNT)

    for (let i = 0; i < STAR_COUNT; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      positions[i * 3] = STAR_SPHERE_RADIUS * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = STAR_SPHERE_RADIUS * Math.cos(phi)
      positions[i * 3 + 2] = STAR_SPHERE_RADIUS * Math.sin(phi) * Math.sin(theta)

      sizes[i] = POINT_SIZE * (0.5 + Math.random() * 0.8)
      opacities[i] = 0.58 + Math.random() * 0.38
      phases[i] = Math.random() * Math.PI * 2

      const t = Math.random()
      if (t < 0.5) {
        colors[i * 3] = 0.85 + Math.random() * 0.12
        colors[i * 3 + 1] = 0.88 + Math.random() * 0.10
        colors[i * 3 + 2] = 0.95 + Math.random() * 0.05
      } else if (t < 0.85) {
        colors[i * 3] = 0.95 + Math.random() * 0.05
        colors[i * 3 + 1] = 0.90 + Math.random() * 0.08
        colors[i * 3 + 2] = 0.80 + Math.random() * 0.12
      } else {
        colors[i * 3] = 0.98 + Math.random() * 0.02
        colors[i * 3 + 1] = 0.92 + Math.random() * 0.06
        colors[i * 3 + 2] = 0.75 + Math.random() * 0.15
      }
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
    geometry.setAttribute('aOpacity', new THREE.BufferAttribute(opacities, 1))
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1))

    const material = new THREE.RawShaderMaterial({
      vertexShader: /* glsl */ `
        precision mediump float;
        attribute float aSize;
        attribute float aOpacity;
        attribute vec3 aColor;
        attribute float aPhase;
        attribute vec3 position;
        uniform mat4 modelViewMatrix;
        uniform mat4 projectionMatrix;
        uniform float uTime;
        varying float vOpacity;
        varying vec3 vColor;

        void main() {
          vColor = aColor;
          float twinkle = sin(uTime * 1.8 + aPhase) * 0.32 + 0.68;
          vOpacity = aOpacity * twinkle;

          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (620.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        precision mediump float;
        varying float vOpacity;
        varying vec3 vColor;

        void main() {
          float dist = length(gl_PointCoord - vec2(0.5));
          if (dist > 0.5) discard;
          float alpha = smoothstep(0.5, 0.1, dist) * vOpacity;
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      uniforms: {
        uTime: { value: 0 },
      },
    })

    this.root = new THREE.Points(geometry, material)
    this.root.frustumCulled = false
  }

  async init(): Promise<void> {}

  update(elapsed: number): void {
    ;(this.root.material as THREE.ShaderMaterial).uniforms.uTime.value = elapsed
  }

  dispose(): void {
    this.root.geometry.dispose()
    ;(this.root.material as THREE.ShaderMaterial).dispose()
  }
}
