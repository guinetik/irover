<template>
  <div class="processing">
    <p v-for="(line, i) in allLines" :key="i" class="line" :class="{ dim: line.dim }">
      <ScrambleText v-if="line.text" :text="line.text" :delay="i * 300" :play-sound="true" />
      <span v-else>&nbsp;</span>
    </p>
    <p v-if="showSnark" class="snark">
      <ScrambleText :text="snarkText" :delay="allLines.length * 300 + 400" :play-sound="true" />
    </p>
    <button v-if="showContinue" class="btn" @click="handleContinue">
      <ScrambleText text="[ CONTINUE ]" :delay="allLines.length * 300 + 1200" :play-sound="true" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import type { PositionId } from './StepPosition.vue'
import ScrambleText from '@/components/ScrambleText.vue'
import { useAudio } from '@/audio/useAudio'
import type { AudioSoundId } from '@/audio/audioManifest'
import type { AudioPlaybackHandle } from '@/audio/audioTypes'

const props = defineProps<{ positionChoice: PositionId }>()
const emit = defineEmits<{ continue: [] }>()

const audio = useAudio()
let processingAudio: AudioPlaybackHandle | null = null
function handleContinue(): void {
  audio.play('ui.confirm' as AudioSoundId)
  emit('continue')
}

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

const allLines = [...lines, ...finalLines]

const snarkMap: Record<PositionId, string> = {
  ceo: 'We noticed you applied for CEO. That position requires 200 years of experience and a net worth exceeding the GDP of Mars. You currently have neither. May we suggest an alternative?',
  personality: "The Personality Hire position has been permanently filled by a chatbot. It has better metrics than any human candidate. We're sure you understand.",
  operator: 'Well. At least one of you reads the job listing.',
}

const showSnark = ref(true)
const showContinue = ref(true)

const snarkText = snarkMap[props.positionChoice] ?? snarkMap.operator

onMounted(() => {
  processingAudio = audio.play('ui.processing', { loop: true })
})

onUnmounted(() => {
  processingAudio?.stop()
  processingAudio = null
})
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
  color: rgba(255, 215, 165, 0.95);
}

.line.dim {
  color: rgba(255, 200, 145, 0.72);
}

.snark {
  margin-top: 16px;
  font-size: 13px;
  line-height: 1.8;
  color: rgba(255, 228, 200, 0.92);
  max-width: 64ch;
}

.btn {
  margin-top: 32px;
  align-self: flex-start;
  background: none;
  border: 1px solid rgba(255, 190, 120, 0.45);
  color: rgba(255, 200, 130, 1);
  font-family: var(--font-mono);
  font-size: 13px;
  padding: 8px 24px;
  cursor: pointer;
  letter-spacing: 0.1em;
  transition: border-color 0.2s, color 0.2s;
}

.btn:hover {
  border-color: rgba(255, 210, 150, 0.85);
  color: rgba(255, 220, 170, 1);
}
</style>
