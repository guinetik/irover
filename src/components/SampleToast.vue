<template>
  <Teleport to="body">
    <TransitionGroup name="toast-pop" tag="div" class="toast-stack">
      <div
        v-for="item in visible"
        :key="item.id"
        class="sample-toast"
      >
        <span class="toast-dot" :style="{ color: item.color }">&#x25CF;</span>
        <span class="toast-label">{{ item.prefix }} {{ item.label }}</span>
        <span v-if="item.weight" class="toast-weight">{{ item.weight }} kg</span>
      </div>
    </TransitionGroup>
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ROCK_TYPES, type RockTypeId } from '@/three/terrain/RockTypes'

interface ToastItem {
  id: string
  prefix: string
  label: string
  weight: string
  color: string
}

const visible = ref<ToastItem[]>([])

const DURATION_MS = 2500

/**
 * Shows a pickup toast for a collected sample.
 */
function show(type: RockTypeId, label: string, weightKg: number): void {
  const id = `toast-${Date.now()}-${Math.random()}`
  const color = ROCK_TYPES[type]?.color ?? '#c4753a'
  const item: ToastItem = { id, prefix: '+', label, weight: weightKg.toFixed(2), color }

  visible.value.push(item)

  setTimeout(() => {
    const idx = visible.value.findIndex(t => t.id === id)
    if (idx >= 0) visible.value.splice(idx, 1)
  }, DURATION_MS)
}

/**
 * Shows a ChemCam analysis toast (no weight).
 */
function showChemCam(type: RockTypeId, rockLabel: string): void {
  const id = `toast-${Date.now()}-${Math.random()}`
  const color = '#66ffee'
  const item: ToastItem = { id, prefix: 'CHEMCAM', label: rockLabel, weight: '', color }

  visible.value.push(item)

  setTimeout(() => {
    const idx = visible.value.findIndex(t => t.id === id)
    if (idx >= 0) visible.value.splice(idx, 1)
  }, DURATION_MS)
}

defineExpose({ show, showChemCam })
</script>

<style scoped>
.toast-stack {
  position: fixed;
  bottom: 140px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column-reverse;
  align-items: center;
  gap: 6px;
  z-index: 60;
  pointer-events: none;
}

.sample-toast {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  background: rgba(10, 5, 2, 0.85);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(196, 117, 58, 0.25);
  border-radius: 6px;
  font-family: 'Courier New', monospace;
  font-size: 11px;
  white-space: nowrap;
}

.toast-dot {
  font-size: 10px;
  text-shadow: 0 0 6px currentColor;
}

.toast-label {
  color: rgba(232, 200, 160, 0.9);
  letter-spacing: 0.04em;
}

.toast-weight {
  color: rgba(196, 149, 106, 0.5);
  font-variant-numeric: tabular-nums;
}

.toast-pop-enter-active {
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.toast-pop-leave-active {
  transition: all 0.3s ease;
}

.toast-pop-enter-from {
  opacity: 0;
  transform: translateY(12px) scale(0.9);
}

.toast-pop-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
