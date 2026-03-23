<template>
  <Teleport to="body">
    <Transition name="science-fade">
      <div v-if="open" class="science-overlay" @click.self="$emit('close')">
        <div
          class="sp-ledger-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sp-ledger-title"
        >
          <div class="science-head">
            <h2 id="sp-ledger-title" class="science-title">SCIENCE POINTS</h2>
            <button type="button" class="science-close" aria-label="Close" @click="$emit('close')">&times;</button>
          </div>
          <div class="sp-ledger-body">
            <p v-if="entries.length === 0" class="sp-ledger-empty">No science points earned yet.</p>
            <ul v-else class="sp-ledger-list" role="list">
              <li v-for="e in entries" :key="e.id" class="sp-ledger-row">
                <div class="sp-ledger-main">
                  <span class="sp-ledger-label">{{ formatRowLabel(e) }}</span>
                  <span v-if="showBonusNote(e)" class="sp-ledger-bonus font-instrument"
                    >×{{ e.bonusMult.toFixed(1) }}</span
                  >
                </div>
                <div class="sp-ledger-meta">
                  <span class="sp-ledger-amount font-instrument">+{{ e.amount }} SP</span>
                  <span class="sp-ledger-time font-instrument">{{ formatTime(e.atMs) }}</span>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSciencePoints, type SPLedgerEntry, type SPSource } from '@/composables/useSciencePoints'

defineProps<{
  open: boolean
}>()

defineEmits<{
  close: []
}>()

const { spLedger } = useSciencePoints()

const entries = computed(() => spLedger.value)

const SOURCE_HEADLINE: Record<SPSource, string> = {
  mastcam: 'Mastcam',
  chemcam: 'ChemCam',
  drill: 'Drill',
  'chemcam-ack': 'ChemCam review',
  dan: 'DAN',
  sam: 'SAM',
  survival: 'Mars survival',
}

/**
 * Human-readable primary line: instrument/category plus detail (rock or DAN reason).
 */
function formatRowLabel(e: SPLedgerEntry): string {
  const head = SOURCE_HEADLINE[e.source]
  if (!e.detail.trim()) return head
  return `${head} — ${e.detail}`
}

/**
 * Show multiplier chip for instrument sources when bonus is not 1×.
 */
function showBonusNote(e: SPLedgerEntry): boolean {
  return (
    e.source !== 'dan' &&
    e.source !== 'survival' &&
    e.source !== 'chemcam-ack' &&
    e.bonusMult !== 1
  )
}

/**
 * Local time for ledger timestamp display.
 */
function formatTime(atMs: number): string {
  try {
    return new Date(atMs).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}
</script>

<style scoped>
.science-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(6px);
}

.sp-ledger-dialog {
  width: min(440px, 100%);
  max-height: min(72vh, 520px);
  display: flex;
  flex-direction: column;
  background: rgba(10, 6, 4, 0.96);
  border: 1px solid rgba(196, 117, 58, 0.35);
  border-radius: 10px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.55);
  overflow: hidden;
  --scrollbar-track: rgba(4, 14, 12, 0.9);
  --scrollbar-thumb: rgba(102, 255, 238, 0.22);
  --scrollbar-thumb-hover: rgba(102, 255, 238, 0.42);
  scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
}

.science-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(102, 255, 238, 0.15);
  flex-shrink: 0;
}

.science-title {
  margin: 0;
  font-family: var(--font-ui);
  font-size: 14px;
  font-weight: bold;
  letter-spacing: 0.2em;
  color: #66ffee;
}

.science-close {
  background: none;
  border: none;
  color: rgba(102, 255, 238, 0.45);
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
  padding: 0 6px;
}
.science-close:hover {
  color: #66ffee;
}

.sp-ledger-body {
  flex: 1;
  min-height: 0;
  padding: 12px 16px 16px;
  overflow-y: auto;
}

.sp-ledger-empty {
  margin: 0;
  padding: 24px 8px;
  text-align: center;
  font-family: var(--font-ui);
  font-size: 12px;
  letter-spacing: 0.08em;
  color: rgba(196, 117, 58, 0.55);
}

.sp-ledger-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sp-ledger-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(102, 255, 238, 0.12);
  border-radius: 6px;
}

.sp-ledger-main {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.sp-ledger-label {
  font-family: var(--font-ui);
  font-size: 12px;
  font-weight: 600;
  color: rgba(232, 220, 200, 0.95);
  letter-spacing: 0.04em;
  line-height: 1.35;
}

.sp-ledger-bonus {
  flex-shrink: 0;
  font-size: 11px;
  color: rgba(102, 255, 238, 0.75);
}

.sp-ledger-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.sp-ledger-amount {
  font-size: 13px;
  color: #66ffee;
}

.sp-ledger-time {
  font-size: 11px;
  color: rgba(102, 255, 238, 0.45);
}

.science-fade-enter-active,
.science-fade-leave-active {
  transition: opacity 0.2s ease;
}
.science-fade-enter-active .sp-ledger-dialog,
.science-fade-leave-active .sp-ledger-dialog {
  transition: transform 0.2s ease, opacity 0.2s ease;
}
.science-fade-enter-from,
.science-fade-leave-to {
  opacity: 0;
}
.science-fade-enter-from .sp-ledger-dialog,
.science-fade-leave-to .sp-ledger-dialog {
  opacity: 0;
  transform: scale(0.98) translateY(8px);
}
</style>
