import { ref, computed } from 'vue'
import type { MissionCatalog, MissionDef, MissionState, ObjectiveState } from '@/types/missions'
import { checkObjective, registerChecker, type CheckerContext } from './useObjectiveTrackers'
import { useLGAMailbox } from './useLGAMailbox'
import { useSciencePoints } from './useSciencePoints'
import { useInventory } from './useInventory'
import { useChemCamArchive } from './useChemCamArchive'
import { useDanArchive } from './useDanArchive'
import { useSamArchive } from './useSamArchive'
import { useAPXSArchive } from './useAPXSArchive'
import { INVENTORY_CATALOG } from '@/types/inventory'
import { getMastCamTagCount, getTotalMastCamTags } from './useMastCamTags'

const STORAGE_KEY = 'mars-missions-v1'

// --- Singleton state ---
const catalog = ref<MissionDef[]>([])
const missionStates = ref<MissionState[]>(loadFromStorage())
const trackedMissionId = ref<string | null>(null)

function loadFromStorage(): MissionState[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
  } catch {
    return []
  }
}

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(missionStates.value))
  } catch { /* quota / private mode */ }
}

// --- Derived ---
const activeMissions = computed(() =>
  missionStates.value.filter((s) => s.status === 'active' || s.status === 'awaiting-transmit'),
)

const awaitingTransmit = computed(() =>
  missionStates.value.filter((s) => s.status === 'awaiting-transmit'),
)

const completedMissions = computed(() =>
  missionStates.value.filter((s) => s.status === 'completed'),
)

const unlockedInstruments = computed(() => {
  const ids: string[] = []
  for (const state of completedMissions.value) {
    const def = getMissionDef(state.missionId)
    if (def) {
      for (const u of def.unlocks) {
        if (!ids.includes(u)) ids.push(u)
      }
    }
  }
  return ids
})

// --- Helpers ---
function getMissionDef(missionId: string): MissionDef | undefined {
  return catalog.value.find((m) => m.id === missionId)
}

function getMissionState(missionId: string): MissionState | undefined {
  return missionStates.value.find((s) => s.missionId === missionId)
}

// --- Core API ---
function loadCatalog(data: MissionCatalog): void {
  catalog.value = data.missions
}

function accept(missionId: string, currentSol: number): void {
  const def = getMissionDef(missionId)
  if (!def) return
  // Don't accept duplicates
  if (missionStates.value.some((s) => s.missionId === missionId)) return

  const objectives: ObjectiveState[] = def.objectives.map((o) => ({
    id: o.id,
    done: false,
  }))

  const state: MissionState = {
    missionId,
    status: 'active',
    acceptedAtSol: currentSol,
    objectives,
  }

  missionStates.value = [...missionStates.value, state]
  persist()

  // Auto-track if this is the only active mission
  const active = missionStates.value.filter((s) => s.status === 'active')
  if (active.length === 1) {
    trackedMissionId.value = missionId
  }
}

function markObjectiveDone(missionId: string, objectiveId: string): void {
  const state = getMissionState(missionId)
  if (!state || state.status !== 'active') return

  const obj = state.objectives.find((o) => o.id === objectiveId)
  if (!obj || obj.done) return

  obj.done = true
  // Trigger reactivity
  missionStates.value = [...missionStates.value]
  persist()
}

function complete(missionId: string, currentSol: number): void {
  const idx = missionStates.value.findIndex((s) => s.missionId === missionId)
  if (idx === -1) return

  const state = missionStates.value[idx]
  if (state.status !== 'active' && state.status !== 'awaiting-transmit') return

  // Mark all objectives done
  for (const obj of state.objectives) {
    obj.done = true
  }

  state.status = 'completed'
  state.completedAtSol = currentSol

  // Trigger reactivity
  missionStates.value = [...missionStates.value]
  persist()

  // Clear tracked if this was the tracked mission
  if (trackedMissionId.value === missionId) {
    const remaining = missionStates.value.filter((s) => s.status === 'active')
    trackedMissionId.value = remaining.length === 1 ? remaining[0].missionId : null
  }

  const def = getMissionDef(missionId)
  if (!def) return

  // Award SP
  if (def.reward.sp) {
    const { awardSurvival } = useSciencePoints()
    awardSurvival('mission:' + missionId, def.reward.sp)
  }

  // Grant item rewards
  if (def.reward.items && def.reward.items.length > 0) {
    const { addComponent } = useInventory()
    for (const item of def.reward.items) {
      addComponent(item.id, item.quantity)
    }
  }

  // Deliver chained mission via mailbox after 3s delay
  if (def.chain) {
    const chainId = def.chain
    const chainDef = getMissionDef(chainId)
    const { pushMessage } = useLGAMailbox()
    setTimeout(() => {
      pushMessage({
        direction: 'received',
        sol: currentSol,
        timeOfDay: 0.5,
        subject: chainDef ? `New Mission: ${chainDef.name}` : `New Mission Available`,
        body: chainDef?.briefing ?? 'A new mission has been transmitted from Mission Control.',
        type: 'mission',
        from: chainDef?.patron ?? 'Mission Control',
        missionId: chainId,
      })
    }, 3000)
  }
}

