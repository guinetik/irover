<template>
  <div class="compass-strip">
    <div class="compass-track" :style="{ transform: `translateX(${offset}px)` }">
      <div v-for="tick in ticks" :key="tick.deg" class="tick" :class="{ cardinal: tick.cardinal, major: tick.major }">
        <div class="tick-line" />
        <span v-if="tick.label" class="tick-label">{{ tick.label }}</span>
      </div>
    </div>
    <div class="compass-pointer" />
    <div class="heading-readout font-instrument">{{ headingDeg }}&deg;</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ heading: number }>()

const TICK_SPACING = 4 // px per degree
const LABELS: Record<number, string> = {
  0: 'N', 45: 'NE', 90: 'E', 135: 'SE',
  180: 'S', 225: 'SW', 270: 'W', 315: 'NW',
}

const headingDeg = computed(() => {
  return Math.round((((-props.heading * 180 / Math.PI) % 360) + 360) % 360)
})

const offset = computed(() => {
  return -headingDeg.value * TICK_SPACING
})

// Generate 720° of ticks (full wrap + extra for seamless scroll)
const ticks = computed(() => {
  const result = []
  for (let d = -180; d <= 540; d += 5) {
    const normalized = ((d % 360) + 360) % 360
    result.push({
      deg: d,
      cardinal: normalized % 90 === 0,
      major: normalized % 45 === 0,
      label: LABELS[normalized] || (normalized % 30 === 0 ? `${normalized}` : null),
    })
  }
  return result
})
</script>

<style scoped>
.compass-strip {
  position: fixed;
  top: 56px;
  left: 50%;
  transform: translateX(-50%);
  width: 320px;
  height: 36px;
  overflow: hidden;
  z-index: 30;
  pointer-events: none;
  background: rgba(10, 5, 2, 0.5);
  backdrop-filter: blur(6px);
  border: 1px solid rgba(196, 117, 58, 0.2);
  border-radius: 4px;
  /* Fade edges */
  mask-image: linear-gradient(to right, transparent 0%, black 20%, black 80%, transparent 100%);
  -webkit-mask-image: linear-gradient(to right, transparent 0%, black 20%, black 80%, transparent 100%);
}

.compass-track {
  position: absolute;
  top: 0;
  left: 50%;
  display: flex;
  height: 100%;
  align-items: flex-start;
  will-change: transform;
}

.tick {
  width: 20px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 4px;
}

.tick-line {
  width: 1px;
  height: 8px;
  background: rgba(196, 117, 58, 0.2);
}

.tick.major .tick-line {
  height: 12px;
  background: rgba(196, 117, 58, 0.4);
}

.tick.cardinal .tick-line {
  height: 14px;
  width: 1.5px;
  background: rgba(196, 117, 58, 0.7);
}

.tick-label {
  font-family: var(--font-ui);
  font-size: 11px;
  letter-spacing: 0.1em;
  color: rgba(196, 149, 106, 0.4);
  margin-top: 1px;
  white-space: nowrap;
}

.tick.cardinal .tick-label {
  font-size: 11px;
  font-weight: bold;
  color: rgba(196, 149, 106, 0.8);
}

.compass-pointer {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-top: 6px solid #c4753a;
}

.heading-readout {
  position: absolute;
  bottom: 2px;
  left: 50%;
  transform: translateX(-50%);
  font-family: var(--font-ui);
  font-size: 11px;
  color: #c4753a;
  letter-spacing: 0.15em;
}
</style>
