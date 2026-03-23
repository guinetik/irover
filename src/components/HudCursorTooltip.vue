<template>
  <component
    :is="as"
    class="hud-cursor-tip-trigger"
    @mouseenter="onEnter"
    @mousemove="onMove"
    @mouseleave="onLeave"
  >
    <slot />
  </component>
  <Teleport to="body">
    <div
      v-show="visible"
      class="hud-cursor-tip-pop"
      role="tooltip"
      :aria-hidden="!visible"
      :style="tipStyle"
    >
      <div class="hud-cursor-tip-title">{{ title }}</div>
      <div class="hud-cursor-tip-body">{{ body }}</div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    /** Short heading (e.g. "Generation"). */
    title: string
    /** Full explanation; keep sentences short for HUD context. */
    body: string
    /** Wrapper element around the slot (must accept mouse events). */
    as?: keyof HTMLElementTagNameMap
  }>(),
  { as: 'span' },
)

/** Pixels to the right/below the pointer. */
const OFFSET = 14
const MAX_W = 300
const MAX_H = 220

const visible = ref(false)
const tipX = ref(0)
const tipY = ref(0)

const tipStyle = computed(() => {
  let x = tipX.value + OFFSET
  let y = tipY.value + OFFSET
  if (typeof window !== 'undefined') {
    const m = 8
    x = Math.min(x, window.innerWidth - MAX_W - m)
    y = Math.min(y, window.innerHeight - MAX_H - m)
    x = Math.max(m, x)
    y = Math.max(m, y)
  }
  return {
    left: `${x}px`,
    top: `${y}px`,
    maxWidth: `${MAX_W}px`,
  }
})

/**
 * Shows the tooltip and seeds position from the pointer.
 */
function onEnter(e: MouseEvent): void {
  visible.value = true
  tipX.value = e.clientX
  tipY.value = e.clientY
}

/**
 * Tracks the cursor while the tooltip is open.
 */
function onMove(e: MouseEvent): void {
  if (!visible.value) return
  tipX.value = e.clientX
  tipY.value = e.clientY
}

/**
 * Hides the tooltip when the pointer leaves the trigger.
 */
function onLeave(): void {
  visible.value = false
}
</script>

<style scoped>
.hud-cursor-tip-trigger {
  display: block;
  width: 100%;
  pointer-events: auto;
  cursor: help;
}

.hud-cursor-tip-pop {
  position: fixed;
  z-index: 55;
  padding: 8px 10px;
  background: rgba(6, 4, 2, 0.96);
  border: 1px solid rgba(196, 117, 58, 0.38);
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  pointer-events: none;
  font-family: var(--font-ui);
  letter-spacing: normal;
}

.hud-cursor-tip-title {
  font-size: 10px;
  font-weight: bold;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #e8a060;
  margin-bottom: 5px;
}

.hud-cursor-tip-body {
  font-size: 11px;
  line-height: 1.4;
  color: rgba(196, 149, 106, 0.88);
  white-space: pre-line;
}
</style>
