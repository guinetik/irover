<template>
  <Teleport to="body">
    <Transition name="science-fade">
      <div v-if="open" class="dsn-overlay" @click.self="emit('close')">
        <div class="dsn-dialog" role="dialog" aria-modal="true" aria-labelledby="dsn-dialog-title">
          <!-- Header -->
          <div class="dsn-header">
            <div class="dsn-header-left">
              <h2 id="dsn-dialog-title" class="dsn-title">DSN ARCHIVE</h2>
              <p class="dsn-subtitle">Deep Space Network — Legacy Transmissions</p>
            </div>
            <div class="dsn-header-right">
              <span class="dsn-counter font-instrument">{{ totalFound }} / {{ totalEntries }}</span>
              <button type="button" class="dsn-close" aria-label="Close" @click="emit('close')">&#x2715;</button>
            </div>
          </div>

          <!-- Timeline bar -->
          <div class="dsn-timeline" aria-label="Transmission timeline">
            <div
              v-for="entry in timelineEntries"
              :key="entry.id"
              class="dsn-timeline-dot"
              :class="{ 'dsn-timeline-dot--found': entry.discovered }"
              :title="entry.id"
            />
          </div>

          <!-- Sender filters -->
          <div class="dsn-filters" role="group" aria-label="Filter by sender">
            <button
              v-for="f in SENDER_FILTERS"
              :key="f.key"
              type="button"
              class="dsn-filter-btn"
              :class="{ 'dsn-filter-btn--active': activeSenderFilter === f.key }"
              @click="activeSenderFilter = f.key"
            >
              {{ f.label }}
            </button>
          </div>

          <!-- Two-pane content -->
          <div class="dsn-body">
            <!-- Left list -->
            <div class="dsn-list" role="list">
              <div v-if="discoveredTransmissions.length === 0" class="dsn-list-empty">
                <span>No transmissions found</span>
              </div>
              <div
                v-for="tx in discoveredTransmissions"
                :key="tx.id"
                class="dsn-list-item"
                :class="{
                  'dsn-list-item--selected': selectedId === tx.id,
                  'dsn-list-item--unread': !tx.read,
                  'dsn-list-item--colonist': tx.category === 'colonist',
                  'dsn-list-item--echo': tx.category === 'echo',
                  'dsn-list-item--tx039': tx.id === 'TX-039',
                }"
                role="listitem"
                tabindex="0"
                @click="selectTransmission(tx.id)"
                @keydown.enter="selectTransmission(tx.id)"
                @keydown.space.prevent="selectTransmission(tx.id)"
              >
                <div class="dsn-item-row1">
                  <span class="dsn-item-id font-instrument">{{ tx.id }}</span>
                  <span class="dsn-item-freq font-instrument">{{ tx.frequencyMHz }} MHz</span>
                  <span class="dsn-item-date">{{ tx.date }}</span>
                </div>
                <div class="dsn-item-row2">
                  <span class="dsn-item-sender">{{ tx.sender }}</span>
                  <span v-if="tx.senderRole" class="dsn-item-role">{{ tx.senderRole }}</span>
                </div>
                <div class="dsn-item-preview">{{ tx.body.slice(0, 80) }}{{ tx.body.length > 80 ? '…' : '' }}</div>
              </div>
            </div>

            <!-- Right detail pane -->
            <div class="dsn-detail">
              <div v-if="!selectedTx" class="dsn-detail-empty">
                <span>Select a transmission to read</span>
              </div>
              <template v-else>
                <div class="dsn-detail-header">
                  <div class="dsn-detail-meta-row">
                    <span class="dsn-detail-id font-instrument" :class="{ 'dsn-detail-id--tx039': selectedTx.id === 'TX-039' }">{{ selectedTx.id }}</span>
                    <span class="dsn-detail-freq font-instrument">{{ selectedTx.frequencyMHz }} MHz</span>
                    <span class="dsn-detail-date">{{ selectedTx.date }}</span>
                    <span
                      class="dsn-detail-tag"
                      :class="selectedTx.category === 'echo' ? 'dsn-detail-tag--echo' : 'dsn-detail-tag--colonist'"
                    >
                      {{ selectedTx.category === 'echo' ? 'DSN ECHO' : 'ARES STATION' }}
                    </span>
                  </div>
                  <div v-if="selectedTx.id !== 'TX-039'" class="dsn-detail-sender-row">
                    <span class="dsn-detail-sender">{{ selectedTx.sender }}</span>
                    <span v-if="selectedTx.senderRole" class="dsn-detail-role">{{ selectedTx.senderRole }}</span>
                  </div>
                </div>
                <!-- eslint-disable-next-line vue/no-v-html -->
                <div
                  class="dsn-detail-body"
                  :class="{ 'dsn-detail-body--tx039': selectedTx.id === 'TX-039' }"
                  v-html="formatBody(selectedTx.body)"
                />
                <div v-if="selectedTx.audioUrl" class="dsn-audio-player">
                  <button
                    type="button"
                    class="dsn-audio-btn"
                    :class="{ 'dsn-audio-btn--playing': isPlaying && playingTxId === selectedTx.id }"
                    @click="toggleAudio(selectedTx)"
                  >
                    <span class="dsn-audio-icon">{{ isPlaying && playingTxId === selectedTx.id ? '&#x25A0;' : '&#x25B6;' }}</span>
                    <span class="dsn-audio-label">{{ isPlaying && playingTxId === selectedTx.id ? 'STOP' : 'PLAY AUDIO LOG' }}</span>
                  </button>
                  <div v-if="isPlaying && playingTxId === selectedTx.id" class="dsn-audio-bar">
                    <div class="dsn-audio-bar-fill" :style="{ width: audioProgress + '%' }" />
                  </div>
                </div>
                <div class="dsn-detail-footer">
                  Discovered: Sol {{ selectedTx.discoveredAtSol }}
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { useAudio } from '@/audio/useAudio'
import type { AudioPlaybackHandle } from '@/audio/audioTypes'
import { useDSNArchive } from '@/composables/useDSNArchive'
import type { DSNTransmission } from '@/types/dsnArchive'

