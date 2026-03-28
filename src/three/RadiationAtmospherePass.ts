import * as THREE from 'three'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import fullscreenPassVert from '@/three/shaders/fullscreen-pass.vert.glsl?raw'
import radiationAtmosphereFrag from '@/three/shaders/radiation-atmosphere.frag.glsl?raw'

export interface RadiationAtmospherePass extends ShaderPass {
  /**
   * Update the radiation hazard level.
   * @param level  0.0 = safe (pass-through), 1.0 = maximum hazardous.
   */
  setRadiation(level: number): void
}

/**
 * Creates the radiation-atmosphere ShaderPass that overlays green-tinted VFX
 * on the composited frame proportional to the current radiation hazard level.
 *
 * Effects are invisible below level 0.25 (safe zones get a clean pass-through).
 * Above that threshold effects accumulate: shadow tint, scanlines, hot pixels,
 * static snow bands, reversed chromatic aberration, and rare full-frame flashes.
 *
 * Wire this pass into the EffectComposer AFTER the DustAtmospherePass.
 */
export function createRadiationAtmospherePass(): RadiationAtmospherePass {
  const shader = {
    uniforms: {
      tDiffuse:        { value: null },
      uRadiationLevel: { value: 0.0 },
      uTime:           { value: 0.0 },
      uResolution:     { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    },
    vertexShader:   fullscreenPassVert,
    fragmentShader: radiationAtmosphereFrag,
  }

  const pass = new ShaderPass(shader) as RadiationAtmospherePass

  pass.setRadiation = (level: number) => {
    pass.uniforms.uRadiationLevel.value = level
  }

  return pass
}
