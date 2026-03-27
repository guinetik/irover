import * as THREE from 'three'

const SPARK_COUNT = 40
const GRAVITY = 1.5
const DRAG = 0.99

/**
 * One-shot electrical spark burst effect for RTG overdrive / power shunt activation.
 * Particles burst outward from the RTG node and drift with light gravity over ~4s
 * to match the duration of the activation sound cue.
 */
export class RtgSparkBurst {
  private points: THREE.Points
  private positions: Float32Array
  private velocities: Float32Array
  private lifetimes: Float32Array
  private active = false
  private delay = 0

  constructor(scene: THREE.Scene) {
    this.positions = new Float32Array(SPARK_COUNT * 3)
    this.velocities = new Float32Array(SPARK_COUNT * 3)
    this.lifetimes = new Float32Array(SPARK_COUNT)

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3))

    const mat = new THREE.PointsMaterial({
      color: 0x44aaff,
      size: 0.03,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    })

    this.points = new THREE.Points(geo, mat)
    this.points.visible = false
    scene.add(this.points)
  }

  /** Fire a spark burst from a world-space position. */
  emit(origin: THREE.Vector3): void {
    for (let i = 0; i < SPARK_COUNT; i++) {
      this.positions[i * 3] = origin.x
      this.positions[i * 3 + 1] = origin.y
      this.positions[i * 3 + 2] = origin.z

      const theta = Math.random() * Math.PI * 2
      const phi = Math.random() * Math.PI * 0.6
      const speed = 0.5 + Math.random() * 1.2
      this.velocities[i * 3] = Math.cos(theta) * Math.sin(phi) * speed
      this.velocities[i * 3 + 1] = Math.cos(phi) * speed + 0.2
      this.velocities[i * 3 + 2] = Math.sin(theta) * Math.sin(phi) * speed

      // Stagger lifetimes across ~4s so they don't all die at once
      this.lifetimes[i] = 2.0 + Math.random() * 2.0
    }

    this.delay = 0.6
    this.active = true
    ;(this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
  }

  /** Advance particles. Call every frame. */
  update(dt: number): void {
    if (!this.active) return

    if (this.delay > 0) {
      this.delay -= dt
      return
    }
    if (!this.points.visible) {
      this.points.visible = true
    }

    const attr = this.points.geometry.getAttribute('position') as THREE.BufferAttribute
    let anyAlive = false

    for (let i = 0; i < SPARK_COUNT; i++) {
      this.lifetimes[i] -= dt
      if (this.lifetimes[i] <= 0) {
        attr.setXYZ(i, 0, -1000, 0)
        continue
      }

      anyAlive = true
      const ix = i * 3

      this.positions[ix] += this.velocities[ix] * dt
      this.positions[ix + 1] += this.velocities[ix + 1] * dt
      this.positions[ix + 2] += this.velocities[ix + 2] * dt

      this.velocities[ix + 1] -= GRAVITY * dt
      this.velocities[ix] *= DRAG
      this.velocities[ix + 2] *= DRAG

      attr.setXYZ(i, this.positions[ix], this.positions[ix + 1], this.positions[ix + 2])
    }

    attr.needsUpdate = true

    const mat = this.points.material as THREE.PointsMaterial
    const aliveCount = this.lifetimes.filter(l => l > 0).length
    mat.opacity = Math.min(0.9, (aliveCount / SPARK_COUNT) * 1.5)

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