const audio = useAudio()

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const {
  discoveries, allTransmissions, colonistCount, echoCount,
  markRead, getTransmission, unreadCount,
} = useDSNArchive()

// suppress unused warning — these are used conceptually for counter display
void colonistCount
void echoCount
void unreadCount

const SENDER_FILTERS = [
  { key: 'all', label: 'ALL' },
  { key: 'vasquez', label: 'VASQUEZ' },
  { key: 'oliveira', label: 'OLIVEIRA' },
  { key: 'nakamura', label: 'NAKAMURA' },
  { key: 'al-rashid', label: 'AL-RASHID' },
  { key: 'tanaka', label: 'TANAKA' },
  { key: 'cortez', label: 'CORTEZ' },
  { key: 'unknown', label: 'UNKNOWN' },
  { key: 'historical', label: 'DSN ECHOES' },
] as const

const activeSenderFilter = ref<string>('all')

type DiscoveredTx = DSNTransmission & { read: boolean; discoveredAtSol: number }

const discoveredTransmissions = computed<DiscoveredTx[]>(() => {
  const found = discoveries.value
    .map(d => {
      const tx = getTransmission(d.transmissionId)
      if (!tx) return null
      return { ...tx, read: d.read, discoveredAtSol: d.discoveredAtSol }
    })
    .filter((t): t is DiscoveredTx => t !== null)
    .sort((a, b) => a.sortOrder - b.sortOrder)

  if (activeSenderFilter.value === 'all') return found
  return found.filter(t => t.senderKey === activeSenderFilter.value)
})

// Timeline: all colonist transmissions except TX-039, showing discovered state
const timelineEntries = computed(() => {
  return allTransmissions.value
    .filter(t => t.category === 'colonist' && t.id !== 'TX-039')
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(t => ({
      id: t.id,
      year: t.year,
      discovered: discoveries.value.some(d => d.transmissionId === t.id),
    }))
})

const totalFound = computed(() => discoveries.value.length)
const totalEntries = computed(() => allTransmissions.value.length)

const selectedId = ref<string | null>(null)
const selectedTx = computed(() => {
  if (!selectedId.value) return null
  return discoveredTransmissions.value.find(t => t.id === selectedId.value) ?? null
})

function selectTransmission(id: string) {
  selectedId.value = id
  markRead(id)
}

