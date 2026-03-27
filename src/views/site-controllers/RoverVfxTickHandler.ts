import type { Ref } from 'vue'
import * as THREE from 'three'
import {
  HeaterController,
  RTGController,
  instrumentSelectionEmissiveIntensity,
  type RTGConservationState,
} from '@/three/instruments'
import { RtgSparkBurst } from '@/three/RtgSparkBurst'
import { formatRtgShuntCooldownLabel } from '@/views/MarsSiteViewController'
import type { SiteFrameContext, SiteTickHandler } from './SiteFrameContext'

export interface RoverVfxRefs {
  rtgPhase: Ref<'idle' | 'overdrive' | 'cooldown' | 'recharging'>
  rtgPhaseProgress: Ref<number>
  rtgConservationMode: Ref<RTGConservationState>
  rtgConservationProgress01: Ref<number>
  rtgOverdriveReady: Ref<boolean>
  rtgConservationReady: Ref<boolean>
  rtgConservationCdLabel: Ref<string>
  rtgConservationCooldownTitle: Ref<string>
  heaterOverdriveReady: Ref<boolean>
  heaterHeatBoostActive: Ref<boolean>
  heaterHeatBoostProgressElapsed01: Ref<number>
}

/**
 * Creates a tick handler for rover visual effects:
 * - RTG overdrive glow and HUD state sync
 * - Sleep-mode red pulse on the entire rover chassis
 * - Instrument selection highlight (cyan emissive on focused tool's GLTF subtree)
 */
export function createRoverVfxTickHandler(refs: RoverVfxRefs): SiteTickHandler {
  const {
    rtgPhase, rtgPhaseProgress, rtgConservationMode, rtgConservationProgress01,
    rtgOverdriveReady, rtgConservationReady, rtgConservationCdLabel, rtgConservationCooldownTitle,
    heaterOverdriveReady, heaterHeatBoostActive, heaterHeatBoostProgressElapsed01,
  } = refs

  let sparkBurst: RtgSparkBurst | null = null
  let prevRtgPhase: string = 'idle'
  let prevConservationMode: string = 'off'

  function tick(fctx: SiteFrameContext): void {
    const { rover: controller, siteScene, isSleeping, simulationTime, sceneDelta } = fctx

    // --- RTG overdrive state + glow ---
    const rtg = controller?.instruments.find(i => i.id === 'rtg') as RTGController | undefined
    if (rtg) {
      rtgPhase.value = rtg.phase
      rtgPhaseProgress.value = rtg.phaseProgress
      rtgConservationMode.value = rtg.conservationMode
      rtgConservationProgress01.value = rtg.conservationProgress01
      rtgOverdriveReady.value = rtg.canActivateOverdrive
      rtgConservationReady.value = rtg.canActivateConservation
      rtgConservationCdLabel.value = formatRtgShuntCooldownLabel(rtg.conservationCooldownRemainingSec)
      rtgConservationCooldownTitle.value = rtg.conservationMode === 'cooldown'
        ? `Shunt recharging — ${formatRtgShuntCooldownLabel(rtg.conservationCooldownRemainingSec)}`
        : ''

      // Glow on RTG mesh only while overdrive is active (materials cloned in RTGController.attach).
      // Cooldown / recharge use UI banners — no chassis emissive so we do not tint the whole rover.
      if (rtg.node && rtg.phase === 'overdrive') {
        rtg.node.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial
            mat.emissive = mat.emissive || new THREE.Color()
            mat.emissive.setHex(0xff6600)
            mat.emissiveIntensity = 0.3 + Math.sin(simulationTime * 4) * 0.15
          }
        })
      } else if (rtg.node) {
        rtg.node.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial
            if (mat.emissiveIntensity > 0) {
              mat.emissiveIntensity = Math.max(0, mat.emissiveIntensity - sceneDelta * 0.5)
            }
          }
        })
      }
    }

    // --- RTG spark burst on overdrive / shunt activation edge ---
    if (rtg) {
      if (!sparkBurst) {
        sparkBurst = new RtgSparkBurst(siteScene.scene)
      }

      const curPhase = rtg.phase
      const curConservation = rtg.conservationMode

      if (curPhase === 'overdrive' && prevRtgPhase !== 'overdrive' && rtg.node) {
        const pos = new THREE.Vector3()
        rtg.node.getWorldPosition(pos)
        sparkBurst.emit(pos)
      }
      if (curConservation === 'active' && prevConservationMode !== 'active' && rtg.node) {
        const pos = new THREE.Vector3()
        rtg.node.getWorldPosition(pos)
        sparkBurst.emit(pos)
      }

      prevRtgPhase = curPhase
      prevConservationMode = curConservation
      sparkBurst.update(sceneDelta)
    }

    // --- Sleep mode visual — slow red pulse on entire rover ---
    if (siteScene.rover) {
      siteScene.rover.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial
          if (!mat.emissive) return
          if (isSleeping) {
            mat.emissive.setHex(0xff1100)
            mat.emissiveIntensity = 0.08 + Math.sin(simulationTime * 1.5) * 0.06
          } else if (rtgPhase.value === 'idle' && mat.emissiveIntensity > 0) {
            mat.emissiveIntensity = Math.max(0, mat.emissiveIntensity - sceneDelta * 0.3)
          }
        }
      })
    }

    // --- Heater overdrive HUD + radiator glow (after chassis emissive decay so boost VFX wins) ---
    const heater = controller?.instruments.find(i => i.id === 'heater') as HeaterController | undefined
    if (heater) {
      heaterOverdriveReady.value = heater.canActivateOverdrive
      heaterHeatBoostActive.value = heater.heatBoostActive
      heaterHeatBoostProgressElapsed01.value = heater.heatBoostProgressElapsed01
      if (heater.node && heater.heatBoostActive) {
        heater.node.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial
            mat.emissive = mat.emissive || new THREE.Color()
            mat.emissive.setHex(0xff4400)
            mat.emissiveIntensity = 0.22 + Math.sin(simulationTime * 3.5) * 0.1
          }
        })
      } else if (heater.node) {
        heater.node.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial
            if (mat.emissiveIntensity > 0) {
              mat.emissiveIntensity = Math.max(0, mat.emissiveIntensity - sceneDelta * 0.5)
            }
          }
        })
      }
    } else {
      heaterOverdriveReady.value = false
      heaterHeatBoostActive.value = false
      heaterHeatBoostProgressElapsed01.value = 0
    }

    // --- Instrument focus — emissive on selected tool's GLTF subtree ---
    const activeInst = controller?.activeInstrument ?? null
    const instrumentViewActive =
      Boolean(controller && (controller.mode === 'instrument' || controller.mode === 'active'))
    const glowIntensity = instrumentSelectionEmissiveIntensity(simulationTime)
    for (const inst of controller?.instruments ?? []) {
      const hex = inst.selectionHighlightColor
      const glowRoots = inst.getSelectionHighlightRoots()
      if (hex == null || glowRoots.length === 0) continue
      if (inst instanceof RTGController && inst.phase === 'overdrive') continue
      if (inst instanceof HeaterController && inst.heatBoostActive) continue
      const focused =
        instrumentViewActive && activeInst === inst && !isSleeping
      for (const root of glowRoots) {
        root.traverse((child) => {
          if (!(child as THREE.Mesh).isMesh) return
          const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial
          if (!mat.emissive) return
          if (focused) {
            mat.emissive.setHex(hex)
            mat.emissiveIntensity = glowIntensity
          }
        })
      }
    }
  }

  function dispose(): void {
    sparkBurst?.dispose()
    sparkBurst = null
  }

  return { tick, dispose }
}
