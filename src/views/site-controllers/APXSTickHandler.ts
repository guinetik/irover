import type { Ref } from 'vue'
import { APXSController } from '@/three/instruments'
import type { SiteFrameContext, SiteTickHandler } from './SiteFrameContext'
import type { ProfileModifiers } from '@/composables/usePlayerProfile'
import type { AudioPlaybackHandle } from '@/audio/audioTypes'
import type { SpeedBreakdown, SpeedBreakdownInput } from '@/lib/instrumentSpeedBreakdown'

export type APXSCountdownState = 'idle' | 'counting' | 'launching' | 'playing'

/** Thermal zone -> game duration. Cold = less time = harder. */
const APXS_THERMAL_DURATION: Record<string, number> = {
  OPTIMAL: 25,
  COLD: 21,
  FRIGID: 12.5,
  CRITICAL: 0,
}

export interface APXSTickRefs {
  crosshairVisible: Ref<boolean>
  crosshairColor: Ref<'green' | 'red'>
  crosshairX: Ref<number>
  crosshairY: Ref<number>
  apxsCountdown: Ref<number>
  apxsState: Ref<APXSCountdownState>
  speedBreakdown: Ref<SpeedBreakdown | null>
}

export interface APXSTickCallbacks {
  onLaunchMinigame: (rockMeshUuid: string, rockType: string, rockLabel: string, durationSec: number) => void
  onBlockedByCold: () => void
  playerMod: (key: keyof ProfileModifiers) => number
  playActionSound: (soundId: 'sfx.apxsContact') => void
  startHeldMovementSound: (soundId: 'sfx.mastMove') => AudioPlaybackHandle
  getSpeedBreakdownBase: () => Omit<SpeedBreakdownInput, 'thermalZone' | 'extras' | 'speedPctOverride'>
}

export function createAPXSTickHandler(
  refs: APXSTickRefs,
  callbacks: APXSTickCallbacks,
): SiteTickHandler & { initIfReady(fctx: SiteFrameContext): void } {
  const { crosshairVisible, crosshairColor, crosshairX, crosshairY, apxsCountdown, apxsState } = refs
  const { onLaunchMinigame, onBlockedByCold, playerMod, playActionSound, startHeldMovementSound } = callbacks
  let gameplayInitialised = false
  let countdownTimer = 0
  let coldToastCooldown = 0
  let apxsOwnsCrosshair = false
  let heldMovementPlayback: AudioPlaybackHandle | null = null

  function initIfReady(fctx: SiteFrameContext): void {
    if (gameplayInitialised) return
    const inst = fctx.rover?.instruments.find(i => i.id === 'apxs')
    if (inst instanceof APXSController && inst.attached && fctx.roverReady && fctx.siteScene.rover) {
      inst.initGameplay(fctx.siteScene.scene, fctx.camera, fctx.siteScene.terrain.getSmallRocks())
      gameplayInitialised = true
    }
  }

  function tick(fctx: SiteFrameContext): void {
    const { rover: controller, siteScene, camera, thermalZone } = fctx

    if (apxsState.value === 'playing') {
      heldMovementPlayback?.stop()
      heldMovementPlayback = null
      return
    }

    coldToastCooldown = Math.max(0, coldToastCooldown - fctx.sceneDelta)

    if (controller?.mode === 'active' && controller.activeInstrument instanceof APXSController) {
      const apxs = controller.activeInstrument
      apxs.setRoverPosition(siteScene.rover!.position)
      if (apxs.isArmActuating) {
        heldMovementPlayback ??= startHeldMovementSound('sfx.mastMove')
      } else if (heldMovementPlayback) {
        heldMovementPlayback.stop()
        heldMovementPlayback = null
      }
      crosshairVisible.value = true
      apxsOwnsCrosshair = true
      const hasValidTarget = apxs.canAnalyzeTarget
      crosshairColor.value = hasValidTarget ? 'green' : 'red'

      if (camera) {
        const projected = apxs.targetWorldPos.clone().project(camera)
        crosshairX.value = (projected.x * 0.5 + 0.5) * 100
        crosshairY.value = (-projected.y * 0.5 + 0.5) * 100
      }

      const duration = (APXS_THERMAL_DURATION[thermalZone] ?? 25) / (playerMod('analysisSpeed') * Math.max(0.1, apxs.durabilityFactor))

      // CRITICAL zone blocks APXS
      if (duration <= 0 && hasValidTarget && apxsState.value === 'idle' && coldToastCooldown <= 0) {
        onBlockedByCold()
        coldToastCooldown = 3
      }

      const canStart = hasValidTarget && duration > 0

      if (canStart && apxsState.value === 'idle') {
        playActionSound('sfx.apxsContact')
        apxsState.value = 'counting'
        countdownTimer = 3
        apxsCountdown.value = 3
      } else if (canStart && apxsState.value === 'counting') {
        countdownTimer -= fctx.sceneDelta
        apxsCountdown.value = Math.ceil(countdownTimer)
        if (countdownTimer <= 0) {
          apxsState.value = 'launching'
          apxs.rollUsageDecay()
          const target = apxs.currentTargetResult!
          const rockType = target.rockType
          const rockLabel = target.rock.userData.rockLabel ?? rockType
          const uuid = target.rock.uuid
          onLaunchMinigame(uuid, rockType, rockLabel, duration)
        }
      } else if (!canStart && apxsState.value === 'counting') {
        apxsState.value = 'idle'
        apxsCountdown.value = 0
      }
    } else {
      heldMovementPlayback?.stop()
      heldMovementPlayback = null
      // Only clear crosshair if APXS was the last to claim it (avoid clobbering drill/chemcam)
      if (apxsOwnsCrosshair) {
        crosshairVisible.value = false
        apxsOwnsCrosshair = false
      }
      if (apxsState.value === 'counting') {
        apxsState.value = 'idle'
        apxsCountdown.value = 0
      }
    }
  }

  function dispose(): void {
    heldMovementPlayback?.stop()
    heldMovementPlayback = null
  }

  return { tick, dispose, initIfReady }
}