function formatBody(body: string): string {
  return body
    .replace(/\[CORRUPTED\]/g, '<span class="dsn-corrupted">[CORRUPTED]</span>')
    .replace(/\[STATIC\]/g, '<span class="dsn-static">[STATIC]</span>')
    .replace(/\[HEAVY STATIC\]/g, '<span class="dsn-static">[HEAVY STATIC]</span>')
    .replace(/\[LONG STATIC\]/g, '<span class="dsn-static">[LONG STATIC]</span>')
}

// --- Audio playback (manifest voice + dynamic src; progress via AudioPlaybackHandle) ---
/** Howler may not report `playing()` until decode starts; avoid treating early `false` as failure. */
const PLAYBACK_STARTUP_GRACE_MS = 2000

let currentHandle: AudioPlaybackHandle | null = null
const isPlaying = ref(false)
const playingTxId = ref<string | null>(null)
const audioProgress = ref(0)
let progressInterval: ReturnType<typeof setInterval> | null = null

function stopAudio() {
  if (currentHandle) {
    currentHandle.stop()
    currentHandle = null
  }
  isPlaying.value = false
  playingTxId.value = null
  audioProgress.value = 0
  if (progressInterval) {
    clearInterval(progressInterval)
    progressInterval = null
  }
}

function toggleAudio(tx: DiscoveredTx) {
  if (isPlaying.value && playingTxId.value === tx.id) {
    stopAudio()
    return
  }
  stopAudio()
  if (!tx.audioUrl) return
  // User gesture: unlock first so we never queue a pending handle or noop from “locked” state.
  audio.unlock()
  const handle = audio.play('voice.dsnTransmission', {
    src: tx.audioUrl,
    onEnd: stopAudio,
  })
  const playbackStartedAt = performance.now()
  currentHandle = handle
  playingTxId.value = tx.id
  isPlaying.value = true
  audioProgress.value = 0
  progressInterval = setInterval(() => {
    if (!currentHandle) return
    if (currentHandle.playing()) {
      audioProgress.value = currentHandle.progress() * 100
      return
    }
    const elapsed = performance.now() - playbackStartedAt
    if (elapsed > PLAYBACK_STARTUP_GRACE_MS) {
      stopAudio()
    }
  }, 100)
}

onUnmounted(stopAudio)

watch(() => props.open, (open) => {
  if (open) {
    selectedId.value = null
    activeSenderFilter.value = 'all'
  } else {
    stopAudio()
  }
})

/** Stop if the playing transmission is no longer the selected row or is hidden by the sender filter. */
watch([selectedId, activeSenderFilter, discoveredTransmissions], () => {
  if (!playingTxId.value || !currentHandle) return
  const pid = playingTxId.value
  if (selectedId.value !== pid) {
    stopAudio()
    return
  }
  if (!discoveredTransmissions.value.some((t) => t.id === pid)) {
    stopAudio()
  }
})
</script>

<style scoped>
.dsn-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(4px);
}

.dsn-dialog {
  position: relative;
  width: 900px;
  max-width: calc(100vw - 32px);
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  padding: 20px;
  background: rgba(10, 5, 2, 0.92);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(196, 149, 106, 0.25);
  border-radius: 6px;
  overflow: hidden;
}

/* Header */
.dsn-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 16px;
  flex-shrink: 0;
}

.dsn-header-left {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.dsn-header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.dsn-title {
  margin: 0;
  font-family: var(--font-ui);
  font-size: 14px;
  font-weight: bold;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: rgba(196, 149, 106, 0.9);
}

.dsn-subtitle {
  margin: 0;
  font-family: var(--font-ui);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(196, 149, 106, 0.4);
}

.dsn-counter {
  font-size: 13px;
  font-weight: bold;
  font-variant-numeric: tabular-nums;
  color: #66ffee;
}

.dsn-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  font-size: 14px;
  line-height: 1;
  color: rgba(196, 149, 106, 0.6);
  background: transparent;
  border: 1px solid rgba(196, 149, 106, 0.2);
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.dsn-close:hover {
  color: rgba(196, 149, 106, 0.9);
  border-color: rgba(196, 149, 106, 0.4);
  background: rgba(196, 149, 106, 0.08);
}

/* Timeline */
.dsn-timeline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 3px;
  margin-bottom: 12px;
  flex-shrink: 0;
}

