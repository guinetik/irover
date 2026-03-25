<template>
  <Transition name="science-fade">
    <div v-if="mission && missionDef" class="mission-tracker">
      <div class="mt-header">
        <span class="mt-name">{{ missionDef.name }}</span>
        <button class="mt-unpin" @click="$emit('untrack')" title="Hide tracker">&#x2715;</button>
      </div>
      <ul class="mt-objectives">
        <li
          v-for="(obj, i) in mission.objectives"
          :key="obj.id"
          class="mt-obj"
          :class="{
            done: obj.done,
            dimmed: missionDef.objectives[i]?.sequential && !isEligible(obj.id),
          }"
        >
          <span class="mt-check">{{ obj.done ? '\u2611' : '\u2610' }}</span>
          <span class="mt-label">{{ missionDef.objectives[i]?.label }}</span>
        </li>
      </ul>

      <!-- Transmit section when all objectives done -->
      <div v-if="mission.status === 'awaiting-transmit'" class="mt-transmit">
        <div v-if="transmitProgress > 0" class="mt-tx-bar">
          <div class="mt-tx-fill" :style="{ width: transmitProgress * 100 + '%' }" />
        </div>
        <button
          v-else
          class="mt-tx-btn"
          :class="{ disabled: !lgaActive }"
          :disabled="!lgaActive"
          @click="$emit('transmit')"
        >
          {{ lgaActive ? 'TRANSMIT RESULTS' : 'ACTIVATE LGA TO TRANSMIT' }}
        </button>
      </div>

      <!-- POI dwell progress bar -->
      <div v-if="dwellPoiId && dwellProgress > 0 && dwellProgress < 1" class="mt-dwell">
        <span class="mt-dwell-label">ARRIVING...</span>
        <div class="mt-dwell-bar">
          <div class="mt-dwell-fill" :style="{ width: dwellProgress * 100 + '%' }" />
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import type { MissionState, MissionDef } from '@/types/missions'

defineProps<{
  mission: MissionState | null
  missionDef: MissionDef | null
  isEligible: (objectiveId: string) => boolean
  lgaActive: boolean
  transmitProgress: number
  dwellPoiId: string | null
  dwellProgress: number
}>()

defineEmits<{
  untrack: []
  transmit: []
}>()
</script>

<style scoped>
.mission-tracker {
  position: fixed;
  top: 58px;
  right: 12px;
  z-index: 40;
  width: 240px;
  max-height: 260px;
  background: rgba(10, 5, 2, 0.8);
  border: 1px solid rgba(196, 149, 106, 0.2);
  border-radius: 8px;
  backdrop-filter: blur(8px);
  padding: 10px 12px;
  overflow-y: auto;
}

.mt-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.mt-name {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: rgba(196, 149, 106, 0.9);
  text-transform: uppercase;
}

.mt-unpin {
  background: none;
  border: none;
  color: rgba(200, 200, 220, 0.4);
  font-size: 12px;
  cursor: pointer;
  padding: 2px 4px;
  line-height: 1;
}
.mt-unpin:hover { color: rgba(200, 200, 220, 0.8); }

.mt-objectives {
  list-style: none;
  margin: 0;
  padding: 0;
}

.mt-obj {
  display: flex;
  gap: 6px;
  align-items: flex-start;
  padding: 2px 0;
  font-size: 11px;
  color: rgba(200, 200, 220, 0.75);
  transition: opacity 0.2s;
}

.mt-obj.done { color: rgba(102, 255, 238, 0.6); }
.mt-obj.dimmed { opacity: 0.35; }

.mt-check {
  flex-shrink: 0;
  width: 14px;
  text-align: center;
}

.mt-label { line-height: 1.3; }

/* --- Transmit section --- */
.mt-transmit {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(196, 149, 106, 0.15);
}

.mt-tx-btn {
  width: 100%;
  padding: 6px 10px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  border: 1px solid rgba(102, 255, 238, 0.4);
  border-radius: 4px;
  background: rgba(102, 255, 238, 0.12);
  color: #66ffee;
  cursor: pointer;
}
.mt-tx-btn:hover:not(.disabled) {
  background: rgba(102, 255, 238, 0.22);
}
.mt-tx-btn.disabled {
  opacity: 0.4;
  cursor: not-allowed;
  color: rgba(200, 200, 220, 0.5);
  border-color: rgba(200, 200, 220, 0.15);
  background: rgba(200, 200, 220, 0.05);
}

.mt-tx-bar {
  height: 6px;
  border-radius: 3px;
  background: rgba(102, 255, 238, 0.1);
  overflow: hidden;
}
.mt-tx-fill {
  height: 100%;
  background: #66ffee;
  border-radius: 3px;
  transition: width 0.1s linear;
}

/* --- POI dwell progress --- */
.mt-dwell {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid rgba(196, 149, 106, 0.1);
}

.mt-dwell-label {
  font-size: 9px;
  letter-spacing: 0.1em;
  color: rgba(255, 204, 68, 0.7);
  text-transform: uppercase;
  display: block;
  margin-bottom: 3px;
}

.mt-dwell-bar {
  height: 4px;
  border-radius: 2px;
  background: rgba(255, 204, 68, 0.1);
  overflow: hidden;
}
.mt-dwell-fill {
  height: 100%;
  background: #ffcc44;
  border-radius: 2px;
  transition: width 0.1s linear;
}

.science-fade-enter-active,
.science-fade-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.science-fade-enter-from,
.science-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
