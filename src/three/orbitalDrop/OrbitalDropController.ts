import * as THREE from 'three'
import {
  getTouchdownReleaseProgress,
  getTouchdownTetherRetractProgress,
  getTouchdownTetherTension,
} from '@/three/skyCraneTouchdown'

export interface OrbitalDropControllerOptions {
  id: string
  position: {
    x: number
    z: number
  }
  heightAt: (x: number, z: number) => number
}

type OrbitalDropControllerStatus = 'descending' | 'landed' | 'opened'

interface DropTether {
  mesh: THREE.Mesh
}

const DESCENT_DURATION_SEC = 4
const DESCENT_HEIGHT = 10
const CARRIER_STAGE_HEIGHT = 3.6
const CARRIER_FLYAWAY_RISE = 3
const CARRIER_FLYAWAY_DRIFT = new THREE.Vector3(-0.8, 0, -2.1)
const TETHER_RADIUS = 0.02
const STAGE_ANCHORS = [
  new THREE.Vector3(-0.45, -0.08, -0.45),
  new THREE.Vector3(0.45, -0.08, -0.45),
  new THREE.Vector3(-0.45, -0.08, 0.45),
  new THREE.Vector3(0.45, -0.08, 0.45),
]
const PAYLOAD_ANCHORS = [
  new THREE.Vector3(-0.34, 0.36, -0.34),
  new THREE.Vector3(0.34, 0.36, -0.34),
  new THREE.Vector3(-0.34, 0.36, 0.34),
  new THREE.Vector3(0.34, 0.36, 0.34),
]

/**
 * Runtime Three.js actor for one sky-crane-style orbital payload delivery.
 */
export class OrbitalDropController {
  readonly id: string
  readonly group = new THREE.Group()

  private readonly scene: THREE.Scene
  private readonly payload = new THREE.Group()
  private readonly stage = new THREE.Group()
  private readonly tethers: DropTether[] = []
  private readonly groundY: number
  private readonly startY: number

  private elapsedSec = 0
  private releaseElapsedSec = 0
  private releaseActive = false
  private started = false
  private _status: OrbitalDropControllerStatus = 'descending'

  /**
   * Creates a payload actor at the requested site position.
   */
  constructor(scene: THREE.Scene, options: OrbitalDropControllerOptions) {
    this.scene = scene
    this.id = options.id
    this.groundY = options.heightAt(options.position.x, options.position.z)
    this.startY = this.groundY + DESCENT_HEIGHT
    this.group.position.set(options.position.x, this.startY, options.position.z)
    this.buildPayload()
    this.buildCarrierRig()
  }

  /**
   * Current payload lifecycle status.
   */
  get status(): OrbitalDropControllerStatus {
    return this._status
  }

  /**
   * Adds the payload actor to the scene if it is not already active.
   */
  start(): void {
    if (this.started) return
    this.started = true
    this.scene.add(this.group)
  }

  /**
   * Advances the descent / landing animation.
   */
  update(deltaSec: number): void {
    if (!this.started || this._status === 'opened') return

    if (!this.releaseActive) {
      const nextElapsedSec = this.elapsedSec + deltaSec
      this.elapsedSec = nextElapsedSec
      const t = Math.min(1, this.elapsedSec / DESCENT_DURATION_SEC)
      const eased = t * t * (3 - 2 * t)
      this.group.position.y = this.startY + (this.groundY - this.startY) * eased
      this.payload.rotation.z = Math.sin(this.elapsedSec * 2.4) * 0.01 * (1 - t)
      this.payload.rotation.x = Math.cos(this.elapsedSec * 1.9) * 0.008 * (1 - t)
      this.updateCarrierRig(0)
      if (t >= 1) {
        this.group.position.y = this.groundY
        this.releaseActive = true
        const overflowSec = Math.max(0, nextElapsedSec - DESCENT_DURATION_SEC)
        if (overflowSec > 0) {
          this.releaseElapsedSec += overflowSec
          this.updateCarrierRig(this.releaseElapsedSec)
          if (getTouchdownTetherRetractProgress(this.releaseElapsedSec) >= 1) {
            this.stage.visible = false
            for (const tether of this.tethers) tether.mesh.visible = false
            this._status = 'landed'
          }
        }
      }
      return
    }

    this.releaseElapsedSec += deltaSec
    this.group.position.y = this.groundY
    this.updateCarrierRig(this.releaseElapsedSec)
    if (getTouchdownTetherRetractProgress(this.releaseElapsedSec) >= 1) {
      this.stage.visible = false
      for (const tether of this.tethers) tether.mesh.visible = false
      this._status = 'landed'
    }
  }

  /**
   * Marks the landed payload as opened.
   */
  open(): void {
    this._status = 'opened'
    this.payload.rotation.set(0, 0, 0)
  }

