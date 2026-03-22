import * as THREE from 'three'

const DRILL_DURATION = 18.0
const GRACE_PERIOD = 0.2
const SPARK_COUNT = 40

// Beam geometry
const CORE_RADIUS = 0.005
const GLOW_RADIUS = 0.025
const BEAM_SEGMENTS = 8

export class LaserDrill {
  private scene: THREE.Scene

  // Dual-layer beam: bright core + soft outer glow
  private beamCore: THREE.Mesh | null = null
  private beamGlow: THREE.Mesh | null = null
  private coreMat: THREE.MeshBasicMaterial
  private glowMat: THREE.MeshBasicMaterial

  // Impact light
  private impactLight: THREE.PointLight | null = null

  // Sparks
  private sparks: THREE.Points | null = null
  private sparkPositions: Float32Array
  private sparkVelocities: Float32Array
  private sparkLifetimes: Float32Array

  progress = 0
  isDrilling = false
  isComplete = false
  /** External multiplier on drill duration (e.g. 1.25 in COLD zone) */
  durationMultiplier = 1.0

  private graceTimer = 0
  private drillOrigin = new THREE.Vector3()
  private drillTarget = new THREE.Vector3()
  private elapsed = 0

  constructor(scene: THREE.Scene) {
    this.scene = scene

    // Bright white-hot core
    this.coreMat = new THREE.MeshBasicMaterial({
      color: 0xffccaa,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })

    // Soft orange-red outer glow
    this.glowMat = new THREE.MeshBasicMaterial({
      color: 0xff4400,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })

    this.sparkPositions = new Float32Array(SPARK_COUNT * 3)
    this.sparkVelocities = new Float32Array(SPARK_COUNT * 3)
    this.sparkLifetimes = new Float32Array(SPARK_COUNT)
  }

  startDrill(origin: THREE.Vector3, target: THREE.Vector3): void {
    if (this.isDrilling) return
    this.isDrilling = true
    this.isComplete = false
    this.progress = 0
    this.graceTimer = 0
    this.elapsed = 0
    this.drillOrigin.copy(origin)
    this.drillTarget.copy(target)
    this.createBeam()
    this.createSparks()
    this.createImpactLight()
  }

  updateTarget(origin: THREE.Vector3, target: THREE.Vector3 | null): void {
    if (!this.isDrilling) return
    if (target) {
      this.graceTimer = 0
      this.drillOrigin.copy(origin)
      this.drillTarget.copy(target)
      this.positionBeam()
      if (this.impactLight) this.impactLight.position.copy(this.drillTarget)
    }
  }

  update(delta: number, hasTarget: boolean): void {
    if (!this.isDrilling) return
    this.elapsed += delta

    if (!hasTarget) {
      this.graceTimer += delta
      if (this.graceTimer >= GRACE_PERIOD) {
        this.cancelDrill()
        return
      }
    } else {
      this.graceTimer = 0
    }

    this.progress += delta / (DRILL_DURATION * this.durationMultiplier)

    // Pulse the beam
    const pulse = 0.8 + Math.sin(this.elapsed * 30) * 0.15 + Math.sin(this.elapsed * 7) * 0.05
    if (this.coreMat) this.coreMat.opacity = Math.min(1, 0.9 * pulse)
    if (this.glowMat) this.glowMat.opacity = 0.3 * pulse

    // Pulse impact light
    if (this.impactLight) {
      this.impactLight.intensity = (1.5 + Math.sin(this.elapsed * 20) * 0.5) * pulse
    }

    // Flicker beam radius slightly
    if (this.beamGlow) {
      const flicker = 1 + Math.sin(this.elapsed * 45) * 0.15
      this.beamGlow.scale.x = flicker
      this.beamGlow.scale.z = flicker
    }

    this.updateSparks(delta)

    if (this.progress >= 1) {
      this.progress = 1
      this.isComplete = true
      this.isDrilling = false
      this.removeVisuals()
    }
  }

  cancelDrill(): void {
    this.isDrilling = false
    this.progress = 0
    this.isComplete = false
    this.removeVisuals()
  }

  // --- Beam ---

  private createBeam(): void {
    const coreGeo = new THREE.CylinderGeometry(CORE_RADIUS, CORE_RADIUS, 1, BEAM_SEGMENTS, 1, true)
    this.beamCore = new THREE.Mesh(coreGeo, this.coreMat)

    const glowGeo = new THREE.CylinderGeometry(GLOW_RADIUS, GLOW_RADIUS, 1, BEAM_SEGMENTS, 1, true)
    this.beamGlow = new THREE.Mesh(glowGeo, this.glowMat)

    this.positionBeam()
    this.scene.add(this.beamCore)
    this.scene.add(this.beamGlow)
  }

