<template>
  <Transition name="fade">
    <div v-if="isLoading" class="loading-overlay">
      <div class="loading-content">
        <div class="loading-mars-icon" aria-hidden="true" />
        <p class="loading-label">LOADING TERRAIN</p>
        <p v-if="siteName" class="loading-site font-instrument">{{ siteName }}</p>
        <div class="loading-bar-track">
          <div class="loading-bar-fill" />
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
defineProps<{
  isLoading: boolean
  siteName?: string
}>()
</script>

<style scoped>
.loading-overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0a0a0a;
}

.loading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.loading-mars-icon {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 40%, #c0603a 0%, #8b3a1e 55%, #3a1208 100%);
  box-shadow: 0 0 24px 4px rgba(180, 80, 40, 0.25);
  animation: pulse 2s ease-in-out infinite;
}

.loading-label {
  color: rgba(255, 255, 255, 0.5);
  font-size: 11px;
  letter-spacing: 0.25em;
  text-transform: uppercase;
}

.loading-site {
  color: rgba(255, 255, 255, 0.8);
  font-size: 16px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.loading-bar-track {
  width: 180px;
  height: 2px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 1px;
  overflow: hidden;
  margin-top: 4px;
}

.loading-bar-fill {
  height: 100%;
  width: 40%;
  background: rgba(192, 96, 58, 0.8);
  border-radius: 1px;
  animation: slide 1.2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 0.7; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.05); }
}

@keyframes slide {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(350%); }
}

.fade-leave-active { transition: opacity 0.6s ease; }
.fade-leave-to { opacity: 0; }
</style>
