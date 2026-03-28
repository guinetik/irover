import * as THREE from 'three'
import type { SiteFrameContext, SiteTickHandler } from './SiteFrameContext'
import { createMeteorTickHandler } from './MeteorTickHandler'
import { MeteorFallRenderer } from '@/three/MeteorFallRenderer'
import type { RockFactory } from '@/three/terrain/RockFactory'
import type { MeteorFall, MeteorShower, ShowerSeverity } from '@/lib/meteor'
import { computeShockwaveDamage, KILL_RADIUS, SHOCKWAVE_RADIUS_MULTIPLIER, rollCraterParams } from '@/lib/meteor'
import type { AudioManager } from '@/audio/AudioManager'
import type { Ref } from 'vue'
import type { MarsSky } from '@/three/MarsSky'
import type { ITerrainGenerator } from '@/three/terrain/TerrainGenerator'
import type { RoverController } from '@/three/RoverController'

const SEVERITY_LABELS: Record<ShowerSeverity, string> = {
  light: 'Light',
  moderate: 'Moderate',
  heavy: 'Heavy',
}

export interface MeteorControllerOptions {
  meteorRisk: number
  audioManager: AudioManager | null
  remsMeteorIncomingText: Ref<string | null>
  remsMeteorActiveText: Ref<string | null>
  onGameOver?: () => void
  shockWhiteoutActive: Ref<boolean>
}

export interface MeteorSceneComponents {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  rockFactory: RockFactory
  terrainGroup: THREE.Group
  heightAt: (x: number, z: number) => number
  sky: MarsSky | null
}

