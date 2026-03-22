<template>
  <div
    v-if="landmark"
    class="landmark-tooltip"
    :style="{ left: `${x}px`, top: `${y}px` }"
  >
    <span class="tooltip-dot" :style="{ backgroundColor: landmark.accent }" />
    <span class="tooltip-name">{{ landmark.name }}</span>
    <span v-if="landmark.type === 'landing-site'" class="tooltip-year">({{ landmark.year }})</span>
  </div>
</template>

<script setup lang="ts">
import type { Landmark } from '@/types/landmark'

defineProps<{
  landmark: Landmark | null
  x: number
  y: number
}>()
</script>

<style scoped>
.landmark-tooltip {
  position: fixed;
  z-index: 30;
  transform: translate(12px, -50%);
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.85);
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(6px);
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  pointer-events: none;
  white-space: nowrap;
}

.tooltip-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.tooltip-name {
  font-weight: 400;
}

.tooltip-year {
  color: rgba(255, 255, 255, 0.45);
  font-size: 11px;
}
</style>
