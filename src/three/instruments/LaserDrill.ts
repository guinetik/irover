import * as THREE from 'three'

const DRILL_DURATION = 3.0
const GRACE_PERIOD = 0.2
const BEAM_COLOR = 0xff4400
const SPARK_COUNT = 20

export class LaserDrill {
  private scene: THREE.Scene
  private beam: THREE.Line | null = null
  private beamMat: THREE.LineBasicMaterial
  private sparks: THREE.Points | null = null
  private sparkPositions: Float32Array
  private sparkVelocities: Float32Array

  progress = 0
  isDrilling = false
  isComplete = false

  private graceTimer = 0
  private drillOrigin = new THREE.Vector3()
  private drillTarget = new THREE.Vector3()

  constructor(scene: THREE.Scene) {
    this.scene = scene
    this.beamMat = new THREE.LineBasicMaterial({
      color: BEAM_COLOR,
      linewidth: 2,
      transparent: true,
      opacity: 0.8,
    })
    this.sparkPositions = new Float32Array(SPARK_COUNT * 3)
    this.sparkVelocities = new Float32Array(SPARK_COUNT * 3)
  }

  startDrill(origin: THREE.Vector3, target: THREE.Vector3): void {
    if (this.isDrilling) return
    this.isDrilling = true
    this.isComplete = false
    this.progress = 0
    this.graceTimer = 0
    this.drillOrigin.copy(origin)
    this.drillTarget.copy(target)
    this.createBeam()
    this.createSparks()
  }

  updateTarget(origin: THREE.Vector3, target: THREE.Vector3 | null): void {
    if (!this.isDrilling) return
    if (target) {
      this.graceTimer = 0
      this.drillOrigin.copy(origin)
      this.drillTarget.copy(target)
      this.updateBeamGeometry()
    }
  }

  update(delta: number, hasTarget: boolean): void {
    if (!this.isDrilling) return

    if (!hasTarget) {
      this.graceTimer += delta
      if (this.graceTimer >= GRACE_PERIOD) {
        this.cancelDrill()
        return
      }
    } else {
      this.graceTimer = 0
    }

    this.progress += delta / DRILL_DURATION

    if (this.sparks) {
      const positions = this.sparks.geometry.getAttribute('position') as THREE.BufferAttribute
      for (let i = 0; i < SPARK_COUNT; i++) {
        const dx = positions.getX(i) - this.drillTarget.x
        const dy = positions.getY(i) - this.drillTarget.y
        const dz = positions.getZ(i) - this.drillTarget.z
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)

        if (dist > 0.5 || Math.random() < 0.05) {
          positions.setXYZ(i, this.drillTarget.x, this.drillTarget.y, this.drillTarget.z)
          this.sparkVelocities[i * 3] = (Math.random() - 0.5) * 2
          this.sparkVelocities[i * 3 + 1] = Math.random() * 3
          this.sparkVelocities[i * 3 + 2] = (Math.random() - 0.5) * 2
        } else {
          positions.setX(i, positions.getX(i) + this.sparkVelocities[i * 3] * delta)
          positions.setY(i, positions.getY(i) + this.sparkVelocities[i * 3 + 1] * delta)
          positions.setZ(i, positions.getZ(i) + this.sparkVelocities[i * 3 + 2] * delta)
          this.sparkVelocities[i * 3 + 1] -= 5 * delta
        }
      }
      positions.needsUpdate = true
    }

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

  private createBeam(): void {
    const geo = new THREE.BufferGeometry().setFromPoints([
      this.drillOrigin, this.drillTarget,
    ])
    this.beam = new THREE.Line(geo, this.beamMat)
    this.scene.add(this.beam)
  }

  private updateBeamGeometry(): void {
    if (!this.beam) return
    const positions = this.beam.geometry.getAttribute('position') as THREE.BufferAttribute
    positions.setXYZ(0, this.drillOrigin.x, this.drillOrigin.y, this.drillOrigin.z)
    positions.setXYZ(1, this.drillTarget.x, this.drillTarget.y, this.drillTarget.z)
    positions.needsUpdate = true
  }

  private createSparks(): void {
    for (let i = 0; i < SPARK_COUNT; i++) {
      this.sparkPositions[i * 3] = this.drillTarget.x
      this.sparkPositions[i * 3 + 1] = this.drillTarget.y
      this.sparkPositions[i * 3 + 2] = this.drillTarget.z
      this.sparkVelocities[i * 3] = (Math.random() - 0.5) * 2
      this.sparkVelocities[i * 3 + 1] = Math.random() * 3
      this.sparkVelocities[i * 3 + 2] = (Math.random() - 0.5) * 2
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.sparkPositions, 3))
    const mat = new THREE.PointsMaterial({
      color: 0xff6600,
      size: 0.06,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    this.sparks = new THREE.Points(geo, mat)
    this.scene.add(this.sparks)
  }

  private removeVisuals(): void {
    if (this.beam) {
      this.scene.remove(this.beam)
      this.beam.geometry.dispose()
      this.beam = null
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
    this.beamMat.dispose()
  }
}
