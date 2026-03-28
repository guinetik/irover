import * as THREE from 'three'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import dustAtmosphereFrag from '@/three/shaders/dust-atmosphere.frag.glsl?raw'
import fullscreenPassVert from '@/three/shaders/fullscreen-pass.vert.glsl?raw'

/** Baseline wind speed (m/s) that maps to a normalized factor of 1.0. */
const WIND_BASELINE_MS = 5

export interface DustAtmospherePass extends ShaderPass {
  /**
   * Update from live site weather.
   * @param windMs   Current wind speed in m/s.
   * @param stormLevel  Active storm level (0 = no storm, 1–5 = severity).
   */
  setWeather(windMs: number, stormLevel: number): void
  /**
   * Drive storm glitch uniforms from the dust storm FSM state.
   *
   * @param glitchIntensity  0.0–1.0 composite glitch drive (stormLevel / 5 while active).
   * @param incomingFactor   1.0 during FSM `incoming` phase, 0.0 otherwise.
   */
  setStormGlitch(glitchIntensity: number, incomingFactor: number): void
}

/**
 * Creates the dust-atmosphere ShaderPass that applies the drone-camera feed
 * aesthetic (barrel distortion, chromatic aberration, dust haze, scan lines,
 * signal noise) and storm-reactive glitch effects.
 *
 * @param dustCover  Site dust cover fraction (0–1), sourced from {@link TerrainParams}.
 */
export function createDustAtmospherePass(dustCover: number): DustAtmospherePass {
  const shader = {
    uniforms: {
      tDiffuse:               { value: null },
      uDustCover:             { value: dustCover },
      uWindSpeed:             { value: 1.0 },
      uDustStormLevel:        { value: 0 },
      uTime:                  { value: 0 },
      uResolution:            { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      /** 0.0–1.0: composite glitch intensity driven by active storm level. */
      uStormGlitchIntensity:  { value: 0.0 },
      /** 1.0 during FSM `incoming` phase for pre-storm signal degradation. */
      uStormPhaseIncoming:    { value: 0.0 },
    },
    vertexShader:   fullscreenPassVert,
    fragmentShader: dustAtmosphereFrag,
  }

  const pass = new ShaderPass(shader) as DustAtmospherePass

  pass.setWeather = (windMs: number, stormLevel: number) => {
    pass.uniforms.uWindSpeed.value      = windMs / WIND_BASELINE_MS
    pass.uniforms.uDustStormLevel.value = stormLevel
  }

  pass.setStormGlitch = (glitchIntensity: number, incomingFactor: number) => {
    pass.uniforms.uStormGlitchIntensity.value = glitchIntensity
    pass.uniforms.uStormPhaseIncoming.value   = incomingFactor
  }

  return pass
}
