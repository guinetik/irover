import * as THREE from 'three'
import {
  addWaypointMarker,
  removeWaypointMarker,
} from './WaypointMarkers'
import { computeSkyOrigin, FALL_DURATION, computeSoundDelay } from '@/lib/meteor'
import type { MeteorFall } from '@/lib/meteor'
import type { AudioManager } from '@/audio/AudioManager'
import type { AudioSoundId } from '@/audio/audioManifest'

const METEOR_MARKER_COLOR = 0xff6633

/** Max audible distance for meteor sounds (beyond this, volume is 0). */
const AUDIO_MAX_DISTANCE = 400

/**
 * Compute distance-based volume (1.0 at 0m, fading to 0 at AUDIO_MAX_DISTANCE)
 * and stereo pan (-1 left, +1 right) from the camera's perspective.
 */
function computeSpatialAudio(
  soundPos: THREE.Vector3,
  roverPos: THREE.Vector3,
  camera: THREE.PerspectiveCamera | null,
): { volume: number; pan: number } {
  const dist = roverPos.distanceTo(soundPos)
  // Inverse-square-ish falloff, clamped
  const volume = dist >= AUDIO_MAX_DISTANCE ? 0 : Math.max(0, 1 - (dist / AUDIO_MAX_DISTANCE)) ** 0.7

  // Stereo pan based on camera heading
  let pan = 0
  if (camera && dist > 1) {
    const toSound = new THREE.Vector3().subVectors(soundPos, roverPos).normalize()
    // Camera forward in XZ plane
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
    forward.y = 0
    forward.normalize()
    // Cross product Y gives left/right: positive = sound is to the right
    pan = Math.max(-1, Math.min(1, forward.x * toSound.z - forward.z * toSound.x))
  }

  return { volume, pan }
}

/** Number of trail points — ~1 second at 60 fps. */
const TRAIL_LENGTH = 60

/** Max distance (m) at which impact VFX are spawned. */
const VFX_MAX_DISTANCE = 500

/** Duration of the dust plume animation in seconds. */
const DUST_PLUME_DURATION = 5

/** Duration of the blast ring animation in seconds. */
const BLAST_RING_DURATION = 1.5

function createBurnMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0xff8844,
    emissive: 0xff6622,
    emissiveIntensity: 2.5,
    roughness: 0.3,
    metalness: 0.5,
  })
}

interface ActiveFallVisual {
  fall: MeteorFall
  mesh: THREE.Mesh
  originMaterial: THREE.Material | THREE.Material[]
  burnMaterial: THREE.MeshStandardMaterial
  origin: THREE.Vector3
  target: THREE.Vector3
  flash: THREE.PointLight | null
  flashElapsed: number
  trail: THREE.Points | null
  trailPositions: Float32Array
  trailSizes: Float32Array
  trailHead: number
  trailCount: number
}

interface ShakeState {
  intensity: number
  duration: number
  elapsed: number
}

interface ImpactVfx {
  /** Brown/ochre dust cloud that rises and expands. */
  dustPlume: THREE.Mesh
  /** Expanding shockwave ring on the ground. */
  blastRing: THREE.Mesh
  elapsed: number
}

// Shared geometries — created once, reused per impact
let dustGeo: THREE.SphereGeometry | null = null
let ringGeo: THREE.TorusGeometry | null = null

function getDustGeo(): THREE.SphereGeometry {
  if (!dustGeo) dustGeo = new THREE.SphereGeometry(1, 12, 8)
  return dustGeo
}

function getRingGeo(): THREE.TorusGeometry {
  if (!ringGeo) ringGeo = new THREE.TorusGeometry(1, 0.15, 6, 24)
  return ringGeo
}

export class MeteorFallRenderer {
  private visuals = new Map<string, ActiveFallVisual>()
  private impactVfx: ImpactVfx[] = []
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera | null = null
  private audioManager: AudioManager | null = null
  private shake: ShakeState | null = null
  private lastRoverPos: THREE.Vector3 | null = null
  private trailMaterial: THREE.PointsMaterial

