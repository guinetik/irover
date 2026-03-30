<template>
  <Teleport to="body">
    <Transition name="rad-result-fade">
      <div v-if="visible" class="rad-result-overlay">
        <div class="rad-result-content">
          <!-- Processing phase -->
          <template v-if="processing">
            <div class="rad-result-subtitle">PROCESSING PARTICLE DATA</div>
            <div class="rad-processing-bar">
              <div class="rad-processing-fill" :style="{ width: processingPct + '%' }" />
            </div>
            <div class="rad-processing-label font-instrument">{{ processingPct }}%</div>
          </template>

          <!-- Results phase -->
          <template v-else>
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
                <br>
                <span style="color:rgba(100,200,120,0.4)">Side products: {{ sideProducts.map(p => p.itemId).join(', ') }}</span>
              </template>
            </div>
            <button class="rad-ack-btn" @click="emit('acknowledge')">ACKNOWLEDGE</button>
            <div class="rad-ack-hint">[ENTER] or click to dismiss</div>
          </template>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
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
  acknowledge: []
}>()

const RARITY_COLORS: Record<string, string> = {
  common: '#55dd88',
  uncommon: '#55bbff',
  rare: '#ff8844',
  legendary: '#cc55ff',
}

const PROCESSING_DURATION_MS = 2500

const processing = ref(true)
const processingPct = ref(0)
let processingStart = 0
let processingRaf = 0

function tickProcessing(): void {
  const elapsed = Date.now() - processingStart
  const pct = Math.min(100, Math.round((elapsed / PROCESSING_DURATION_MS) * 100))
  processingPct.value = pct
  if (pct >= 100) {
    processing.value = false
    return
  }
  processingRaf = requestAnimationFrame(tickProcessing)
}

watch(() => props.visible, (v) => {
  if (v) {
    processing.value = true
    processingPct.value = 0
    processingStart = Date.now()
    processingRaf = requestAnimationFrame(tickProcessing)
  } else {
    cancelAnimationFrame(processingRaf)
  }
}, { immediate: true })

// Enter key to acknowledge
function onKeyDown(e: KeyboardEvent): void {
  if (!props.visible || processing.value) return
  if (e.code === 'Enter' || e.code === 'Space') {
    e.preventDefault()
    emit('acknowledge')
  }
}

onMounted(() => window.addEventListener('keydown', onKeyDown))
onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
  cancelAnimationFrame(processingRaf)
})

const eventDef = computed(() => RAD_EVENT_DEFS[props.classifiedAs])
const displayName = computed(() => props.resolved ? (eventDef.value?.name ?? 'Unknown') : 'UNRESOLVED')
const rarityLabel = computed(() => eventDef.value?.rarity?.toUpperCase() ?? '')
const rarityColor = computed(() => RARITY_COLORS[eventDef.value?.rarity ?? 'common'] ?? '#55dd88')
const catchPct = computed(() => props.total === 0 ? 0 : Math.round((props.caught / props.total) * 100))
const confidencePct = computed(() => Math.round(props.confidence * 100))
const gradeStyle = computed(() => {
  const g = props.grade
  const color = g === 'S' ? '#ffdd33' : g === 'A' ? '#55dd88' : '#e8a54b'
  const shadow = g === 'S' ? 'rgba(255,221,51,0.4)' : 'rgba(100,220,130,0.3)'
  return { color, textShadow: `0 0 30px ${shadow}` }
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

.rad-processing-bar {
  width: 280px;
  height: 4px;
  background: rgba(100, 220, 130, 0.1);
  border-radius: 2px;
  overflow: hidden;
  margin: 16px 0 8px;
}

.rad-processing-fill {
  height: 100%;
  background: linear-gradient(90deg, rgba(100, 220, 130, 0.4), rgba(100, 220, 130, 0.8));
  border-radius: 2px;
  transition: width 0.1s linear;
}

.rad-processing-label {
  font-size: 12px;
  color: rgba(100, 200, 120, 0.5);
  letter-spacing: 2px;
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

.rad-ack-btn {
  font-family: 'Oxanium', sans-serif;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 3px;
  text-transform: uppercase;
  padding: 10px 36px;
  background: transparent;
  color: #55dd88;
  border: 1px solid rgba(100, 220, 130, 0.5);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.rad-ack-btn:hover {
  background: rgba(100, 220, 130, 0.12);
  box-shadow: 0 0 20px rgba(100, 220, 130, 0.15);
}

.rad-ack-hint {
  font-size: 10px;
  color: rgba(100, 200, 120, 0.25);
  letter-spacing: 1px;
  margin-top: 8px;
  font-family: 'JetBrains Mono', monospace;
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
