import type { ComputedRef, Ref } from 'vue'
import { solFractionFromMarsClockHours, sceneSecondsFromSolFraction, secondsPerSol } from '@/lib/missionTime'

import { AntennaLGController } from '@/three/instruments/AntennaLGController'
import { AntennaUHFController } from '@/three/instruments/AntennaUHFController'
import { useOrbitalPasses } from '@/composables/useOrbitalPasses'
import { useLGAMailbox } from '@/composables/useLGAMailbox'
import { useTransmissionQueue } from '@/composables/useTransmissionQueue'
import type { TransmissionQueueItem } from '@/types/transmissionQueue'
import type { SPGain } from '@/composables/useSciencePoints'
import type SampleToast from '@/components/SampleToast.vue'
import type { ProfileModifiers } from '@/composables/usePlayerProfile'
import { useDSNArchive } from '@/composables/useDSNArchive'
import type { DSNTransmission } from '@/types/dsnArchive'
import type { AudioPlaybackHandle } from '@/audio/audioTypes'
import type { SiteFrameContext, SiteTickHandler } from './SiteFrameContext'

export interface AntennaTickRefs {
  uhfPassActive: Ref<boolean>
  uhfTransmitting: Ref<boolean>
  uhfCurrentOrbiter: Ref<string>
  uhfTransmissionProgress: Ref<number>
  uhfQueueLength: Ref<number>
  uhfWindowRemainingSec: Ref<number>
  uhfNextPassInSec: Ref<number>
  uhfTransmittedThisPass: Ref<number>
  lgaUnreadCount: Ref<number> | ComputedRef<number>
  passiveUiRevision: Ref<number>
}

export interface AntennaTickCallbacks {
  sampleToastRef: Ref<InstanceType<typeof SampleToast> | null>
  awardTransmission: (archiveId: string, baseSP: number, label: string) => SPGain | null
  playerMod: (key: keyof ProfileModifiers) => number
  onDSNTransmissionsReceived?: (transmissions: DSNTransmission[]) => void
  playUhfLock: () => void
  startUhfUplinkLoop: () => AudioPlaybackHandle
  playLgaUplink: () => void
}

/**
 * Creates a tick handler for the antenna subsystems:
 * - LGA heartbeat: sends daily heartbeat at 0800, receives incoming messages
 * - UHF transmission: detects orbital passes, auto-transmits queued discoveries, awards bonus SP
 */