  private positionBeam(): void {
    const mid = new THREE.Vector3().addVectors(this.drillOrigin, this.drillTarget).multiplyScalar(0.5)
    const dist = this.drillOrigin.distanceTo(this.drillTarget)

    for (const mesh of [this.beamCore, this.beamGlow]) {
      if (!mesh) continue
      mesh.position.copy(mid)
      const sx = mesh === this.beamGlow ? mesh.scale.x : 1
      const sz = mesh === this.beamGlow ? mesh.scale.z : 1
      mesh.scale.set(sx, dist, sz)
      mesh.lookAt(this.drillTarget)
      mesh.rotateX(Math.PI / 2)
    }
  }

  // --- Impact light ---

  private createImpactLight(): void {
    this.impactLight = new THREE.PointLight(0xff6630, 1.5, 3, 2)
    this.impactLight.position.copy(this.drillTarget)
    this.scene.add(this.impactLight)
  }

  // --- Sparks ---

  private createSparks(): void {
    for (let i = 0; i < SPARK_COUNT; i++) {
      this.resetSpark(i)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.sparkPositions, 3))
    const mat = new THREE.PointsMaterial({
      color: 0xffaa44,
      size: 0.04,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    })
    this.sparks = new THREE.Points(geo, mat)
    this.scene.add(this.sparks)
  }

  private resetSpark(i: number): void {
    this.sparkPositions[i * 3] = this.drillTarget.x
    this.sparkPositions[i * 3 + 1] = this.drillTarget.y
    this.sparkPositions[i * 3 + 2] = this.drillTarget.z
    // Random hemisphere burst away from impact
    const theta = Math.random() * Math.PI * 2
    const phi = Math.random() * Math.PI * 0.5
    const speed = 0.8 + Math.random() * 2.5
    this.sparkVelocities[i * 3] = Math.cos(theta) * Math.sin(phi) * speed
    this.sparkVelocities[i * 3 + 1] = Math.cos(phi) * speed + 0.5
    this.sparkVelocities[i * 3 + 2] = Math.sin(theta) * Math.sin(phi) * speed
    this.sparkLifetimes[i] = 0.15 + Math.random() * 0.4
  }

  private updateSparks(delta: number): void {
    if (!this.sparks) return
    const positions = this.sparks.geometry.getAttribute('position') as THREE.BufferAttribute

    for (let i = 0; i < SPARK_COUNT; i++) {
      this.sparkLifetimes[i] -= delta

      if (this.sparkLifetimes[i] <= 0) {
        this.resetSpark(i)
        positions.setXYZ(i, this.drillTarget.x, this.drillTarget.y, this.drillTarget.z)
      } else {
        // Move
        const vx = this.sparkVelocities[i * 3]
        const vy = this.sparkVelocities[i * 3 + 1]
        const vz = this.sparkVelocities[i * 3 + 2]
        positions.setX(i, positions.getX(i) + vx * delta)
        positions.setY(i, positions.getY(i) + vy * delta)
        positions.setZ(i, positions.getZ(i) + vz * delta)
        // Gravity
        this.sparkVelocities[i * 3 + 1] -= 6 * delta
        // Drag
        this.sparkVelocities[i * 3] *= 0.98
        this.sparkVelocities[i * 3 + 2] *= 0.98
      }
    }
    positions.needsUpdate = true
  }

  // --- Cleanup ---

  private removeVisuals(): void {
    if (this.beamCore) {
      this.scene.remove(this.beamCore)
      this.beamCore.geometry.dispose()
      this.beamCore = null
    }
    if (this.beamGlow) {
      this.scene.remove(this.beamGlow)
      this.beamGlow.geometry.dispose()
      this.beamGlow = null
    }
    if (this.impactLight) {
      this.scene.remove(this.impactLight)
      this.impactLight = null
    }
    if (this.sparks) {
      this.scene.remove(this.sparks)
      this.sparks.geometry.dispose()
      ;(this.sparks.material as THREE.PointsMaterial).dispose()
      this.sparks = null
    }
  }

  dispose(): void {
    this.removeVisuals()
    this.coreMat.dispose()
    this.glowMat.dispose()
  }
}
