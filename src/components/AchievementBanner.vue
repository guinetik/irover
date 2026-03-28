<template>
  <Teleport to="body">
    <TransitionGroup
      name="ach-slide"
      tag="div"
      class="achievement-stack"
      aria-live="polite"
      aria-relevant="additions"
    >
      <div
        v-for="item in visible"
        :key="item.id"
        class="achievement-banner"
        role="status"
      >
        <div class="ach-unlocked-strip">
          <span class="ach-trophy-mark" aria-hidden="true">🏆</span>
          <span class="ach-unlocked-text">Achievement unlocked</span>
        </div>
        <div class="ach-main">
          <div class="ach-icon">{{ item.icon }}</div>
          <div class="ach-body">
            <div class="ach-title">{{ item.title }}</div>
            <div class="ach-desc">{{ item.description }}</div>
          </div>
          <div class="ach-type">{{ item.type }}</div>
        </div>
      </div>
    </TransitionGroup>
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useUiSound } from '@/composables/useUiSound'
import type { AudioSoundId } from '@/audio/audioManifest'

interface AchievementItem {
  id: string
  icon: string
  title: string
  description: string
  type: string
}

const visible = ref<AchievementItem[]>([])
const DURATION_MS = 5000

const { playUiCue } = useUiSound()

/**
 * Shows a toast for a newly unlocked achievement (or reward-track milestone) and plays a manifest UI cue.
 * Defaults to cue `ui.achievement`; pass `ui.reward` for SP reward-track unlock toasts.
 * If Howler has not been unlocked yet (no prior user gesture on the site), the manager skips playback.
 */
function show(
  icon: string,
  title: string,
  description: string,
  type = 'ACHIEVEMENT',
  cue: AudioSoundId = 'ui.achievement',
): void {
  playUiCue(cue)
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
  flex-direction: column;
  gap: 0;
  padding: 0;
  overflow: hidden;
  background: rgba(12, 8, 5, 0.94);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(196, 149, 106, 0.45);
  border-radius: 8px;
  box-shadow:
    0 0 0 1px rgba(232, 176, 96, 0.12),
    0 8px 28px rgba(0, 0, 0, 0.45),
    0 0 24px rgba(232, 176, 96, 0.12);
  min-width: 360px;
  max-width: 500px;
}

.ach-unlocked-strip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: linear-gradient(90deg, rgba(196, 149, 106, 0.18), rgba(102, 255, 238, 0.06));
  border-bottom: 1px solid rgba(196, 149, 106, 0.25);
}

.ach-trophy-mark {
  font-size: 16px;
  line-height: 1;
  filter: drop-shadow(0 0 6px rgba(232, 176, 96, 0.45));
}

.ach-unlocked-text {
  font-family: var(--font-ui);
  font-size: 10px;
  font-weight: bold;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: #e8b060;
}

.ach-main {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 18px 12px;
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
  font-family: var(--font-ui);
  font-size: 12px;
  font-weight: bold;
  color: #66ffee;
  letter-spacing: 0.1em;
  margin-bottom: 2px;
}

.ach-desc {
  font-family: var(--font-ui);
  font-size: 11px;
  color: rgba(102, 255, 238, 0.5);
  letter-spacing: 0.04em;
  line-height: 1.4;
}

.ach-type {
  font-family: var(--font-ui);
  font-size: 10px;
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
