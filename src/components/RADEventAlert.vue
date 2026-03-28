<template>
  <Transition name="rad-alert">
    <div v-if="visible" class="rad-alert">
      <div class="rad-alert-icon">&#x2622;</div>
      <div class="rad-alert-title">RADIATION EVENT DETECTED</div>
      <div class="rad-alert-buttons">
        <button class="rad-btn rad-btn-decode" @click="emit('decode')">DECODE</button>
        <button class="rad-btn rad-btn-dismiss" @click="emit('dismiss')">DISMISS</button>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
defineProps<{ visible: boolean }>()
const emit = defineEmits<{ decode: []; dismiss: [] }>()
</script>

<style scoped>
.rad-alert {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 200;
  pointer-events: auto;
  background: rgba(0, 0, 0, 0.85);
  border: 1px solid rgba(68, 221, 136, 0.4);
  border-radius: 8px;
  padding: 24px 32px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  min-width: 280px;
}

.rad-alert-icon {
  font-size: 36px;
  color: #44dd88;
  text-shadow: 0 0 12px rgba(68, 221, 136, 0.8), 0 0 24px rgba(68, 221, 136, 0.4);
  line-height: 1;
}

.rad-alert-title {
  color: #e8c870;
  font-size: 14px;
  letter-spacing: 0.15em;
  text-align: center;
  font-family: 'Instrument Sans', monospace;
}

.rad-alert-buttons {
  display: flex;
  gap: 12px;
  margin-top: 4px;
}

.rad-btn {
  padding: 8px 20px;
  font-size: 12px;
  letter-spacing: 0.1em;
  border-radius: 4px;
  cursor: pointer;
  background: transparent;
  font-family: 'Instrument Sans', monospace;
  transition: background 0.15s ease;
}

.rad-btn-decode {
  color: #44dd88;
  border: 1px solid #44dd88;
}

.rad-btn-decode:hover {
  background: rgba(68, 221, 136, 0.15);
}

.rad-btn-dismiss {
  color: #888;
  border: 1px solid #555;
}

.rad-btn-dismiss:hover {
  background: rgba(255, 255, 255, 0.05);
}

/* Transition */
.rad-alert-enter-active,
.rad-alert-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.rad-alert-enter-from,
.rad-alert-leave-to {
  opacity: 0;
  transform: translate(-50%, -50%) scale(0.95);
}
</style>
