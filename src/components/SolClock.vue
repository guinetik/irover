<template>
  <div class="sol-clock">
    <span class="sc-icon" aria-hidden="true">{{ icon }}</span>
    <div class="sc-main">
      <span class="sc-time font-instrument">{{ marsTime }}</span>
      <span class="sc-dot" aria-hidden="true">&middot;</span>
      <span class="sc-sol"><span class="sc-sol-label">Sol</span> <span class="font-instrument sc-sol-num">{{ sol }}</span></span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { MARS_SOL_CLOCK_MINUTES } from '@/three/MarsSky'

const props = defineProps<{
  sol: number
  /** 0..1 from MarsSky.timeOfDay */
  timeOfDay: number
  /** 0..1 MarsSky.nightFactor */
  nightFactor?: number
}>()

const marsTime = computed(() => {
  const totalMin = (props.timeOfDay % 1) * MARS_SOL_CLOCK_MINUTES
  const h = Math.floor(totalMin / 60)
  const m = Math.floor(totalMin % 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
})

const icon = computed(() => {
  const nf = props.nightFactor ?? 0
  if (nf > 0.8) return '\u263E'   // crescent moon — night
  if (nf > 0.4) return '\uD83C\uDF05' // sunrise/sunset
  return '\u2600'                  // sun — day (using text, not emoji)
})
</script>

<style scoped>
.sol-clock {
  position: fixed;
  top: 56px;
  left: 10px;
  z-index: 42;
  box-sizing: border-box;
  width: var(--site-left-stack-width);
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  background: rgba(10, 5, 2, 0.75);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(196, 117, 58, 0.4);
  border-radius: 8px;
  padding: 8px 12px;
  font-family: var(--font-ui);
  font-variant-numeric: tabular-nums;
  pointer-events: none;
}

.sc-icon {
  flex-shrink: 0;
  color: #e8a060;
  font-size: 15px;
  line-height: 1;
}

.sc-main {
  display: flex;
  align-items: baseline;
  flex-wrap: nowrap;
  gap: 6px;
  min-width: 0;
  flex: 1;
  justify-content: center;
}

.sc-time {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: #e8c4a0;
}

.sc-dot {
  flex-shrink: 0;
  color: rgba(196, 117, 58, 0.45);
  font-size: 12px;
  line-height: 1;
  transform: translateY(-1px);
}

.sc-sol {
  display: flex;
  align-items: baseline;
  gap: 4px;
  white-space: nowrap;
  color: rgba(196, 117, 58, 0.88);
}

.sc-sol-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: rgba(196, 149, 106, 0.55);
}

.sc-sol-num {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: #d4a574;
}
</style>