  constructor(scene: THREE.Scene) {
    this.scene = scene
    this.trailMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.8,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    })
  }

  setCamera(camera: THREE.PerspectiveCamera): void {
    this.camera = camera
  }

  setAudioManager(audioManager: AudioManager): void {
    this.audioManager = audioManager
  }

  showMarker(fall: MeteorFall): void {
    const markerId = `meteor-${fall.id}`
    addWaypointMarker(markerId, fall.targetX, fall.targetZ, fall.groundY, this.scene, METEOR_MARKER_COLOR)
  }

  removeMarker(fall: MeteorFall): void {
    removeWaypointMarker(`meteor-${fall.id}`, this.scene)
  }

  startFall(fall: MeteorFall, mesh: THREE.Mesh): void {
    const origin = computeSkyOrigin(
      fall.targetX, fall.targetZ, fall.groundY,
      fall.entryAngle, fall.azimuth,
    )
    const originVec = new THREE.Vector3(origin.x, origin.y, origin.z)
    const targetVec = new THREE.Vector3(fall.targetX, fall.groundY, fall.targetZ)

    mesh.position.copy(originVec)
    this.scene.add(mesh)

    const burnMat = createBurnMaterial()

    // Trail geometry — positions and per-point sizes start zeroed out
    const trailPositions = new Float32Array(TRAIL_LENGTH * 3)
    const trailSizes = new Float32Array(TRAIL_LENGTH)
    const trailGeo = new THREE.BufferGeometry()
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3))
    trailGeo.setAttribute('size', new THREE.BufferAttribute(trailSizes, 1))
    trailGeo.setDrawRange(0, 0)
    const trail = new THREE.Points(trailGeo, this.trailMaterial)
    this.scene.add(trail)

    const visual: ActiveFallVisual = {
      fall,
      mesh,
      originMaterial: mesh.material,
      burnMaterial: burnMat,
      origin: originVec,
      target: targetVec,
      flash: null,
      flashElapsed: 0,
      trail,
      trailPositions,
      trailSizes,
      trailHead: 0,
      trailCount: 0,
    }
    mesh.material = burnMat
    this.visuals.set(fall.id, visual)

    // Spatial audio: volume + pan based on distance/angle to target
    if (this.audioManager && this.lastRoverPos) {
      const handle = this.audioManager.play('sfx.meteorFall' as AudioSoundId)
      const { volume, pan } = computeSpatialAudio(targetVec, this.lastRoverPos, this.camera)
      handle.setVolume(volume)
      handle.setStereo(pan)
    }
  }

  update(delta: number, roverPosition: THREE.Vector3): void {
    this.lastRoverPos = roverPosition

    // Falling meshes
    for (const [, visual] of this.visuals) {
      const { fall, mesh, origin, target, burnMaterial } = visual

      if (fall.phase === 'falling') {
        const t = Math.min(fall.elapsed / FALL_DURATION, 1)
        const eased = t * t
        mesh.position.lerpVectors(origin, target, eased)
        burnMaterial.emissiveIntensity = 2.5 + eased * 3.0
        mesh.rotation.x += delta * 2.0
        mesh.rotation.z += delta * 1.5

        // Trail — write current position into circular buffer slot
        if (visual.trail) {
          const { trailPositions, trailSizes } = visual
          const head = visual.trailHead
          trailPositions[head * 3]     = mesh.position.x
          trailPositions[head * 3 + 1] = mesh.position.y
          trailPositions[head * 3 + 2] = mesh.position.z
          trailSizes[head] = 1.0

          visual.trailHead = (head + 1) % TRAIL_LENGTH
          visual.trailCount = Math.min(visual.trailCount + 1, TRAIL_LENGTH)

          // Age all sizes: shrink toward 0 so older points vanish
          for (let i = 0; i < TRAIL_LENGTH; i++) {
            trailSizes[i] = Math.max(0, trailSizes[i] - delta * 1.5)
          }
          // Restore the freshly written point's size (aging loop may have touched it)
          trailSizes[head] = 1.0

          const geo = visual.trail.geometry
          geo.setDrawRange(0, visual.trailCount)
          ;(geo.attributes.position as THREE.BufferAttribute).needsUpdate = true
          ;(geo.attributes.size as THREE.BufferAttribute).needsUpdate = true
        }
      }

      if (visual.flash) {
        visual.flashElapsed += delta
        const flashDuration = 0.3
        if (visual.flashElapsed >= flashDuration) {
          this.scene.remove(visual.flash)
          visual.flash.dispose()
          visual.flash = null
        } else {
          visual.flash.intensity = 8 * (1 - visual.flashElapsed / flashDuration)
        }
      }
    }

    // Impact VFX — dust plumes and blast rings
    for (let i = this.impactVfx.length - 1; i >= 0; i--) {
      const vfx = this.impactVfx[i]
      vfx.elapsed += delta

      // Dust plume: rises, expands, fades over DUST_PLUME_DURATION
      const dustT = vfx.elapsed / DUST_PLUME_DURATION
      if (dustT < 1) {
        const easeOut = 1 - (1 - dustT) * (1 - dustT)
        const scale = 2 + easeOut * 8
        vfx.dustPlume.scale.set(scale, scale * 1.5, scale)
        vfx.dustPlume.position.y += delta * 3 * (1 - dustT)
        const mat = vfx.dustPlume.material as THREE.MeshBasicMaterial
        mat.opacity = 0.5 * (1 - dustT)
      }

      // Blast ring: expands rapidly, fades over BLAST_RING_DURATION
      const ringT = vfx.elapsed / BLAST_RING_DURATION
      if (ringT < 1) {
        const ringScale = 1 + ringT * 12
        vfx.blastRing.scale.set(ringScale, ringScale, ringScale)
        const mat = vfx.blastRing.material as THREE.MeshBasicMaterial
        mat.opacity = 0.6 * (1 - ringT)
      }

      // Clean up when both animations are done
      if (dustT >= 1 && ringT >= 1) {
        this.scene.remove(vfx.dustPlume)
        this.scene.remove(vfx.blastRing)
        ;(vfx.dustPlume.material as THREE.Material).dispose()
        ;(vfx.blastRing.material as THREE.Material).dispose()
        this.impactVfx.splice(i, 1)
      }
    }

    // Camera shake
    if (this.shake && this.camera) {
      this.shake.elapsed += delta
      if (this.shake.elapsed >= this.shake.duration) {
        this.shake = null
      } else {
        const decay = 1 - this.shake.elapsed / this.shake.duration
        const magnitude = this.shake.intensity * decay
        this.camera.position.x += (Math.random() - 0.5) * magnitude
        this.camera.position.y += (Math.random() - 0.5) * magnitude * 0.5
        this.camera.position.z += (Math.random() - 0.5) * magnitude
      }
    }
  }

  onImpact(fall: MeteorFall, roverPosition: THREE.Vector3): void {
    const visual = this.visuals.get(fall.id)
    if (!visual) return

    const { mesh, originMaterial, target } = visual

    // Remove trail
    if (visual.trail) {
      this.scene.remove(visual.trail)
      visual.trail.geometry.dispose()
      visual.trail = null
    }

    // Strip burn, restore original material
    mesh.material = originMaterial
    mesh.position.copy(target)
    mesh.rotation.set(
      Math.random() * 0.3,
      Math.random() * Math.PI * 2,
      Math.random() * 0.3,
    )

    // Impact flash
    const flash = new THREE.PointLight(0xffaa44, 8, 50)
    flash.position.copy(target)
    flash.position.y += 1
    this.scene.add(flash)
    visual.flash = flash
    visual.flashElapsed = 0

    // Distance-gated impact VFX (dust plume + blast ring)
    const distance = roverPosition.distanceTo(target)
    if (distance < VFX_MAX_DISTANCE) {
      this.spawnImpactVfx(target)
    }

    // Camera shake based on distance
    let shakeIntensity = 0
    let shakeDuration = 0
    if (distance < 30) {
      shakeIntensity = 0.4
      shakeDuration = 1.2
    } else if (distance < 100) {
      shakeIntensity = 0.2
      shakeDuration = 0.8
    } else if (distance < 300) {
      shakeIntensity = 0.08
      shakeDuration = 0.4
    }
    if (shakeIntensity > 0) {
      this.shake = { intensity: shakeIntensity, duration: shakeDuration, elapsed: 0 }
    }

    // Impact sound with Mars speed-of-sound delay + spatial audio
    const { volume, pan } = computeSpatialAudio(target, roverPosition, this.camera)
    const playImpact = () => {
      if (!this.audioManager) return
      const handle = this.audioManager.play('sfx.meteorImpact' as AudioSoundId)
      handle.setVolume(volume)
      handle.setStereo(pan)
    }
    const soundDelay = computeSoundDelay(distance)
    if (soundDelay < 0.05) {
      playImpact()
    } else {
      setTimeout(playImpact, soundDelay * 1000)
    }

    this.removeMarker(fall)
  }

  private spawnImpactVfx(position: THREE.Vector3): void {
    // Dust plume — brown/ochre expanding sphere that rises
    const dustMat = new THREE.MeshBasicMaterial({
      color: 0x8b6914,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    const dustPlume = new THREE.Mesh(getDustGeo(), dustMat)
    dustPlume.position.copy(position)
    dustPlume.position.y += 0.5
    dustPlume.scale.set(2, 2, 2)
    dustPlume.renderOrder = 5
    this.scene.add(dustPlume)

    // Blast ring — expanding torus on the ground plane
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffaa44,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    const blastRing = new THREE.Mesh(getRingGeo(), ringMat)
    blastRing.position.copy(position)
    blastRing.position.y += 0.2
    blastRing.rotation.x = -Math.PI / 2
    blastRing.renderOrder = 4
    this.scene.add(blastRing)

    this.impactVfx.push({ dustPlume, blastRing, elapsed: 0 })
  }

  completeFall(fallId: string): void {
    const visual = this.visuals.get(fallId)
    if (!visual) return
    if (visual.flash) {
      this.scene.remove(visual.flash)
      visual.flash.dispose()
    }
    if (visual.trail) {
      this.scene.remove(visual.trail)
      visual.trail.geometry.dispose()
      visual.trail = null
    }
    visual.burnMaterial.dispose()
    this.visuals.delete(fallId)
  }

  dispose(): void {
    for (const [, visual] of this.visuals) {
      this.removeMarker(visual.fall)
      if (visual.flash) {
        this.scene.remove(visual.flash)
        visual.flash.dispose()
      }
      if (visual.trail) {
        this.scene.remove(visual.trail)
        visual.trail.geometry.dispose()
        visual.trail = null
      }
      visual.burnMaterial.dispose()
    }
    this.visuals.clear()
    this.trailMaterial.dispose()
    for (const vfx of this.impactVfx) {
      this.scene.remove(vfx.dustPlume)
      this.scene.remove(vfx.blastRing)
      ;(vfx.dustPlume.material as THREE.Material).dispose()
      ;(vfx.blastRing.material as THREE.Material).dispose()
    }
    this.impactVfx.length = 0
    this.shake = null
  }
}
