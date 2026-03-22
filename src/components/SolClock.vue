<template>
  <div class="sol-clock">
    <span class="sc-icon">{{ icon }}</span>
    <span class="sc-time">{{ marsTime }}</span>
    <span class="sc-dot">&middot;</span>
    <span class="sc-sol">Sol {{ sol }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  sol: number
  /** 0..1 from MarsSky.timeOfDay */
  timeOfDay: number
  /** 0..1 MarsSky.nightFactor */
  nightFactor?: number
}>()

const MARS_DAY_MINUTES = 24 * 60 + 37

const marsTime = computed(() => {
  const totalMin = (props.timeOfDay % 1) * MARS_DAY_MINUTES
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
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(10, 5, 2, 0.75);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(196, 117, 58, 0.4);
  border-radius: 6px;
  padding: 4px 10px;
  font-family: 'Courier New', monospace;
  font-size: 9px;
  letter-spacing: 0.2em;
  color: #c4956a;
  pointer-events: none;
}

.sc-icon {
  color: #e8a060;
  font-size: 11px;
}

.sc-time {
  font-variant-numeric: tabular-nums;
}

.sc-dot {
  color: rgba(196, 117, 58, 0.4);
}

.sc-sol {
  color: rgba(196, 117, 58, 0.7);
}
</style>
