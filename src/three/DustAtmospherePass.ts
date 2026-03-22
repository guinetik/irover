import * as THREE from 'three'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import dustAtmosphereFrag from '@/three/shaders/dust-atmosphere.frag.glsl?raw'

export function createDustAtmospherePass(dustCover: number): ShaderPass {
  const shader = {
    uniforms: {
      tDiffuse: { value: null },
      uDustCover: { value: dustCover },
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: dustAtmosphereFrag,
  }

  return new ShaderPass(shader)
}
