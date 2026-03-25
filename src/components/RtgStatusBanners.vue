<script setup lang="ts">
import type { RTGConservationState } from '@/three/instruments'

/**
 * Top-center RTG / power-shunt / heater-overdrive status strips during active phases.
 * Priority: RTG overdrive → RTG cooldown → shunt active → shunt cooldown → heater heat boost.
 */
defineProps<{
  rtgPhase: 'idle' | 'overdrive' | 'cooldown' | 'recharging'
  rtgPhaseProgress: number
  rtgConservationMode: RTGConservationState
  rtgConservationProgress01: number
  rtgConservationCdLabel: string
  heaterHeatBoostActive: boolean
  heaterHeatBoostProgressElapsed01: number
}>()
</script>

<template>
  <Transition name="deploy-fade">
    <div v-if="rtgPhase === 'overdrive'" class="rtg-banner overdrive" key="rtg-overdrive">
      <span class="rtg-banner-icon">&#x26A1;</span>
      <span class="rtg-banner-text">OVERDRIVE ACTIVE</span>
      <div class="rtg-banner-bar">
        <div class="rtg-banner-fill" :style="{ width: (1 - rtgPhaseProgress) * 100 + '%' }" />
      </div>
    </div>
    <div v-else-if="rtgPhase === 'cooldown'" class="rtg-banner cooldown" key="rtg-cooldown">
      <span class="rtg-banner-icon">&#x23F3;</span>
      <span class="rtg-banner-text">RTG COOLDOWN &mdash; INSTRUMENTS LOCKED</span>
      <div class="rtg-banner-bar">
        <div class="rtg-banner-fill cooldown" :style="{ width: (1 - rtgPhaseProgress) * 100 + '%' }" />
      </div>
    </div>
    <div v-else-if="rtgConservationMode === 'active'" class="rtg-banner conservation" key="rtg-shunt">
      <span class="rtg-banner-icon">&#x26AB;</span>
      <span class="rtg-banner-text">POWER SHUNT &mdash; DRIVE OFFLINE &middot; &minus;50% LOAD</span>
      <div class="rtg-banner-bar">
        <div class="rtg-banner-fill conservation" :style="{ width: (1 - rtgConservationProgress01) * 100 + '%' }" />
      </div>
    </div>
    <div v-else-if="rtgConservationMode === 'cooldown'" class="rtg-banner shunt-cooldown" key="rtg-shunt-cd">
      <span class="rtg-banner-icon">&#x23F3;</span>
      <span class="rtg-banner-text">SHUNT RECHARGE &mdash; {{ rtgConservationCdLabel }}</span>
      <div class="rtg-banner-bar">
        <div class="rtg-banner-fill shunt-cd" :style="{ width: (1 - rtgConservationProgress01) * 100 + '%' }" />
      </div>
    </div>
    <div
      v-else-if="heaterHeatBoostActive"
      class="rtg-banner overdrive heater-od-banner"
      key="heater-overdrive-heat"
    >
      <span class="rtg-banner-icon">&#x2668;</span>
      <span class="rtg-banner-text">HEATER OVERDRIVE &mdash; DOUBLE THERMAL OUTPUT</span>
      <div class="rtg-banner-bar">
        <div class="rtg-banner-fill" :style="{ width: (1 - heaterHeatBoostProgressElapsed01) * 100 + '%' }" />
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.rtg-banner {
  position: fixed;
  top: 100px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 20px;
  background: rgba(10, 5, 2, 0.7);
  backdrop-filter: blur(8px);
  border-radius: 6px;
  font-family: var(--font-ui);
  z-index: 40;
  pointer-events: none;
}

.rtg-banner.overdrive {
  border: 1px solid rgba(239, 159, 39, 0.4);
}

.rtg-banner.cooldown {
  border: 1px solid rgba(224, 80, 48, 0.3);
}

.rtg-banner-icon {
  font-size: 14px;
}

.rtg-banner-text {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.15em;
  color: #ef9f27;
}

.rtg-banner.cooldown .rtg-banner-text {
  color: #e05030;
}

.rtg-banner-bar {
  width: 80px;
  height: 3px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 2px;
  overflow: hidden;
}

.rtg-banner-fill {
  height: 100%;
  background: rgba(239, 159, 39, 0.8);
  border-radius: 2px;
  transition: width 0.5s linear;
}

.rtg-banner-fill.cooldown {
  background: rgba(224, 80, 48, 0.7);
}

.rtg-banner.conservation {
  border: 1px solid rgba(72, 188, 168, 0.5);
}

.rtg-banner.conservation .rtg-banner-text {
  color: #6ed4c4;
}

.rtg-banner-fill.conservation {
  background: rgba(72, 200, 175, 0.9);
}

.rtg-banner.shunt-cooldown {
  border: 1px solid rgba(100, 140, 135, 0.4);
}

.rtg-banner.shunt-cooldown .rtg-banner-text {
  color: rgba(160, 210, 200, 0.95);
  font-size: 11px;
}

.rtg-banner-fill.shunt-cd {
  background: rgba(100, 170, 160, 0.6);
}
</style>
