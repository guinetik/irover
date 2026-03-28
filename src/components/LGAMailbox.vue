<script setup lang="ts">
import { ref, computed } from 'vue'
import { useUiSound } from '@/composables/useUiSound'
import type { LGAMessage } from '@/types/lgaMailbox'
import { MARS_SOL_CLOCK_MINUTES } from '@/lib/marsTimeConstants'
import ScrambleText from '@/components/ScrambleText.vue'

const props = defineProps<{
  messages: LGAMessage[]
  unreadCount: number
}>()

const emit = defineEmits<{
  markRead: [messageId: string]
  'open-message': [message: LGAMessage]
}>()

const { playUiCue } = useUiSound()

const activeTab = ref<'inbox' | 'sent'>('inbox')

const inbox = computed(() => props.messages.filter(m => m.direction === 'received').reverse())
const sent = computed(() => props.messages.filter(m => m.direction === 'sent').reverse())
const displayedMessages = computed(() => activeTab.value === 'inbox' ? inbox.value : sent.value)

const emptyLabel = computed(() =>
  activeTab.value === 'inbox' ? 'No received messages' : 'No sent messages',
)

/**
 * Switches inbox / sent tab with the shared tab-toggle cue.
 */
function setTab(tab: 'inbox' | 'sent'): void {
  if (activeTab.value === tab) return
  playUiCue('ui.switch')
  activeTab.value = tab
}

/** Opens the message dialog; list rows stay ellipsized previews (full text only in the overlay dialog). */
function openMessageRow(msg: LGAMessage): void {
  playUiCue('ui.science')
  if (!msg.read && msg.direction === 'received') emit('markRead', msg.id)
  emit('open-message', msg)
}

function formatTimeOfDay(tod: number): string {
  const totalMinutes = tod * MARS_SOL_CLOCK_MINUTES
  const hours = Math.floor(totalMinutes / 60)
  const minutes = Math.floor(totalMinutes % 60)
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
}
</script>

<template>
  <div class="lga-mailbox">
    <div class="mailbox-header">
      <span class="mailbox-title">
        <ScrambleText text="LGA MAILBOX" :speed="22" :scramble-frames="10" :stagger="1" />
      </span>
    </div>

    <div class="mailbox-tabs">
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'inbox' }"
        type="button"
        @click="setTab('inbox')"
      >
        <ScrambleText text="INBOX" :speed="28" :scramble-frames="6" :stagger="1" />
        <span v-if="unreadCount > 0" class="unread-badge">
          <ScrambleText
            :key="`n-${unreadCount}`"
            :text="String(unreadCount)"
            :speed="24"
            :scramble-frames="4"
            :stagger="0"
          />
        </span>
      </button>
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'sent' }"
        type="button"
        @click="setTab('sent')"
      >
        <ScrambleText text="SENT" :speed="28" :scramble-frames="6" :stagger="1" />
      </button>
    </div>

    <div class="mailbox-list">
      <div v-if="displayedMessages.length === 0" class="mailbox-empty">
        <ScrambleText
          :key="emptyLabel"
          :text="emptyLabel"
          :speed="26"
          :scramble-frames="8"
          :stagger="1"
        />
      </div>

      <div
        v-for="msg in displayedMessages"
        :key="msg.id"
        class="mailbox-item"
        :class="{ unread: !msg.read && msg.direction === 'received' }"
        @click="openMessageRow(msg)"
      >
        <div class="msg-row">
          <span class="msg-dot" :class="{ unread: !msg.read && msg.direction === 'received' }">●</span>
          <span v-if="msg.type === 'mission'" class="msg-mission-badge">[M]</span>
          <span class="msg-subject">
            <span class="msg-subject-clip" :title="msg.subject">{{ msg.subject }}</span>
          </span>
        </div>
        <div class="msg-meta">
          SOL {{ msg.sol }} — {{ formatTimeOfDay(msg.timeOfDay) }}
        </div>
        <div class="msg-body-preview">
          <span class="msg-body-clip" :title="msg.body">{{ msg.body }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.lga-mailbox {
  width: 280px;
  max-height: 360px;
  display: flex;
  flex-direction: column;
  background: rgba(10, 5, 2, 0.85);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(136, 204, 255, 0.2);
  border-radius: 8px;
  font-family: var(--font-ui);
  font-size: 11px;
  overflow: hidden;
}

.mailbox-header {
  padding: 8px 12px 4px;
}

.mailbox-title {
  color: rgba(136, 204, 255, 0.8);
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.mailbox-title :deep(.scramble-text) {
  color: inherit;
}

.mailbox-tabs {
  display: flex;
  gap: 2px;
  padding: 4px 8px;
  border-bottom: 1px solid rgba(136, 204, 255, 0.1);
}

.tab-btn {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px 4px;
  background: none;
  border: 1px solid rgba(136, 204, 255, 0.15);
  border-radius: 4px;
  color: rgba(200, 200, 220, 0.5);
  font-family: var(--font-ui);
  font-size: 10px;
  letter-spacing: 0.08em;
  padding: 3px 10px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.tab-btn :deep(.scramble-text) {
  color: inherit;
}

.tab-btn.active {
  color: rgba(136, 204, 255, 0.95);
  border-color: rgba(136, 204, 255, 0.4);
  background: rgba(136, 204, 255, 0.08);
}

.tab-btn.active :deep(.scramble-text) {
  color: inherit;
}

.unread-badge {
  display: inline-block;
  background: rgba(136, 204, 255, 0.85);
  color: rgba(0, 0, 0, 0.9);
  border-radius: 8px;
  padding: 0 5px;
  font-size: 9px;
  margin-left: 4px;
  font-weight: bold;
}

.unread-badge :deep(.scramble-text) {
  color: inherit;
}

.mailbox-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.mailbox-empty {
  padding: 20px 12px;
  text-align: center;
  color: rgba(200, 200, 220, 0.3);
  font-style: italic;
}

.mailbox-empty :deep(.scramble-text) {
  color: inherit;
}

.mailbox-item {
  padding: 6px 12px;
  cursor: pointer;
  border-bottom: 1px solid rgba(136, 204, 255, 0.05);
  transition: background 0.12s ease;
}

.mailbox-item:hover {
  background: rgba(136, 204, 255, 0.05);
}

.msg-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.msg-dot {
  font-size: 6px;
  color: rgba(200, 200, 220, 0.2);
}

.msg-dot.unread {
  color: #88ccff;
  text-shadow: 0 0 4px rgba(136, 204, 255, 0.5);
}

.msg-mission-badge {
  flex-shrink: 0;
  font-size: 9px;
  color: #ffcc44;
  letter-spacing: 0.04em;
  font-weight: bold;
}

.msg-subject {
  color: rgba(200, 200, 220, 0.7);
  min-width: 0;
  flex: 1;
}

.msg-subject-clip {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mailbox-item.unread .msg-subject {
  color: rgba(200, 200, 220, 0.95);
  font-weight: bold;
}

.mailbox-item.unread .msg-subject-clip {
  color: inherit;
  font-weight: bold;
}

.msg-meta {
  color: rgba(200, 200, 220, 0.3);
  font-size: 9px;
  padding-left: 12px;
  font-family: var(--font-instrument);
}

.msg-body-preview {
  margin-top: 2px;
  padding-left: 12px;
  color: rgba(200, 200, 220, 0.35);
  font-family: var(--font-instrument);
  font-size: 9px;
  line-height: 1.3;
}

.msg-body-clip {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
