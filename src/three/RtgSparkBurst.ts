import * as THREE from 'three'

const SPARK_COUNT = 30
const GRAVITY = 3
const DRAG = 0.98

/**
 * One-shot electrical spark burst effect for RTG overdrive / power shunt activation.
 * Reusable: call {@link emit} to fire a burst from a world position.
 * Call {@link update} each frame; particles self-expire and hide when done.
 */
export class RtgSparkBurst {
  private points: THREE.Points
  private positions: Float32Array
  private velocities: Float32Array
  private lifetimes: Float32Array
  private active = false

  constructor(scene: THREE.Scene) {
    this.positions = new Float32Array(SPARK_COUNT * 3)
    this.velocities = new Float32Array(SPARK_COUNT * 3)
    this.lifetimes = new Float32Array(SPARK_COUNT)

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3))

    const mat = new THREE.PointsMaterial({
      color: 0x44aaff,
      size: 0.035,
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
      const speed = 1.5 + Math.random() * 2.5
      this.velocities[i * 3] = Math.cos(theta) * Math.sin(phi) * speed
      this.velocities[i * 3 + 1] = Math.cos(phi) * speed + 0.3
      this.velocities[i * 3 + 2] = Math.sin(theta) * Math.sin(phi) * speed

      this.lifetimes[i] = 0.5 + Math.random() * 0.8
    }

    this.points.visible = true
    this.active = true
    ;(this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
  }

  /** Advance particles. Call every frame. */
  update(dt: number): void {
    if (!this.active) return

    const attr = this.points.geometry.getAttribute('position') as THREE.BufferAttribute
    let anyAlive = false

    for (let i = 0; i < SPARK_COUNT; i++) {
      this.lifetimes[i] -= dt
      if (this.lifetimes[i] <= 0) continue

      anyAlive = true
      const ix = i * 3

      // Move
      this.positions[ix] += this.velocities[ix] * dt
      this.positions[ix + 1] += this.velocities[ix + 1] * dt
      this.positions[ix + 2] += this.velocities[ix + 2] * dt

      // Gravity
      this.velocities[ix + 1] -= GRAVITY * dt

      // Drag
      this.velocities[ix] *= DRAG
      this.velocities[ix + 2] *= DRAG

      attr.setXYZ(i, this.positions[ix], this.positions[ix + 1], this.positions[ix + 2])
    }

    attr.needsUpdate = true

    // Fade opacity based on oldest surviving particle
    const mat = this.points.material as THREE.PointsMaterial
    const maxLife = Math.max(...this.lifetimes)
    mat.opacity = Math.max(0, Math.min(0.9, maxLife * 2))

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