function isObjectiveEligible(missionId: string, objectiveId: string): boolean {
  const def = getMissionDef(missionId)
  const state = getMissionState(missionId)
  if (!def || !state || state.status !== 'active') return false

  const objDefIdx = def.objectives.findIndex((o) => o.id === objectiveId)
  if (objDefIdx === -1) return false

  const objDef = def.objectives[objDefIdx]
  if (!objDef.sequential) return true

  // For sequential objectives, all prior sequential objectives must be done
  for (let i = 0; i < objDefIdx; i++) {
    const priorDef = def.objectives[i]
    if (priorDef.sequential) {
      const priorState = state.objectives.find((o) => o.id === priorDef.id)
      if (!priorState || !priorState.done) return false
    }
  }
  return true
}

function checkAllObjectives(
  roverX: number,
  roverZ: number,
  pois: CheckerContext['pois'],
  currentSol: number,
): void {
  const ctx: CheckerContext = { roverX, roverZ, pois }

  for (const state of activeMissions.value) {
    const def = getMissionDef(state.missionId)
    if (!def) continue

    let allDone = true
    for (const objState of state.objectives) {
      if (objState.done) continue

      if (!isObjectiveEligible(state.missionId, objState.id)) {
        allDone = false
        continue
      }

      const objDef = def.objectives.find((o) => o.id === objState.id)
      if (!objDef) {
        allDone = false
        continue
      }

      const passed = checkObjective(objDef.type, objDef.params, ctx)
      if (passed) {
        markObjectiveDone(state.missionId, objState.id)
      } else {
        allDone = false
      }
    }

    if (allDone && state.status === 'active') {
      // All objectives done — await LGA transmission to complete
      state.status = 'awaiting-transmit'
      missionStates.value = [...missionStates.value]
      persist()
    }
  }
}

/**
 * Transmit mission completion via LGA. Called when player activates transmit
 * on a mission in awaiting-transmit state. Returns true if transmission started.
 */
const transmitting = ref<string | null>(null) // missionId currently transmitting
const transmitProgress = ref(0)

function startTransmitCompletion(missionId: string, currentSol: number): boolean {
  const state = getMissionState(missionId)
  if (!state || state.status !== 'awaiting-transmit') return false
  if (transmitting.value) return false // already transmitting

  transmitting.value = missionId
  transmitProgress.value = 0
  return true
}

function tickTransmit(dt: number, currentSol: number): void {
  if (!transmitting.value) return
  transmitProgress.value = Math.min(transmitProgress.value + dt / 2, 1) // 2 second transmit
  if (transmitProgress.value >= 1) {
    const missionId = transmitting.value
    transmitting.value = null
    transmitProgress.value = 0

    // Send completion report to outbox
    const def = getMissionDef(missionId)
    if (def) {
      const { pushMessage } = useLGAMailbox()
      pushMessage({
        direction: 'sent',
        sol: currentSol,
        timeOfDay: 0.5,
        subject: `MISSION COMPLETE: ${def.name}`,
        body: `All objectives fulfilled. Transmitting results to Mission Control for ${def.reward.sp ?? 0} SP.`,
        type: 'info',
        from: 'Rover',
      })
    }

    complete(missionId, currentSol)
  }
}

