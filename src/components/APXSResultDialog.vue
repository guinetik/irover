<template>
  <Teleport to="body">
    <Transition name="result-fade">
      <div v-if="result" class="result-backdrop" @click.self="$emit('close')">
        <div class="result-dialog">
          <!-- Grade banner -->
          <div class="result-grade-banner" :class="`grade--${result.grade}`">
            {{ gradeLabel(result.grade) }}
          </div>

          <!-- Body -->
          <div class="result-body">
            <h2 class="result-name">{{ result.rockLabel }}</h2>

            <!-- Grade + accuracy -->
            <div class="result-meta-row">
              <span class="result-grade-letter" :style="{ color: gradeColor(result.grade) }">
                {{ result.grade }}
              </span>
              <span class="result-accuracy">Accuracy: {{ result.accuracy.toFixed(1) }}%</span>
            </div>

            <!-- Composition chart -->
            <APXSResultChart
              :true-composition="result.trueComposition"
              :measured-composition="result.measuredComposition"
              :grade="result.grade"
            />

            <!-- Anomalies -->
            <div v-if="result.anomalies.length > 0" class="result-anomalies">
              Trace anomalies: {{ result.anomalies.join(', ') }}
            </div>

            <!-- SP reward -->
            <div class="result-sp">+{{ result.sp }} SP</div>
          </div>

          <!-- Actions -->
          <div class="result-actions">
            <button class="btn-acknowledge" @click="$emit('acknowledge')">
              ACKNOWLEDGE
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import type { APXSQueueEntry } from '@/composables/useAPXSQueue'
import type { APXSGrade } from '@/lib/apxsComposition'
import APXSResultChart from '@/components/APXSResultChart.vue'

defineProps<{
  result: APXSQueueEntry | null
}>()

defineEmits<{
  acknowledge: []
  close: []
}>()

function gradeLabel(grade: APXSGrade): string {
  const labels: Record<APXSGrade, string> = {
    S: 'PERFECT ANALYSIS',
    A: 'EXCELLENT ANALYSIS',
    B: 'GOOD ANALYSIS',
    C: 'FAIR ANALYSIS',
    D: 'POOR ANALYSIS',
  }
  return labels[grade]
}

function gradeColor(grade: APXSGrade): string {
  if (grade === 'S') return '#ffdd33'
  if (grade === 'A') return '#44dd88'
  return '#e8a060'
}
</script>

<style scoped>
.result-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
}

.result-dialog {
  width: 500px;
  max-width: calc(100vw - 32px);
  background: rgba(10, 5, 2, 0.92);
  backdrop-filter: blur(18px);
  border: 1px solid rgba(196, 117, 58, 0.25);
  border-radius: 10px;
  overflow: hidden;
  font-family: var(--font-ui, monospace);
  box-shadow: 0 0 80px rgba(0, 0, 0, 0.6);
}

/* Grade banner */
.result-grade-banner {
  width: 100%;
  padding: 10px 20px;
  font-size: 11px;
  font-weight: bold;
  letter-spacing: 0.25em;
  text-align: center;
  color: rgba(255, 255, 255, 0.9);
}

.grade--S { background: linear-gradient(135deg, #8b6914, #c49a2a); }
.grade--A { background: #2a6b5a; }
.grade--B { background: #6b5a1a; }
.grade--C { background: #6b4a1a; }
.grade--D { background: #666; }

/* Body */
.result-body {
  padding: 28px 28px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  text-align: center;
}

.result-name {
  margin: 0;
  font-size: 22px;
  font-weight: bold;
  color: #ffffff;
  letter-spacing: 0.05em;
  line-height: 1.2;
}

.result-meta-row {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.result-grade-letter {
  font-size: 28px;
  font-weight: bold;
  letter-spacing: 0.05em;
}

.result-accuracy {
  font-size: 11px;
  color: rgba(196, 117, 58, 0.6);
  letter-spacing: 0.08em;
}

.result-anomalies {
  font-size: 10px;
  color: #cc55ff;
  letter-spacing: 0.05em;
}

.result-sp {
  font-size: 26px;
  font-weight: bold;
  color: #5dc9a5;
  letter-spacing: 0.05em;
}

/* Actions */
.result-actions {
  display: flex;
  gap: 12px;
  padding: 16px 28px 24px;
  justify-content: center;
  align-items: center;
  border-top: 1px solid rgba(196, 117, 58, 0.1);
}

.btn-acknowledge {
  padding: 10px 28px;
  background: rgba(196, 117, 58, 0.15);
  border: 1px solid rgba(196, 117, 58, 0.6);
  border-radius: 6px;
  color: #e8a060;
  font-family: inherit;
  font-size: 12px;
  font-weight: bold;
  letter-spacing: 0.18em;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s;
}

.btn-acknowledge:hover {
  background: rgba(196, 117, 58, 0.28);
  border-color: rgba(196, 117, 58, 0.9);
}

/* Transition */
.result-fade-enter-active,
.result-fade-leave-active {
  transition: opacity 0.25s ease;
}

.result-fade-enter-active .result-dialog,
.result-fade-leave-active .result-dialog {
  transition: transform 0.25s ease, opacity 0.25s ease;
}

.result-fade-enter-from,
.result-fade-leave-to {
  opacity: 0;
}

.result-fade-enter-from .result-dialog,
.result-fade-leave-to .result-dialog {
  opacity: 0;
  transform: scale(0.95);
}
</style>