.dsn-timeline-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgba(196, 149, 106, 0.15);
  border: 1px solid rgba(196, 149, 106, 0.2);
  transition: background 0.15s ease;
}

.dsn-timeline-dot--found {
  background: rgba(196, 149, 106, 0.7);
  border-color: rgba(196, 149, 106, 0.8);
  box-shadow: 0 0 4px rgba(196, 149, 106, 0.3);
}

/* Filters */
.dsn-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 14px;
  flex-shrink: 0;
}

.dsn-filter-btn {
  padding: 4px 10px;
  font-family: var(--font-ui);
  font-size: 10px;
  font-weight: bold;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(196, 149, 106, 0.55);
  background: transparent;
  border: 1px solid rgba(196, 149, 106, 0.15);
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.dsn-filter-btn:hover {
  color: rgba(196, 149, 106, 0.8);
  border-color: rgba(196, 149, 106, 0.3);
  background: rgba(196, 149, 106, 0.06);
}

.dsn-filter-btn--active {
  color: rgba(196, 149, 106, 0.9);
  border-color: rgba(196, 149, 106, 0.45);
  background: rgba(196, 149, 106, 0.12);
}

/* Two-pane body */
.dsn-body {
  display: flex;
  min-height: 0;
  flex: 1;
  overflow: hidden;
  border: 1px solid rgba(196, 149, 106, 0.15);
  border-radius: 4px;
}

/* Left list */
.dsn-list {
  width: 280px;
  flex-shrink: 0;
  overflow-y: auto;
  border-right: 1px solid rgba(196, 149, 106, 0.12);
  scrollbar-color: rgba(196, 149, 106, 0.35) transparent;
  scrollbar-width: thin;
}

.dsn-list::-webkit-scrollbar {
  width: 4px;
}

.dsn-list::-webkit-scrollbar-thumb {
  background: rgba(196, 149, 106, 0.35);
  border-radius: 2px;
}

.dsn-list-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 24px 16px;
  font-family: var(--font-ui);
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(196, 149, 106, 0.3);
}

.dsn-list-item {
  padding: 8px 12px;
  border-bottom: 1px solid rgba(196, 149, 106, 0.06);
  cursor: pointer;
  transition: background 0.15s ease;
  outline: none;
}

.dsn-list-item:hover {
  background: rgba(196, 149, 106, 0.06);
}

.dsn-list-item--selected {
  background: rgba(196, 149, 106, 0.1);
}

.dsn-list-item--unread.dsn-list-item--colonist {
  border-left: 2px solid rgba(196, 149, 106, 0.5);
  box-shadow: inset 2px 0 8px rgba(196, 149, 106, 0.08);
}

.dsn-list-item--unread.dsn-list-item--echo {
  border-left: 2px solid rgba(102, 180, 220, 0.5);
  box-shadow: inset 2px 0 8px rgba(102, 180, 220, 0.08);
}

.dsn-list-item--tx039 {
  border-left: 2px solid rgba(102, 255, 238, 0.5) !important;
}

.dsn-item-row1 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 2px;
}

.dsn-item-id {
  font-size: 11px;
  font-weight: bold;
  font-variant-numeric: tabular-nums;
  color: rgba(196, 149, 106, 0.85);
}

.dsn-list-item--echo .dsn-item-id {
  color: rgba(136, 180, 220, 0.85);
}

.dsn-list-item--tx039 .dsn-item-id {
  color: #66ffee;
}

.dsn-item-freq {
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  color: rgba(196, 117, 58, 0.4);
}

.dsn-item-date {
  margin-left: auto;
  font-family: var(--font-ui);
  font-size: 9px;
  letter-spacing: 0.06em;
  color: rgba(196, 117, 58, 0.35);
}

.dsn-item-row2 {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 3px;
}

.dsn-item-sender {
  font-family: var(--font-ui);
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(196, 149, 106, 0.7);
}

.dsn-list-item--echo .dsn-item-sender {
  color: rgba(136, 180, 220, 0.7);
}

.dsn-item-role {
  font-family: var(--font-ui);
  font-size: 9px;
  letter-spacing: 0.08em;
  color: rgba(196, 117, 58, 0.35);
}

