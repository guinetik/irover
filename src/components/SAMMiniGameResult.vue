<template>
  <Transition name="res-fade">
    <div v-if="visible" class="res-overlay">
      <div class="res-card">
        <div class="res-status" :style="{ color: statusColor }">{{ statusLabel }}</div>
        <div class="res-quality-ring">
          <svg viewBox="0 0 80 80" class="res-ring-svg">
            <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(196,117,58,0.1)" stroke-width="4" />
            <circle cx="40" cy="40" r="34" fill="none" :stroke="statusColor" stroke-width="4"
              stroke-linecap="round" :stroke-dasharray="ringDash" stroke-dashoffset="0"
              transform="rotate(-90 40 40)" />
          </svg>
          <div class="res-quality-num font-instrument">{{ quality }}%</div>
        </div>
        <div class="res-verdict">{{ verdict }}</div>
        <button class="res-continue" @click="emit('continue')">
          CONTINUE
        </button>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  visible: boolean
  quality: number
}>()

const emit = defineEmits<{
  continue: []
}>()

const statusColor = computed(() =>
  props.quality >= 70 ? '#5dc9a5'
    : props.quality >= 40 ? '#ef9f27'
      : '#e05030',
)

const statusLabel = computed(() =>
  props.quality === 0 ? 'EXPERIMENT FAILED'
    : props.quality >= 80 ? 'EXCELLENT ANALYSIS'
      : props.quality >= 60 ? 'GOOD ANALYSIS'
        : props.quality >= 40 ? 'FAIR ANALYSIS'
          : 'POOR ANALYSIS',
)

const verdict = computed(() =>
  props.quality === 0 ? 'Quality dropped to zero — no usable data was recovered.'
    : props.quality >= 80 ? 'High-fidelity data captured. Strong discovery potential.'
      : props.quality >= 60 ? 'Solid data with minor noise. Adequate for most analyses.'
        : props.quality >= 40 ? 'Noisy results. Discovery odds reduced.'
          : 'Marginal data quality. Low chance of significant findings.',
)

const ringDash = computed(() => {
  const circ = 2 * Math.PI * 34
  const filled = (props.quality / 100) * circ
  return `${filled} ${circ - filled}`
})
</script>

<style scoped>
.res-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(5, 3, 1, 0.88);
  backdrop-filter: blur(4px);
}

.res-card {
  max-width: 340px;
  padding: 28px 36px;
  background: rgba(15, 10, 6, 0.95);
  border: 1px solid rgba(196, 117, 58, 0.25);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.res-status {
  font-family: var(--font-ui);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.2em;
}

.res-quality-ring {
  position: relative;
  width: 80px;
  height: 80px;
}

.res-ring-svg {
  width: 100%;
  height: 100%;
}

.res-quality-num {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: bold;
  color: #e8a060;
}

.res-verdict {
  font-family: var(--font-ui);
  font-size: 11px;
  color: rgba(196, 117, 58, 0.55);
  text-align: center;
  line-height: 1.5;
  letter-spacing: 0.03em;
  max-width: 280px;
}

.res-continue {
  margin-top: 4px;
  padding: 10px 36px;
  background: rgba(196, 117, 58, 0.15);
  border: 1px solid rgba(196, 117, 58, 0.4);
  border-radius: 6px;
  color: #e8a060;
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.2em;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s;
}

.res-continue:hover {
  background: rgba(196, 117, 58, 0.25);
  border-color: rgba(196, 117, 58, 0.6);
}

.res-fade-enter-active,
.res-fade-leave-active {
  transition: opacity 0.3s ease;
}
.res-fade-enter-from,
.res-fade-leave-to {
  opacity: 0;
}
</style>
