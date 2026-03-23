<template>
  <div v-if="phase !== 'idle' && phase !== 'complete'" class="dan-prospect-bar">
    <div class="dpb-label">{{ label }}</div>
    <div class="dpb-track">
      <div class="dpb-fill" :class="phase" :style="{ width: fillPct + '%' }" />
    </div>
    <div class="dpb-pct font-instrument">{{ Math.round(fillPct) }}%</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  phase: string
  progress: number
}>()

const label = computed(() => {
  switch (props.phase) {
    case 'initiating': return 'INITIATING DAN PROSPECTING'
    case 'prospecting': return 'PROSPECTING SUBSURFACE...'
    case 'drive-to-zone': return 'DRIVE TO SIGNAL ZONE'
    default: return ''
  }
})

const fillPct = computed(() => {
  if (props.phase === 'initiating') return (1 - props.progress) * 100
  return props.progress * 100
})
</script>

<style scoped>
.dan-prospect-bar {
  position: fixed;
  top: 52px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  background: rgba(5, 10, 25, 0.88);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(68, 170, 255, 0.25);
  border-radius: 6px;
  z-index: 45;
  font-family: var(--font-ui);
}
.dpb-label { font-size: 10px; font-weight: 600; letter-spacing: 0.1em; color: rgba(68, 170, 255, 0.8); white-space: nowrap; }
.dpb-track { width: 120px; height: 4px; background: rgba(68, 170, 255, 0.1); border-radius: 2px; overflow: hidden; }
.dpb-fill { height: 100%; border-radius: 2px; transition: width 0.3s linear; }
.dpb-fill.drive-to-zone { background: rgba(68, 170, 255, 0.3); }
.dpb-fill.initiating { background: rgba(68, 170, 255, 0.6); }
.dpb-fill.prospecting { background: #44aaff; box-shadow: 0 0 6px rgba(68, 170, 255, 0.4); }
.dpb-pct { font-size: 11px; color: rgba(68, 170, 255, 0.7); min-width: 30px; text-align: right; }
</style>
