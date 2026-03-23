<template>
  <Teleport to="body">
    <Transition name="science-fade">
      <div v-if="open" class="science-overlay" @click.self="$emit('close')">
        <div
          class="ach-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ach-dialog-title"
        >
          <div class="science-head">
            <h2 id="ach-dialog-title" class="science-title">ACHIEVEMENTS</h2>
            <button type="button" class="science-close" aria-label="Close" @click="$emit('close')">&times;</button>
          </div>
          <div class="ach-body">
            <p v-if="libs.length === 0 && dan.length === 0 && survival.length === 0" class="ach-empty">Loading achievements…</p>
            <template v-else>
              <section v-if="libs.length > 0" class="ach-section">
                <h3 class="ach-section-title">LIBS calibration</h3>
                <ul class="ach-list" role="list">
                  <li
                    v-for="a in libs"
                    :key="a.id"
                    class="ach-row"
                    :class="{ 'ach-row--locked': !isUnlocked(a.id) }"
                  >
                    <div class="ach-icon-box" aria-hidden="true">{{ isUnlocked(a.id) ? a.icon : '?' }}</div>
                    <div class="ach-text">
                      <div class="ach-row-title">{{ a.title }}</div>
                      <div class="ach-row-desc">{{ isUnlocked(a.id) ? a.description : libsLockedHint(a) }}</div>
                    </div>
                    <div class="ach-meta font-instrument">{{ a.type }}</div>
                  </li>
                </ul>
              </section>
              <section v-if="survival.length > 0" class="ach-section">
                <h3 class="ach-section-title">Mars survival</h3>
                <ul class="ach-list" role="list">
                  <li
                    v-for="a in survival"
                    :key="a.id"
                    class="ach-row"
                    :class="{ 'ach-row--locked': !isUnlocked(a.id) }"
                  >
                    <div class="ach-icon-box" aria-hidden="true">{{ isUnlocked(a.id) ? a.icon : '?' }}</div>
                    <div class="ach-text">
                      <div class="ach-row-title">{{ a.title }}</div>
                      <div class="ach-row-desc">{{ isUnlocked(a.id) ? a.description : survivalLockedHint(a) }}</div>
                    </div>
                    <div class="ach-meta font-instrument">{{ a.type }}</div>
                  </li>
                </ul>
              </section>
              <section v-if="dan.length > 0" class="ach-section">
                <h3 class="ach-section-title">DAN prospecting</h3>
                <ul class="ach-list" role="list">
                  <li
                    v-for="a in dan"
                    :key="a.id"
                    class="ach-row"
                    :class="{ 'ach-row--locked': !isUnlocked(a.id) }"
                  >
                    <div class="ach-icon-box" aria-hidden="true">{{ isUnlocked(a.id) ? a.icon : '?' }}</div>
                    <div class="ach-text">
                      <div class="ach-row-title">{{ a.title }}</div>
                      <div class="ach-row-desc">{{ isUnlocked(a.id) ? a.description : danLockedHint(a) }}</div>
                    </div>
                    <div class="ach-meta font-instrument">{{ a.type }}</div>
                  </li>
                </ul>
              </section>
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
export interface AchievementBase {
  id: string
  icon: string
  title: string
  description: string
  type: string
}

export interface LibsAchievementRow extends AchievementBase {
  sp: number
}

export interface DanAchievementRow extends AchievementBase {
  event: string
}

export interface SurvivalAchievementRow extends AchievementBase {
  /** Unlock when mission `marsSol` reaches this value (landing starts at Sol 1; first full sol ends at Sol 2). */
  minSol: number
  spReward: number
}

const props = defineProps<{
  open: boolean
  libs: LibsAchievementRow[]
  dan: DanAchievementRow[]
  survival: SurvivalAchievementRow[]
  /** Unlocked achievement ids (same ids as achievements.json) */
  unlockedIds: string[]
  /** Current science points (for LIBS requirement hints) */
  totalSp: number
  /** Current mission sol (for survival hints) */
  missionSol: number
}>()

defineEmits<{
  close: []
}>()

const DAN_LOCKED: Record<string, string> = {
  'first-hit': 'Detect a hydrogen signal with DAN.',
  'first-prospect': 'Complete a DAN prospect survey.',
  'water-confirmed': 'Confirm subsurface water at a prospect site.',
}

/**
 * Whether the given achievement id has been unlocked this session.
 */
function isUnlocked(id: string): boolean {
  return props.unlockedIds.includes(id)
}

