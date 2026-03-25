import { ref, computed, watch, type Ref, type ShallowRef } from 'vue'
import type { LGAMessage } from '@/types/lgaMailbox'
import type { MissionState, MissionDef } from '@/types/missions'
import { useMissions } from './useMissions'
import { usePoiArrival, clearPoiArrival } from './usePoiArrival'
import { useSiteMissionPois } from './useSiteMissionPois'
import { addWaypointMarker, removeWaypointMarker } from '@/three/WaypointMarkers'
import type { MarsSiteViewControllerHandle } from '@/views/MarsSiteViewController'

/**
 * All mission-related UI state and logic, extracted from MartianSiteView.
 * Call once from the view's setup, passing in the reactive refs it needs.
 */
export function useMissionUI(deps: {
  siteHandle: ShallowRef<MarsSiteViewControllerHandle | null>
  roverWorldX: Ref<number>
  roverWorldZ: Ref<number>
  marsSol: Ref<number>
  activeInstrumentSlot: Ref<number | null>
  onMissionComplete?: (name: string, sp: number, unlock: string | null) => void
}) {
  const { siteHandle, roverWorldX, roverWorldZ, marsSol, activeInstrumentSlot } = deps

  const {
    activeMissions,
    completedMissions,
    trackedMissionId,
    unlockedInstruments,
    accept,
    isObjectiveEligible,
    getMissionDef,
    startTransmitCompletion,
    transmitProgress,
  } = useMissions()

  const { dwellStates } = usePoiArrival()
  const { upsertPoi, removePoi } = useSiteMissionPois()

  // --- UI state ---
  const missionLogOpen = ref(false)
  const openedMessage = ref<LGAMessage | null>(null)

  // --- Computed ---
  const trackedMission = computed<MissionState | null>(() =>
    activeMissions.value.find((m) => m.missionId === trackedMissionId.value) ?? null,
  )

  const trackedMissionDef = computed<MissionDef | null>(() =>
    trackedMissionId.value ? getMissionDef(trackedMissionId.value) ?? null : null,
  )

  const activeDwellPoiId = computed(() => {
    const dwelling = dwellStates.value.find((s) => s.progress > 0 && !s.arrived)
    return dwelling?.poiId ?? null
  })

  const activeDwellProgress = computed(() => {
    const dwelling = dwellStates.value.find((s) => s.progress > 0 && !s.arrived)
    return dwelling?.progress ?? 0
  })

  const lgaActive = computed(() => activeInstrumentSlot.value === 11)

  const missionAccepted = computed(() =>
    !!(openedMessage.value?.missionId && (
      activeMissions.value.some((m) => m.missionId === openedMessage.value?.missionId) ||
      completedMissions.value.some((m) => m.missionId === openedMessage.value?.missionId)
    )),
  )

  // --- Helpers ---
  function getObjLabel(missionId: string, objectiveId: string): string {
    const def = getMissionDef(missionId)
    return def?.objectives.find((o) => o.id === objectiveId)?.label ?? ''
  }

  // --- Handlers ---
  function handleAcceptMission(missionId: string | undefined) {
    if (!missionId) return
    accept(missionId, marsSol.value)

    const def = getMissionDef(missionId)
    if (def) {
      const rx = roverWorldX.value
      const rz = roverWorldZ.value
      const goToObjs = def.objectives.filter((o) => o.type === 'go-to')
      goToObjs.forEach((obj, i) => {
        const angle = (i / goToObjs.length) * Math.PI * 2 - Math.PI / 2
        const dist = 8 + i * 5
        const px = Math.max(-390, Math.min(390, rx + Math.cos(angle) * dist))
        const pz = Math.max(-390, Math.min(390, rz + Math.sin(angle) * dist))
        upsertPoi({
          id: obj.params.poiId,
          label: obj.label,
          x: px,
          z: pz,
          color: '#66ffee',
        })
        const scene = siteHandle.value?.siteScene
        if (scene) {
          const groundY = scene.terrain.heightAt(px, pz)
          addWaypointMarker(obj.params.poiId, px, pz, groundY, scene.scene)
        }
      })

      // Spawn orbital drops at go-to POIs for any gather objectives
      const gatherObjs = def.objectives.filter((o) => o.type === 'gather')
      if (gatherObjs.length > 0 && goToObjs.length > 0) {
        const rx2 = roverWorldX.value
        const rz2 = roverWorldZ.value
        const angle0 = (0 / goToObjs.length) * Math.PI * 2 - Math.PI / 2
        const dist0 = 8
        const dropX = Math.max(-390, Math.min(390, rx2 + Math.cos(angle0) * dist0))
        const dropZ = Math.max(-390, Math.min(390, rz2 + Math.sin(angle0) * dist0))
        for (const gather of gatherObjs) {
          try {
            siteHandle.value?.spawnOrbitalDropItem(gather.params.itemId, {
              x: dropX, z: dropZ, quantity: gather.params.quantity ?? 1,
            })
          } catch { /* scene not ready */ }
        }
      }
    }

    openedMessage.value = null
  }

  function handleMissionTransmit() {
    if (!trackedMissionId.value) return
    startTransmitCompletion(trackedMissionId.value, marsSol.value)
  }

  function handleOpenMessage(msg: LGAMessage) {
    openedMessage.value = msg
  }

  function handleCloseMessage() {
    openedMessage.value = null
  }

  function handleOpenMissionLog() {
    missionLogOpen.value = true
  }

  function handleCloseMissionLog() {
    missionLogOpen.value = false
  }

  function handleTrackMission(id: string) {
    trackedMissionId.value = id
  }

  function handleUntrack() {
    trackedMissionId.value = null
  }

  // --- Watchers ---

  // Clean up POIs + 3D markers as individual objectives complete
  watch(
    () => activeMissions.value.map((m) => m.objectives.map((o) => o.done)),
    () => {
      const scene = siteHandle.value?.siteScene
      for (const state of activeMissions.value) {
        const def = getMissionDef(state.missionId)
        if (!def) continue
        for (let i = 0; i < state.objectives.length; i++) {
          if (!state.objectives[i].done) continue
          const objDef = def.objectives[i]
          if (objDef?.type === 'go-to' && objDef.params.poiId) {
            removePoi(objDef.params.poiId)
            clearPoiArrival(objDef.params.poiId)
            if (scene) removeWaypointMarker(objDef.params.poiId, scene.scene)
          }
        }
      }
    },
    { deep: true },
  )

  // Clean up markers + fire completion callback when missions complete
  watch(completedMissions, (curr, prev) => {
    const scene = siteHandle.value?.siteScene
    for (const state of curr) {
      const def = getMissionDef(state.missionId)
      if (!def) continue
      for (const obj of def.objectives) {
        if (obj.type === 'go-to' && obj.params.poiId) {
          removePoi(obj.params.poiId)
          if (scene) removeWaypointMarker(obj.params.poiId, scene.scene)
        }
      }
    }
    // Fire callback for newly completed missions
    if (curr.length > (prev?.length ?? 0) && deps.onMissionComplete) {
      const newest = curr[curr.length - 1]
      const def = getMissionDef(newest.missionId)
      if (def) {
        const unlockLabel = def.unlocks.length > 0 ? def.unlocks.join(', ').toUpperCase() : null
        deps.onMissionComplete(def.name, def.reward.sp ?? 0, unlockLabel)
      }
    }
  })

  return {
    // State
    missionLogOpen,
    openedMessage,
    activeMissions,
    completedMissions,
    trackedMissionId,
    unlockedInstruments,
    transmitProgress,

    // Computed
    trackedMission,
    trackedMissionDef,
    activeDwellPoiId,
    activeDwellProgress,
    lgaActive,
    missionAccepted,

    // Helpers
    getMissionDef,
    getObjLabel,
    isObjectiveEligible,

    // Handlers
    handleAcceptMission,
    handleMissionTransmit,
    handleOpenMessage,
    handleCloseMessage,
    handleOpenMissionLog,
    handleCloseMissionLog,
    handleTrackMission,
    handleUntrack,
  }
}
