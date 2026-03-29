import { ref, computed, watch, type Ref, type ShallowRef } from 'vue'
import type { LGAMessage } from '@/types/lgaMailbox'
import type { MissionState, MissionDef } from '@/types/missions'
import { useMissions } from './useMissions'
import { usePoiArrival, clearPoiArrival } from './usePoiArrival'
import { useSiteMissionPois } from './useSiteMissionPois'
import { addWaypointMarker, removeWaypointMarker } from '@/three/WaypointMarkers'
import { setRtgTutorialMode } from '@/lib/missionTime'
import type { MarsSiteViewControllerHandle } from '@/views/MarsSiteViewController'
import { isOrbitalDropItemId } from '@/types/orbitalDrop'
import { rewardItemsForOrbitalDrop } from '@/lib/missionRewardOrbital'
import { resolveRandomOrbitalDropPosition } from '@/lib/orbitalDropSpawn'

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
  const newlyUnlockedInstruments = ref<string[]>([])
  let previousUnlocked: string[] = []

  // Track newly unlocked instruments — highlight them until player clicks one
  watch(unlockedInstruments, (curr) => {
    const fresh = curr.filter((id) => !previousUnlocked.includes(id))
    if (fresh.length > 0) {
      newlyUnlockedInstruments.value = [...newlyUnlockedInstruments.value, ...fresh]
    }
    previousUnlocked = [...curr]
  }, { immediate: true })

  // Dismiss highlight when instrument is selected (keyboard or click)
  watch(activeInstrumentSlot, (slot) => {
    if (slot == null || newlyUnlockedInstruments.value.length === 0) return
    // Resolve slot to instrument id via the controller
    const rover = siteHandle.value?.rover
    if (!rover) return
    const inst = rover.instruments.find((i) => i.slot === slot)
    if (inst && newlyUnlockedInstruments.value.includes(inst.id)) {
      newlyUnlockedInstruments.value = newlyUnlockedInstruments.value.filter((id) => id !== inst.id)
    }
  })

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

  const missionCompleted = computed(() =>
    !!(openedMessage.value?.missionId &&
      completedMissions.value.some((m) => m.missionId === openedMessage.value?.missionId)
    ),
  )

  // --- POI reveal logic ---
  // Pre-computed positions for go-to objectives (stored at accept time, revealed progressively)
  const plannedPoiPositions = new Map<string, { x: number; z: number; label: string }>()
  const revealedPoiIds = new Set<string>()

  /**
   * Recomputes go-to POI world positions from the rover (same geometry as mission accept)
   * and reveals eligible markers. Call after refresh so active missions stay playable.
   */
  function seedGoToPoisForMission(missionId: string): void {
    const def = getMissionDef(missionId)
    if (!def) return
    const rx = roverWorldX.value
    const rz = roverWorldZ.value
    const goToObjs = def.objectives.filter((o) => o.type === 'go-to')
    goToObjs.forEach((obj, i) => {
      let px: number
      let pz: number

      if (obj.params.nearRocks) {
        // Place at the nearest large rock to the rover spawn — "return to the outcrop"
        const colliders = siteHandle.value?.siteScene?.terrain.rockColliders ?? []
        let best = { x: rx + 5, z: rz + 5 }
        let bestDist = Infinity
        for (const r of colliders) {
          if (r.radius < 1.0) continue
          const dx = r.x - rx
          const dz = r.z - rz
          const d = Math.sqrt(dx * dx + dz * dz)
          if (d < bestDist) { bestDist = d; best = { x: r.x, z: r.z } }
        }
        px = Math.max(-390, Math.min(390, best.x))
        pz = Math.max(-390, Math.min(390, best.z))
      } else {
        const angle = (i / goToObjs.length) * Math.PI * 2 - Math.PI / 2
        const dist = typeof obj.params.dist === 'number' ? obj.params.dist : 8 + i * 15
        px = Math.max(-390, Math.min(390, rx + Math.cos(angle) * dist))
        pz = Math.max(-390, Math.min(390, rz + Math.sin(angle) * dist))
      }

      plannedPoiPositions.set(obj.params.poiId, { x: px, z: pz, label: obj.label })
    })
    revealEligiblePois(missionId)
  }

  /**
   * Spawns orbital supply boxes for gather objectives at the first go-to site (matches accept flow).
   *
   * @param incompleteOnly - When true (page reload), skip gathers already marked done.
   */
  function spawnMissionGatherOrbitalDrops(missionId: string, incompleteOnly: boolean): void {
    const def = getMissionDef(missionId)
    const state = activeMissions.value.find((m) => m.missionId === missionId)
    if (!def || !state) return
    const goToObjs = def.objectives.filter((o) => o.type === 'go-to')
    if (goToObjs.length === 0) return
    const firstPos = plannedPoiPositions.get(goToObjs[0].params.poiId)
    if (!firstPos) return

    for (let i = 0; i < def.objectives.length; i++) {
      const obj = def.objectives[i]
      if (obj.type !== 'gather') continue
      if (incompleteOnly && state.objectives[i]?.done) continue
      const itemId = obj.params.itemId as string
      if (!isOrbitalDropItemId(itemId)) continue
      try {
        siteHandle.value?.spawnOrbitalDropItem(itemId, {
          x: firstPos.x,
          z: firstPos.z,
          quantity: obj.params.quantity ?? 1,
        })
      } catch {
        /* scene not ready */
      }
    }
  }

  /** After load: restore POI layout and orbital crates for every active mission (same rules as accept). */
  function syncActiveMissionsLayoutFromRover(): void {
    for (const m of activeMissions.value) {
      if (m.status !== 'active') continue
      const def = getMissionDef(m.missionId)
      if (!def) continue
      const hasGoTo = def.objectives.some((o) => o.type === 'go-to')
      if (!hasGoTo) continue
      seedGoToPoisForMission(m.missionId)
      spawnMissionGatherOrbitalDrops(m.missionId, true)
    }
  }

  function revealEligiblePois(missionId: string): void {
    const def = getMissionDef(missionId)
    const state = activeMissions.value.find((m) => m.missionId === missionId)
    if (!def || !state) return

    for (let i = 0; i < def.objectives.length; i++) {
      const objDef = def.objectives[i]
      if (objDef.type !== 'go-to') continue
      const objState = state.objectives[i]
      if (objState.done) continue // already completed

      const poiId = objDef.params.poiId
      // Only reveal if this objective is eligible (sequential gating)
      if (!isObjectiveEligible(missionId, objDef.id)) continue

      const pos = plannedPoiPositions.get(poiId)
      if (!pos) continue

      // Always refresh compass / dwell list (static site-pois load can replace `pois` after first sync).
      upsertPoi({ id: poiId, label: pos.label, x: pos.x, z: pos.z, color: '#66ffee' })

      if (revealedPoiIds.has(poiId)) continue

      revealedPoiIds.add(poiId)
      const scene = siteHandle.value?.siteScene
      if (scene) {
        const groundY = scene.terrain.heightAt(pos.x, pos.z)
        addWaypointMarker(poiId, pos.x, pos.z, groundY, scene.scene)
      }
    }
  }

  // --- Helpers ---
  function getObjLabel(missionId: string, objectiveId: string): string {
    const def = getMissionDef(missionId)
    return def?.objectives.find((o) => o.id === objectiveId)?.label ?? ''
  }

  // --- Handlers ---
  function handleAcceptMission(missionId: string | undefined) {
    if (!missionId) return
    accept(missionId, marsSol.value)

    // Enable tutorial-short RTG durations for the RTG mission
    if (missionId === 'm04-rtg') setRtgTutorialMode(true)

    const def = getMissionDef(missionId)
    if (def) {
      seedGoToPoisForMission(missionId)
      spawnMissionGatherOrbitalDrops(missionId, false)
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

  function dismissNewlyUnlocked(instrumentId: string) {
    newlyUnlockedInstruments.value = newlyUnlockedInstruments.value.filter((id) => id !== instrumentId)
  }

  function handleUntrack() {
    trackedMissionId.value = null
  }

  // --- Watchers ---

  // Clean up completed POIs + reveal next eligible POIs
  watch(
    () => activeMissions.value.map((m) => m.objectives.map((o) => o.done)),
    () => {
      const scene = siteHandle.value?.siteScene
      for (const state of activeMissions.value) {
        const def = getMissionDef(state.missionId)
        if (!def) continue
        // Remove completed go-to POIs
        for (let i = 0; i < state.objectives.length; i++) {
          if (!state.objectives[i].done) continue
          const objDef = def.objectives[i]
          if (objDef?.type === 'go-to' && objDef.params.poiId) {
            removePoi(objDef.params.poiId)
            clearPoiArrival(objDef.params.poiId)
            revealedPoiIds.delete(objDef.params.poiId)
            if (scene) removeWaypointMarker(objDef.params.poiId, scene.scene)
          }
        }
        // Reveal newly eligible go-to POIs (next in sequence)
        revealEligiblePois(state.missionId)
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
          plannedPoiPositions.delete(obj.params.poiId)
          revealedPoiIds.delete(obj.params.poiId)
          if (scene) removeWaypointMarker(obj.params.poiId, scene.scene)
        }
      }
    }
    // Fire callback for newly completed missions + orbital drops for component item rewards
    if (curr.length > (prev?.length ?? 0)) {
      const newest = curr[curr.length - 1]
      if (newest.missionId === 'm04-rtg') setRtgTutorialMode(false)
      const def = getMissionDef(newest.missionId)
      if (def) {
        const unlockLabel = def.unlocks.length > 0 ? def.unlocks.join(', ').toUpperCase() : null
        deps.onMissionComplete?.(def.name, def.reward.sp ?? 0, unlockLabel)
        const orbitalStacks = rewardItemsForOrbitalDrop(def.reward)
        for (const stack of orbitalStacks) {
          const pos = resolveRandomOrbitalDropPosition(
            { x: roverWorldX.value, z: roverWorldZ.value },
            {},
          )
          try {
            siteHandle.value?.spawnOrbitalDropItem(stack.id, {
              quantity: stack.quantity,
              x: pos.x,
              z: pos.z,
            })
          } catch {
            /* scene not ready or invalid id */
          }
        }
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
    missionCompleted,

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
    newlyUnlockedInstruments,
    dismissNewlyUnlocked,
    syncActiveMissionsLayoutFromRover,
  }
}