export function createMeteorController(
  options: MeteorControllerOptions,
): SiteTickHandler & {
  /** Wire Three.js scene components after the site scene has been created. */
  setSceneComponents: (components: MeteorSceneComponents) => void
  onStormActive: () => void
  getActiveMeteoriteRocks: () => THREE.Mesh[]
  /** Dev: force-trigger a meteor shower at the given severity. */
  triggerShower: (severity: ShowerSeverity) => void
} {
  const {
    meteorRisk,
    audioManager,
    remsMeteorIncomingText,
    remsMeteorActiveText,
  } = options

  let renderer: MeteorFallRenderer | null = null
  let scene: THREE.Scene | null = null
  let rockFactory: RockFactory | null = null
  let terrainGroup: THREE.Group | null = null
  let heightAt: ((x: number, z: number) => number) | null = null
  let sky: MarsSky | null = null
  let terrain: ITerrainGenerator | null = null

  // Sky intensity lerp state
  let targetSkyIntensity = 0
  let currentSkyIntensity = 0

  // Last rover reference — updated each tick
  let lastRoverController: RoverController | null = null
  let lastRoverPosition: THREE.Vector3 | null = null

  const meteoriteRocks: THREE.Mesh[] = []
  const fallingMeshes = new Map<string, THREE.Mesh>()
  let lastStormPhase: string = 'none'

  const tickHandler = createMeteorTickHandler({
    meteorRisk,
    heightAt: (x, z) => heightAt?.(x, z) ?? 0,

    onShowerScheduled(shower: MeteorShower) {
      const label = SEVERITY_LABELS[shower.severity]
      remsMeteorIncomingText.value =
        `REMS: Meteor shower incoming — elevated bolide activity detected. Expect ${label}.`
      targetSkyIntensity = 1
    },

    onFallMarkerShow(fall: MeteorFall) {
      if (!renderer) return
      renderer.showMarker(fall)
      if (!remsMeteorActiveText.value) {
        remsMeteorActiveText.value = `REMS: Meteor shower active.`
        remsMeteorIncomingText.value = null
      }
    },

    onFallStart(fall: MeteorFall) {
      if (!renderer || !rockFactory) return
      const mesh = rockFactory.createMeteoriteRock(fall.variant, fall.showerId)
      if (!mesh) {
        console.warn(`[Meteor] createMeteoriteRock returned null for variant ${fall.variant} — GLB may not contain this mesh`)
        return
      }
      fallingMeshes.set(fall.id, mesh)
      renderer.startFall(fall, mesh)
    },

    onFallImpact(fall: MeteorFall) {
      if (!renderer) return
      // Always remove the marker, even if the mesh was never created
      renderer.removeMarker(fall)

      const impactPos = new THREE.Vector3(fall.targetX, fall.groundY, fall.targetZ)
      const roverPos = lastRoverPosition
      const dist = roverPos ? roverPos.distanceTo(impactPos) : Infinity

      // Kill zone — direct hit = game over
      if (dist < KILL_RADIUS) {
        options.onGameOver?.()
        renderer.completeFall(fall.id)
        return
      }

      // Shockwave zone — durability damage + knockback
      const shockwaveRadius = KILL_RADIUS * SHOCKWAVE_RADIUS_MULTIPLIER
      if (dist < shockwaveRadius && roverPos) {
        // Apply damage to each instrument
        if (lastRoverController) {
          for (const inst of lastRoverController.instruments) {
            const dmg = computeShockwaveDamage(dist, shockwaveRadius, inst.tier)
            if (dmg > 0) inst.applyHazardDamage(dmg * 100) // durabilityPct is 0-100
          }
        }

        // Knockback — push rover away from blast
        if (dist < 10) {
          const pushDir = roverPos.clone().sub(impactPos).normalize()
          const pushMag = (1 - dist / 10) * 1.0
          roverPos.x += pushDir.x * pushMag
          roverPos.z += pushDir.z * pushMag
        }

        // Dust whiteout
        if (dist < 15) {
          options.shockWhiteoutActive.value = true
          setTimeout(() => { options.shockWhiteoutActive.value = false }, 1500)
        }
      }

      // Process the rock (existing logic)
      const mesh = fallingMeshes.get(fall.id)
      if (!mesh || !rockFactory || !terrainGroup) {
        renderer.completeFall(fall.id)
        return
      }
      fallingMeshes.delete(fall.id)

      renderer.onImpact(fall, roverPos ?? new THREE.Vector3())

      // Terrain crater deformation
      if (terrain) {
        const crater = rollCraterParams()
        terrain.deformCrater(fall.targetX, fall.targetZ, crater.radius, crater.depth, crater.rimHeight)
        // Reposition rock to new ground level
        mesh.position.y = terrain.terrainHeightAt(fall.targetX, fall.targetZ)
      }

      rockFactory.registerMeteoriteRock(mesh, terrainGroup)
      meteoriteRocks.push(mesh)

      renderer.completeFall(fall.id)
    },

    onShowerComplete() {
      remsMeteorIncomingText.value = null
      remsMeteorActiveText.value = null
      targetSkyIntensity = 0
    },
  })

  function setSceneComponents(components: MeteorSceneComponents): void {
    const { scene: sc, camera, rockFactory: rf, terrainGroup: tg, heightAt: ha, sky: sk } = components
    scene = sc
    renderer = new MeteorFallRenderer(sc)
    renderer.setCamera(camera)
    if (audioManager) renderer.setAudioManager(audioManager)
    rockFactory = rf
    terrainGroup = tg
    heightAt = ha
    sky = sk
  }

  function onStormActive(): void {
    if (!rockFactory || !terrainGroup) return
    for (const rock of meteoriteRocks) {
      rockFactory.unregisterMeteoriteRock(rock, terrainGroup)
    }
    meteoriteRocks.length = 0
  }

  function getActiveMeteoriteRocks(): THREE.Mesh[] {
    return meteoriteRocks
  }

  function tick(fctx: SiteFrameContext): void {
    // Not yet initialized — skip until setSceneComponents is called
    if (!renderer) return

    // Track rover controller and position for shockwave/kill detection
    if (fctx.rover) lastRoverController = fctx.rover
    lastRoverPosition = fctx.siteScene.rover?.position ?? null

    // Sync terrain reference from siteScene
    if (!terrain && fctx.siteScene.terrain) {
      terrain = fctx.siteScene.terrain
    }

    // Storm cleanup: when dust storm transitions to 'active', remove meteorite rocks
    if (fctx.dustStormPhase === 'active' && lastStormPhase !== 'active') {
      onStormActive()
    }
    lastStormPhase = fctx.dustStormPhase

    tickHandler.tick(fctx)

    // Sky intensity lerp — fast in (rate 3.0), slow out (rate 0.5)
    if (sky && targetSkyIntensity !== currentSkyIntensity) {
      const rate = targetSkyIntensity > currentSkyIntensity ? 3.0 : 0.5
      currentSkyIntensity += (targetSkyIntensity - currentSkyIntensity) * Math.min(1, rate * fctx.sceneDelta)
      if (Math.abs(currentSkyIntensity - targetSkyIntensity) < 0.01) currentSkyIntensity = targetSkyIntensity
      sky.setMeteorShowerIntensity(currentSkyIntensity)
    }

    const roverPos = fctx.siteScene.rover?.position ?? new THREE.Vector3()
    renderer.update(fctx.sceneDelta, roverPos)
  }

  function dispose(): void {
    tickHandler.dispose()
    renderer?.dispose()
    onStormActive()
  }

  function triggerShower(severity: ShowerSeverity): void {
    tickHandler.forceShower(severity)
  }

  return { tick, dispose, setSceneComponents, onStormActive, getActiveMeteoriteRocks, triggerShower }
}