  /**
   * Removes the payload actor and disposes its geometry/materials.
   */
  dispose(): void {
    this.scene.remove(this.group)
    this.group.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      child.geometry.dispose()
      if (Array.isArray(child.material)) {
        for (const material of child.material) material.dispose()
      } else {
        child.material.dispose()
      }
    })
  }

  /**
   * Builds the persistent landed payload box.
   */
  private buildPayload(): void {
    const boxMaterial = new THREE.MeshStandardMaterial({
      color: 0x7a532f,
      roughness: 0.86,
      metalness: 0.12,
    })
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.62, 0.9), boxMaterial)
    box.castShadow = true
    box.receiveShadow = true
    box.position.y = 0.31
    this.payload.add(box)

    const bandMaterial = new THREE.MeshStandardMaterial({
      color: 0xc48d54,
      roughness: 0.72,
      metalness: 0.2,
    })
    const topBand = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.08, 0.96), bandMaterial)
    topBand.position.y = 0.62
    topBand.castShadow = true
    topBand.receiveShadow = true
    this.payload.add(topBand)

    this.group.add(this.payload)
  }

  /**
   * Builds the temporary carrier stage and tether meshes above the payload.
   */
  private buildCarrierRig(): void {
    const stageMaterial = new THREE.MeshStandardMaterial({
      color: 0x5d6771,
      roughness: 0.85,
      metalness: 0.25,
      emissive: new THREE.Color(0x110804),
      emissiveIntensity: 0.08,
    })
    const stageBody = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.16, 1.2), stageMaterial)
    this.stage.add(stageBody)

    for (const [x, z] of [[0, -0.72], [0, 0.72], [-0.72, 0], [0.72, 0]] as const) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.1, 0.54), stageMaterial)
      beam.position.set(x, 0.02, z)
      if (x !== 0) beam.rotation.y = Math.PI / 2
      this.stage.add(beam)

      const thruster = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 0.24, 8), stageMaterial)
      thruster.position.set(x * 0.95, -0.18, z * 0.95)
      this.stage.add(thruster)
    }

    const tetherMaterial = new THREE.MeshStandardMaterial({
      color: 0x161a1f,
      roughness: 0.85,
      metalness: 0.08,
      emissive: new THREE.Color(0x050607),
      transparent: true,
      opacity: 0.95,
    })
    const tetherGeometry = new THREE.CylinderGeometry(TETHER_RADIUS, TETHER_RADIUS, 1, 10, 1, false)
    for (let i = 0; i < STAGE_ANCHORS.length; i++) {
      const mesh = new THREE.Mesh(tetherGeometry, tetherMaterial.clone())
      mesh.castShadow = true
      mesh.receiveShadow = true
      this.group.add(mesh)
      this.tethers.push({ mesh })
    }

    this.group.add(this.stage)
  }

  /**
   * Updates the carrier flyaway rig and tether positions.
   */
  private updateCarrierRig(releaseElapsedSec: number): void {
    const releaseProgress = getTouchdownReleaseProgress(releaseElapsedSec)
    const retractProgress = getTouchdownTetherRetractProgress(releaseElapsedSec)
    const tension = getTouchdownTetherTension(releaseElapsedSec)
    const stageFlightProgress = Math.min(1, releaseProgress * 0.35 + retractProgress * 0.65)
    const flyaway = CARRIER_FLYAWAY_DRIFT.clone().multiplyScalar(stageFlightProgress)
    const swayScale = 1 - stageFlightProgress

    this.stage.visible = this._status !== 'landed'
    this.stage.position.set(
      Math.sin(this.elapsedSec * 1.4) * 0.08 * swayScale + flyaway.x,
      CARRIER_STAGE_HEIGHT + CARRIER_FLYAWAY_RISE * stageFlightProgress * stageFlightProgress,
      Math.cos(this.elapsedSec * 1.1) * 0.06 * swayScale + flyaway.z,
    )
    this.stage.rotation.x = this.payload.rotation.x * 0.45
    this.stage.rotation.z = this.payload.rotation.z * 0.45 - stageFlightProgress * 0.16
    this.stage.rotation.y = stageFlightProgress * 0.35

    for (let i = 0; i < this.tethers.length; i++) {
      const start = this.stage.localToWorld(STAGE_ANCHORS[i].clone())
      const end = this.payload.localToWorld(PAYLOAD_ANCHORS[i].clone())
      this.updateTetherMesh(this.tethers[i], start, end, tension, releaseProgress, retractProgress)
    }
  }

  /**
   * Updates one tether mesh so it reads as a physical cable between stage and payload.
   */
  private updateTetherMesh(
    tether: DropTether,
    start: THREE.Vector3,
    end: THREE.Vector3,
    tension: number,
    releaseProgress: number,
    retractProgress: number,
  ): void {
    const offsetEnd = end.clone()
    offsetEnd.y -= releaseProgress * 0.12
    offsetEnd.z -= releaseProgress * 0.14
    const retractTarget = start.clone()
    retractTarget.y -= 0.1
    retractTarget.z -= 0.08
    offsetEnd.lerp(retractTarget, retractProgress)

    const direction = offsetEnd.clone().sub(start)
    const length = direction.length()
    if (length <= 0.001) {
      tether.mesh.visible = false
      return
    }

    tether.mesh.visible = retractProgress < 0.995 && (tension > 0.01 || retractProgress > 0)
    tether.mesh.position.copy(start.clone().addScaledVector(direction, 0.5))
    tether.mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.clone().normalize(),
    )
    tether.mesh.scale.set(1, length, 1)

    const material = tether.mesh.material as THREE.MeshStandardMaterial
    material.opacity = Math.max(0.1, 1 - retractProgress * 0.9)
  }
}
