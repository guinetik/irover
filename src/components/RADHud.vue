<template>
  <Transition name="rad-fade">
    <div v-if="enabled" class="rad-hud" role="status" aria-label="RAD radiation monitor">
      <!-- Header -->
      <div class="rad-header">
        <span class="rad-title">RAD</span>
        <span class="rad-divider">|</span>
        <span class="rad-zone-dot" :style="{ background: zoneColor }" aria-hidden="true" />
        <span class="rad-zone-label" :style="{ color: zoneColor }">{{ zoneLabel }}</span>
      </div>

      <div class="rad-sep" />

      <!-- Dose rate bar -->
      <div class="rad-row">
        <span class="rad-label">DOSE RATE</span>
        <span class="rad-value font-instrument">{{ doseRate.toFixed(3) }}</span>
        <span class="rad-unit">mGy/d</span>
      </div>
      <div class="rad-bar-track" aria-hidden="true">
        <div
          class="rad-bar-fill"
          :style="{
            width: barFillPct + '%',
            background: zoneColor,
          }"
        />
      </div>

      <div class="rad-sep" />

      <!-- Cumulative sol dose -->
      <div class="rad-row">
        <span class="rad-label">SOL DOSE</span>
        <span class="rad-value font-instrument">{{ cumulativeDose.toFixed(4) }}</span>
        <span class="rad-unit">mGy</span>
      </div>

      <!-- Particle count rate -->
      <div class="rad-row">
        <span class="rad-label">PART RATE</span>
        <span class="rad-value font-instrument">{{ Math.round(particleRate) }}</span>
        <span class="rad-unit">CPM</span>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { RadiationZone } from '@/lib/radiation'
import { ZONE_CONFIG } from '@/lib/radiation'

const props = defineProps<{
  enabled: boolean
  zone: RadiationZone
  level: number
  doseRate: number
  cumulativeDose: number
  particleRate: number
}>()

const zoneColor = computed(() => ZONE_CONFIG[props.zone].color)
const zoneLabel = computed(() => ZONE_CONFIG[props.zone].label)

/** Fill percentage of dose rate bar — clamp level (0.0–1.2) to 0–100%. */
const barFillPct = computed(() => Math.min(100, (props.level / 1.2) * 100))
</script>

<style scoped>
.rad-hud {
  position: fixed;
  top: 56px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 50;
  width: 170px;
  background: rgba(8, 4, 2, 0.82);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(68, 221, 136, 0.2);
  border-radius: 8px;
  padding: 8px 12px;
  font-family: var(--font-ui);
  font-size: 11px;
  letter-spacing: 0.1em;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.rad-header {
  display: flex;
  align-items: center;
  gap: 6px;
}

.rad-title {
  font-size: 11px;
  font-weight: bold;
  color: #44dd88;
  letter-spacing: 0.18em;
}

.rad-divider {
  color: rgba(68, 221, 136, 0.25);
}

.rad-zone-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  box-shadow: 0 0 6px currentColor;
  transition: background 0.4s ease;
}

.rad-zone-label {
  font-size: 11px;
  font-weight: bold;
  letter-spacing: 0.12em;
  transition: color 0.4s ease;
}

.rad-sep {
  height: 1px;
  background: rgba(68, 221, 136, 0.12);
  margin: 1px 0;
}

.rad-row {
  display: flex;
  align-items: baseline;
  gap: 4px;
  white-space: nowrap;
}

.rad-label {
  font-size: 10px;
  color: rgba(68, 221, 136, 0.45);
  letter-spacing: 0.12em;
  flex: 1;
}

.rad-value {
  font-size: 12px;
  font-weight: bold;
  font-variant-numeric: tabular-nums;
  color: #c8ecd8;
  text-align: right;
}

.rad-unit {
  font-size: 10px;
  color: rgba(68, 221, 136, 0.4);
  letter-spacing: 0.06em;
  min-width: 34px;
}

.rad-bar-track {
  width: 100%;
  height: 3px;
  background: rgba(0, 0, 0, 0.45);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 2px;
}

.rad-bar-fill {
  height: 100%;
  border-radius: 2px;
  transition:
    width 0.4s ease,
    background 0.4s ease;
  opacity: 0.85;
}

/* Transition */
.rad-fade-enter-active,
.rad-fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.rad-fade-enter-from,
.rad-fade-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-8px);
}
</style>
