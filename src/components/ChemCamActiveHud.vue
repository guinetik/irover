<script setup lang="ts">
/**
 * Top strip + progress when ChemCam is in active instrument mode (slot 2).
 * Parent controls visibility with `v-if`; emits when the player opens spectrum results.
 */
defineProps<{
  shotsRemaining: number
  shotsMax: number
  phase: string
  phaseLabel: string
  progressPct: number
  unreadCount: number
}>()

const emit = defineEmits<{
  seeResults: []
}>()

function progressFillClass(phase: string): string {
  return phase.toLowerCase().replace('_', '-')
}
</script>

<template>
  <div class="chemcam-hud">
    <div class="cc-strip">
      <span class="cc-label">CHEMCAM</span>
      <span class="cc-divider">|</span>
      <span class="cc-shots"><span class="font-instrument">{{ shotsRemaining }}/{{ shotsMax }}</span> SHOTS</span>
      <span class="cc-divider">|</span>
      <span class="cc-phase" :class="phase.toLowerCase()">{{ phaseLabel }}</span>
      <span class="cc-divider">|</span>
      <span class="cc-hint">A/D pan · W/S tilt · Scroll zoom · hold E fire</span>
    </div>
    <div v-if="phase === 'PULSE_TRAIN' || phase === 'INTEGRATING'" class="cc-progress-bar">
      <div
        class="cc-progress-fill"
        :class="progressFillClass(phase)"
        :style="{ width: progressPct + '%' }"
      />
      <span class="cc-progress-label">{{ phase === 'PULSE_TRAIN' ? 'FIRING...' : 'INTEGRATING...' }}</span>
    </div>
    <Transition name="deploy-fade">
      <div v-if="unreadCount > 0" class="cc-results-row">
        <span class="cc-results-hint">SPECTRUM READY</span>
        <button
          type="button"
          class="cc-btn-see-results"
          @click="emit('seeResults')"
        >
          SEE RESULTS <span class="cc-results-badge font-instrument">{{ unreadCount }}</span>
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* ChemCam HUD — above InstrumentToolbar (toolbar bottom: 24px, ~4.5rem tall) */
.chemcam-hud {
  position: fixed;
  bottom: calc(24px + 4.5rem + 10px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 43;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  pointer-events: none;
}

.cc-strip {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(10, 5, 2, 0.75);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(100, 200, 230, 0.3);
  border-radius: 6px;
  padding: 5px 14px;
  font-family: var(--font-ui);
  font-size: 11px;
  letter-spacing: 0.1em;
}

.cc-label {
  color: #66ffee;
  font-weight: bold;
}

.cc-divider {
  color: rgba(100, 200, 230, 0.25);
}

.cc-shots {
  color: #e8c8a0;
}

.cc-phase {
  color: #66ffee;
  font-weight: bold;
}

.cc-phase.pulse_train,
.cc-phase.pulse-train {
  color: #ff6644;
  animation: cc-blink 0.15s infinite alternate;
}

.cc-phase.integrating {
  color: #ffcc44;
}

.cc-phase.ready {
  color: #44ff88;
}

.cc-hint {
  color: rgba(100, 200, 230, 0.4);
  font-size: 11px;
}

.cc-progress-bar {
  width: 200px;
  height: 4px;
  background: rgba(0, 0, 0, 0.4);
  border-radius: 2px;
  overflow: hidden;
  position: relative;
}

.cc-progress-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.1s linear;
}

.cc-progress-fill.pulse-train {
  background: linear-gradient(90deg, #ff6644, #ff4422);
}

.cc-progress-fill.integrating {
  background: linear-gradient(90deg, #ffcc44, #66ffee);
}

.cc-progress-label {
  position: absolute;
  top: 6px;
  left: 50%;
  transform: translateX(-50%);
  font-family: var(--font-ui);
  font-size: 11px;
  color: #66ffee;
  letter-spacing: 0.15em;
}

@keyframes cc-blink {
  from {
    opacity: 0.6;
  }
  to {
    opacity: 1;
  }
}

.cc-results-row {
  display: flex;
  align-items: center;
  gap: 10px;
  pointer-events: auto;
}

.cc-results-hint {
  font-family: var(--font-ui);
  font-size: 11px;
  letter-spacing: 0.18em;
  color: #44ff88;
}

.cc-btn-see-results {
  padding: 6px 12px;
  background: rgba(102, 255, 238, 0.12);
  border: 1px solid rgba(102, 255, 238, 0.4);
  border-radius: 6px;
  color: #66ffee;
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: bold;
  letter-spacing: 0.12em;
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.cc-btn-see-results:hover {
  background: rgba(102, 255, 238, 0.2);
  border-color: rgba(102, 255, 238, 0.6);
}

.cc-results-badge {
  display: inline-block;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  background: #66ffee;
  color: #0a0502;
  border-radius: 7px;
  font-size: 11px;
  font-weight: bold;
  line-height: 14px;
  text-align: center;
}
</style>
