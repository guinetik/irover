import * as THREE from 'three'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import dustAtmosphereFrag from '@/three/shaders/dust-atmosphere.frag.glsl?raw'
import fullscreenPassVert from '@/three/shaders/fullscreen-pass.vert.glsl?raw'

export function createDustAtmospherePass(dustCover: number): ShaderPass {
  const shader = {
    uniforms: {
      tDiffuse: { value: null },
      uDustCover: { value: dustCover },
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    },
    vertexShader: fullscreenPassVert,
    fragmentShader: dustAtmosphereFrag,
  }

  return new ShaderPass(shader)
}
