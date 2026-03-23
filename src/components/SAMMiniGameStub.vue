<template>
  <div class="minigame-stub">
    <div class="stub-panel">
      <div class="mode-name">{{ modeName }}</div>
      <div class="subtitle">ANALYSIS IN PROGRESS</div>

      <div class="sample-display">
        <span class="sample-label">SAMPLE</span>
        <span class="sample-id">{{ sampleId }}</span>
      </div>

      <div class="button-row">
        <button class="stub-btn success-btn" @click="emit('complete', 85)">
          ANALYSIS SUCCESSFUL
        </button>
        <button class="stub-btn fail-btn" @click="emit('complete', 30)">
          ANALYSIS FAILED
        </button>
      </div>

      <div class="hint-text">Mini-game placeholder — real games coming soon</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  modeId: string
  sampleId: string
}>()

const emit = defineEmits<{
  complete: [quality: number]
}>()

const modeName = computed(() => {
  switch (props.modeId) {
    case 'pyrolysis':
      return 'PYROLYSIS'
    case 'wet-chemistry':
      return 'WET CHEMISTRY'
    case 'isotope-analysis':
      return 'ISOTOPE ANALYSIS'
    default:
      return props.modeId.toUpperCase()
  }
})
</script>

<style scoped>
.minigame-stub {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  background: rgba(10, 14, 20, 0.85);
}

.stub-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  padding: 40px 48px;
  background: rgba(18, 24, 32, 0.95);
  border: 1px solid rgba(232, 160, 96, 0.3);
  min-width: 420px;
}

.mode-name {
  font-size: 1.4rem;
  font-weight: 700;
  letter-spacing: 0.15em;
  color: #e8a060;
  text-transform: uppercase;
}

.subtitle {
  font-size: 0.78rem;
  letter-spacing: 0.2em;
  color: rgba(232, 160, 96, 0.55);
  text-transform: uppercase;
}

.sample-display {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 20px;
  border: 1px solid rgba(232, 160, 96, 0.2);
  background: rgba(232, 160, 96, 0.05);
}

.sample-label {
  font-size: 0.7rem;
  letter-spacing: 0.18em;
  color: rgba(232, 160, 96, 0.5);
}

.sample-id {
  font-size: 0.85rem;
  letter-spacing: 0.08em;
  color: #e8a060;
  font-family: monospace;
}

.button-row {
  display: flex;
  gap: 24px;
  margin-top: 12px;
}

.stub-btn {
  width: 200px;
  height: 60px;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  cursor: pointer;
  background: transparent;
  transition: background 0.15s ease, box-shadow 0.15s ease;
}

.success-btn {
  color: #5dc9a5;
  border: 2px solid #5dc9a5;
}

.success-btn:hover {
  background: rgba(93, 201, 165, 0.12);
  box-shadow: 0 0 14px rgba(93, 201, 165, 0.35);
}

.fail-btn {
  color: #e05030;
  border: 2px solid #e05030;
}

.fail-btn:hover {
  background: rgba(224, 80, 48, 0.12);
  box-shadow: 0 0 14px rgba(224, 80, 48, 0.35);
}

.hint-text {
  font-size: 0.65rem;
  letter-spacing: 0.08em;
  color: rgba(232, 160, 96, 0.35);
  margin-top: 8px;
}
</style>
