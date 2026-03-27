<template>
  <Teleport to="body">
    <Transition name="science-fade">
      <div v-if="message" class="msg-overlay" @click.self="emitClose">
        <div class="msg-dialog" role="dialog" aria-modal="true">
          <div class="msg-head">
            <div class="msg-from" v-if="message.from">FROM: {{ message.from }}</div>
            <h2 class="msg-subject">{{ message.subject }}</h2>
            <button type="button" class="msg-close" aria-label="Close" @click="emitClose">&times;</button>
          </div>
          <div class="msg-body">
            <p>{{ message.body }}</p>
          </div>
          <div class="msg-footer">
            <template v-if="message.type === 'mission' && !missionAccepted">
              <button type="button" class="msg-btn msg-btn-accept" @click="emitAcceptMission(message.missionId ?? '')">
                ACCEPT MISSION
              </button>
              <button type="button" class="msg-btn msg-btn-later" @click="emitClose">
                MAYBE LATER
              </button>
            </template>
            <template v-else-if="message.type === 'mission' && missionAccepted">
              <span class="msg-accepted-label">MISSION ACCEPTED</span>
              <button type="button" class="msg-btn msg-btn-later" @click="emitClose">CLOSE</button>
            </template>
            <template v-else>
              <button type="button" class="msg-btn msg-btn-later" @click="emitClose">CLOSE</button>
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { useUiSound } from '@/composables/useUiSound'
import type { LGAMessage } from '@/types/lgaMailbox'

defineProps<{
  message: LGAMessage | null
  missionAccepted: boolean
}>()

const emit = defineEmits<{
  close: []
  'accept-mission': [missionId: string]
}>()

const { playUiCue } = useUiSound()

/**
 * Navbar / panel open cue — used for LGA message dismissals and mission acceptance.
 */
function playConfirmCue(): void {
  playUiCue('ui.confirm')
}

function emitClose(): void {
  playConfirmCue()
  emit('close')
}

function emitAcceptMission(missionId: string): void {
  playConfirmCue()
  emit('accept-mission', missionId)
}
</script>

<style scoped>
.msg-overlay {
  position: fixed;
  inset: 0;
  z-index: 55;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
}

.msg-dialog {
  width: 500px;
  max-width: 90vw;
  max-height: 80vh;
  background: rgba(10, 5, 2, 0.92);
  border: 1px solid rgba(196, 149, 106, 0.25);
  border-radius: 12px;
  backdrop-filter: blur(16px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.msg-head {
  padding: 16px 20px 12px;
  border-bottom: 1px solid rgba(196, 149, 106, 0.15);
  position: relative;
}

.msg-from {
  font-size: 10px;
  letter-spacing: 0.1em;
  color: rgba(196, 149, 106, 0.6);
  margin-bottom: 4px;
  text-transform: uppercase;
}

.msg-subject {
  font-size: 16px;
  font-weight: 600;
  color: rgba(220, 210, 200, 0.95);
  margin: 0;
  padding-right: 30px;
}

.msg-close {
  position: absolute;
  top: 12px;
  right: 16px;
  background: none;
  border: none;
  color: rgba(200, 200, 220, 0.5);
  font-size: 22px;
  cursor: pointer;
  padding: 4px 8px;
  line-height: 1;
}
.msg-close:hover { color: rgba(200, 200, 220, 0.9); }

.msg-body {
  padding: 16px 20px;
  flex: 1;
  overflow-y: auto;
  color: rgba(200, 200, 220, 0.8);
  font-size: 14px;
  line-height: 1.6;
}
.msg-body p { margin: 0; }

.msg-footer {
  padding: 12px 20px 16px;
  border-top: 1px solid rgba(196, 149, 106, 0.15);
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  align-items: center;
}

.msg-btn {
  padding: 8px 18px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.05em;
  cursor: pointer;
  text-transform: uppercase;
  border: 1px solid transparent;
}

.msg-btn-accept {
  background: rgba(102, 255, 238, 0.15);
  border-color: rgba(102, 255, 238, 0.4);
  color: #66ffee;
}
.msg-btn-accept:hover {
  background: rgba(102, 255, 238, 0.25);
}

.msg-btn-later {
  background: rgba(200, 200, 220, 0.08);
  border-color: rgba(200, 200, 220, 0.2);
  color: rgba(200, 200, 220, 0.7);
}
.msg-btn-later:hover {
  background: rgba(200, 200, 220, 0.15);
}

.msg-accepted-label {
  font-size: 11px;
  letter-spacing: 0.1em;
  color: rgba(102, 255, 238, 0.7);
  text-transform: uppercase;
}

.science-fade-enter-active,
.science-fade-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.science-fade-enter-from,
.science-fade-leave-to {
  opacity: 0;
  transform: scale(0.96);
}
</style>
