<template>
  <Teleport to="body">
    <Transition name="mc-fade">
      <div v-if="current" class="mc-overlay" role="status" aria-live="polite">
        <div class="mc-banner">
          <div class="mc-strip">
            <span class="mc-signal" aria-hidden="true">&#x25C9;</span>
            <span class="mc-strip-text">MISSION COMPLETE</span>
          </div>
          <div class="mc-main">
            <div class="mc-name">{{ current.name }}</div>
            <div class="mc-reward" v-if="current.sp">+{{ current.sp }} SP</div>
          </div>
          <div class="mc-unlock" v-if="current.unlock">
            <span class="mc-unlock-label">UNLOCKED:</span>
            <span class="mc-unlock-name">{{ current.unlock }}</span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue'

interface MissionCompleteItem {
  name: string
  sp: number
  unlock: string | null
}

const current = ref<MissionCompleteItem | null>(null)
let timer: ReturnType<typeof setTimeout> | null = null

function show(name: string, sp: number, unlock: string | null = null, durationMs = 4000): void {
  if (timer) clearTimeout(timer)
  current.value = { name, sp, unlock }
  timer = setTimeout(() => {
    current.value = null
    timer = null
  }, durationMs)
}

defineExpose({ show })
</script>

<style scoped>
.mc-overlay {
  position: fixed;
  top: 50%;
  margin-top: -60px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 52;
  pointer-events: none;
}

.mc-banner {
  min-width: 320px;
  max-width: 440px;
  background: rgba(10, 5, 2, 0.92);
  border: 1px solid rgba(102, 255, 238, 0.3);
  border-radius: 10px;
  backdrop-filter: blur(12px);
  overflow: hidden;
}

.mc-strip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: rgba(102, 255, 238, 0.08);
  border-bottom: 1px solid rgba(102, 255, 238, 0.15);
}

.mc-signal {
  color: #66ffee;
  font-size: 14px;
}

.mc-strip-text {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.15em;
  color: #66ffee;
  text-transform: uppercase;
}

.mc-main {
  padding: 12px 16px 8px;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.mc-name {
  font-size: 16px;
  font-weight: 600;
  color: rgba(220, 210, 200, 0.95);
}

.mc-reward {
  font-size: 14px;
  font-weight: 600;
  color: #66ffee;
  white-space: nowrap;
}

.mc-unlock {
  padding: 0 16px 12px;
  display: flex;
  gap: 6px;
  align-items: center;
}

.mc-unlock-label {
  font-size: 9px;
  letter-spacing: 0.1em;
  color: rgba(196, 149, 106, 0.6);
  text-transform: uppercase;
}

.mc-unlock-name {
  font-size: 12px;
  font-weight: 600;
  color: rgba(196, 149, 106, 0.9);
  text-transform: uppercase;
}

.mc-fade-enter-active {
  transition: opacity 0.4s ease, transform 0.4s ease;
}
.mc-fade-leave-active {
  transition: opacity 0.6s ease, transform 0.6s ease;
}
.mc-fade-enter-from {
  opacity: 0;
  transform: translateX(-50%) scale(0.9);
}
.mc-fade-leave-to {
  opacity: 0;
  transform: translateX(-50%) scale(0.95);
}
</style>
