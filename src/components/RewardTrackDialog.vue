<template>
  <Teleport to="body">
    <Transition name="science-fade">
      <div v-if="open" class="science-overlay" @click.self="emitClose">
        <div
          class="rt-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rt-dialog-title"
        >
          <div class="science-head">
            <h2 id="rt-dialog-title" class="science-title">SP REWARD TRACK</h2>
            <button type="button" class="science-close" aria-label="Close" @click="emitClose">&times;</button>
          </div>

          <!-- Progress summary -->
          <div class="rt-progress">
            <div class="rt-progress-text">
              <span class="rt-sp font-instrument">{{ totalSp }} SP</span>
              <span v-if="nextMilestone" class="rt-next">
                Next: <strong>{{ nextMilestone.title }}</strong> at {{ nextMilestone.sp }} SP
              </span>
              <span v-else class="rt-next">All milestones unlocked!</span>
            </div>
            <div class="rt-bar-track">
              <div class="rt-bar-fill" :style="{ width: progressPct + '%' }" />
            </div>
          </div>

          <!-- Tier sections -->
          <div class="rt-body">
            <section v-for="tier in tiers" :key="tier.name" class="rt-tier">
              <h3 class="rt-tier-title">{{ tier.name }}</h3>
              <ul class="ach-list" role="list">
                <li
                  v-for="m in tier.milestones"
                  :key="m.id"
                  class="ach-row"
                  :class="{
                    'ach-row--locked': !isUnlocked(m.id),
                    'rt-row--next': isNext(m),
                  }"
                >
                  <div class="ach-icon-box" aria-hidden="true">{{ isUnlocked(m.id) ? m.icon : '?' }}</div>
                  <div class="ach-text">
                    <div class="ach-row-title">{{ m.title }}</div>
                    <div class="ach-row-desc">
                      <template v-if="isUnlocked(m.id)">
                        {{ m.description }}
                      </template>
                      <template v-else>
                        Reach {{ m.sp }} SP to unlock.
                      </template>
                    </div>
                  </div>
                  <div class="rt-badge font-instrument">{{ m.perkId ? 'PERK' : 'MOD' }}</div>
                </li>
              </ul>
            </section>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useUiSound } from '@/composables/useUiSound'
import type { RewardTrackMilestone } from '@/lib/rewardTrack'

const props = defineProps<{
  open: boolean
  milestones: RewardTrackMilestone[]
  unlockedIds: string[]
  totalSp: number
}>()

const emit = defineEmits<{
  close: []
}>()

const { playUiCue } = useUiSound()

function emitClose(): void {
  playUiCue('ui.confirm')
  emit('close')
}

interface Tier {
  name: string
  milestones: RewardTrackMilestone[]
}

const TIER_DEFS: { name: string; maxSp: number }[] = [
  { name: 'TIER 1 — FIRST STEPS', maxSp: 100 },
  { name: 'TIER 2 — GETTING COMFORTABLE', maxSp: 250 },
  { name: 'TIER 3 — SEASONED OPERATOR', maxSp: 500 },
  { name: 'TIER 4 — VETERAN EXPLORER', maxSp: 750 },
  { name: 'TIER 5 — MARS VETERAN', maxSp: 1000 },
]

const sorted = computed(() => [...props.milestones].sort((a, b) => a.sp - b.sp))

const tiers = computed<Tier[]>(() => {
  let prevMax = 0
  return TIER_DEFS.map(td => {
    const ms = sorted.value.filter(m => m.sp > prevMax && m.sp <= td.maxSp)
    prevMax = td.maxSp
    return { name: td.name, milestones: ms }
  }).filter(t => t.milestones.length > 0)
})

const nextMilestone = computed(() =>
  sorted.value.find(m => m.sp > props.totalSp) ?? null,
)

const progressPct = computed(() => {
  const next = nextMilestone.value
  if (!next) return 100
  // Find the milestone just before next
  const prev = sorted.value.filter(m => m.sp <= props.totalSp)
  const prevSp = prev.length > 0 ? prev[prev.length - 1].sp : 0
  const range = next.sp - prevSp
  if (range <= 0) return 100
  return Math.min(100, Math.max(0, ((props.totalSp - prevSp) / range) * 100))
})

function isUnlocked(id: string): boolean {
  return props.unlockedIds.includes(id)
}

function isNext(m: RewardTrackMilestone): boolean {
  return nextMilestone.value?.id === m.id
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

.rt-dialog {
  width: min(500px, 100%);
  max-height: min(82vh, 620px);
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

/* Progress summary */
.rt-progress {
  flex-shrink: 0;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(196, 149, 106, 0.12);
}

.rt-progress-text {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.rt-sp {
  font-size: 16px;
  font-weight: bold;
  color: #e8b060;
}

.rt-next {
  font-family: var(--font-ui);
  font-size: 11px;
  color: rgba(232, 220, 200, 0.6);
  letter-spacing: 0.03em;
}
.rt-next strong {
  color: rgba(232, 176, 96, 0.85);
}

.rt-bar-track {
  height: 4px;
  background: rgba(196, 149, 106, 0.15);
  border-radius: 2px;
  overflow: hidden;
}

.rt-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #e8b060, #f0c878);
  border-radius: 2px;
  transition: width 0.3s ease;
}

/* Scrollable body */
.rt-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 16px 18px;
}

.rt-tier {
  margin-bottom: 16px;
}
.rt-tier:last-child {
  margin-bottom: 0;
}

.rt-tier-title {
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
  border-left: 3px solid rgba(232, 176, 96, 0.5);
}

.ach-row--locked {
  opacity: 0.72;
  border-style: dashed;
  border-left: 3px dashed rgba(196, 149, 106, 0.2);
}

.rt-row--next {
  border-left-color: #e8b060;
  box-shadow: 0 0 12px rgba(232, 176, 96, 0.15);
  opacity: 1;
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

.rt-badge {
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
.science-fade-enter-active .rt-dialog,
.science-fade-leave-active .rt-dialog {
  transition: transform 0.2s ease, opacity 0.2s ease;
}
.science-fade-enter-from,
.science-fade-leave-to {
  opacity: 0;
}
.science-fade-enter-from .rt-dialog,
.science-fade-leave-to .rt-dialog {
  opacity: 0;
  transform: scale(0.98) translateY(8px);
}
</style>
