import * as THREE from 'three'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import dustAtmosphereFrag from '@/three/shaders/dust-atmosphere.frag.glsl?raw'
import fullscreenPassVert from '@/three/shaders/fullscreen-pass.vert.glsl?raw'

/** Baseline wind speed (m/s) that maps to a normalized factor of 1.0. */
const WIND_BASELINE_MS = 5

export interface DustAtmospherePass extends ShaderPass {
  /** Update from live site weather. */
  setWeather(windMs: number, stormLevel: number): void
}

export function createDustAtmospherePass(dustCover: number): DustAtmospherePass {
  const shader = {
    uniforms: {
      tDiffuse: { value: null },
      uDustCover: { value: dustCover },
      uWindSpeed: { value: 1.0 },
      uDustStormLevel: { value: 0 },
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    },
    vertexShader: fullscreenPassVert,
    fragmentShader: dustAtmosphereFrag,
  }

  const pass = new ShaderPass(shader) as DustAtmospherePass
  pass.setWeather = (windMs: number, stormLevel: number) => {
    pass.uniforms.uWindSpeed.value = windMs / WIND_BASELINE_MS
    pass.uniforms.uDustStormLevel.value = stormLevel
  }
  return pass
}
