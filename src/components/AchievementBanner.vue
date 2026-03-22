<template>
  <Teleport to="body">
    <TransitionGroup name="ach-slide" tag="div" class="achievement-stack">
      <div
        v-for="item in visible"
        :key="item.id"
        class="achievement-banner"
      >
        <div class="ach-icon">{{ item.icon }}</div>
        <div class="ach-body">
          <div class="ach-title">{{ item.title }}</div>
          <div class="ach-desc">{{ item.description }}</div>
        </div>
        <div class="ach-type">{{ item.type }}</div>
      </div>
    </TransitionGroup>
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue'

interface AchievementItem {
  id: string
  icon: string
  title: string
  description: string
  type: string
}

const visible = ref<AchievementItem[]>([])
const DURATION_MS = 5000

function show(icon: string, title: string, description: string, type = 'ACHIEVEMENT'): void {
  const id = `ach-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const item: AchievementItem = { id, icon, title, description, type }
  visible.value.push(item)
  setTimeout(() => {
    const idx = visible.value.findIndex(a => a.id === id)
    if (idx >= 0) visible.value.splice(idx, 1)
  }, DURATION_MS)
}

defineExpose({ show })
</script>

<style scoped>
.achievement-stack {
  position: fixed;
  top: 90px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  z-index: 65;
  pointer-events: none;
}

.achievement-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 20px;
  background: rgba(5, 25, 30, 0.92);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(102, 255, 238, 0.4);
  border-radius: 8px;
  box-shadow: 0 0 20px rgba(102, 255, 238, 0.15), inset 0 0 30px rgba(102, 255, 238, 0.03);
  min-width: 360px;
  max-width: 500px;
}

.ach-icon {
  font-size: 22px;
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(102, 255, 238, 0.08);
  border: 1px solid rgba(102, 255, 238, 0.2);
  border-radius: 6px;
}

.ach-body {
  flex: 1;
}

.ach-title {
  font-family: 'Courier New', monospace;
  font-size: 12px;
  font-weight: bold;
  color: #66ffee;
  letter-spacing: 0.1em;
  margin-bottom: 2px;
}

.ach-desc {
  font-family: 'Courier New', monospace;
  font-size: 9px;
  color: rgba(102, 255, 238, 0.5);
  letter-spacing: 0.04em;
  line-height: 1.4;
}

.ach-type {
  font-family: 'Courier New', monospace;
  font-size: 7px;
  color: rgba(102, 255, 238, 0.3);
  letter-spacing: 0.15em;
  writing-mode: vertical-rl;
  text-orientation: mixed;
  flex-shrink: 0;
}

/* Transition */
.ach-slide-enter-active {
  transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.ach-slide-leave-active {
  transition: all 0.4s ease;
}

.ach-slide-enter-from {
  opacity: 0;
  transform: translateY(-20px) scale(0.95);
}

.ach-slide-leave-to {
  opacity: 0;
  transform: translateY(-12px);
}
</style>
