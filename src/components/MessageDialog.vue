<template>
  <Teleport to="body">
    <Transition name="science-fade">
      <div v-if="message" class="msg-overlay" @click.self="emitClose">
        <div class="msg-dialog" role="dialog" aria-modal="true">
          
          <div class="msg-head">
            <div class="msg-head-content">
              <div class="msg-from" v-if="message.from">
                <span class="from-label">FROM:</span> <span class="from-value"><ScrambleText :text="message.from" :play-sound="true" :speed="20" :scramble-frames="4" :stagger="1" /></span>
              </div>
              <h2 class="msg-subject"><ScrambleText :text="message.subject" :play-sound="true" :speed="25" :scramble-frames="5" :stagger="1.5" /></h2>
            </div>
            <button type="button" class="msg-close" aria-label="Close" @click="emitClose">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M1 1L13 13M1 13L13 1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
          <div class="msg-body">
            <!-- eslint-disable-next-line vue/no-v-html -->
            <div class="msg-body-content" v-html="message.body" />
          </div>
          <div class="msg-footer">
            <div class="footer-actions">
              <template v-if="message.type === 'mission' && !missionAccepted">
                <button type="button" class="msg-btn msg-btn-later" @click="emitClose">
                  <span class="btn-text">DECLINE</span>
                </button>
                <button type="button" class="msg-btn msg-btn-accept" @click="emitAcceptMission(message.missionId ?? '')">
                  <span class="btn-text">ACCEPT MISSION</span>
                  <div class="btn-glow"></div>
                </button>
              </template>
              <template v-else-if="message.type === 'mission' && missionAccepted">
                <div class="status-badge" :class="{ 'status-completed': missionCompleted }">
                  <span class="status-dot"></span>
                  <span class="msg-accepted-label">{{ missionCompleted ? 'MISSION COMPLETED' : 'MISSION ACTIVE' }}</span>
                </div>
                <button type="button" class="msg-btn msg-btn-later" @click="emitClose">
                  <span class="btn-text">CLOSE</span>
                </button>
              </template>
              <template v-else>
                <button type="button" class="msg-btn msg-btn-primary" @click="emitClose">
                  <span class="btn-text">ACKNOWLEDGE</span>
                  <div class="btn-glow"></div>
                </button>
              </template>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { useUiSound } from '@/composables/useUiSound'
import type { LGAMessage } from '@/types/lgaMailbox'
import ScrambleText from '@/components/ScrambleText.vue'