/**
 * Hint shown for locked LIBS achievements.
 */
function libsLockedHint(a: LibsAchievementRow): string {
  if (props.totalSp >= a.sp) return a.description
  return `Reach ${a.sp} SP (currently ${props.totalSp}).`
}

/**
 * Hint shown for locked DAN achievements.
 */
function danLockedHint(a: DanAchievementRow): string {
  return DAN_LOCKED[a.event] ?? 'Unlock through DAN operations.'
}

/**
 * Hint shown for locked survival achievements.
 */
function survivalLockedHint(a: SurvivalAchievementRow): string {
  const need = a.minSol
  const cur = props.missionSol
  return `Reach mission Sol ${need} (full sols survived: ${Math.max(0, cur - 1)}; currently Sol ${cur}).`
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

.ach-dialog {
  width: min(480px, 100%);
  max-height: min(78vh, 560px);
  display: flex;
  flex-direction: column;
  background: rgba(10, 6, 4, 0.96);
  border: 1px solid rgba(196, 117, 58, 0.35);
  border-radius: 10px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.55);
  overflow: hidden;
  --scrollbar-track: rgba(4, 14, 12, 0.9);
  --scrollbar-thumb: rgba(196, 149, 106, 0.28);
  --scrollbar-thumb-hover: rgba(196, 149, 106, 0.45);
  scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
}

.science-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(196, 149, 106, 0.2);
  flex-shrink: 0;
}

.science-title {
  margin: 0;
  font-family: var(--font-ui);
  font-size: 14px;
  font-weight: bold;
  letter-spacing: 0.2em;
  color: #e8b060;
}

.science-close {
  background: none;
  border: none;
  color: rgba(196, 149, 106, 0.55);
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
  padding: 0 6px;
}
.science-close:hover {
  color: #e8b060;
}

.ach-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 16px 18px;
}

.ach-empty {
  margin: 0;
  padding: 20px;
  text-align: center;
  font-family: var(--font-ui);
  font-size: 12px;
  color: rgba(196, 117, 58, 0.55);
  letter-spacing: 0.06em;
}

.ach-section {
  margin-bottom: 16px;
}
.ach-section:last-child {
  margin-bottom: 0;
}

.ach-section-title {
  margin: 0 0 8px;
  font-family: var(--font-ui);
  font-size: 10px;
  font-weight: bold;
  letter-spacing: 0.18em;
  color: rgba(196, 149, 106, 0.65);
}

.ach-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ach-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  background: rgba(0, 0, 0, 0.28);
  border: 1px solid rgba(196, 149, 106, 0.15);
  border-radius: 6px;
}

.ach-row--locked {
  opacity: 0.72;
  border-style: dashed;
}

.ach-icon-box {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  background: rgba(196, 149, 106, 0.1);
  border: 1px solid rgba(196, 149, 106, 0.22);
  border-radius: 6px;
}

.ach-row--locked .ach-icon-box {
  font-size: 14px;
  font-weight: bold;
  color: rgba(196, 149, 106, 0.45);
}

.ach-text {
  flex: 1;
  min-width: 0;
}

.ach-row-title {
  font-family: var(--font-ui);
  font-size: 12px;
  font-weight: bold;
  letter-spacing: 0.08em;
  color: #f0e6d8;
  margin-bottom: 4px;
}

.ach-row-desc {
  font-family: var(--font-ui);
  font-size: 11px;
  line-height: 1.4;
  color: rgba(232, 220, 200, 0.72);
  letter-spacing: 0.03em;
}

.ach-row--locked .ach-row-desc {
  color: rgba(196, 149, 106, 0.75);
}

.ach-meta {
  flex-shrink: 0;
  font-size: 9px;
  letter-spacing: 0.1em;
  color: rgba(196, 149, 106, 0.4);
  writing-mode: vertical-rl;
  text-orientation: mixed;
  align-self: center;
}

.science-fade-enter-active,
.science-fade-leave-active {
  transition: opacity 0.2s ease;
}
.science-fade-enter-active .ach-dialog,
.science-fade-leave-active .ach-dialog {
  transition: transform 0.2s ease, opacity 0.2s ease;
}
.science-fade-enter-from,
.science-fade-leave-to {
  opacity: 0;
}
.science-fade-enter-from .ach-dialog,
.science-fade-leave-to .ach-dialog {
  opacity: 0;
  transform: scale(0.98) translateY(8px);
}
</style>
