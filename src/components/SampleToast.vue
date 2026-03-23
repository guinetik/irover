<template>
  <Teleport to="body">
    <TransitionGroup name="toast-pop" tag="div" class="toast-stack">
      <div
        v-for="item in visible"
        :key="item.id"
        class="sample-toast"
        :class="item.variant"
      >
        <span class="toast-dot" :style="{ color: item.color }">&#x25CF;</span>
        <span class="toast-label">
          <template v-if="item.variant === 'sp'">
            <span class="font-instrument">{{ item.prefix }}</span> {{ item.label }}
          </template>
          <template v-else>
            {{ item.prefix }} {{ item.label }}
          </template>
        </span>
        <span v-if="item.weight" class="toast-weight font-instrument">{{ item.weight }} kg</span>
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
  variant: string
}

const visible = ref<ToastItem[]>([])

const DURATION_MS = 2500

function push(item: ToastItem): void {
  visible.value.push(item)
  setTimeout(() => {
    const idx = visible.value.findIndex(t => t.id === item.id)
    if (idx >= 0) visible.value.splice(idx, 1)
  }, DURATION_MS)
}

function show(type: RockTypeId, label: string, weightKg: number): void {
  const color = ROCK_TYPES[type]?.color ?? '#c4753a'
  push({ id: uid(), prefix: '+', label, weight: weightKg.toFixed(2), color, variant: '' })
}

/** Brief error line (e.g. inventory full). */
function showError(message: string): void {
  push({
    id: uid(),
    prefix: '!',
    label: message,
    weight: '',
    color: '#e05030',
    variant: 'error',
  })
}

function showChemCam(type: RockTypeId, rockLabel: string): void {
  push({ id: uid(), prefix: 'CHEMCAM', label: rockLabel, weight: '', color: '#66ffee', variant: 'chemcam' })
}

function showSP(amount: number, source: string, bonusMult: number): void {
  const bonusTag = bonusMult > 1 ? ` (x${bonusMult.toFixed(1)})` : ''
  push({
    id: uid(),
    prefix: `+${amount} SP`,
    label: source.toUpperCase() + bonusTag,
    weight: '',
    color: '#66ffee',
    variant: 'sp',
  })
}

function showTrace(element: string, label: string): void {
  push({
    id: uid(),
    prefix: '+',
    label: `${label} (${element})`,
    weight: '~1g',
    color: '#cc88ff',
    variant: 'trace',
  })
}

function showDAN(message: string): void {
  push({
    id: uid(),
    prefix: 'DAN',
    label: message,
    weight: '',
    color: '#44aaff',
    variant: 'dan',
  })
}

function showPayloadStatus(message: string): void {
  push({
    id: uid(),
    prefix: 'DROP',
    label: message,
    weight: '',
    color: '#ffd27a',
    variant: 'payload',
  })
}

function showPayloadItem(label: string, quantity: number): void {
  push({
    id: uid(),
    prefix: '+',
    label: `${label} x${quantity}`,
    weight: '',
    color: '#ffd27a',
    variant: 'payload',
  })
}

function uid(): string {
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

defineExpose({ show, showError, showChemCam, showSP, showTrace, showDAN, showPayloadStatus, showPayloadItem })
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
  font-family: var(--font-ui);
  font-size: 11px;
  white-space: nowrap;
}

.sample-toast.chemcam {
  border-color: rgba(102, 255, 238, 0.3);
}

.sample-toast.sp {
  background: rgba(5, 30, 35, 0.92);
  border-color: rgba(102, 255, 238, 0.45);
  box-shadow: 0 0 12px rgba(102, 255, 238, 0.15);
}

.sample-toast.error {
  border-color: rgba(224, 80, 48, 0.55);
  background: rgba(40, 12, 8, 0.92);
}

.sample-toast.error .toast-label {
  color: rgba(255, 180, 160, 0.95);
  white-space: normal;
  max-width: 280px;
}

.toast-dot {
  font-size: 12px;
  text-shadow: 0 0 6px currentColor;
}

.toast-label {
  color: rgba(232, 200, 160, 0.9);
  letter-spacing: 0.04em;
}

.sample-toast.sp .toast-label {
  color: rgba(102, 255, 238, 0.95);
  font-weight: bold;
  letter-spacing: 0.08em;
}

.sample-toast.trace {
  background: rgba(20, 10, 30, 0.9);
  border-color: rgba(204, 136, 255, 0.35);
}

.sample-toast.trace .toast-label {
  color: rgba(204, 136, 255, 0.9);
}

.sample-toast.trace .toast-weight {
  color: rgba(204, 136, 255, 0.5);
}

.sample-toast.dan {
  background: rgba(5, 15, 35, 0.92);
  border-color: rgba(68, 170, 255, 0.35);
}

.sample-toast.dan .toast-label {
  color: rgba(68, 170, 255, 0.9);
}

.sample-toast.payload {
  background: rgba(36, 24, 7, 0.92);
  border-color: rgba(255, 210, 122, 0.38);
}

.sample-toast.payload .toast-label {
  color: rgba(255, 223, 166, 0.96);
}

.toast-weight {
  color: rgba(196, 149, 106, 0.5);
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
