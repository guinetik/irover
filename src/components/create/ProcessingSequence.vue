<template>
  <div class="processing">
    <p v-for="(line, i) in visibleLines" :key="i" class="line" :class="{ dim: line.dim }">
      {{ line.text }}
    </p>
    <p v-if="showSnark" class="snark">{{ snarkText }}</p>
    <button v-if="showContinue" class="btn" @click="$emit('continue')">[ CONTINUE ]</button>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { PositionId } from './StepPosition.vue'

const props = defineProps<{ positionChoice: PositionId }>()
defineEmits<{ continue: [] }>()

interface Line { text: string; dim: boolean }

const lines: Line[] = [
  { text: 'PROCESSING APPLICATION...', dim: false },
  { text: '', dim: true },
  { text: '> Cross-referencing credentials with available positions...', dim: true },
  { text: '> Evaluating 2,847 concurrent applications...', dim: true },
  { text: '> Running background check...', dim: true },
  { text: '> Background check passed.', dim: true },
  { text: '> Matching to open positions...', dim: true },
  { text: '', dim: true },
  { text: '\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2591\u2591\u2591\u2591 78%', dim: false },
]

const finalLines: Line[] = [
  { text: '\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588 100%', dim: false },
  { text: '', dim: true },
  { text: 'RESULT:', dim: false },
  { text: '', dim: true },
  { text: 'All positions matching your qualifications are currently filled.', dim: false },
]

const snarkMap: Record<PositionId, string> = {
  ceo: 'We noticed you applied for CEO. That position requires 200 years of experience and a net worth exceeding the GDP of Mars. You currently have neither. May we suggest an alternative?',
  personality: "The Personality Hire position has been permanently filled by a chatbot. It has better metrics than any human candidate. We're sure you understand.",
  operator: 'Well. At least one of you reads the job listing.',
}

const visibleLines = ref<Line[]>([])
const showSnark = ref(false)
const showContinue = ref(false)

const snarkText = snarkMap[props.positionChoice] ?? snarkMap.operator

onMounted(async () => {
  for (const line of lines) {
    visibleLines.value.push(line)
    await delay(200)
  }
  await delay(800)
  for (const line of finalLines) {
    visibleLines.value.push(line)
    await delay(150)
  }
  await delay(400)
  showSnark.value = true
  await delay(1000)
  showContinue.value = true
})

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
</script>

<style scoped>
.processing {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.line {
  font-size: 13px;
  line-height: 1.8;
  margin: 0;
  color: rgba(196, 149, 106, 0.9);
}

.line.dim {
  color: rgba(196, 149, 106, 0.5);
}

.snark {
  margin-top: 16px;
  font-size: 13px;
  line-height: 1.8;
  color: rgba(255, 255, 255, 0.7);
  max-width: 64ch;
}

.btn {
  margin-top: 32px;
  align-self: flex-start;
  background: none;
  border: 1px solid rgba(196, 149, 106, 0.3);
  color: #c4956a;
  font-family: var(--font-mono);
  font-size: 13px;
  padding: 8px 24px;
  cursor: pointer;
  letter-spacing: 0.1em;
  transition: border-color 0.2s, color 0.2s;
}

.btn:hover {
  border-color: rgba(196, 149, 106, 0.7);
  color: rgba(196, 149, 106, 1);
}
</style>
