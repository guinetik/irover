<script setup lang="ts">
/**
 * Top strip + scan progress when MastCam is in active instrument mode (slot 1).
 * Parent controls visibility with `v-if`.
 */
defineProps<{
  filterLabel: string
  scanning: boolean
  /** 0–1 scan progress while scanning */
  scanProgress: number
}>()
</script>

<template>
  <div class="mastcam-hud">
    <div class="mc-strip">
      <span class="mc-label">MASTCAM</span>
      <span class="mc-divider">|</span>
      <span class="mc-filter">SURVEY: {{ filterLabel }}</span>
      <span class="mc-divider">|</span>
      <span class="mc-hint">A/D pan &middot; W/S tilt &middot; Scroll zoom &middot; Q filter &middot; Hold E scan</span>
    </div>
    <div v-if="scanning" class="mc-scan-bar">
      <div class="mc-scan-fill" :style="{ width: scanProgress * 100 + '%' }" />
      <span class="mc-scan-label">SCANNING...</span>
    </div>
  </div>
</template>

<style scoped>
.mastcam-hud {
  position: fixed;
  bottom: calc(24px + 4.5rem + 10px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 42;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  pointer-events: none;
}

.mc-strip {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(10, 5, 2, 0.75);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(196, 117, 58, 0.3);
  border-radius: 6px;
  padding: 5px 14px;
  font-family: var(--font-ui);
  font-size: 11px;
  letter-spacing: 0.1em;
}

.mc-label {
  color: #e8a060;
  font-weight: bold;
}

.mc-divider {
  color: rgba(196, 117, 58, 0.25);
}

.mc-filter {
  color: #5dc9a5;
  font-weight: bold;
}

.mc-hint {
  color: rgba(196, 117, 58, 0.4);
  font-size: 11px;
}

.mc-scan-bar {
  width: 200px;
  height: 4px;
  background: rgba(0, 0, 0, 0.4);
  border-radius: 2px;
  overflow: hidden;
  position: relative;
}

.mc-scan-fill {
  height: 100%;
  background: linear-gradient(90deg, #5dc9a5, #3a9a7a);
  border-radius: 2px;
  transition: width 0.1s linear;
}

.mc-scan-label {
  position: absolute;
  top: 6px;
  left: 50%;
  transform: translateX(-50%);
  font-family: var(--font-ui);
  font-size: 11px;
  color: #5dc9a5;
  letter-spacing: 0.15em;
}
</style>
