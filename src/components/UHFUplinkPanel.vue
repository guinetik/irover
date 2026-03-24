<template>
  <div
    class="uhf-panel"
    :class="{
      active: passActive && uhfEnabled,
      warning: passActive && !uhfEnabled,
    }"
  >
    <!-- State 1: UHF Disabled (no pass active) -->
    <template v-if="!uhfEnabled && !passActive">
      <div class="panel-title">UHF RELAY</div>
      <div class="status-row">
        <span class="status-label">STATUS:</span>
        <span class="status-value"> OFFLINE</span>
      </div>
      <div class="offline-hint">Enable UHF subsystem to<br />transmit during passes</div>
    </template>

    <!-- State 5: Pass active but UHF disabled -->
    <template v-else-if="passActive && !uhfEnabled">
      <div class="panel-title warning">&#x26A0; PASS ACTIVE</div>
      <div class="warning-text">{{ currentOrbiter }} overhead — UHF OFFLINE</div>
      <div class="offline-hint">Enable to transmit</div>
      <div class="window-row">
        <span class="status-label">Window:</span>
        <span class="countdown"> {{ formatSceneSeconds(windowRemainingSec) }} remaining</span>
      </div>
    </template>

    <!-- State 3: Pass active, transmitting -->
    <template v-else-if="passActive && uhfEnabled && transmitting">
      <div class="panel-title">&#x25B2; UHF UPLINK — {{ currentOrbiter }}</div>
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: `${transmissionProgress * 100}%` }"></div>
      </div>
      <div class="tx-queue-label">
        {{ transmittedThisPass }}/{{ transmittedThisPass + queueLength }} queued
      </div>
      <div class="tx-label">Transmitting: data</div>
      <div class="window-row">
        <span class="status-label">Window:</span>
        <span class="countdown"> {{ formatSceneSeconds(windowRemainingSec) }} remaining</span>
      </div>
    </template>

    <!-- State 4: Pass active, queue empty -->
    <template v-else-if="passActive && uhfEnabled && !transmitting">
      <div class="panel-title">&#x25B2; UHF UPLINK — {{ currentOrbiter }}</div>
      <div class="tx-idle">All data transmitted</div>
      <div class="tx-idle">Link idle</div>
      <div class="window-row">
        <span class="status-label">Window:</span>
        <span class="countdown"> {{ formatSceneSeconds(windowRemainingSec) }} remaining</span>
      </div>
    </template>

    <!-- State 2: UHF enabled, no active pass, waiting -->
    <template v-else>
      <div class="panel-title">UHF RELAY</div>
      <div class="status-row">
        <span class="status-label">STATUS:</span>
        <span class="status-value"> WAITING PASS</span>
      </div>
      <div class="next-pass-row">
        <span class="status-label">Next:</span>
        <span class="countdown"> {{ nextPassLabel }}</span>
      </div>
      <div class="queue-info">Queue: {{ queueLength }} pending</div>

      <div v-if="passes.length > 0" class="pass-schedule">
        <div class="pass-schedule-title">TODAY'S PASSES</div>
        <div
          v-for="pass in passes"
          :key="pass.id"
          class="pass-row"
          :class="passRowClass(pass)"
        >
          <span class="pass-orbiter">{{ pass.orbiter }}</span>
          <span class="pass-time">
            {{ formatTimeOfDay(pass.startTimeOfDay) }} — {{ formatTimeOfDay(pass.endTimeOfDay) }}
          </span>
          <span v-if="isNextPass(pass)" class="pass-next-indicator">&#x2190;</span>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  passActive: boolean
  transmitting: boolean
  currentOrbiter: string
  transmissionProgress: number
  queueLength: number
  windowRemainingSec: number
  nextPassInSec: number
  transmittedThisPass: number
  uhfEnabled: boolean
  passes: { id: string; orbiter: string; startTimeOfDay: number; endTimeOfDay: number }[]
}>()

