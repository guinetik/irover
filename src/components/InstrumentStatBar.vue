<!-- src/components/InstrumentStatBar.vue -->
<template>
  <div class="ov-stat-bar">
    <div class="ov-stat-bar-row">
      <span class="ov-stat-bar-label">{{ label }}</span>
      <span class="ov-stat-bar-value" :style="{ color: valueColor }">{{ valueStr }}</span>
    </div>
    <div class="ov-stat-bar-track">
      <div class="ov-stat-bar-fill" :style="{ width: barPct + '%', background: valueColor }" />
    </div>
    <div class="ov-stat-bar-buffs">
      <div
        v-for="buff in breakdown.buffs"
        :key="buff.label"
        class="ov-stat-bar-buff"
      >
        <span class="ov-stat-bar-buff-label">{{ buff.label }}</span>
        <span class="ov-stat-bar-buff-value" :style="{ color: buff.color }">{{ buff.value }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { SpeedBreakdown } from '@/lib/instrumentSpeedBreakdown'

const props = defineProps<{
  label: string
  breakdown: SpeedBreakdown
}>()

const valueStr = computed(() => `${Math.round(props.breakdown.speedPct)}%`)

const valueColor = computed(() => {
  const pct = props.breakdown.speedPct
  if (pct > 105) return '#5dc9a5'
  if (pct >= 95) return '#ef9f27'
  return '#e05030'
})

const barPct = computed(() => {
  const pct = props.breakdown.speedPct
  return Math.min(100, Math.max(0, pct / 1.5))
})
</script>

<style scoped>
.ov-stat-bar {
  margin: 6px 0 4px;
}
.ov-stat-bar-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 3px;
}
.ov-stat-bar-label {
  font-size: 10px;
  letter-spacing: 0.08em;
  color: rgba(196, 117, 58, 0.7);
  text-transform: uppercase;
}
.ov-stat-bar-value {
  font-size: 13px;
  font-weight: bold;
  letter-spacing: 0.05em;
}
.ov-stat-bar-track {
  width: 100%;
  height: 3px;
  background: rgba(196, 117, 58, 0.13);
  border-radius: 2px;
  margin-bottom: 4px;
}
.ov-stat-bar-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.3s ease;
}
.ov-stat-bar-buffs {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.ov-stat-bar-buff {
  display: flex;
  justify-content: space-between;
  font-size: 9px;
  letter-spacing: 0.06em;
}
.ov-stat-bar-buff-label {
  color: rgba(196, 117, 58, 0.5);
}
.ov-stat-bar-buff-value {
  font-weight: bold;
}
</style>
