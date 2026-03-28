import * as THREE from 'three'
import type { SiteFrameContext, SiteTickHandler } from './SiteFrameContext'
import { createMeteorTickHandler } from './MeteorTickHandler'
import { MeteorFallRenderer } from '@/three/MeteorFallRenderer'
import type { RockFactory } from '@/three/terrain/RockFactory'
import type { MeteorFall, MeteorShower, ShowerSeverity } from '@/lib/meteor'
import type { AudioManager } from '@/audio/AudioManager'
import type { Ref } from 'vue'

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
}

export interface MeteorSceneComponents {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  rockFactory: RockFactory
  terrainGroup: THREE.Group
  heightAt: (x: number, z: number) => number
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

      const mesh = fallingMeshes.get(fall.id)
      if (!mesh || !rockFactory || !terrainGroup) {
        renderer.completeFall(fall.id)
        return
      }
      fallingMeshes.delete(fall.id)

      const roverPos = scene?.getObjectByName('RoverGroup')?.position ?? new THREE.Vector3()
      renderer.onImpact(fall, roverPos)

      rockFactory.registerMeteoriteRock(mesh, terrainGroup)
      meteoriteRocks.push(mesh)

      renderer.completeFall(fall.id)
    },

    onShowerComplete() {
      remsMeteorIncomingText.value = null
      remsMeteorActiveText.value = null
    },
  })

  function setSceneComponents(components: MeteorSceneComponents): void {
    const { scene: sc, camera, rockFactory: rf, terrainGroup: tg, heightAt: ha } = components
    scene = sc
    renderer = new MeteorFallRenderer(sc)
    renderer.setCamera(camera)
    if (audioManager) renderer.setAudioManager(audioManager)
    rockFactory = rf
    terrainGroup = tg
    heightAt = ha
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

    // Storm cleanup: when dust storm transitions to 'active', remove meteorite rocks
    if (fctx.dustStormPhase === 'active' && lastStormPhase !== 'active') {
      onStormActive()
    }
    lastStormPhase = fctx.dustStormPhase

    tickHandler.tick(fctx)

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
