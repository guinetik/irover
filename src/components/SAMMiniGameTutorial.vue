<template>
  <Transition name="tut-fade">
    <div v-if="visible" class="tut-overlay" @click.self="dismiss">
      <div class="tut-card">
        <div class="tut-header">
          <span class="tut-icon">{{ icon }}</span>
          <span class="tut-title">{{ title }}</span>
        </div>

        <div class="tut-body">
          <div class="tut-diagram" v-html="diagram" />
          <ul class="tut-steps">
            <li v-for="(step, i) in steps" :key="i">
              <span class="tut-step-key" v-if="step.key">{{ step.key }}</span>
              {{ step.text }}
            </li>
          </ul>
        </div>

        <button class="tut-start" @click="dismiss">
          START ANALYSIS
        </button>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
defineProps<{
  visible: boolean
  title: string
  icon: string
  diagram: string
  steps: { key?: string; text: string }[]
}>()

const emit = defineEmits<{
  start: []
}>()

function dismiss() {
  emit('start')
}
</script>

<style scoped>
.tut-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(5, 3, 1, 0.85);
  backdrop-filter: blur(4px);
}

.tut-card {
  max-width: 420px;
  padding: 28px 32px;
  background: rgba(15, 10, 6, 0.95);
  border: 1px solid rgba(196, 117, 58, 0.25);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.tut-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.tut-icon {
  font-size: 20px;
  color: #e8a060;
}

.tut-title {
  font-family: var(--font-ui);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.18em;
  color: #e8a060;
}

.tut-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.tut-diagram {
  text-align: center;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 11px;
  line-height: 1.6;
  color: rgba(196, 117, 58, 0.6);
  padding: 12px 0;
  border: 1px solid rgba(196, 117, 58, 0.1);
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.3);
}

.tut-steps {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-family: var(--font-ui);
  font-size: 11px;
  color: rgba(196, 117, 58, 0.7);
  letter-spacing: 0.04em;
  line-height: 1.5;
}

.tut-step-key {
  display: inline-block;
  padding: 1px 6px;
  margin-right: 4px;
  background: rgba(196, 117, 58, 0.15);
  border: 1px solid rgba(196, 117, 58, 0.25);
  border-radius: 3px;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  color: #e8a060;
}

.tut-start {
  align-self: center;
  padding: 10px 36px;
  background: rgba(196, 117, 58, 0.15);
  border: 1px solid rgba(196, 117, 58, 0.4);
  border-radius: 6px;
  color: #e8a060;
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.2em;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s;
}

.tut-start:hover {
  background: rgba(196, 117, 58, 0.25);
  border-color: rgba(196, 117, 58, 0.6);
}

.tut-fade-enter-active,
.tut-fade-leave-active {
  transition: opacity 0.3s ease;
}
.tut-fade-enter-from,
.tut-fade-leave-to {
  opacity: 0;
}
</style>
