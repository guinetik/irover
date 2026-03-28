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
}

interface ShakeState {
  intensity: number
  duration: number
  elapsed: number
}

export class MeteorFallRenderer {
  private visuals = new Map<string, ActiveFallVisual>()
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera | null = null
  private audioManager: AudioManager | null = null
  private shake: ShakeState | null = null

  constructor(scene: THREE.Scene) {
    this.scene = scene
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
    const visual: ActiveFallVisual = {
      fall,
      mesh,
      originMaterial: mesh.material,
      burnMaterial: burnMat,
      origin: originVec,
      target: targetVec,
      flash: null,
      flashElapsed: 0,
    }
    mesh.material = burnMat
    this.visuals.set(fall.id, visual)

    this.audioManager?.play('sfx.meteorFall' as AudioSoundId)
  }

  update(delta: number, roverPosition: THREE.Vector3): void {
    for (const [, visual] of this.visuals) {
      const { fall, mesh, origin, target, burnMaterial } = visual

      if (fall.phase === 'falling') {
        const t = Math.min(fall.elapsed / FALL_DURATION, 1)
        const eased = t * t // quadratic ease-in
        mesh.position.lerpVectors(origin, target, eased)
        burnMaterial.emissiveIntensity = 2.5 + eased * 3.0
        mesh.rotation.x += delta * 2.0
        mesh.rotation.z += delta * 1.5
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

    // Suppress unused parameter warning — roverPosition used only in onImpact
    void roverPosition
  }

  onImpact(fall: MeteorFall, roverPosition: THREE.Vector3): void {
    const visual = this.visuals.get(fall.id)
    if (!visual) return

    const { mesh, originMaterial, target } = visual

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

    // Camera shake based on distance
    const distance = roverPosition.distanceTo(target)
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

    // Impact sound with Mars speed-of-sound delay
    const soundDelay = computeSoundDelay(distance)
    if (soundDelay < 0.05) {
      this.audioManager?.play('sfx.meteorImpact' as AudioSoundId)
    } else {
      setTimeout(() => {
        this.audioManager?.play('sfx.meteorImpact' as AudioSoundId)
      }, soundDelay * 1000)
    }

    this.removeMarker(fall)
  }

  completeFall(fallId: string): void {
    const visual = this.visuals.get(fallId)
    if (!visual) return
    if (visual.flash) {
      this.scene.remove(visual.flash)
      visual.flash.dispose()
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
      visual.burnMaterial.dispose()
    }
    this.visuals.clear()
    this.shake = null
  }
}