export function createAntennaTickHandler(
  refs: AntennaTickRefs,
  callbacks: AntennaTickCallbacks,
): SiteTickHandler {
  const orbitalPasses = useOrbitalPasses()
  const mailbox = useLGAMailbox()
  const txQueue = useTransmissionQueue()

  // --- Internal state (closure variables) ---
  let lastLgaSol = -1
  let lastUhfPassId = ''
  let currentTxItem: TransmissionQueueItem | null = null
  let currentTxElapsed = 0
  let passNotifiedMissed = false
  let uhfUplinkPlayback: AudioPlaybackHandle | null = null
  let lastLgaUnreadCount = 0

  // --- LGA Tick ---
  function tickLGA(fctx: SiteFrameContext): void {
    const lgaCtrl = fctx.rover?.instruments.find(i => i.id === 'antenna-lg') as AntennaLGController | undefined
    if (!lgaCtrl || !fctx.roverReady) return

    // Update link status
    lgaCtrl.linkStatus = lgaCtrl.passiveSubsystemEnabled ? 'LINKED' : 'OFF'
    lgaCtrl.accuracyMod = callbacks.playerMod('instrumentAccuracy')

    // Always sync unread count (mission pushMessage can add messages while LGA is off)
    lgaCtrl.unreadCount = mailbox.unreadCount.value

    if (!lgaCtrl.passiveSubsystemEnabled) return

    const { marsSol, marsTimeOfDay } = fctx
    const HEARTBEAT_TIME = solFractionFromMarsClockHours(8) // 0800

    // Heartbeat: send once per sol when timeOfDay crosses 0800
    if (marsSol !== lastLgaSol) {
      lgaCtrl.heartbeatSentThisSol = false
      lastLgaSol = marsSol
    }

    if (!lgaCtrl.heartbeatSentThisSol && marsTimeOfDay >= HEARTBEAT_TIME) {
      mailbox.sendHeartbeat(marsSol)
      lgaCtrl.heartbeatSentThisSol = true
      lgaCtrl.lastHeartbeatSol = marsSol
      callbacks.sampleToastRef.value?.showComm?.(`Heartbeat sent — Sol ${marsSol}`)
    }

    // Incoming messages are now delivered by the mission system via pushMessage().
    // The old deterministic test messages (receiveMessage / hasIncomingMessage) are removed.

    // Detect new incoming messages and play LGA uplink sound
    const currentUnread = mailbox.unreadCount.value
    if (currentUnread > lastLgaUnreadCount) {
      callbacks.playLgaUplink()
    }
    lastLgaUnreadCount = currentUnread

    // Update controller state
    lgaCtrl.unreadCount = currentUnread
  }

  // --- UHF Tick ---
  function tickUHF(fctx: SiteFrameContext): void {
    const uhfCtrl = fctx.rover?.instruments.find(i => i.id === 'antenna-uhf') as AntennaUHFController | undefined
    if (!uhfCtrl || !fctx.roverReady) return

    // Update link status
    uhfCtrl.linkStatus = uhfCtrl.passiveSubsystemEnabled
      ? (uhfCtrl.passActive ? 'RELAY LOCK' : 'WAITING PASS')
      : 'OFF'
    uhfCtrl.accuracyMod = callbacks.playerMod('instrumentAccuracy')

    const { marsSol, marsTimeOfDay, sceneDelta } = fctx
    const activePass = orbitalPasses.getActivePass(marsSol, marsTimeOfDay)
    const nextPass = orbitalPasses.getNextPass(marsSol, marsTimeOfDay)

    // Detect pass start
    if (activePass && lastUhfPassId !== activePass.id) {
      lastUhfPassId = activePass.id
      uhfCtrl.passActive = true
      uhfCtrl.currentOrbiter = activePass.orbiter
      uhfCtrl.relayOrbiter = activePass.orbiter
      uhfCtrl.transmittedThisPass = 0
      currentTxItem = null
      currentTxElapsed = 0
      passNotifiedMissed = false

      if (uhfCtrl.passiveSubsystemEnabled) {
        callbacks.sampleToastRef.value?.showComm?.(`Orbital pass — ${activePass.orbiter} in range`)
        callbacks.playUhfLock()
      }
    }

    // Detect pass end
    if (!activePass && uhfCtrl.passActive) {
      if (uhfCtrl.transmittedThisPass > 0) {
        callbacks.sampleToastRef.value?.showComm?.(`${uhfCtrl.transmittedThisPass} discoveries transmitted`)
      }

      // Pull DSN archaeology transmissions at end of pass (received via LGA)
      const { unlocked: dsnUnlocked, pullTransmissions: dsnPull } = useDSNArchive()
      const lgaCtrl = fctx.rover?.instruments.find(i => i.id === 'antenna-lg') as AntennaLGController | undefined
      if (dsnUnlocked.value && lgaCtrl?.passiveSubsystemEnabled && uhfCtrl.passiveSubsystemEnabled) {
        const pulled = dsnPull(marsSol)
        if (pulled.length > 0) {
          callbacks.onDSNTransmissionsReceived?.(pulled)
        }
      }

      uhfCtrl.passActive = false
      uhfCtrl.transmitting = false
      uhfCtrl.transmissionProgress = 0
      uhfCtrl.currentOrbiter = ''
      currentTxItem = null
      currentTxElapsed = 0
      lastUhfPassId = ''
    }

    // During active pass with UHF on: transmit
    if (activePass && uhfCtrl.passiveSubsystemEnabled) {
      // Calculate window remaining
      const windowFractionRemaining = activePass.endTimeOfDay - marsTimeOfDay
      uhfCtrl.windowRemainingSec = sceneSecondsFromSolFraction(windowFractionRemaining)

      // Pick next item if not currently transmitting
      if (!currentTxItem) {
        const q = txQueue.queue.value
        if (q.length > 0) {
          currentTxItem = q[0]
          currentTxElapsed = 0
          uhfCtrl.transmitting = true
        } else {
          uhfCtrl.transmitting = false
        }
      }

      // Progress current item
      if (currentTxItem) {
        currentTxElapsed += sceneDelta
        const effectiveBandwidth = currentTxItem.bandwidthSec / (callbacks.playerMod('instrumentAccuracy') * Math.max(0.1, uhfCtrl.durabilityFactor))
        uhfCtrl.transmissionProgress = Math.min(1, currentTxElapsed / effectiveBandwidth)

        // Item complete
        if (currentTxElapsed >= effectiveBandwidth) {
          txQueue.markTransmitted(currentTxItem)
          const gain = callbacks.awardTransmission(currentTxItem.archiveId, currentTxItem.originalSP, currentTxItem.label)
          if (gain) {
            callbacks.sampleToastRef.value?.showSP?.(gain.amount, 'TRANSMISSION', gain.bonus)
          }
          uhfCtrl.rollUsageDecay()
          uhfCtrl.transmittedThisPass++
          currentTxItem = null
          currentTxElapsed = 0
          uhfCtrl.transmissionProgress = 0
        }
      }
    }

    // During pass but UHF off: warn once
    if (activePass && !uhfCtrl.passiveSubsystemEnabled && !passNotifiedMissed) {
      callbacks.sampleToastRef.value?.showComm?.('Pass active — UHF offline')
      passNotifiedMissed = true
    }

    // UHF uplink sound: loop while transmitting, stop otherwise
    if (uhfCtrl.transmitting) {
      uhfUplinkPlayback ??= callbacks.startUhfUplinkLoop()
    } else if (uhfUplinkPlayback) {
      uhfUplinkPlayback.stop()
      uhfUplinkPlayback = null
    }

    // Update refs for UI
    refs.uhfPassActive.value = uhfCtrl.passActive
    refs.uhfTransmitting.value = uhfCtrl.transmitting
    refs.uhfCurrentOrbiter.value = uhfCtrl.currentOrbiter
    refs.uhfTransmissionProgress.value = uhfCtrl.transmissionProgress
    refs.uhfQueueLength.value = txQueue.totalPendingCount.value
    refs.uhfWindowRemainingSec.value = uhfCtrl.windowRemainingSec
    refs.uhfTransmittedThisPass.value = uhfCtrl.transmittedThisPass

    // Next pass countdown
    if (nextPass && !activePass) {
      const fractionUntil = nextPass.startTimeOfDay - marsTimeOfDay
      uhfCtrl.nextPassInSec = sceneSecondsFromSolFraction(fractionUntil)
      refs.uhfNextPassInSec.value = uhfCtrl.nextPassInSec
    } else {
      uhfCtrl.nextPassInSec = 0
      refs.uhfNextPassInSec.value = 0
    }
  }

  // --- Main tick ---
  function tick(fctx: SiteFrameContext): void {
    tickLGA(fctx)
    tickUHF(fctx)
  }

  function dispose(): void {
    uhfUplinkPlayback?.stop()
    uhfUplinkPlayback = null
  }

  return { tick, dispose }
}