function wireArchiveCheckers(): void {
  const { stacks } = useInventory()
  const { spectra } = useChemCamArchive()
  const { prospects } = useDanArchive()
  const { discoveries } = useSamArchive()
  const { analyses } = useAPXSArchive()

  // gather: count items in inventory
  // itemId "rock-sample" is special — matches any rock-category item
  registerChecker('gather', (p) => {
    if (p.itemId === 'rock-sample') {
      const rockCount = stacks.value
        .filter((s) => INVENTORY_CATALOG[s.itemId]?.category === 'rock')
        .reduce((sum, s) => sum + s.quantity, 0)
      return rockCount >= (p.quantity ?? 1)
    }
    if (p.itemId) {
      const stack = stacks.value.find((s) => s.itemId === p.itemId)
      return (stack?.quantity ?? 0) >= (p.quantity ?? 1)
    }
    return false
  })

  // chemcam: count spectra matching rock type ('any' matches all)
  registerChecker('chemcam', (p) => {
    const matching = spectra.value.filter((s) => {
      if (p.rockType && p.rockType !== 'any' && s.rockType !== p.rockType) return false
      return true
    })
    return matching.length >= (p.count ?? 1)
  })

  // dan-prospect: check for confirmed water with signal strength threshold
  registerChecker('dan-prospect', (p) => {
    const threshold = p.signalStrength ?? 0
    const matching = prospects.value.filter(
      (d) => d.waterConfirmed && d.signalStrength >= threshold,
    )
    return matching.length >= (p.count ?? 1)
  })

  // sam-experiment: check for discoveries with matching mode
  registerChecker('sam-experiment', (p) => {
    const matching = discoveries.value.filter((d) => {
      if (p.mode && p.mode !== 'any' && d.modeId !== p.mode) return false
      return true
    })
    return matching.length >= (p.count ?? 1)
  })

  // apxs: count analyses matching rock type
  registerChecker('apxs', (p) => {
    const matching = analyses.value.filter((a) => {
      if (p.rockType && p.rockType !== 'any' && a.rockType !== p.rockType) return false
      return true
    })
    return matching.length >= (p.count ?? 1)
  })

  // transmit: count transmitted items across all archives
  registerChecker('transmit', (p) => {
    let count = 0
    if (!p.archive || p.archive === 'chemcam') {
      count += spectra.value.filter((s) => s.transmitted).length
    }
    if (!p.archive || p.archive === 'dan') {
      count += prospects.value.filter((d) => d.transmitted).length
    }
    if (!p.archive || p.archive === 'sam') {
      count += discoveries.value.filter((d) => d.transmitted).length
    }
    if (!p.archive || p.archive === 'apxs') {
      count += analyses.value.filter((a) => a.transmitted).length
    }
    return count >= (p.count ?? 1)
  })

  // mastcam-tag: count tagged rocks by type
  registerChecker('mastcam-tag', (p) => {
    if (p.rockType === 'any') return getTotalMastCamTags() >= (p.count ?? 1)
    return getMastCamTagCount(p.rockType) >= (p.count ?? 1)
  })

  // rtg-overdrive: flag set externally when player triggers overdrive
  registerChecker('rtg-overdrive', () => rtgOverdriveTriggered.value)

  // rtg-shunt: flag set externally when player activates power shunt
  registerChecker('rtg-shunt', () => rtgShuntTriggered.value)

  // rems-activate: flag set externally when player turns on REMS
  registerChecker('rems-activate', () => remsActivated.value)

  // use-repair-kit: flag set externally when player completes a repair
  registerChecker('use-repair-kit', () => repairKitUsed.value)

  // install-upgrade: check if a specific instrument has been upgraded
  registerChecker('install-upgrade', (p) => {
    if (p.instrumentId) return upgradedInstruments.value.has(p.instrumentId)
    return upgradedInstruments.value.size > 0
  })

  // dsn-firmware-install: flag set externally when player installs DSN firmware
  registerChecker('dsn-firmware-install', () => dsnFirmwareInstalled.value)
}

/** Set to true when the player activates RTG overdrive (called from view layer). */
const rtgOverdriveTriggered = ref(false)
const rtgShuntTriggered = ref(false)
const remsActivated = ref(false)
const repairKitUsed = ref(false)
const upgradedInstruments = ref<Set<string>>(new Set())
const dsnFirmwareInstalled = ref(false)

function notifyRtgOverdrive(): void {
  rtgOverdriveTriggered.value = true
}

function notifyRtgShunt(): void {
  rtgShuntTriggered.value = true
}

function notifyRemsActivated(): void {
  remsActivated.value = true
}

function notifyRepairKitUsed(): void {
  repairKitUsed.value = true
}

function notifyDsnFirmwareInstalled(): void {
  dsnFirmwareInstalled.value = true
}

function notifyUpgradeInstalled(instrumentId: string): void {
  const next = new Set(upgradedInstruments.value)
  next.add(instrumentId)
  upgradedInstruments.value = next
}

function resetForTests(): void {
  rtgOverdriveTriggered.value = false
  rtgShuntTriggered.value = false
  remsActivated.value = false
  repairKitUsed.value = false
  upgradedInstruments.value = new Set()
  dsnFirmwareInstalled.value = false
  catalog.value = []
  missionStates.value = []
  trackedMissionId.value = null
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
}

export function useMissions() {
  return {
    catalog,
    missionStates,
    trackedMissionId,
    activeMissions,
    awaitingTransmit,
    completedMissions,
    unlockedInstruments,
    transmitting,
    transmitProgress,
    loadCatalog,
    accept,
    markObjectiveDone,
    complete,
    isObjectiveEligible,
    checkAllObjectives,
    startTransmitCompletion,
    tickTransmit,
    wireArchiveCheckers,
    notifyRtgOverdrive,
    notifyRtgShunt,
    notifyRemsActivated,
    notifyRepairKitUsed,
    notifyDsnFirmwareInstalled,
    notifyUpgradeInstalled,
    getMissionDef,
    resetForTests,
  }
}
