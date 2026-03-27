<template>
  <div class="site-hud">
    <div class="site-hud-left">
      <button type="button" class="back-btn" @click="handleBackClick">BACK</button>
      <SolClock
        v-if="showSolClock"
        :sol="marsSol"
        :time-of-day="marsTimeOfDay"
        :night-factor="currentNightFactor"
        :ambient-celsius="ambientCelsius"
      />
      <h2 class="site-name">{{ siteTitle }}</h2>
      <button type="button" class="sound-toggle" :title="muted ? 'Unmute' : 'Mute'" @click="toggleMute">
        {{ muted ? '🔇' : '🔊' }}
      </button>
    </div>
    <div class="site-hud-center">
      <SiteCompass :heading="roverHeading" :pois="compassPois" />
    </div>
    <div class="hud-actions">
      <button class="mission-log-btn" @click="handleMissionLogClick">
        <span class="ml-icon">&#x25CE;</span>
        <span class="ml-label">MISSIONS</span>
        <span v-if="activeMissionCount > 0" class="ml-badge">{{ activeMissionCount }}</span>
      </button>
      <button
        type="button"
        class="ach-counter"
        aria-haspopup="dialog"
        :aria-expanded="achievementsExpanded"
        aria-label="Achievements"
        @click="handleAchievementsClick"
      >
        <span class="ach-trophy" aria-hidden="true">🏆</span>
        <span class="ach-count font-instrument">{{ unlockedAchievementCount }}/{{ totalAchievementCount }}</span>
      </button>
      <button
        type="button"
        class="sp-counter"
        aria-haspopup="dialog"
        :aria-expanded="spLedgerExpanded"
        aria-label="Science points history"
        @click="handleSpLedgerClick"
      >
        <span class="sp-icon" aria-hidden="true">&#x2726;</span>
        <span class="sp-value font-instrument">{{ totalSp }}</span>
        <span class="sp-label">SP</span>
      </button>
      <button v-if="showArchiveButton" class="hud-btn hud-btn--archive" @click="handleArchiveClick">
        <span class="hud-btn-icon">&#x29BF;</span>
        <span class="hud-btn-label">ARCHIVE</span>
        <span v-if="archiveUnreadCount > 0" class="hud-badge archive-badge">{{ archiveUnreadCount }}</span>
      </button>
      <button
        v-if="showScienceButton"
        type="button"
        class="science-hud-btn"
        @click="handleScienceLogClick"
      >
        SCIENCE
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Howler } from 'howler'
import { useRouter } from 'vue-router'
import { useAudio } from '@/audio/useAudio'
import SiteCompass from '@/components/SiteCompass.vue'
import type { SiteCompassPoi } from '@/components/SiteCompass.vue'
import SolClock from '@/components/SolClock.vue'

withDefaults(
  defineProps<{
    /** Map / site label (route id or display name). */
    siteTitle: string
    showSolClock: boolean
    marsSol: number
    marsTimeOfDay: number
    currentNightFactor?: number
    ambientCelsius?: number | null
    roverHeading: number
    compassPois?: SiteCompassPoi[]
    unlockedAchievementCount: number
    totalAchievementCount: number
    totalSp: number
    showScienceButton: boolean
    achievementsExpanded: boolean
    spLedgerExpanded: boolean
    activeMissionCount?: number
    showArchiveButton?: boolean
    archiveUnreadCount?: number
  }>(),
  { compassPois: () => [], currentNightFactor: 0, activeMissionCount: 0, showArchiveButton: false, archiveUnreadCount: 0 },
)

const router = useRouter()
const audio = useAudio()
const muted = ref(Howler._muted ?? false)

function toggleMute(): void {
  muted.value = !muted.value
  Howler.mute(muted.value)
}
const emit = defineEmits<{
  'open-achievements': []
  'open-sp-ledger': []
  'open-science-log': []
  'open-mission-log': []
  'open-archive': []
}>()

/**
 * Plays the top-navbar confirm cue for navigation and panel open actions.
 */
function playConfirmCue(): void {
  audio.unlock()
  audio.play('ui.confirm')
}

function handleBackClick(): void {
  playConfirmCue()
  goBack()
}

function handleMissionLogClick(): void {
  playConfirmCue()
  emit('open-mission-log')
}

/**
 * Trophy opens achievements — play the achievement sting here (same handler as the click) so it is not
 * lost behind `ui.confirm` or a parent listener running after emit.
 */
function handleAchievementsClick(): void {
  audio.unlock()
  audio.play('ui.achievement')
  emit('open-achievements')
}

function handleSpLedgerClick(): void {
  playConfirmCue()
  emit('open-sp-ledger')
}

function handleArchiveClick(): void {
  playConfirmCue()
  emit('open-archive')
}

function handleScienceLogClick(): void {
  playConfirmCue()
  emit('open-science-log')
}

/** Returns to the global Mars globe view. */
function goBack(): void {
  void router.push('/globe')
}
</script>

