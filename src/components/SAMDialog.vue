<template>
  <Teleport to="body">
    <Transition name="sam-slide">
      <div v-if="visible" class="sam-dialog">
        <div class="sam-header">
          <span class="sam-icon">&#x2394;</span>
          <span class="sam-title">SAM — SAMPLE ANALYSIS</span>
        </div>
        <div class="sam-body">
          <div class="sam-placeholder">
            <div class="sam-placeholder-icon">&#x2699;</div>
            <div class="sam-placeholder-text">ANALYSIS MODULE READY</div>
            <div class="sam-placeholder-sub">No puzzles loaded</div>
          </div>
        </div>
        <div class="sam-footer">[ESC] CLOSE</div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
defineProps<{
  visible: boolean
}>()
</script>

<style scoped>
.sam-dialog {
  position: fixed;
  top: 50%;
  right: 320px;
  transform: translateY(-50%);
  width: 480px;
  height: 270px;
  background: rgba(10, 5, 2, 0.92);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(196, 117, 58, 0.3);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  z-index: 50;
  font-family: 'Courier New', monospace;
  overflow: hidden;
}

.sam-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(196, 117, 58, 0.15);
}

.sam-icon {
  font-size: 16px;
  color: #e8a060;
}

.sam-title {
  font-size: 11px;
  font-weight: bold;
  letter-spacing: 0.2em;
  color: #e8a060;
}

.sam-body {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sam-placeholder {
  text-align: center;
}

.sam-placeholder-icon {
  font-size: 32px;
  color: rgba(196, 117, 58, 0.2);
  margin-bottom: 12px;
}

.sam-placeholder-text {
  font-size: 11px;
  color: rgba(196, 117, 58, 0.5);
  letter-spacing: 0.15em;
  margin-bottom: 4px;
}

.sam-placeholder-sub {
  font-size: 9px;
  color: rgba(196, 117, 58, 0.25);
  letter-spacing: 0.1em;
}

.sam-footer {
  text-align: center;
  padding: 8px;
  font-size: 8px;
  color: rgba(196, 117, 58, 0.3);
  letter-spacing: 0.15em;
  border-top: 1px solid rgba(196, 117, 58, 0.1);
}

/* Transition */
.sam-slide-enter-active,
.sam-slide-leave-active {
  transition: transform 0.3s ease, opacity 0.3s ease;
}

.sam-slide-enter-from {
  transform: translateY(-50%) translateX(-30px);
  opacity: 0;
}

.sam-slide-leave-to {
  transform: translateY(-50%) translateX(-30px);
  opacity: 0;
}
</style>