.dsn-item-preview {
  font-family: var(--font-mono);
  font-size: 10px;
  line-height: 1.4;
  color: rgba(196, 149, 106, 0.4);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dsn-list-item--echo .dsn-item-preview {
  color: rgba(136, 180, 220, 0.4);
}

/* Right detail pane */
.dsn-detail {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
  scrollbar-color: rgba(196, 149, 106, 0.35) transparent;
  scrollbar-width: thin;
}

.dsn-detail::-webkit-scrollbar {
  width: 4px;
}

.dsn-detail::-webkit-scrollbar-thumb {
  background: rgba(196, 149, 106, 0.35);
  border-radius: 2px;
}

.dsn-detail-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-family: var(--font-ui);
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(196, 149, 106, 0.25);
}

.dsn-detail-header {
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(196, 149, 106, 0.1);
}

.dsn-detail-meta-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
  flex-wrap: wrap;
}

.dsn-detail-id {
  font-size: 13px;
  font-weight: bold;
  font-variant-numeric: tabular-nums;
  color: rgba(196, 149, 106, 0.9);
}

.dsn-detail-id--tx039 {
  color: #66ffee;
}

.dsn-detail-freq {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: rgba(196, 117, 58, 0.5);
}

.dsn-detail-date {
  font-family: var(--font-ui);
  font-size: 10px;
  letter-spacing: 0.08em;
  color: rgba(196, 117, 58, 0.45);
}

.dsn-detail-tag {
  margin-left: auto;
  padding: 2px 8px;
  font-family: var(--font-ui);
  font-size: 9px;
  font-weight: bold;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  border-radius: 2px;
}

.dsn-detail-tag--colonist {
  color: rgba(196, 149, 106, 0.75);
  background: rgba(196, 149, 106, 0.1);
  border: 1px solid rgba(196, 149, 106, 0.2);
}

.dsn-detail-tag--echo {
  color: rgba(102, 180, 220, 0.8);
  background: rgba(102, 180, 220, 0.08);
  border: 1px solid rgba(102, 180, 220, 0.2);
}

.dsn-detail-sender-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dsn-detail-sender {
  font-family: var(--font-ui);
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(196, 149, 106, 0.75);
}

.dsn-detail-role {
  font-family: var(--font-ui);
  font-size: 10px;
  letter-spacing: 0.08em;
  color: rgba(196, 117, 58, 0.4);
}

.dsn-detail-body {
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.7;
  color: rgba(196, 149, 106, 0.85);
  white-space: pre-wrap;
  word-break: break-word;
}

.dsn-detail-body--tx039 {
  color: #66ffee;
}

/* echo body styling — applied via parent class in template if needed */
.dsn-detail-body :deep(.dsn-corrupted) {
  color: #e05030;
  font-weight: bold;
}

.dsn-detail-body :deep(.dsn-static) {
  color: rgba(200, 200, 220, 0.3);
}

/* Audio player */
.dsn-audio-player {
  margin-top: 16px;
  padding: 10px 12px;
  background: rgba(196, 149, 106, 0.04);
  border: 1px solid rgba(196, 149, 106, 0.12);
  border-radius: 4px;
}

.dsn-audio-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0;
  font-family: var(--font-ui);
  font-size: 10px;
  font-weight: bold;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(196, 149, 106, 0.7);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: color 0.15s ease;
}

.dsn-audio-btn:hover { color: rgba(196, 149, 106, 0.95); }

.dsn-audio-btn--playing { color: #e05030; }
.dsn-audio-btn--playing:hover { color: #f06040; }

.dsn-audio-icon { font-size: 12px; }

.dsn-audio-bar {
  margin-top: 8px;
  height: 2px;
  background: rgba(196, 149, 106, 0.12);
  border-radius: 1px;
  overflow: hidden;
}

.dsn-audio-bar-fill {
  height: 100%;
  background: rgba(196, 149, 106, 0.6);
  border-radius: 1px;
  transition: width 0.15s linear;
}

.dsn-detail-footer {
  margin-top: 16px;
  padding-top: 10px;
  border-top: 1px solid rgba(196, 149, 106, 0.08);
  font-family: var(--font-ui);
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(196, 117, 58, 0.35);
}
</style>
