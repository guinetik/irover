<script setup lang="ts">
import { ref, computed } from 'vue'
import type { LGAMessage } from '@/types/lgaMailbox'

const props = defineProps<{
  messages: LGAMessage[]
  unreadCount: number
}>()

const emit = defineEmits<{
  markRead: [messageId: string]
}>()

const activeTab = ref<'inbox' | 'sent'>('inbox')
const expandedId = ref<string | null>(null)

const inbox = computed(() => props.messages.filter(m => m.direction === 'received').reverse())
const sent = computed(() => props.messages.filter(m => m.direction === 'sent').reverse())
const displayedMessages = computed(() => activeTab.value === 'inbox' ? inbox.value : sent.value)

function toggleMessage(msg: LGAMessage) {
  if (expandedId.value === msg.id) {
    expandedId.value = null
  } else {
    expandedId.value = msg.id
    if (!msg.read) emit('markRead', msg.id)
  }
}

function formatTimeOfDay(tod: number): string {
  const totalMinutes = tod * 1477  // MARS_SOL_CLOCK_MINUTES
  const hours = Math.floor(totalMinutes / 60)
  const minutes = Math.floor(totalMinutes % 60)
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
}
</script>

<template>
  <div class="lga-mailbox">
    <div class="mailbox-header">
      <span class="mailbox-title">LGA MAILBOX</span>
    </div>

    <div class="mailbox-tabs">
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'inbox' }"
        @click="activeTab = 'inbox'"
      >
        INBOX
        <span v-if="unreadCount > 0" class="unread-badge">{{ unreadCount }}</span>
      </button>
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'sent' }"
        @click="activeTab = 'sent'"
      >
        SENT
      </button>
    </div>

    <div class="mailbox-list">
      <div v-if="displayedMessages.length === 0" class="mailbox-empty">
        No {{ activeTab === 'inbox' ? 'received' : 'sent' }} messages
      </div>

      <div
        v-for="msg in displayedMessages"
        :key="msg.id"
        class="mailbox-item"
        :class="{ unread: !msg.read, expanded: expandedId === msg.id }"
        @click="toggleMessage(msg)"
      >
        <div class="msg-row">
          <span class="msg-dot" :class="{ unread: !msg.read }">●</span>
          <span class="msg-subject">{{ msg.subject }}</span>
        </div>
        <div class="msg-meta">
          SOL {{ msg.sol }} — {{ formatTimeOfDay(msg.timeOfDay) }}
        </div>
        <div v-if="expandedId === msg.id" class="msg-body">
          {{ msg.body }}
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

.mailbox-tabs {
  display: flex;
  gap: 2px;
  padding: 4px 8px;
  border-bottom: 1px solid rgba(136, 204, 255, 0.1);
}

.tab-btn {
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

.tab-btn.active {
  color: rgba(136, 204, 255, 0.95);
  border-color: rgba(136, 204, 255, 0.4);
  background: rgba(136, 204, 255, 0.08);
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

.mailbox-item {
  padding: 6px 12px;
  cursor: pointer;
  border-bottom: 1px solid rgba(136, 204, 255, 0.05);
  transition: background 0.12s ease;
}

.mailbox-item:hover {
  background: rgba(136, 204, 255, 0.05);
}

.mailbox-item.expanded {
  background: rgba(136, 204, 255, 0.08);
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

.msg-subject {
  color: rgba(200, 200, 220, 0.7);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mailbox-item.unread .msg-subject {
  color: rgba(200, 200, 220, 0.95);
  font-weight: bold;
}

.msg-meta {
  color: rgba(200, 200, 220, 0.3);
  font-size: 9px;
  padding-left: 12px;
  font-family: var(--font-instrument);
}

.msg-body {
  margin-top: 6px;
  padding: 6px 8px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 4px;
  color: rgba(200, 200, 220, 0.6);
  font-family: var(--font-instrument);
  font-size: 10px;
  line-height: 1.4;
  white-space: pre-wrap;
}
</style>