<style scoped>
.site-hud {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 40;
  height: 48px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  column-gap: 16px;
  padding: 0 16px;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.site-hud-left {
  display: flex;
  align-items: center;
  gap: 0;
  min-width: 0;
}

.site-hud-left > * + * {
  margin-left: 12px;
  padding-left: 12px;
  border-left: 1px solid rgba(255, 255, 255, 0.12);
}

.site-hud-center {
  justify-self: center;
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.hud-actions {
  justify-self: end;
  display: flex;
  align-items: center;
  gap: 10px;
}

.mission-log-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  font: inherit;
  cursor: pointer;
  background: rgba(196, 149, 106, 0.1);
  border: 1px solid rgba(196, 149, 106, 0.35);
  border-radius: 4px;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.mission-log-btn:hover {
  background: rgba(196, 149, 106, 0.16);
  border-color: rgba(232, 176, 96, 0.45);
}

.mission-log-btn:focus {
  outline: none;
}

.mission-log-btn:focus-visible {
  box-shadow:
    0 0 0 2px rgba(10, 6, 4, 0.95),
    0 0 0 4px rgba(232, 176, 96, 0.45);
}

.ml-icon {
  font-size: 14px;
  line-height: 1;
  color: #e8b060;
}

.ml-label {
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: bold;
  letter-spacing: 0.12em;
  color: #e8b060;
}

.ml-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  font-size: 10px;
  font-weight: bold;
  line-height: 1;
  color: #0a0604;
  background: #e8b060;
  border-radius: 8px;
}

.ach-counter {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  font: inherit;
  cursor: pointer;
  background: rgba(196, 149, 106, 0.1);
  border: 1px solid rgba(196, 149, 106, 0.35);
  border-radius: 4px;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.ach-counter:hover {
  background: rgba(196, 149, 106, 0.16);
  border-color: rgba(232, 176, 96, 0.45);
}

.ach-counter:focus {
  outline: none;
}

.ach-counter:focus-visible {
  box-shadow:
    0 0 0 2px rgba(10, 6, 4, 0.95),
    0 0 0 4px rgba(232, 176, 96, 0.45);
}

.ach-trophy {
  font-size: 14px;
  line-height: 1;
}

.ach-count {
  font-size: 12px;
  font-weight: bold;
  letter-spacing: 0.04em;
  color: #e8b060;
}

.sp-counter {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 12px;
  font: inherit;
  cursor: pointer;
  background: rgba(102, 255, 238, 0.08);
  border: 1px solid rgba(102, 255, 238, 0.25);
  border-radius: 4px;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.sp-counter:hover {
  background: rgba(102, 255, 238, 0.12);
  border-color: rgba(102, 255, 238, 0.4);
}

.sp-counter:focus {
  outline: none;
}

.sp-counter:focus-visible {
  box-shadow:
    0 0 0 2px rgba(10, 6, 4, 0.95),
    0 0 0 4px rgba(102, 255, 238, 0.55);
}

.science-hud-btn {
  padding: 4px 14px;
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: bold;
  letter-spacing: 0.18em;
  color: #0a0604;
  background: linear-gradient(180deg, rgba(102, 255, 238, 0.95), rgba(80, 200, 185, 0.9));
  border: 1px solid rgba(102, 255, 238, 0.6);
  border-radius: 4px;
  cursor: pointer;
  transition:
    filter 0.15s ease,
    box-shadow 0.15s ease;
  box-shadow: 0 0 12px rgba(102, 255, 238, 0.2);
}

.science-hud-btn:hover {
  filter: brightness(1.08);
  box-shadow: 0 0 16px rgba(102, 255, 238, 0.35);
}

.sp-icon {
  color: #66ffee;
  font-size: 12px;
  text-shadow: 0 0 6px rgba(102, 255, 238, 0.4);
}

.sp-value {
  color: #66ffee;
  font-size: 13px;
  font-weight: bold;
  letter-spacing: 0.05em;
}

.sp-label {
  color: rgba(102, 255, 238, 0.5);
  font-family: var(--font-ui);
  font-size: 11px;
  letter-spacing: 0.12em;
}

.back-btn {
  padding: 5px 14px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.7);
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 3px;
  cursor: pointer;
  transition: background 0.2s ease;
}

.back-btn:hover {
  background: rgba(255, 255, 255, 0.12);
}

.hud-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  font: inherit;
  cursor: pointer;
  background: rgba(196, 149, 106, 0.1);
  border: 1px solid rgba(196, 149, 106, 0.35);
  border-radius: 4px;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.hud-btn:hover {
  background: rgba(196, 149, 106, 0.16);
  border-color: rgba(232, 176, 96, 0.45);
}

.hud-btn:focus {
  outline: none;
}

.hud-btn:focus-visible {
  box-shadow:
    0 0 0 2px rgba(10, 6, 4, 0.95),
    0 0 0 4px rgba(232, 176, 96, 0.45);
}

.hud-btn-icon {
  font-size: 13px;
  line-height: 1;
  color: rgba(196, 149, 106, 0.85);
}

.hud-btn-label {
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: bold;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(196, 149, 106, 0.85);
}

.hud-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  font-size: 10px;
  font-weight: bold;
  line-height: 1;
  border-radius: 8px;
}

.archive-badge {
  color: #0a0604;
  background: rgba(196, 149, 106, 0.85);
}

.site-name {
  flex: 1;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 400;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.6);
}

.sound-toggle {
  flex-shrink: 0;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  padding: 2px 6px;
  opacity: 0.5;
  transition: opacity 0.15s ease;
}

.sound-toggle:hover {
  opacity: 0.9;
}
</style>
