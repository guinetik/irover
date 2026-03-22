<template>
  <Teleport to="body">
    <div v-if="visible" class="crosshair" :class="color">
      <div class="crosshair-dot" />
      <svg v-if="drilling" class="crosshair-ring" viewBox="0 0 40 40">
        <circle cx="20" cy="20" r="16" class="ring-track" />
        <circle cx="20" cy="20" r="16" class="ring-fill"
          :style="{ strokeDashoffset: dashOffset }" />
      </svg>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  visible: boolean
  color: 'green' | 'red'
  drilling: boolean
  progress: number
}>()

const circumference = 2 * Math.PI * 16
const dashOffset = computed(() =>
  circumference * (1 - props.progress)
)
</script>

<style scoped>
.crosshair {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 45;
  pointer-events: none;
}

.crosshair-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  transition: background 0.15s ease;
}

.crosshair.green .crosshair-dot {
  background: rgba(93, 201, 165, 0.9);
  box-shadow: 0 0 6px rgba(93, 201, 165, 0.5);
}

.crosshair.red .crosshair-dot {
  background: rgba(224, 80, 48, 0.9);
  box-shadow: 0 0 6px rgba(224, 80, 48, 0.5);
}

.crosshair-ring {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 40px;
  height: 40px;
  transform: translate(-50%, -50%) rotate(-90deg);
}

.ring-track {
  fill: none;
  stroke: rgba(255, 255, 255, 0.1);
  stroke-width: 2;
}

.ring-fill {
  fill: none;
  stroke: rgba(93, 201, 165, 0.8);
  stroke-width: 2.5;
  stroke-dasharray: 100.53;
  transition: stroke-dashoffset 0.1s linear;
}
</style>
