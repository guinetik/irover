<template>
  <div class="si-root">
    <div class="si-heading">SELECT ANALYSIS INSTRUMENT</div>
    <div class="si-cards">
      <div
        v-for="mode in modes"
        :key="mode.id"
        class="si-card"
        :class="{
          'si-card--locked': isLocked(mode),
          'si-card--unlocked': !isLocked(mode),
        }"
        @click="handleSelect(mode)"
      >
        <!-- Lock overlay -->
        <div v-if="isLocked(mode)" class="si-lock-overlay">
          <span class="si-lock-icon">&#x1F512;</span>
          <span class="si-lock-label">REQUIRES {{ mode.unlockSP }} SP</span>
        </div>

        <!-- Icon -->
        <div class="si-icon">{{ mode.icon }}</div>

        <!-- Name -->
        <div class="si-name">{{ mode.name }}</div>

        <!-- Instrument subtitle -->
        <div class="si-instrument">{{ mode.instrument }}</div>

        <!-- Power + duration -->
        <div class="si-stats">
          <span class="si-stat font-instrument">{{ mode.powerW }}W</span>
          <span class="si-stat-sep">/</span>
          <span class="si-stat font-instrument">{{ mode.baseDurationSec }}s</span>
        </div>

        <!-- Description -->
        <div class="si-description">{{ mode.description }}</div>

        <!-- Ingredients -->
        <div v-if="mode.ingredients.length > 0" class="si-ingredients">
          <span class="si-ingredients-label">REQUIRES:</span>
          <span
            v-for="ing in mode.ingredients"
            :key="ing.itemId"
            class="si-ingredient"
          >
            {{ ing.quantity }}x {{ getItemLabel(ing.itemId) }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { SAMAnalysisMode } from '@/types/samExperiments'
import { getInventoryItemDef } from '@/types/inventory'

const props = defineProps<{
  modes: SAMAnalysisMode[]
  totalSP: number
}>()

const emit = defineEmits<{
  select: [modeId: string]
}>()

function isLocked(mode: SAMAnalysisMode): boolean {
  return mode.unlockSP > props.totalSP
}

function handleSelect(mode: SAMAnalysisMode): void {
  if (!isLocked(mode)) {
    emit('select', mode.id)
  }
}

function getItemLabel(itemId: string): string {
  const def = getInventoryItemDef(itemId)
  return def ? def.label : itemId
}
</script>

<style scoped>
.si-root {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 24px 28px;
  height: 100%;
  box-sizing: border-box;
}

.si-heading {
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: bold;
  letter-spacing: 0.2em;
  color: rgba(196, 117, 58, 0.6);
  flex-shrink: 0;
}

.si-cards {
  display: flex;
  flex-direction: row;
  gap: 16px;
  flex: 1;
  min-height: 0;
}

/* ── Base card ─────────────────────────────────────────────── */
.si-card {
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 20px 18px;
  background: rgba(10, 5, 2, 0.7);
  border: 1px solid rgba(196, 117, 58, 0.18);
  border-radius: 8px;
  overflow: hidden;
  transition: border-color 0.2s ease, background 0.2s ease;
}

/* ── Unlocked card ─────────────────────────────────────────── */
.si-card--unlocked {
  cursor: pointer;
}

.si-card--unlocked:hover {
  background: rgba(20, 10, 4, 0.85);
  border-color: #e8a060;
}

/* ── Locked card ───────────────────────────────────────────── */
.si-card--locked {
  cursor: not-allowed;
  opacity: 0.45;
}

/* Lock overlay */
.si-lock-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: rgba(5, 2, 1, 0.72);
  backdrop-filter: blur(2px);
}

.si-lock-icon {
  font-size: 28px;
  line-height: 1;
}

.si-lock-label {
  font-family: var(--font-ui);
  font-size: 10px;
  font-weight: bold;
  letter-spacing: 0.18em;
  color: rgba(196, 117, 58, 0.55);
}

/* ── Card contents ─────────────────────────────────────────── */
.si-icon {
  font-size: 36px;
  text-align: center;
  line-height: 1;
}

.si-name {
  font-family: var(--font-ui);
  font-size: 12px;
  font-weight: bold;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: #e8a060;
  text-align: center;
}

.si-instrument {
  font-family: var(--font-ui);
  font-size: 10px;
  letter-spacing: 0.1em;
  color: rgba(196, 117, 58, 0.45);
  text-align: center;
  text-transform: uppercase;
}

.si-stats {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.si-stat {
  font-family: var(--font-instrument);
  font-size: 13px;
  color: rgba(93, 201, 165, 0.75);
}

.si-stat-sep {
  font-size: 10px;
  color: rgba(196, 117, 58, 0.3);
}

.si-description {
  font-family: var(--font-ui);
  font-size: 11px;
  line-height: 1.55;
  color: rgba(232, 160, 96, 0.55);
  flex: 1;
}

.si-ingredients {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-top: 8px;
  border-top: 1px solid rgba(196, 117, 58, 0.1);
}

.si-ingredients-label {
  font-family: var(--font-ui);
  font-size: 9px;
  letter-spacing: 0.15em;
  color: rgba(196, 117, 58, 0.4);
}

.si-ingredient {
  font-family: var(--font-ui);
  font-size: 10px;
  letter-spacing: 0.08em;
  color: rgba(232, 160, 96, 0.7);
}
</style>
