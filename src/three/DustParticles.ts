import * as THREE from 'three'
import dustVert from '@/three/shaders/dust.vert.glsl?raw'
import dustFrag from '@/three/shaders/dust.frag.glsl?raw'

const PARTICLE_COUNT = 3000

/** Baseline wind speed (m/s) that maps to a normalized factor of 1.0. */
const WIND_BASELINE_MS = 5

/**
 * Height of the rover-relative particle box (world units).
 * Must match the `boxY` constant in `dust.vert.glsl`.
 */
const BOX_Y = 5.0

/** Convert meteorological wind direction (degrees, 0 = north, CW) to a unit XZ vector. */
function windDirToVec3(deg: number): THREE.Vector3 {
  const rad = (deg * Math.PI) / 180
  // Meteorological: wind blows FROM this direction, so particles move opposite
  return new THREE.Vector3(-Math.sin(rad), 0, -Math.cos(rad))
}

export interface DustConfig {
  dustCover: number
  featureType: string
  waterIceIndex: number
  temperatureMinK: number
  /** Initial wind speed in m/s (default 5). */
  windSpeedMs?: number
  /** Meteorological wind direction in degrees (0 = north, clockwise). */
  windDirectionDeg?: number
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
    let baseWindDirection: THREE.Vector3
    let verticalDrift: number

    if (isPolar) {
      particleColor = new THREE.Vector3(0.78, 0.80, 0.82)
      speedMultiplier = 0.4
      sizeMultiplier = 0.6
      baseWindDirection = new THREE.Vector3(0.2, -0.15, 0.3).normalize()
      verticalDrift = -0.3
    } else if (isVolcano) {
      particleColor = new THREE.Vector3(0.45, 0.40, 0.36)
      speedMultiplier = 1.0
      sizeMultiplier = 1.0
      baseWindDirection = new THREE.Vector3(0.6, 0.05, 0.4).normalize()
      verticalDrift = 0.0
    } else if (isCanyon) {
      particleColor = new THREE.Vector3(0.68, 0.52, 0.40)
      speedMultiplier = 1.0
      sizeMultiplier = 1.0
      baseWindDirection = new THREE.Vector3(0.8, 0.02, 0.2).normalize()
      verticalDrift = 0.0
    } else {
      // plains, basin, landing-site, default
      particleColor = new THREE.Vector3(0.72, 0.58, 0.44)
      speedMultiplier = 1.0
      sizeMultiplier = 1.0
      baseWindDirection = new THREE.Vector3(0.6, 0.05, 0.4).normalize()
      verticalDrift = 0.0
    }

    // Override wind direction from REMS meteorological degrees if provided
    const windDirection = config.windDirectionDeg != null
      ? windDirToVec3(config.windDirectionDeg)
      : baseWindDirection
    // Preserve vertical component from feature-type defaults
    windDirection.y = baseWindDirection.y

    const positions = new Float32Array(PARTICLE_COUNT * 3)
    const sizes = new Float32Array(PARTICLE_COUNT)
    const speeds = new Float32Array(PARTICLE_COUNT)
    const phases = new Float32Array(PARTICLE_COUNT)

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      positions[i * 3]     = (Math.random() - 0.5) * 22
      // Y initialized within the rover-relative box height; shader wraps to rover Y at runtime
      positions[i * 3 + 1] = Math.random() * BOX_Y
      positions[i * 3 + 2] = (Math.random() - 0.5) * 22
      sizes[i]  = (0.4 + Math.random() * 0.8) * sizeMultiplier
      speeds[i] = (0.3 + Math.random() * 0.7) * speedMultiplier
      phases[i] = Math.random()
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('aSize',    new THREE.BufferAttribute(sizes,     1))
    geometry.setAttribute('aSpeed',   new THREE.BufferAttribute(speeds,    1))
    geometry.setAttribute('aPhase',   new THREE.BufferAttribute(phases,    1))

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime:          { value: 0 },
        uDustCover:     { value: dustCover },
        uWindDirection: { value: windDirection },
        uWindSpeed:     { value: (config.windSpeedMs ?? WIND_BASELINE_MS) / WIND_BASELINE_MS },
        uCameraPos:     { value: new THREE.Vector3() },
        uParticleColor: { value: particleColor },
        uVerticalDrift: { value: verticalDrift },
        /**
         * World-space Y of the rover (terrain surface level).
         * Initialised to 0; updated every frame via {@link update}.
         */
        uRoverY:        { value: 0.0 },
      },
      vertexShader:   dustVert,
      fragmentShader: dustFrag,
      transparent: true,
      depthWrite:  false,
      blending:    THREE.NormalBlending,
    })

    this.mesh = new THREE.Points(geometry, this.material)
    // Shader repositions particles around camera — disable frustum culling
    // so Three.js doesn't cull the mesh based on stale bounding sphere
    this.mesh.frustumCulled = false
  }

  /** Update wind from live REMS telemetry. */
  setWind(speedMs: number, directionDeg: number) {
    this.material.uniforms.uWindSpeed.value = speedMs / WIND_BASELINE_MS
    const dir = windDirToVec3(directionDeg)
    dir.y = this.material.uniforms.uWindDirection.value.y // keep vertical component
    this.material.uniforms.uWindDirection.value.copy(dir)
  }

  /**
   * @param elapsed        Accumulated simulation time (seconds).
   * @param cameraPosition World-space camera position.
   * @param roverPosition  World-space rover position. Particles wrap their Y
   *                       around this so they stay near the terrain surface
   *                       regardless of site elevation. Falls back to an
   *                       estimate below the camera if not provided.
   */
  update(elapsed: number, cameraPosition: THREE.Vector3, roverPosition?: THREE.Vector3) {
    this.material.uniforms.uTime.value = elapsed
    this.material.uniforms.uCameraPos.value.copy(cameraPosition)
    // Use rover Y when available; otherwise estimate terrain as 4 units below camera
    this.material.uniforms.uRoverY.value = roverPosition
      ? roverPosition.y
      : cameraPosition.y - 4.0
  }

  dispose() {
    this.mesh.geometry.dispose()
    this.material.dispose()
  }
}
