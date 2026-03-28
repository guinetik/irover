<template>
  <Teleport to="body">
    <Transition name="rad-result-fade">
      <div v-if="visible" class="rad-result-overlay">
        <div class="rad-result-content">
          <div class="rad-result-subtitle">Analysis Complete</div>
          <div class="rad-result-grade" :style="gradeStyle">{{ grade }}</div>
          <div class="rad-result-details">
            <span class="result-event-name">&#x2622; {{ displayName }}</span>
            <template v-if="resolved">
              &mdash; <span :style="{ color: rarityColor }">{{ rarityLabel }}</span>
            </template>
            <br>
            Catch: {{ caught }} / {{ total }} ({{ catchPct }}%)
            <br>
            Classification confidence: {{ confidencePct }}%
            <template v-if="!resolved">
              <span class="result-miss"> (below 70% threshold)</span>
            </template>
            <br>
            <span class="result-sp">+{{ sp }} SP</span>
            <template v-if="sideProducts.length > 0">
              <br><br>
              <span style="color:rgba(100,200,120,0.4)">Side products earned</span>
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import type { RadEventId } from '@/lib/radiation'
import { RAD_EVENT_DEFS } from '@/lib/radiation'

const props = defineProps<{
  visible: boolean
  eventId: RadEventId
  classifiedAs: RadEventId
  resolved: boolean
  caught: number
  total: number
  grade: string
  sp: number
  confidence: number
  sideProducts: Array<{ itemId: string; quantity: number }>
}>()

const emit = defineEmits<{
  close: []
}>()

const RARITY_COLORS: Record<string, string> = {
  common: '#55dd88',
  uncommon: '#55bbff',
  rare: '#ff8844',
  legendary: '#cc55ff',
}

const eventDef = computed(() => RAD_EVENT_DEFS[props.classifiedAs])

const displayName = computed(() => {
  if (!props.resolved) return 'UNRESOLVED'
  return eventDef.value?.name ?? 'Unknown'
})

const rarityLabel = computed(() => eventDef.value?.rarity?.toUpperCase() ?? '')
const rarityColor = computed(() => RARITY_COLORS[eventDef.value?.rarity ?? 'common'] ?? '#55dd88')

const catchPct = computed(() => {
  if (props.total === 0) return 0
  return Math.round((props.caught / props.total) * 100)
})

const confidencePct = computed(() => Math.round(props.confidence * 100))

const gradeStyle = computed(() => {
  const g = props.grade
  const color = g === 'S' ? '#ffdd33' : g === 'A' ? '#55dd88' : '#e8a54b'
  const shadow = g === 'S' ? 'rgba(255,221,51,0.4)' : 'rgba(100,220,130,0.3)'
  return { color, textShadow: `0 0 30px ${shadow}` }
})

// Auto-close after 3 seconds
let closeTimer: ReturnType<typeof setTimeout> | null = null
watch(() => props.visible, (v) => {
  if (closeTimer) {
    clearTimeout(closeTimer)
    closeTimer = null
  }
  if (v) {
    closeTimer = setTimeout(() => {
      emit('close')
    }, 3000)
  }
})
</script>

<style scoped>
.rad-result-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  background: rgba(3, 5, 2, 0.92);
  z-index: 910;
  backdrop-filter: blur(8px);
  cursor: default;
  font-family: 'Oxanium', sans-serif;
  color: #e8a54b;
}

.rad-result-content {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.rad-result-subtitle {
  font-size: 12px;
  font-weight: 300;
  color: rgba(100, 200, 120, 0.4);
  letter-spacing: 4px;
  text-transform: uppercase;
  margin-bottom: 6px;
}

.rad-result-grade {
  font-size: 48px;
  font-weight: 700;
  margin: 8px 0;
}

.rad-result-details {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: rgba(100, 200, 120, 0.5);
  text-align: center;
  line-height: 2;
  margin-bottom: 16px;
  max-width: 500px;
}

.result-event-name {
  color: #55dd88;
  font-weight: 600;
}

.result-miss {
  color: #ff6655;
}

.result-sp {
  color: #e8a54b;
  font-weight: 700;
}

.rad-result-fade-enter-active,
.rad-result-fade-leave-active {
  transition: opacity 0.3s ease;
}
.rad-result-fade-enter-from,
.rad-result-fade-leave-to {
  opacity: 0;
}
</style>
