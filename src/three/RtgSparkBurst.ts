import * as THREE from 'three'

const SPARK_COUNT = 40
/** Radius of the sphere sparkles spawn on around the RTG center. */
const SPAWN_RADIUS = 0.25
/** Total duration before all sparkles have expired. */
const TOTAL_DURATION = 1.8

/**
 * Electrical sparkle effect that dances around the RTG body on overdrive / shunt activation.
 * Particles spawn on a sphere around the origin, jitter in place with random flicker,
 * and fade out over time — like static discharge crawling over the surface.
 */
export class RtgSparkBurst {
  private points: THREE.Points
  private positions: Float32Array
  private origins: Float32Array
  private lifetimes: Float32Array
  private maxLifetimes: Float32Array
  private phases: Float32Array
  private active = false

  constructor(scene: THREE.Scene) {
    this.positions = new Float32Array(SPARK_COUNT * 3)
    this.origins = new Float32Array(SPARK_COUNT * 3)
    this.lifetimes = new Float32Array(SPARK_COUNT)
    this.maxLifetimes = new Float32Array(SPARK_COUNT)
    this.phases = new Float32Array(SPARK_COUNT)

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3))

    const mat = new THREE.PointsMaterial({
      color: 0x55bbff,
      size: 0.03,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    })

    this.points = new THREE.Points(geo, mat)
    this.points.visible = false
    scene.add(this.points)
  }

  /** Fire sparkles around a world-space center (RTG node position). */
  emit(center: THREE.Vector3): void {
    for (let i = 0; i < SPARK_COUNT; i++) {
      // Random point on sphere surface
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const r = SPAWN_RADIUS * (0.6 + Math.random() * 0.4)
      const ox = center.x + Math.sin(phi) * Math.cos(theta) * r
      const oy = center.y + Math.sin(phi) * Math.sin(theta) * r
      const oz = center.z + Math.cos(phi) * r

      this.origins[i * 3] = ox
      this.origins[i * 3 + 1] = oy
      this.origins[i * 3 + 2] = oz
      this.positions[i * 3] = ox
      this.positions[i * 3 + 1] = oy
      this.positions[i * 3 + 2] = oz

      // Stagger start times so they don't all pop at once
      const life = 0.6 + Math.random() * (TOTAL_DURATION - 0.6)
      this.maxLifetimes[i] = life
      this.lifetimes[i] = life
      this.phases[i] = Math.random() * Math.PI * 2
    }

    this.points.visible = true
    this.active = true
    ;(this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
  }

  /** Advance sparkles. Call every frame. */
  update(dt: number): void {
    if (!this.active) return

    const attr = this.points.geometry.getAttribute('position') as THREE.BufferAttribute
    let anyAlive = false

    for (let i = 0; i < SPARK_COUNT; i++) {
      this.lifetimes[i] -= dt
      if (this.lifetimes[i] <= 0) {
        // Hide dead particles far away
        attr.setXYZ(i, 0, -1000, 0)
        continue
      }

      anyAlive = true
      const ix = i * 3
      const t = 1 - this.lifetimes[i] / this.maxLifetimes[i]
      const phase = this.phases[i]

      // Jitter around origin — electrical crackle feel
      const jitter = 0.04 * (1 - t * 0.5) // Calms down as it fades
      const freq = 25 + i * 3
      const jx = Math.sin(this.lifetimes[i] * freq + phase) * jitter
      const jy = Math.cos(this.lifetimes[i] * freq * 1.3 + phase * 2) * jitter
      const jz = Math.sin(this.lifetimes[i] * freq * 0.7 + phase * 3) * jitter

      attr.setXYZ(
        i,
        this.origins[ix] + jx,
        this.origins[ix + 1] + jy,
        this.origins[ix + 2] + jz,
      )
    }

    attr.needsUpdate = true

    // Global opacity fade based on how many are still alive
    const aliveRatio = this.lifetimes.filter(l => l > 0).length / SPARK_COUNT
    const mat = this.points.material as THREE.PointsMaterial
    mat.opacity = Math.min(0.95, aliveRatio * 1.5)

    if (!anyAlive) {
      this.active = false
      this.points.visible = false
    }
  }

  dispose(): void {
    this.points.geometry.dispose()
    ;(this.points.material as THREE.Material).dispose()
    this.points.parent?.remove(this.points)
  }
}
