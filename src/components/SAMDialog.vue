<template>
  <Teleport to="body">
    <Transition name="sam-fade">
      <div v-if="visible" class="sam-overlay">
        <div class="sam-dialog">
          <div class="sam-header">
            <span class="sam-icon">&#x2394;</span>
            <span class="sam-title">SAM — SAMPLE ANALYSIS AT MARS</span>
            <div class="sam-header-right">
              <span class="sam-esc">[ESC] CLOSE</span>
            </div>
          </div>
          <div class="sam-body">
            <div class="sam-placeholder">
              <div class="sam-placeholder-icon">&#x2699;</div>
              <div class="sam-placeholder-text">ANALYSIS MODULE READY</div>
              <div class="sam-placeholder-sub">Select a sample from inventory to begin</div>
            </div>
          </div>
          <div class="sam-footer">
            <span class="sam-footer-status">STANDBY</span>
            <span class="sam-footer-power">0W</span>
          </div>
        </div>
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
.sam-overlay {
  position: fixed;
  inset: 0;
  z-index: 55;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.sam-dialog {
  width: 75vw;
  height: 75vh;
  background: rgba(10, 5, 2, 0.88);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(196, 117, 58, 0.25);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  font-family: var(--font-ui);
  overflow: hidden;
  pointer-events: auto;
  box-shadow: 0 0 60px rgba(0, 0, 0, 0.5);
}

.sam-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 20px;
  border-bottom: 1px solid rgba(196, 117, 58, 0.15);
  flex-shrink: 0;
}

.sam-icon {
  font-size: 18px;
  color: #e8a060;
}

.sam-title {
  font-size: 12px;
  font-weight: bold;
  letter-spacing: 0.2em;
  color: #e8a060;
}

.sam-header-right {
  margin-left: auto;
}

.sam-esc {
  font-size: 10px;
  color: rgba(196, 117, 58, 0.3);
  letter-spacing: 0.1em;
}

.sam-body {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
}

.sam-placeholder {
  text-align: center;
}

.sam-placeholder-icon {
  font-size: 48px;
  color: rgba(196, 117, 58, 0.15);
  margin-bottom: 16px;
}

.sam-placeholder-text {
  font-size: 12px;
  color: rgba(196, 117, 58, 0.5);
  letter-spacing: 0.15em;
  margin-bottom: 6px;
}

.sam-placeholder-sub {
  font-size: 11px;
  color: rgba(196, 117, 58, 0.25);
  letter-spacing: 0.1em;
}

.sam-footer {
  display: flex;
  justify-content: space-between;
  padding: 10px 20px;
  font-size: 10px;
  letter-spacing: 0.12em;
  border-top: 1px solid rgba(196, 117, 58, 0.1);
  flex-shrink: 0;
}

.sam-footer-status {
  color: rgba(196, 117, 58, 0.4);
}

.sam-footer-power {
  color: rgba(93, 201, 165, 0.5);
}

/* Transition */
.sam-fade-enter-active,
.sam-fade-leave-active {
  transition: opacity 0.3s ease;
}
.sam-fade-enter-active .sam-dialog,
.sam-fade-leave-active .sam-dialog {
  transition: transform 0.3s ease, opacity 0.3s ease;
}
.sam-fade-enter-from,
.sam-fade-leave-to {
  opacity: 0;
}
.sam-fade-enter-from .sam-dialog,
.sam-fade-leave-to .sam-dialog {
  opacity: 0;
  transform: scale(0.97);
}
</style>