defineProps<{
  message: LGAMessage | null
  missionAccepted: boolean
  missionCompleted?: boolean
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
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.msg-dialog {
  position: relative;
  width: 680px;
  max-width: 100%;
  max-height: 85vh;
  background: rgba(15, 10, 8, 0.95);
  border: 1px solid rgba(196, 149, 106, 0.25);
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.05);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.msg-head {
  padding: 20px 24px 16px;
  border-bottom: 1px solid rgba(196, 149, 106, 0.15);
  background: rgba(255, 255, 255, 0.02);
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.msg-head-content {
  flex: 1;
  padding-right: 20px;
}

.msg-from {
  font-family: 'Rajdhani', 'Courier New', monospace;
  font-size: 12px;
  letter-spacing: 0.05em;
  color: rgba(255, 255, 255, 0.8);
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.from-label {
  color: rgba(196, 149, 106, 0.8);
  font-weight: 600;
  font-size: 11px;
}

.from-value {
  color: rgba(220, 210, 200, 0.9);
}

.msg-subject {
  font-family: 'Rajdhani', sans-serif;
  font-size: 20px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: #fff;
  margin: 0;
}

.msg-close {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  color: rgba(200, 200, 220, 0.6);
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
}
.msg-close:hover { 
  background: rgba(196, 149, 106, 0.15);
  border-color: rgba(196, 149, 106, 0.4);
  color: #fff;
}

.msg-body {
  padding: 24px;
  flex: 1;
  overflow-y: auto;
  position: relative;
  display: flex;
  flex-direction: column;
}

/* Custom scrollbar for body */
.msg-body::-webkit-scrollbar {
  width: 6px;
}
.msg-body::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 3px;
}
.msg-body::-webkit-scrollbar-thumb {
  background: rgba(196, 149, 106, 0.3);
  border-radius: 3px;
}
.msg-body::-webkit-scrollbar-thumb:hover {
  background: rgba(196, 149, 106, 0.5);
}

.msg-body-content {
  color: rgba(220, 210, 200, 0.85);
  font-size: 15px;
  line-height: 1.6;
  font-family: 'Inter', sans-serif;
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: auto; /* Pushes the chat to the bottom if it's smaller than the container */
}

:deep(.msg-body-content p) { 
  margin: 0;
  padding: 14px 18px;
  background: rgba(196, 149, 106, 0.06);
  border: 1px solid rgba(196, 149, 106, 0.15);
  border-left: 3px solid rgba(196, 149, 106, 0.4);
  border-radius: 4px 12px 12px 12px;
  max-width: 100%;
  align-self: flex-start;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  position: relative;
  transform-origin: bottom left;
  
  /* Animation for sequential appearance */
  opacity: 0;
  animation: message-appear 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
}

@keyframes message-appear {
  0% { opacity: 0; transform: translateY(20px) scale(0.9); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}

:deep(.msg-body-content p:nth-child(1)) { animation-delay: 0.2s; }
:deep(.msg-body-content p:nth-child(2)) { animation-delay: 0.8s; }
:deep(.msg-body-content p:nth-child(3)) { animation-delay: 1.4s; }
:deep(.msg-body-content p:nth-child(4)) { animation-delay: 2.0s; }
:deep(.msg-body-content p:nth-child(5)) { animation-delay: 2.6s; }
:deep(.msg-body-content p:nth-child(6)) { animation-delay: 3.2s; }
:deep(.msg-body-content p:nth-child(7)) { animation-delay: 3.8s; }
:deep(.msg-body-content p:nth-child(8)) { animation-delay: 4.4s; }
:deep(.msg-body-content p:nth-child(9)) { animation-delay: 5.0s; }
:deep(.msg-body-content p:nth-child(10)) { animation-delay: 5.6s; }
:deep(.msg-body-content p:nth-child(11)) { animation-delay: 6.2s; }
:deep(.msg-body-content p:nth-child(12)) { animation-delay: 6.8s; }
:deep(.msg-body-content p:nth-child(n+13)) { animation-delay: 7.4s; }

:deep(.msg-body-content p::before) {
  content: '';
  position: absolute;
  top: -1px;
  left: -8px;
  border-width: 8px 8px 0 0;
  border-style: solid;
  border-color: rgba(196, 149, 106, 0.4) transparent transparent transparent;
  display: none; /* Optional: turn on if you want a literal chat tail, but the flat border-radius often looks cleaner for sci-fi */
}

:deep(.msg-body-content p:last-child) {
  margin-bottom: 0;
}

.msg-footer {
  padding: 16px 24px;
  background: rgba(0, 0, 0, 0.2);
  border-top: 1px solid rgba(196, 149, 106, 0.1);
  display: flex;
  justify-content: flex-end;
  align-items: center;
}

.footer-actions {
  display: flex;
  gap: 12px;
  align-items: center;
  width: 100%;
  justify-content: flex-end;
}

.msg-btn {
  position: relative;
  padding: 10px 20px;
  font-family: 'Rajdhani', 'Courier New', monospace;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.05em;
  cursor: pointer;
  text-transform: uppercase;
  border-radius: 6px;
  overflow: hidden;
  transition: all 0.3s ease;
}

.btn-text {
  position: relative;
  z-index: 2;
}

.btn-glow {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.15), transparent);
  transform: translateX(-100%);
  transition: transform 0.5s ease;
  z-index: 1;
}

.msg-btn:hover .btn-glow {
  transform: translateX(100%);
}

.msg-btn-accept, .msg-btn-primary {
  background: rgba(102, 255, 238, 0.1);
  border: 1px solid rgba(102, 255, 238, 0.4);
  color: #66ffee;
}
.msg-btn-accept:hover, .msg-btn-primary:hover {
  background: rgba(102, 255, 238, 0.2);
  box-shadow: 0 0 12px rgba(102, 255, 238, 0.15);
}

.msg-btn-later {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: rgba(220, 210, 200, 0.8);
}
.msg-btn-later:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.status-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: rgba(102, 255, 238, 0.08);
  border: 1px solid rgba(102, 255, 238, 0.25);
  border-radius: 6px;
  margin-right: auto; /* Pushes the close button to the right */
}

.status-badge.status-completed {
  background: rgba(150, 255, 100, 0.08);
  border-color: rgba(150, 255, 100, 0.25);
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #66ffee;
  box-shadow: 0 0 8px #66ffee;
  animation: pulse 2s infinite;
}

.status-completed .status-dot {
  background: #96ff64;
  box-shadow: 0 0 8px #96ff64;
  animation: none; /* No pulse for completed */
}

@keyframes pulse {
  0% { opacity: 1; box-shadow: 0 0 8px #66ffee; }
  50% { opacity: 0.5; box-shadow: 0 0 2px #66ffee; }
  100% { opacity: 1; box-shadow: 0 0 8px #66ffee; }
}

.msg-accepted-label {
  font-family: 'Rajdhani', monospace;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.05em;
  color: #66ffee;
  text-transform: uppercase;
}

.status-completed .msg-accepted-label {
  color: #96ff64;
}

.science-fade-enter-active,
.science-fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}
.science-fade-enter-from,
.science-fade-leave-to {
  opacity: 0;
  transform: scale(0.95) translateY(10px);
}
</style>