function formatSceneSeconds(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatTimeOfDay(tod: number): string {
  const totalMinutes = tod * 1477
  const hours = Math.floor(totalMinutes / 60)
  const minutes = Math.floor(totalMinutes % 60)
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
}

const nextPassLabel = computed(() => {
  if (props.passes.length === 0) return `in ${formatSceneSeconds(props.nextPassInSec)}`
  // Find the next pass by finding the first one that hasn't started yet
  // We use nextPassInSec as authoritative; orbiter name comes from passes array if available
  const next = props.passes.find((p) => isNextPass(p))
  if (next) {
    return `${next.orbiter} in ${formatSceneSeconds(props.nextPassInSec)}`
  }
  return `in ${formatSceneSeconds(props.nextPassInSec)}`
})

function isNextPass(pass: { id: string; orbiter: string; startTimeOfDay: number; endTimeOfDay: number }): boolean {
  if (props.passes.length === 0) return false
  // The next pass is the one whose orbiter matches currentOrbiter when !passActive,
  // or more generically: we look at which pass index corresponds to the next upcoming one.
  // We identify the next pass as having the smallest startTimeOfDay among passes that
  // would be upcoming. Since we don't have current scene time directly, we use the
  // ordering of passes and pick the first one without a "past" indicator.
  // Delegate to passRowClass: the first non-past pass is the next one.
  const nonPastPasses = props.passes.filter((p) => !isPastPass(p))
  return nonPastPasses.length > 0 && nonPastPasses[0].id === pass.id
}

function isPastPass(pass: { startTimeOfDay: number; endTimeOfDay: number }): boolean {
  // A pass is considered past if it comes before the next pass in the list.
  // Without scene time, we use nextPassInSec: if nextPassInSec is large, earlier
  // passes in the list are past. We simply mark passes earlier in the array than
  // the next pass as past.
  const nonPassiveIdx = props.passes.findIndex((p) => !props.passActive || p.orbiter !== props.currentOrbiter)
  // Simplified heuristic: the next upcoming pass is determined by the position in the
  // sorted list. We find the first pass that would be "next" by index; everything
  // before it is past. Since passes are ordered by startTimeOfDay, if nextPassInSec
  // is > 0 and there is no active pass, the first pass in the list with the smallest
  // startTimeOfDay relative to now would be next. We assume passes are sorted ascending.
  // Mark passes before the first "non-past" as past. We check against all passes:
  // passes where ALL subsequent passes have startTimeOfDay >= currentPass.startTimeOfDay
  // and the first entry is the earliest.
  // Most practical: mark none as past here; let isNextPass pick the first.
  // Actually let's do a cleaner approach: sort by startTimeOfDay and the first one is next.
  const sorted = [...props.passes].sort((a, b) => a.startTimeOfDay - b.startTimeOfDay)
  const firstNonPastIndex = sorted.findIndex((p) => p.id === pass.id)
  const nextPassIndex = 0 // first sorted pass is next if no info
  return firstNonPastIndex < nextPassIndex
}

function passRowClass(pass: { id: string; orbiter: string; startTimeOfDay: number; endTimeOfDay: number }) {
  if (isNextPass(pass)) return 'next'
  if (isPastPass(pass)) return 'past'
  return ''
}
</script>

<style scoped>
.uhf-panel {
  width: 260px;
  background: rgba(10, 5, 2, 0.85);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(68, 255, 136, 0.2);
  border-radius: 8px;
  padding: 10px 14px;
  font-family: var(--font-ui);
  font-size: 11px;
}

.uhf-panel.active {
  border-color: rgba(68, 255, 136, 0.45);
  box-shadow: 0 0 12px rgba(68, 255, 136, 0.1);
}

.uhf-panel.warning {
  border-color: rgba(255, 180, 60, 0.45);
}

.panel-title {
  color: rgba(68, 255, 136, 0.85);
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  margin-bottom: 6px;
}

.panel-title.warning {
  color: rgba(255, 180, 60, 0.85);
}

.status-label {
  color: rgba(200, 200, 220, 0.5);
  font-size: 10px;
  letter-spacing: 0.08em;
}

.status-value {
  color: rgba(200, 200, 220, 0.9);
  font-family: var(--font-instrument);
}

.status-row {
  display: flex;
  align-items: baseline;
  margin-bottom: 4px;
}

.next-pass-row {
  display: flex;
  align-items: baseline;
  margin-top: 4px;
}

.window-row {
  display: flex;
  align-items: baseline;
  margin-top: 6px;
}

.countdown {
  color: rgba(68, 255, 136, 0.7);
  font-family: var(--font-instrument);
  font-size: 13px;
}

.queue-info {
  color: rgba(200, 200, 220, 0.5);
  font-size: 10px;
  margin-top: 4px;
}

.pass-schedule {
  margin-top: 8px;
  border-top: 1px solid rgba(68, 255, 136, 0.1);
  padding-top: 6px;
}

.pass-schedule-title {
  color: rgba(200, 200, 220, 0.4);
  font-size: 9px;
  letter-spacing: 0.1em;
  margin-bottom: 4px;
}

.pass-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 2px 0;
  color: rgba(200, 200, 220, 0.5);
  font-family: var(--font-instrument);
  font-size: 10px;
}

.pass-row.next {
  color: rgba(68, 255, 136, 0.8);
}

.pass-row.past {
  color: rgba(200, 200, 220, 0.25);
}

.pass-next-indicator {
  font-size: 9px;
  color: rgba(68, 255, 136, 0.6);
  margin-left: 4px;
}

.progress-bar {
  height: 4px;
  background: rgba(200, 200, 220, 0.1);
  border-radius: 2px;
  overflow: hidden;
  margin: 6px 0;
}

.progress-fill {
  height: 100%;
  background: rgba(68, 255, 136, 0.7);
  border-radius: 2px;
  transition: width 0.1s linear;
}

.tx-queue-label {
  color: rgba(200, 200, 220, 0.5);
  font-size: 10px;
  margin-bottom: 4px;
}

.tx-label {
  color: rgba(200, 200, 220, 0.6);
  font-size: 10px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tx-idle {
  color: rgba(68, 255, 136, 0.5);
  font-style: italic;
  font-size: 10px;
  margin-bottom: 2px;
}

.offline-hint {
  color: rgba(200, 200, 220, 0.35);
  font-size: 10px;
  margin-top: 8px;
}

.warning-text {
  color: rgba(255, 180, 60, 0.85);
  font-size: 10px;
  margin-bottom: 4px;
}
</style>
