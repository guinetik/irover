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
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  rockFactory: RockFactory
  terrainGroup: THREE.Group
  heightAt: (x: number, z: number) => number
  audioManager: AudioManager | null
  remsMeteorIncomingText: Ref<string | null>
  remsMeteorActiveText: Ref<string | null>
}

export function createMeteorController(
  options: MeteorControllerOptions,
): SiteTickHandler & {
  onStormActive: () => void
  getActiveMeteoriteRocks: () => THREE.Mesh[]
} {
  const {
    meteorRisk,
    scene,
    camera,
    rockFactory,
    terrainGroup,
    heightAt,
    audioManager,
    remsMeteorIncomingText,
    remsMeteorActiveText,
  } = options

  const renderer = new MeteorFallRenderer(scene)
  renderer.setCamera(camera)
  if (audioManager) renderer.setAudioManager(audioManager)

  const meteoriteRocks: THREE.Mesh[] = []
  const fallingMeshes = new Map<string, THREE.Mesh>()
  let lastStormPhase: string = 'none'

  const tickHandler = createMeteorTickHandler({
    meteorRisk,
    heightAt,

    onShowerScheduled(shower: MeteorShower) {
      const label = SEVERITY_LABELS[shower.severity]
      remsMeteorIncomingText.value =
        `REMS: Meteor shower incoming — elevated bolide activity detected. Expect ${label}.`
    },

    onFallMarkerShow(fall: MeteorFall) {
      renderer.showMarker(fall)
      if (!remsMeteorActiveText.value) {
        remsMeteorActiveText.value = `REMS: Meteor shower active.`
        remsMeteorIncomingText.value = null
      }
    },

    onFallStart(fall: MeteorFall) {
      const mesh = rockFactory.createMeteoriteRock(fall.variant, fall.showerId)
      if (!mesh) return
      fallingMeshes.set(fall.id, mesh)
      renderer.startFall(fall, mesh)
    },

    onFallImpact(fall: MeteorFall) {
      const mesh = fallingMeshes.get(fall.id)
      if (!mesh) return
      fallingMeshes.delete(fall.id)

      const roverPos = scene.getObjectByName('RoverGroup')?.position ?? new THREE.Vector3()
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

  function onStormActive(): void {
    for (const rock of meteoriteRocks) {
      rockFactory.unregisterMeteoriteRock(rock, terrainGroup)
    }
    meteoriteRocks.length = 0
  }

  function getActiveMeteoriteRocks(): THREE.Mesh[] {
    return meteoriteRocks
  }

  function tick(fctx: SiteFrameContext): void {
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
    renderer.dispose()
    onStormActive()
  }

  return { tick, dispose, onStormActive, getActiveMeteoriteRocks }
}
