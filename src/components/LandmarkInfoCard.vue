<template>
  <Transition name="card">
    <div v-if="landmark" class="info-card">
      <button class="card-close" @click="$emit('close')">&times;</button>
      <div class="card-accent" :style="{ backgroundColor: landmark.accent }" />
      <h2 class="card-title">{{ landmark.name }}</h2>
      <p class="card-description">{{ landmark.description }}</p>

      <div class="card-details">
        <template v-if="landmark.type === 'landing-site'">
          <div class="detail-row">
            <span class="detail-label">Mission</span>
            <span class="detail-value">{{ landmark.mission }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Agency</span>
            <span class="detail-value">{{ landmark.agency }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Year</span>
            <span class="detail-value">{{ landmark.year }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Status</span>
            <span class="detail-value capitalize">{{ landmark.status }}</span>
          </div>
        </template>

        <template v-if="landmark.type === 'geological'">
          <div class="detail-row">
            <span class="detail-label">Feature</span>
            <span class="detail-value capitalize">{{ landmark.featureType.replace('-', ' ') }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Diameter</span>
            <span class="detail-value">{{ landmark.diameterKm.toLocaleString() }} km</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Elevation</span>
            <span class="detail-value">{{ landmark.elevationKm > 0 ? '+' : '' }}{{ landmark.elevationKm }} km</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Pressure</span>
            <span class="detail-value">{{ landmark.surfacePressureMbar }} mbar</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Temp Range</span>
            <span class="detail-value">{{ landmark.temperatureMinK }}K — {{ landmark.temperatureMaxK }}K</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Age</span>
            <span class="detail-value capitalize">{{ landmark.geologicalAge }}</span>
          </div>

          <div class="stat-bars">
            <div class="stat-bar-row">
              <span class="stat-label">Water Ice</span>
              <div class="stat-track"><div class="stat-fill" :style="{ width: `${landmark.waterIceIndex * 100}%`, background: '#4fc3f7' }" /></div>
            </div>
            <div class="stat-bar-row">
              <span class="stat-label">Iron Oxide</span>
              <div class="stat-track"><div class="stat-fill" :style="{ width: `${landmark.ironOxideIndex * 100}%`, background: '#ff7043' }" /></div>
            </div>
            <div class="stat-bar-row">
              <span class="stat-label">Silicate</span>
              <div class="stat-track"><div class="stat-fill" :style="{ width: `${landmark.silicateIndex * 100}%`, background: '#ab47bc' }" /></div>
            </div>
            <div class="stat-bar-row">
              <span class="stat-label">Basalt</span>
              <div class="stat-track"><div class="stat-fill" :style="{ width: `${landmark.basaltIndex * 100}%`, background: '#66bb6a' }" /></div>
            </div>
            <div class="stat-bar-row">
              <span class="stat-label">Roughness</span>
              <div class="stat-track"><div class="stat-fill" :style="{ width: `${landmark.roughness * 100}%`, background: '#ffca28' }" /></div>
            </div>
            <div class="stat-bar-row">
              <span class="stat-label">Dust Cover</span>
              <div class="stat-track"><div class="stat-fill" :style="{ width: `${landmark.dustCover * 100}%`, background: '#bcaaa4' }" /></div>
            </div>
            <div class="stat-bar-row">
              <span class="stat-label">Cratering</span>
              <div class="stat-track"><div class="stat-fill" :style="{ width: `${landmark.craterDensity * 100}%`, background: '#78909c' }" /></div>
            </div>
          </div>
        </template>

        <div class="detail-row">
          <span class="detail-label">Coordinates</span>
          <span class="detail-value">{{ landmark.lat.toFixed(2) }}°, {{ landmark.lon.toFixed(2) }}°</span>
        </div>
      </div>

      <button
        class="select-site-btn"
        @click="$emit('select-site', landmark)"
      >
        SELECT SITE
      </button>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import type { Landmark } from '@/types/landmark'

defineProps<{
  landmark: Landmark | null
}>()

defineEmits<{
  close: []
  'select-site': [landmark: Landmark]
}>()
</script>

<style scoped>
.info-card {
  position: fixed;
  bottom: 24px;
  left: 24px;
  z-index: 30;
  width: 320px;
  padding: 20px;
  background: rgba(10, 10, 15, 0.85);
  backdrop-filter: blur(12px);
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.85);
}

.card-close {
  position: absolute;
  top: 12px;
  right: 14px;
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.4);
  font-size: 18px;
  cursor: pointer;
  line-height: 1;
}

.card-close:hover {
  color: rgba(255, 255, 255, 0.8);
}

.card-accent {
  width: 24px;
  height: 3px;
  border-radius: 2px;
  margin-bottom: 12px;
}

.card-title {
  font-size: 16px;
  font-weight: 500;
  margin: 0 0 8px;
  letter-spacing: 0.03em;
}

.card-description {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.55);
  line-height: 1.5;
  margin: 0 0 16px;
}

.card-details {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
}

.detail-label {
  color: rgba(255, 255, 255, 0.35);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.detail-value {
  color: rgba(255, 255, 255, 0.7);
}

.select-site-btn {
  width: 100%;
  margin-top: 16px;
  padding: 10px 0;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: #000;
  background: #ffca28;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.2s ease, transform 0.1s ease;
}

.select-site-btn:hover {
  background: #ffd54f;
}

.select-site-btn:active {
  transform: scale(0.98);
}

.stat-bars {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.stat-bar-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 10px;
}

.stat-label {
  width: 64px;
  flex-shrink: 0;
  color: rgba(255, 255, 255, 0.35);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.stat-track {
  flex: 1;
  height: 4px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 2px;
  overflow: hidden;
}

.stat-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.4s ease-out;
}

.card-enter-active { transition: all 0.3s ease-out; }
.card-leave-active { transition: all 0.2s ease-in; }
.card-enter-from { opacity: 0; transform: translateY(16px); }
.card-leave-to { opacity: 0; transform: translateY(8px); }
</style>
