<template>
  <div class="apxs-chart">
    <div class="apxs-chart__column" v-for="el in APXS_ELEMENTS" :key="el">
      <div class="apxs-chart__bars">
        <div
          class="apxs-chart__bar apxs-chart__bar--true"
          :style="{
            height: barHeight(trueComposition[el]) + '%',
            backgroundColor: ELEMENT_COLORS[el],
          }"
        />
        <div
          class="apxs-chart__bar apxs-chart__bar--measured"
          :style="{
            height: barHeight(measuredComposition[el]) + '%',
            backgroundColor: ELEMENT_COLORS[el],
          }"
        />
      </div>
      <span class="apxs-chart__label" :style="{ color: ELEMENT_COLORS[el] }">{{ el }}</span>
      <span class="apxs-chart__pct">{{ measuredComposition[el].toFixed(1) }}%</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { APXSComposition, APXSGrade } from '@/lib/apxsComposition'
import { APXS_ELEMENTS, ELEMENT_COLORS } from '@/lib/apxsComposition'

const props = defineProps<{
  trueComposition: APXSComposition
  measuredComposition: APXSComposition
  grade: APXSGrade
}>()

function barHeight(value: number): number {
  // Find max across both compositions for scaling
  let max = 0
  for (const el of APXS_ELEMENTS) {
    if (props.trueComposition[el] > max) max = props.trueComposition[el]
    if (props.measuredComposition[el] > max) max = props.measuredComposition[el]
  }
  if (max === 0) return 0
  return (value / max) * 100
}
</script>

<style scoped>
.apxs-chart {
  display: flex;
  gap: 3px;
  height: 80px;
  align-items: flex-end;
  background: rgba(0, 0, 0, 0.3);
  padding: 4px;
  border-radius: 3px;
}

.apxs-chart__column {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.apxs-chart__bars {
  width: 100%;
  display: flex;
  gap: 1px;
  height: 60px;
  align-items: flex-end;
}

.apxs-chart__bar {
  flex: 1;
  border-radius: 1px 1px 0 0;
  min-height: 1px;
}

.apxs-chart__bar--true {
  opacity: 0.2;
}

.apxs-chart__bar--measured {
  opacity: 0.85;
}

.apxs-chart__label {
  font-size: 9px;
  font-family: var(--font-ui);
  margin-top: 2px;
}

.apxs-chart__pct {
  font-size: 8px;
  font-family: var(--font-ui);
  color: rgba(255, 255, 255, 0.5);
}
</style>
